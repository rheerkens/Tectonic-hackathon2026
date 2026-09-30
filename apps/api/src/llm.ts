import Anthropic from '@anthropic-ai/sdk';
import type { LlmConfig } from './config.ts';

/** Room for the answer (and for the thinking some models do by default). The answer itself stays short. */
const MAX_TOKENS = 4096;

export interface LlmRequest {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  /** Answer now: tools stay declared (the history contains tool_use blocks) but may not be called. */
  noTools?: boolean;
  /** Hard limit for this one call; the caller derives it from the overall deadline. */
  timeoutMs: number;
}

/** The only thing the chat loop needs from a model. Tests and demos can pass a scripted one. */
export interface LlmClient {
  readonly model: string;
  createMessage(request: LlmRequest): Promise<Anthropic.Message>;
}

/** null without a key: callers then use their deterministic path. The key is never logged or echoed. */
export function createLlmClient(config: LlmConfig | null): LlmClient | null {
  if (!config) return null;
  // No SDK retries: the overall deadline is ours, and the deterministic fallback is the retry.
  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 0 });
  return {
    model: config.model,
    // No sampling params (rejected by newer models), no forced tool_choice; thinking blocks stay in `content` so they can be echoed back.
    createMessage: (request) =>
      client.messages.create(
        {
          model: config.model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: request.messages,
          tools: request.tools,
          ...(request.noTools ? { tool_choice: { type: 'none' as const } } : {}),
        },
        { timeout: request.timeoutMs },
      ),
  };
}
