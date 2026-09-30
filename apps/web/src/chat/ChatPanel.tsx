import type { ChatContext } from '@tectonic/shared';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import lumi from '../../../../docs/branding/assets/lumi.svg';
import { ContextSelects, Icon, type AskContext } from '../kennis/ui.tsx';
import { useAccess, useUsers } from '../lib/queries.ts';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { AssistantMessage, ErrorMessage, PendingMessage, UserMessage, contextLabel } from './Messages.tsx';
import { useConversation, type ChatEntry } from './useConversation.ts';
import './chat.css';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NEAR_BOTTOM_PX = 96;

/**
 * Lumi, the chat assistant: a launcher button that opens a native popover panel (Escape and outside clicks close it,
 * focus goes back to the launcher). The panel stays mounted while closed, so the conversation, the draft and the
 * scroll position survive closing it. The panel can be enlarged for long answers.
 */
export function ChatPanel({ context, onContextChange }: { context: ChatContext; onContextChange: (patch: Partial<AskContext>) => void }) {
  const access = useAccess();
  const users = useUsers();
  const conversation = useConversation(context);
  const { entries, pending, send, retry, reset, lastUserText } = conversation;

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true); // is the reader at the bottom? then new content may scroll into view
  const lastTop = useRef(0);
  const seen = useRef(entries.length);
  const [showJump, setShowJump] = useState(false);
  const [unread, setUnread] = useState(false); // an answer arrived while the panel was closed

  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const userName = useCallback((id: string | null) => (id ? names.get(id) : undefined), [names]);

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

  // Opened: put the cursor in the composer and show the reader where they were (a closed panel has no layout, so the scroll offset is gone).
  useEffect(() => {
    if (!open) return;
    setUnread(false);
    const el = scroller.current;
    if (el) el.scrollTop = stuck.current ? el.scrollHeight : lastTop.current;
    composer.current?.focus();
  }, [open]);

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
      if (!open) setUnread(true);
      if (stuck.current) {
        // A long answer should be read from its first line, not its last.
        const msgs = el.querySelectorAll<HTMLElement>('.ch-msg--assistant, .ch-msg--error');
        const newest = msgs[msgs.length - 1];
        if (newest && newest.offsetHeight > el.clientHeight * 0.8) el.scrollTo({ top: el.scrollTop + newest.getBoundingClientRect().top - el.getBoundingClientRect().top - 16, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        else scrollToBottom();
      } else setShowJump(true);
    }
  }, [entries, pending, open, scrollToBottom]);

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

  const examples = access.data?.examples ?? [];
  return (
    <>
      <button ref={launcher} type="button" className="kn-chat-launcher" popoverTarget="lumi-chat" aria-haspopup="dialog" aria-expanded={open} aria-label={unread ? 'Open Lumi, chatassistent (nieuw antwoord)' : 'Open Lumi, chatassistent'} data-testid="lumi-launcher">
        <img src={lumi} alt="" width="56" height="56" />
        {(pending || unread) && !open && <span className={`ch-launcher-dot${unread ? ' is-ready' : ''}`} aria-hidden="true" />}
      </button>
      <section
        id="lumi-chat"
        popover="auto"
        className={`kn-chat-panel ch-panel${expanded ? ' is-expanded' : ''}`}
        role="dialog"
        aria-labelledby="lumi-title"
        aria-busy={pending}
        data-testid="chat-panel"
        onToggle={(e) => {
          const isOpen = e.newState === 'open';
          setOpen(isOpen);
          // The browser returns focus to the launcher; make sure it does even when the panel was closed by a click elsewhere.
          if (!isOpen && document.activeElement === document.body) launcher.current?.focus();
        }}
      >
        <header className="ch-head">
          <img src={lumi} alt="" width="40" height="40" />
          <div className="ch-head-copy">
            <h2 id="lumi-title">Lumi</h2>
            <p>Een frisse blik op je kennisvragen</p>
          </div>
          <button type="button" className="ch-tool" onClick={newConversation} disabled={entries.length === 0 && !pending} data-testid="ch-new" aria-label="Nieuw gesprek" title="Nieuw gesprek">
            <Icon name="plus" size={18} />
          </button>
          <button type="button" className="ch-tool ch-expand" onClick={() => setExpanded(!expanded)} aria-pressed={expanded} aria-label={expanded ? 'Chat verkleinen' : 'Chat vergroten'} title={expanded ? 'Verkleinen' : 'Vergroten'} data-testid="ch-expand">
            <Icon name={expanded ? 'shrink' : 'expand'} size={18} />
          </button>
          <button type="button" className="ch-tool" popoverTarget="lumi-chat" popoverTargetAction="hide" aria-label="Sluit chat" title="Sluiten (Esc)">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="kn-chips ch-context" role="group" aria-label="Context van je vragen">
          <ContextSelects value={context} clients={access.data?.clients ?? []} onChange={onContextChange} />
        </div>

        <div className="ch-scroll" ref={scroller} onScroll={onScroll} data-testid="ch-scroll">
          <div className="ch-log" role="log" aria-live="polite" aria-relevant="additions" aria-busy={pending} aria-label="Gesprek">
            {entries.length === 0 && !pending ? (
              <div className="ch-empty" data-testid="ch-empty">
                <h3>Hoi, ik ben Lumi.</h3>
                <p>
                  Ik zoek in de kennis van je teams en vertel erbij hoe goed het antwoord onderbouwd is. Nu voor <strong>{contextLabel(context)}</strong>.
                </p>
                {access.isPending ? (
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
          <Composer ref={composer} pending={pending} lastUserText={lastUserText} onSend={ask} />
        </div>
      </section>
    </>
  );
}
