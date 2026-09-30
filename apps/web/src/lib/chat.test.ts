import { describe, expect, test } from 'bun:test';
import type { ProjectChatTurn } from '@tectonic/shared';
import { ApiError } from './api.ts';
import { postProjectChat } from './chat.ts';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const TURN = {
  id: '22222222-2222-4222-8222-222222222222', message: 'What is here?', reply: 'A project.', tools: [],
  status: 'completed', createdAt: '2026-09-30T10:00:00.000Z',
} satisfies ProjectChatTurn;

function replaceFetch(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetcher });
  return () => Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
}

describe('postProjectChat', () => {
  test('parses split NDJSON chunks, streams full reply updates, and returns the completed turn', async () => {
    const encoder = new TextEncoder();
    const source = [
      '{"type":"text","text":"A project."}\n',
      `${JSON.stringify({ type: 'done', turn: TURN })}\n`,
    ];
    const restoreFetch = replaceFetch(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(source[0]!.slice(0, 13)));
        controller.enqueue(encoder.encode(source[0]!.slice(13) + source[1]!));
        controller.close();
      },
    })));
    try {
      const replies: string[] = [];
      const result = await postProjectChat({ projectId: PROJECT, message: 'What is here?', getAuthHeaders: async () => ({}), onEvent: (event) => {
        if (event.type === 'text') replies.push(event.text);
      } });
      expect(replies).toEqual(['A project.']);
      expect(result).toEqual(TURN);
    } finally {
      restoreFetch();
    }
  });

  test('rejects a stream that ends without a done event', async () => {
    const restoreFetch = replaceFetch(async () => new Response('{"type":"text","text":"partial"}\n'));
    try {
      await expect(postProjectChat({ projectId: PROJECT, message: 'Question', getAuthHeaders: async () => ({}) })).rejects.toBeInstanceOf(ApiError);
    } finally {
      restoreFetch();
    }
  });

  test('cancels the stream when an event fails schema validation', async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const restoreFetch = replaceFetch(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"tool","tool":{"id":"bad"}}\n'));
      },
      cancel() { cancelled = true; },
    })));
    try {
      await expect(postProjectChat({ projectId: PROJECT, message: 'Question', getAuthHeaders: async () => ({}) })).rejects.toBeInstanceOf(ApiError);
      expect(cancelled).toBe(true);
    } finally {
      restoreFetch();
    }
  });
});
