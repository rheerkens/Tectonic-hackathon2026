import { expect, test } from 'bun:test';
import { normalizeContext } from '@earendil-works/pi-ai';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import { CHAT_MODEL } from '@tectonic/shared';
import { streamOpenAIChat } from '../src/project-chat/provider.ts';

test('Codex transport sends the supplied token without needing a Pi OAuth store', async () => {
  const catalogModel = getBuiltinModel('openai-codex', CHAT_MODEL);
  if (!catalogModel) throw new Error('Missing chat model');
  const token = `fixture.${Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' },
  })).toString('base64url')}.signature`;
  const receivedHeaders = new Headers();
  let requestPath: string | undefined;
  const events = [
    { type: 'response.output_item.added', item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', part: { type: 'output_text', text: '' } },
    { type: 'response.output_text.delta', delta: 'Connected.' },
    { type: 'response.output_item.done', item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Connected.' }] } },
    { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8, input_tokens_details: { cached_tokens: 0 } } } },
  ];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      request.headers.forEach((value, key) => receivedHeaders.set(key, value));
      requestPath = new URL(request.url).pathname;
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  });
  try {
    const stream = await streamOpenAIChat({ ...catalogModel, baseUrl: server.url.toString() }, normalizeContext({
      messages: [{ role: 'user', content: 'Connect.', timestamp: Date.now() }],
    }), { apiKey: token, signal: AbortSignal.timeout(5000) });
    const response = await stream.result();
    expect(response.stopReason).toBe('stop');
    expect(response.content).toContainEqual(expect.objectContaining({ type: 'text', text: 'Connected.' }));
    expect(requestPath).toBe('/codex/responses');
    expect(receivedHeaders.get('authorization')).toBe(`Bearer ${token}`);
    expect(receivedHeaders.get('chatgpt-account-id')).toBe('fixture-account');
  } finally {
    server.stop(true);
  }
});
