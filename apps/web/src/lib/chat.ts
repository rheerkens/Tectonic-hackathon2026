import { ApiErrorBodySchema, CHAT_STREAM_PATH, ChatEventSchema, ProjectChatInputSchema, buildPath, type ChatEvent, type ProjectChatTurn, type PathParams } from '@tectonic/shared';
import { ApiError, type AuthHeaders } from './api.ts';
import { apiUrl } from './config.ts';

const MAX_LINE_LENGTH = 1_000_000;

export interface PostProjectChatOptions {
  projectId: string;
  message: string;
  getAuthHeaders: AuthHeaders;
  signal?: AbortSignal;
  onEvent?: (event: Exclude<ChatEvent, { type: 'done' | 'error' }>) => void;
}

export async function postProjectChat({ projectId, message, getAuthHeaders, signal, onEvent }: PostProjectChatOptions): Promise<ProjectChatTurn> {
  const input = ProjectChatInputSchema.safeParse({ message });
  if (!input.success) throw new ApiError(400, 'validation_failed', input.error.issues[0]?.message ?? 'Enter a message.');

  const pathParams: PathParams<typeof CHAT_STREAM_PATH> = { projectId };
  const response = await fetch(apiUrl(buildPath(CHAT_STREAM_PATH, pathParams)), {
    method: 'POST',
    headers: { accept: 'application/x-ndjson', 'content-type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(input.data),
    signal,
  });

  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
    throw new ApiError(response.status, 'unexpected', `Request failed with status ${response.status}`);
  }
  if (!response.body) throw new ApiError(response.status, 'unexpected', 'The chat response has no readable stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let turn: ProjectChatTurn | undefined;
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > MAX_LINE_LENGTH && !buffer.includes('\n')) throw new ApiError(response.status, 'unexpected', 'The chat response line is too large.');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          if (line.length > MAX_LINE_LENGTH) throw new ApiError(response.status, 'unexpected', 'The chat response line is too large.');
          const event = parseEvent(line, response.status);
          if (event.type === 'done') turn = event.turn;
          else if (event.type === 'error') throw new ApiError(response.status, 'unexpected', event.message);
          else onEvent?.(event);
        }
        newline = buffer.indexOf('\n');
      }
      if (done) break;
    }
    const lastLine = buffer.trim();
    if (lastLine) {
      if (lastLine.length > MAX_LINE_LENGTH) throw new ApiError(response.status, 'unexpected', 'The chat response line is too large.');
      const event = parseEvent(lastLine, response.status);
      if (event.type === 'done') turn = event.turn;
      else if (event.type === 'error') throw new ApiError(response.status, 'unexpected', event.message);
      else onEvent?.(event);
    }
    if (!turn) throw new ApiError(response.status, 'unexpected', 'The chat stream ended before the reply was complete.');
    completed = true;
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!turn) throw new ApiError(response.status, 'unexpected', 'The chat stream ended before the reply was complete.');
  return turn;
}

function parseEvent(line: string, status: number): ChatEvent {
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new ApiError(status, 'unexpected', 'The chat response contains invalid JSON.'); }
  const parsed = ChatEventSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(status, 'unexpected', 'The chat response has an unexpected shape.', parsed.error.issues);
  return parsed.data;
}
