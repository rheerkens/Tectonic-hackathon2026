import { describe, expect, test } from 'bun:test';
import { createAssistantMessageEventStream, Type, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import type { AppContext } from '../src/app.ts';
import { createProjectChatRunner, type ChatRunOptions } from '../src/project-chat/runner.ts';

const model = getBuiltinModel('openai-codex', 'gpt-6.1-sol');
if (!model) throw new Error('Test catalog is missing gpt-6.1-sol');

function assistant(content: AssistantMessage['content'], stopReason: AssistantMessage['stopReason']): AssistantMessage {
  return {
    role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason, timestamp: Date.now(),
  };
}

function textStream(text: string) {
  const stream = createAssistantMessageEventStream();
  const initial = assistant([], 'pending');
  stream.push({ type: 'start', partial: initial });
  const partial = assistant([{ type: 'text', text }], 'pending');
  stream.push({ type: 'text_start', contentIndex: 0, partial: initial });
  stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial });
  stream.push({ type: 'text_end', contentIndex: 0, content: text, partial });
  stream.push({ type: 'done', reason: 'stop', message: assistant([{ type: 'text', text }], 'stop') });
  return stream;
}

function toolStream(name: string, id: string) {
  const stream = createAssistantMessageEventStream();
  const initial = assistant([], 'pending');
  const call = { type: 'toolCall' as const, id, name, arguments: {} };
  const partial = assistant([call], 'pending');
  stream.push({ type: 'start', partial: initial });
  stream.push({ type: 'toolcall_start', contentIndex: 0, partial: initial });
  stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: call, partial });
  stream.push({ type: 'done', reason: 'toolUse', message: assistant([call], 'toolUse') });
  return stream;
}

function makeOptions(overrides: Partial<ChatRunOptions> = {}): ChatRunOptions {
  return {
    ctx: { config: { productionLike: false } } as AppContext,
    projectId: 'project-test', userId: 'user-test', allowedProjectIds: ['project-test'], history: [], message: 'What is here?', signal: new AbortController().signal,
    onEvent: async () => {}, ...overrides,
  };
}

describe('project chat runner', () => {
  test('streams the full answer and returns it', async () => {
    const events: unknown[] = [];
    const run = createProjectChatRunner({
      resolveModel: async () => model as Model<typeof model.api>,
      resolveToken: async () => 'fixture-token',
      streamFn: () => textStream('The project is ready.'),
      createTools: () => [],
    });

    const result = await run(makeOptions({ onEvent: async (event) => { events.push(event); } }));
    expect(result).toEqual({ reply: 'The project is ready.', tools: [] });
    expect(events).toContainEqual({ type: 'text', text: 'The project is ready.' });
  });

  test('executes a real Pi tool call then continues to the final answer', async () => {
    let request = 0;
    let executed = 0;
    const run = createProjectChatRunner({
      resolveModel: async () => model as Model<typeof model.api>,
      resolveToken: async () => 'fixture-token',
      streamFn: () => {
        request += 1;
        return request === 1 ? toolStream('list_sources', 'call-1') : textStream('Source S4 supports that conclusion.');
      },
      createTools: () => [{
        name: 'list_sources', label: 'List knowledge sources', description: 'List team sources.', parameters: Type.Object({}),
        execute: async () => { executed += 1; return { content: [{ type: 'text', text: 'S4: approved' }], details: undefined }; },
      }],
    });
    const events: Array<{ type: string; tool?: { status: string; name: string } }> = [];

    const result = await run(makeOptions({ onEvent: async (event) => { events.push(event); } }));
    expect(request).toBe(2);
    expect(executed).toBe(1);
    expect(result.reply).toBe('Source S4 supports that conclusion.');
    expect(result.tools).toMatchObject([{ id: 'call-1', name: 'list_sources', status: 'completed', result: 'S4: approved' }]);
    expect(events.filter((event) => event.type === 'tool').map((event) => event.tool?.status)).toEqual(['running', 'completed']);
  });

  test('aborts an in-flight tool when the request signal is cancelled', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const toolStarted = new Promise<void>((resolve) => { started = resolve; });
    const run = createProjectChatRunner({
      resolveModel: async () => model as Model<typeof model.api>,
      resolveToken: async () => 'fixture-token',
      streamFn: () => toolStream('list_sources', 'call-cancel'),
      createTools: () => [{
        name: 'list_sources', label: 'List knowledge sources', description: 'List team sources.', parameters: Type.Object({}),
        execute: async (_id, _args, signal) => {
          started();
          return new Promise((resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
            if (signal?.aborted) reject(new Error('cancelled'));
            void resolve;
          });
        },
      }],
    });
    const running = run(makeOptions({ signal: controller.signal }));
    await toolStarted;
    controller.abort();
    await expect(running).rejects.toThrow('Chat could not complete the request');
  });

  test('aborts provider work when event delivery fails', async () => {
    let providerSignal: AbortSignal | undefined;
    const run = createProjectChatRunner({
      resolveModel: async () => model as Model<typeof model.api>,
      resolveToken: async () => 'fixture-token',
      streamFn: (_model, _context, options) => {
        providerSignal = options?.signal;
        return textStream('The project is ready.');
      },
      createTools: () => [],
    });

    await expect(run(makeOptions({ onEvent: async () => { throw new Error('transport failed'); } })))
      .rejects.toThrow('Chat could not complete the request');
    expect(providerSignal?.aborted).toBe(true);
  });
});
