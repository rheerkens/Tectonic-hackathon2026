import type { ChatContext } from '@tectonic/shared';
import { Activity, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ContextSelects, Icon, type AskContext } from '../kennis/ui.tsx';
import { useAccess, useUsers } from '../lib/queries.ts';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { AssistantMessage, ErrorMessage, PendingMessage, UserMessage, contextLabel } from './Messages.tsx';
import { useConversation, type ChatEntry } from './useConversation.ts';
import './chat.css';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NEAR_BOTTOM_PX = 96;

/**
 * The chat view. The conversation lives here (so it survives switching to the Kennis page); the surface below
 * is hidden, not unmounted, while the other view is showing, which keeps the draft and the scroll position.
 */
export function ChatView({ active, context, onContextChange }: { active: boolean; context: ChatContext; onContextChange: (patch: Partial<AskContext>) => void }) {
  const access = useAccess();
  const users = useUsers();
  const conversation = useConversation(context);

  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const userName = useCallback((id: string | null) => (id ? names.get(id) : undefined), [names]);

  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <ChatSurface
        context={context}
        onContextChange={onContextChange}
        clients={access.data?.clients ?? []}
        examples={access.data?.examples ?? []}
        examplesLoading={access.isPending}
        userName={userName}
        {...conversation}
      />
    </Activity>
  );
}

type SurfaceProps = ReturnType<typeof useConversation> & {
  context: ChatContext;
  onContextChange: (patch: Partial<AskContext>) => void;
  clients: string[];
  examples: string[];
  examplesLoading: boolean;
  userName: (id: string | null) => string | undefined;
};

function ChatSurface({ context, onContextChange, clients, examples, examplesLoading, userName, entries, pending, send, retry, reset, lastUserText }: SurfaceProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const stuck = useRef(true); // is the reader at the bottom? then new content may scroll into view
  const lastTop = useRef(0);
  const seen = useRef(entries.length);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    stuck.current = true;
    setShowJump(false);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    lastTop.current = el.scrollTop;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (stuck.current) setShowJump(false);
  };

  // Shown (again) after the other view: restore where the reader was and put the cursor in the composer (not on touch screens, where it opens the keyboard).
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = stuck.current ? scroller.current.scrollHeight : lastTop.current;
    if (window.matchMedia('(pointer: fine)').matches) composer.current?.focus();
  }, []);

  // New content: follow it when the reader is at the bottom (or just asked something); otherwise leave them where they are and offer a jump.
  useLayoutEffect(() => {
    const el = scroller.current;
    const added = entries.length > seen.current;
    seen.current = entries.length;
    if (!el || entries.length === 0) return;
    const last = entries[entries.length - 1]!;
    if (last.kind === 'user') {
      scrollToBottom();
    } else if (added && !pending) {
      if (stuck.current) {
        // A long answer should be read from its first line, not its last.
        const msgs = el.querySelectorAll<HTMLElement>('.ch-msg--assistant, .ch-msg--error');
        const newest = msgs[msgs.length - 1];
        if (newest && newest.offsetHeight > el.clientHeight * 0.8) el.scrollTo({ top: el.scrollTop + newest.getBoundingClientRect().top - el.getBoundingClientRect().top - 16, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        else scrollToBottom();
      } else setShowJump(true);
    }
  }, [entries, pending, scrollToBottom]);

  // While the progress bubble is on screen keep it in view.
  useLayoutEffect(() => {
    if (pending) scrollToBottom();
  }, [pending, scrollToBottom]);

  const ask = (text: string) => {
    const sent = send(text);
    if (sent) composer.current?.focus();
    return sent;
  };
  const retryAndFocus = () => {
    retry();
    composer.current?.focus();
  };
  const newConversation = () => {
    reset();
    stuck.current = true;
    setShowJump(false);
    composer.current?.focus();
  };

  // A divider wherever the context changed between two questions.
  const previous = { context: null as ChatContext | null };
  const render = (entry: ChatEntry) => {
    if (entry.kind === 'user') {
      const changed = previous.context !== null && contextLabel(previous.context) !== contextLabel(entry.context);
      previous.context = entry.context;
      return (
        <Fragment key={entry.id}>
          {changed && (
            <div className="ch-divider" role="separator" aria-label={`Context gewijzigd: ${contextLabel(entry.context)}`}>
              <span>Context: {contextLabel(entry.context)}</span>
            </div>
          )}
          <UserMessage entry={entry} />
        </Fragment>
      );
    }
    if (entry.kind === 'assistant') return <AssistantMessage key={entry.id} entry={entry} userName={userName} />;
    return <ErrorMessage key={entry.id} error={entry.error} onRetry={retryAndFocus} busy={pending} />;
  };

  return (
    <main className="ch" id="ch-main" aria-labelledby="ch-title" data-testid="chat-view">
      <header className="ch-head">
        <div>
          <h1 id="ch-title">Chat</h1>
          <p className="kn-muted">Stel je vraag in gewone taal. Elk antwoord laat zien op welke bronnen het rust en waarom andere bronnen niet gekozen zijn.</p>
        </div>
        <button type="button" className="kn-btn kn-btn--outline ch-new" onClick={newConversation} disabled={entries.length === 0 && !pending} data-testid="ch-new">
          <Icon name="plus" size={16} /> Nieuw gesprek
        </button>
      </header>

      <div className="kn-chips ch-context" role="group" aria-label="Context van je vragen">
        <ContextSelects value={context} clients={clients} onChange={onContextChange} />
      </div>

      <div className="ch-scroll" ref={scroller} onScroll={onScroll} data-testid="ch-scroll">
        <div className="ch-col ch-log" role="log" aria-live="polite" aria-relevant="additions" aria-busy={pending} aria-label="Gesprek">
          {entries.length === 0 && !pending ? (
            <div className="ch-empty" data-testid="ch-empty">
              <h2>Waar kan ik je mee helpen?</h2>
              <p>
                Ik zoek in de kennis van je teams en vertel erbij hoe goed het antwoord onderbouwd is. Nu voor <strong>{contextLabel(context)}</strong>.
              </p>
              {examplesLoading ? (
                <span className="skeleton skeleton-text" style={{ width: '60%', margin: '0 auto' }} aria-hidden="true" />
              ) : (
                examples.length > 0 && (
                  <ul className="ch-examples" aria-label="Voorbeeldvragen">
                    {examples.map((q) => (
                      <li key={q}>
                        <button type="button" className="ch-example" onClick={() => ask(q)} disabled={pending}>
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ) : (
            entries.map(render)
          )}
          {pending && <PendingMessage />}
        </div>
      </div>

      <div className="ch-dock">
        {showJump && (
          <button type="button" className="ch-jump" onClick={() => scrollToBottom()}>
            <Icon name="down" size={16} /> Nieuw antwoord
          </button>
        )}
        <div className="ch-col">
          <Composer ref={composer} pending={pending} lastUserText={lastUserText} onSend={ask} />
        </div>
      </div>
    </main>
  );
}
