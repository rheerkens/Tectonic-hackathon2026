import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../kennis/ui.tsx';
import { MAX_LENGTH } from './useConversation.ts';

export interface ComposerHandle {
  focus(): void;
  /** Puts text in the composer (e.g. an example question) without sending it. */
  setText(text: string): void;
}

/**
 * Enter sends, Shift+Enter adds a line, ArrowUp in an empty composer recalls your last question.
 * The textarea grows with its content; sending is blocked while an answer is on its way.
 */
export const Composer = forwardRef<ComposerHandle, { pending: boolean; lastUserText: string; onSend: (text: string) => boolean }>(function Composer({ pending, lastUserText, onSend }, ref) {
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    setText: (value: string) => {
      setText(value);
      area.current?.focus();
    },
  }));

  // Auto-grow: collapse first so the height can also shrink.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
  }, [text]);

  const canSend = !pending && text.trim().length > 0;
  const submit = useCallback(() => {
    if (!canSend) return;
    if (onSend(text)) {
      setText('');
      area.current?.focus();
    }
  }, [canSend, onSend, text]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp' && text === '' && lastUserText && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setText(lastUserText);
      // Caret to the end once the value has been applied.
      requestAnimationFrame(() => {
        const el = area.current;
        if (el) el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  };

  const nearLimit = text.length >= MAX_LENGTH * 0.8;
  return (
    <form
      className="ch-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="ch-composer-box">
        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Stel een vraag over je kennis…"
          aria-label="Stel je vraag"
          aria-describedby="ch-composer-hint"
          data-testid="ch-input"
        />
        <button type="submit" className="ch-send" disabled={!canSend} aria-label={pending ? 'Bezig met antwoorden' : 'Verstuur'} title={pending ? 'Wacht op het antwoord' : 'Verstuur (Enter)'} data-testid="ch-send">
          <Icon name="arrow" />
        </button>
      </div>
      <div className="ch-composer-foot" id="ch-composer-hint">
        <span>Enter verstuurt · Shift+Enter nieuwe regel · ↑ haalt je vorige vraag terug</span>
        <span className={`ch-count${nearLimit ? ' is-near' : ''}`} aria-live={text.length >= MAX_LENGTH ? 'polite' : 'off'}>
          {text.length.toLocaleString('nl-BE')} / {MAX_LENGTH.toLocaleString('nl-BE')}
        </span>
      </div>
    </form>
  );
});
