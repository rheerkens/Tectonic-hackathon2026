import type { ChatContext, ChatResult, ChatTurn } from '@tectonic/shared';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../lib/api.ts';
import { useChat } from '../lib/queries.ts';

/** A conversation is client state only: nothing is stored, "Nieuw gesprek" just empties it. */
export interface UserEntry {
  id: string;
  kind: 'user';
  content: string;
  context: ChatContext;
}
export interface AssistantEntry {
  id: string;
  kind: 'assistant';
  result: ChatResult;
  /** The context the question was answered for (the context can change between questions). */
  context: ChatContext;
}
export interface ErrorEntry {
  id: string;
  kind: 'error';
  error: ChatErrorInfo;
}
export type ChatEntry = UserEntry | AssistantEntry | ErrorEntry;

export interface ChatErrorInfo {
  title: string;
  message: string;
  /** Validation problems, one per line ("messages.0.content: ..."). */
  issues: string[];
  /** The raw server message when we replaced it by friendlier text. */
  technical: string | null;
}

export const MAX_TURNS = 20;
export const MAX_LENGTH = 4000;

/** What goes over the wire: at most the last 20 turns, starting with a user turn, assistants as their answer text. */
export function toTurns(entries: ChatEntry[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const e of entries) {
    if (e.kind === 'user') turns.push({ role: 'user', content: e.content.slice(0, MAX_LENGTH) });
    else if (e.kind === 'assistant') turns.push({ role: 'assistant', content: e.result.answer.trim().slice(0, MAX_LENGTH) || '(geen antwoord)' });
  }
  const last = turns.slice(-MAX_TURNS);
  while (last.length > 1 && last[0]!.role === 'assistant') last.shift();
  return last;
}

function validationIssues(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d) => {
    if (typeof d !== 'object' || d === null) return [];
    const { path, message } = d as { path?: unknown; message?: unknown };
    if (typeof message !== 'string') return [];
    const where = Array.isArray(path) && path.length > 0 ? `${path.join('.')}: ` : '';
    return [`${where}${message}`];
  });
}

/** Turns whatever went wrong into Dutch text that says what the user can do about it. */
export function describeError(error: unknown): ChatErrorInfo {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return { title: 'Te veel vragen', message: 'Je stelt te veel vragen in korte tijd. Wacht even en probeer het dan opnieuw.', issues: [], technical: null };
    }
    if (error.code === 'network') {
      return { title: 'Geen verbinding', message: 'We konden de server niet bereiken. Controleer je verbinding en probeer het opnieuw.', issues: [], technical: error.message };
    }
    if (error.code === 'validation_failed' || error.code === 'bad_request') {
      return { title: 'Deze vraag kan niet verwerkt worden', message: error.message, issues: validationIssues(error.details), technical: null };
    }
    if (error.status === 401 || error.status === 403) {
      return { title: 'Geen toegang', message: error.message, issues: [], technical: null };
    }
    return { title: 'Er ging iets mis', message: error.message, issues: [], technical: null };
  }
  return { title: 'Er ging iets mis', message: error instanceof Error ? error.message : 'Onbekende fout', issues: [], technical: null };
}

export function useConversation(context: ChatContext) {
  const chat = useChat();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pending, setPending] = useState(false);

  // Refs keep the async callbacks honest: they see the latest list/context, and a reset invalidates in-flight answers.
  const entriesRef = useRef<ChatEntry[]>([]);
  const contextRef = useRef(context);
  const pendingRef = useRef(false);
  const epoch = useRef(0);
  const nextId = useRef(1);
  contextRef.current = context;

  const commit = useCallback((next: ChatEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);
  const setBusy = useCallback((busy: boolean) => {
    pendingRef.current = busy;
    setPending(busy);
  }, []);
  const newId = () => `m${nextId.current++}`;

  const run = useCallback(
    (list: ChatEntry[]) => {
      const mine = epoch.current;
      const ctx = contextRef.current;
      setBusy(true);
      chat.mutateAsync({ messages: toTurns(list), context: ctx }).then(
        (result) => {
          if (mine !== epoch.current) return;
          commit([...entriesRef.current, { id: newId(), kind: 'assistant', result, context: ctx }]);
          setBusy(false);
        },
        (error: unknown) => {
          if (mine !== epoch.current) return;
          commit([...entriesRef.current, { id: newId(), kind: 'error', error: describeError(error) }]);
          setBusy(false);
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chat.mutateAsync` is stable
    [commit, setBusy],
  );

  /** Adds the user's message and asks. Returns false when nothing was sent (empty, or a question is still running). */
  const send = useCallback(
    (text: string): boolean => {
      const content = text.trim();
      if (!content || pendingRef.current) return false;
      const next: ChatEntry[] = [...entriesRef.current.filter((e) => e.kind !== 'error'), { id: newId(), kind: 'user', content, context: contextRef.current }];
      commit(next);
      run(next);
      return true;
    },
    [commit, run],
  );

  /** After an error: drop the error bubble and send the same conversation again (the user message stays). */
  const retry = useCallback(() => {
    if (pendingRef.current) return;
    const next = entriesRef.current.filter((e) => e.kind !== 'error');
    if (next.at(-1)?.kind !== 'user') return;
    commit(next);
    run(next);
  }, [commit, run]);

  const reset = useCallback(() => {
    epoch.current += 1;
    commit([]);
    setBusy(false);
  }, [commit, setBusy]);

  const lastUserText = [...entries].reverse().find((e): e is UserEntry => e.kind === 'user')?.content ?? '';
  return { entries, pending, send, retry, reset, lastUserText };
}
