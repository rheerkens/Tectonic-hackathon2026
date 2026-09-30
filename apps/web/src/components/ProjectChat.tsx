import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatStatus, ProjectChatToolCall, ProjectChatTurn } from '@tectonic/shared';
import { useSession } from '../auth/context.ts';
import { ApiError } from '../lib/api.ts';
import { postProjectChat } from '../lib/chat.ts';
import { useApiClient } from '../lib/queries.ts';

const ChatMarkdown = lazy(() => import('./ChatMarkdown.tsx').then((module) => ({ default: module.ChatMarkdown })));

interface ProjectChatProps { teams: Array<{ id: string; name: string }> }
interface LiveTurn { id: string; message: string; reply: string; tools: ProjectChatToolCall[]; createdAt: string; status: 'running' | 'failed' | 'cancelled' }
type ChatEntry = ProjectChatTurn | LiveTurn;

export function ProjectChat({ teams }: ProjectChatProps) {
  const session = useSession();
  const api = useApiClient();
  // The team anchors private history; the agent discovers context across accessible teams.
  const projectId = teams[0]?.id ?? null;
  const accessScope = teams.map((team) => team.id).sort().join(':');
  const [history, setHistory] = useState<ProjectChatTurn[]>([]);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const timeline = useRef<HTMLOListElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const launcher = useRef<HTMLButtonElement | null>(null);
  const stickToBottom = useRef(true);
  const alive = useRef(true);
  const scope = useRef(0);

  useEffect(() => {
    alive.current = true;
    const currentScope = ++scope.current;
    const activeController = new AbortController();
    setLoadingHistory(true);
    setHistory([]);
    setLive(null);
    setStatus(null);
    setError(null);
    setMessage('');
    setExpanded({});
    setSending(false);
    stickToBottom.current = true;
    if (!projectId) {
      setLoadingHistory(false);
      return;
    }
    void Promise.all([
      api.request('chatStatus', {}),
      api.request('chatHistory', { projectId }),
    ]).then(([nextStatus, turns]) => {
      if (!alive.current || activeController.signal.aborted || currentScope !== scope.current) return;
      setStatus(nextStatus);
      setHistory(turns);
    }).catch((cause: unknown) => {
      if (!alive.current || activeController.signal.aborted || currentScope !== scope.current) return;
      setError(errorMessage(cause));
    }).finally(() => {
      if (alive.current && !activeController.signal.aborted && currentScope === scope.current) setLoadingHistory(false);
    });
    return () => {
      alive.current = false;
      activeController.abort();
      controller.current?.abort();
      controller.current = null;
    };
  }, [api, projectId, accessScope, session.user.id]);

  useEffect(() => {
    if (stickToBottom.current && timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight;
  }, [history, live]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const currentScope = scope.current;
    setLoadingHistory(true);
    setError(null);
    try {
      const [nextStatus, turns] = await Promise.all([api.request('chatStatus', {}), api.request('chatHistory', { projectId })]);
      if (!alive.current || currentScope !== scope.current) return;
      setStatus(nextStatus);
      setHistory(turns);
      if (!controller.current) setLive(null);
    } catch (cause) {
      if (alive.current && currentScope === scope.current) setError(errorMessage(cause));
    } finally {
      if (alive.current && currentScope === scope.current) setLoadingHistory(false);
    }
  }, [api, projectId]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    setLive((current) => current ? { ...current, status: 'cancelled' } : current);
  }, []);
  const send = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending || !status?.available || !projectId) return;
    const aborter = new AbortController();
    const currentScope = scope.current;
    const previousTurnIds = new Set(history.map((turn) => turn.id));
    controller.current = aborter;
    const createdAt = new Date().toISOString();
    const liveId = `live-${createdAt}`;
    setSending(true);
    setError(null);
    setMessage('');
    setLive({ id: liveId, message: trimmed, reply: '', tools: [], createdAt, status: 'running' });
    try {
      const turn = await postProjectChat({
        projectId, message: trimmed, getAuthHeaders: session.getAuthHeaders, signal: aborter.signal,
        onEvent: (streamEvent) => {
          if (!alive.current || aborter.signal.aborted || currentScope !== scope.current) return;
          setLive((current) => {
            if (!current || current.id !== liveId) return current;
            if (streamEvent.type === 'text') return { ...current, reply: streamEvent.text };
            const oldIndex = current.tools.findIndex((tool) => tool.id === streamEvent.tool.id);
            const tools = [...current.tools];
            if (oldIndex < 0) tools.push(streamEvent.tool);
            else tools[oldIndex] = streamEvent.tool;
            return { ...current, tools };
          });
        },
      });
      if (alive.current && !aborter.signal.aborted && currentScope === scope.current) {
        setHistory((old) => [...old, turn]);
        setLive(null);
      }
    } catch (cause) {
      if (alive.current && aborter.signal.aborted && currentScope === scope.current) {
        void reconcileTurn(currentScope, liveId, trimmed, createdAt, previousTurnIds);
      } else if (alive.current && currentScope === scope.current) {
        setError(errorMessage(cause));
        setMessage(trimmed);
        setLive((current) => current?.id === liveId ? { ...current, status: 'failed' } : current);
        void reconcileTurn(currentScope, liveId, trimmed, createdAt, previousTurnIds);
      }
    } finally {
      if (controller.current === aborter) controller.current = null;
      if (alive.current && currentScope === scope.current) setSending(false);
    }
  }, [history, message, projectId, sending, session.getAuthHeaders, status?.available]);

  async function reconcileTurn(currentScope: number, liveId: string, sentMessage: string, sentAt: string, previousTurnIds: Set<string>) {
    if (!projectId) return;
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      try {
        const turns = await api.request('chatHistory', { projectId });
        const savedTurn = turns.find((turn) => !previousTurnIds.has(turn.id)
          && turn.message === sentMessage
          && Date.parse(turn.createdAt) >= Date.parse(sentAt) - 10_000);
        if (savedTurn && alive.current && currentScope === scope.current) {
          setHistory((current) => mergeTurns(current, turns));
          setLive((current) => current?.id === liveId ? null : current);
          return;
        }
      } catch {
        if (!alive.current || currentScope !== scope.current) return;
      }
      if (!alive.current || currentScope !== scope.current) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  function handleScroll() {
    if (!timeline.current) return;
    const remaining = timeline.current.scrollHeight - timeline.current.scrollTop - timeline.current.clientHeight;
    stickToBottom.current = remaining < 56;
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => composer.current?.focus());
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  const entries: ChatEntry[] = [...history, ...(live ? [live] : [])];

  return (
    <div className="project-chat-launcher">
      {open && <section className="project-chat" aria-label="Project chat">
      <div className="chat-toolbar">
        <div className="chat-title"><span className="chat-assistant-mark" aria-hidden="true"><AssistantIcon /></span><h2>Knowledge assistant</h2></div>
        <button type="button" className="chat-close" aria-label="Close chat" onClick={close}>×</button>
      </div>
      <ol className="chat-timeline" ref={timeline} onScroll={handleScroll} aria-live="polite" aria-label="Chat messages">
        {loadingHistory && entries.length === 0 && <li className="chat-empty muted">Loading your conversation…</li>}
        {!loadingHistory && entries.length === 0 && <li className="chat-empty"><strong>What would you like to know?</strong><span className="muted">Ask about the knowledge sources you have access to.</span></li>}
        {entries.map((turn) => <ChatTurnView key={turn.id} turn={turn} expanded={expanded} onToggle={(id) => setExpanded((old) => ({ ...old, [id]: !old[id] }))} />)}
      </ol>
      {error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" className="kn-btn chat-action" onClick={() => void (message.trim() && status?.available ? send() : reload())}>Retry</button></div>}
      {status && !status.available && <p className="chat-notice muted" role="status">{status.message} Your conversation remains available above.</p>}
      <form className="chat-composer" onSubmit={(event) => void send(event)}>
        <label className="sr-only" htmlFor="project-chat-message">Message</label>
        <textarea ref={composer}
          id="project-chat-message" aria-label="Message" placeholder="Ask about your knowledge sources…" value={message}
          onChange={(event) => setMessage(event.target.value)} onKeyDown={handleKeyDown} rows={2} maxLength={8000}
          disabled={status?.available !== true || sending}
        />
        {sending ? <button type="button" className="kn-btn chat-action chat-action--quiet" onClick={stop}>Stop</button> : <button type="submit" className="kn-btn chat-action" disabled={!message.trim() || status?.available !== true}>Send</button>}
      </form>
      </section>}
      <button ref={launcher} type="button" className="chat-launch-button" aria-label={open ? 'Close project chat' : 'Open project chat'} aria-expanded={open} disabled={teams.length === 0} title={teams.length === 0 ? 'No team is available for chat' : undefined} onClick={() => {
        if (open) close(); else {
          setOpen(true);
          if (!controller.current) void reload();
        }
      }}>
        {open ? <span aria-hidden="true">×</span> : <AssistantIcon />}
      </button>
    </div>
  );
}

function ChatTurnView({ turn, expanded, onToggle }: { turn: ChatEntry; expanded: Record<string, boolean>; onToggle: (id: string) => void }) {
  return <li className="chat-turn">
    <div className="chat-message chat-message--user"><span className="chat-message-label">You</span><p>{turn.message}</p></div>
    <div className="chat-message chat-message--assistant"><span className="chat-message-label">Assistant</span><Suspense fallback={<p>{turn.reply || 'Thinking…'}</p>}><ChatMarkdown text={turn.reply || (turn.status === 'cancelled' ? 'Response stopped.' : turn.status === 'running' ? 'Thinking…' : 'No reply was returned.')} /></Suspense>
      {turn.status === 'failed' && <span className="chat-turn-status">This response failed.</span>}
    </div>
    {turn.tools.length > 0 && <div className="chat-tools"><span className="chat-message-label">Knowledge lookups</span>
      {turn.tools.map((tool) => <div className="chat-tool" key={tool.id}>
        <button type="button" aria-expanded={Boolean(expanded[tool.id])} onClick={() => onToggle(tool.id)}>
          <span>{toolDisplayName(tool.name)}</span><span className="muted">{tool.status}</span>
        </button>
        {expanded[tool.id] && <pre>{tool.result ?? (tool.status === 'running' ? 'Running…' : 'No result returned.')}</pre>}
      </div>)}
    </div>}
  </li>;
}

function toolDisplayName(name: string): string {
  const builtInNames: Record<string, string> = {
    list_teams: 'Accessible teams',
    get_team: 'Team details',
    list_sources: 'Knowledge sources',
    get_project: 'Project details',
    list_tasks: 'Task list',
  };
  return builtInNames[name] ?? name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mergeTurns(current: ProjectChatTurn[], fetched: ProjectChatTurn[]): ProjectChatTurn[] {
  const byId = new Map(current.map((turn) => [turn.id, turn]));
  for (const turn of fetched) byId.set(turn.id, turn);
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function AssistantIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" focusable="false">
    <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.25-3.3A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8.5 11.5h.01m3.49 0h.01m3.49 0h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : 'The chat request failed.';
}
