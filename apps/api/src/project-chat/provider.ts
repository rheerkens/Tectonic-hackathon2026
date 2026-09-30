import type { StreamFn } from '@earendil-works/pi-agent-core';
import { hasApi } from '@earendil-works/pi-ai';
import { streamSimple as streamCodex } from '@earendil-works/pi-ai/api/openai-codex-responses';
import { streamSimple as streamOpenAI } from '@earendil-works/pi-ai/api/openai-responses';

/** Codex owns the credential file. Call Pi's transport without its OAuth store. */
export const streamOpenAIChat: StreamFn = (model, context, options) => {
  if (!options?.apiKey) throw new Error('Codex sign-in is unavailable.');
  if (hasApi(model, 'openai-codex-responses')) {
    // SSE keeps each conversation's request and cancellation independent.
    return streamCodex(model, context, { ...options, transport: 'sse' });
  }
  if (hasApi(model, 'openai-responses')) {
    return streamOpenAI(model, context, { ...options, maxTokens: 4000 });
  }
  throw new Error('Unsupported project chat provider.');
};
