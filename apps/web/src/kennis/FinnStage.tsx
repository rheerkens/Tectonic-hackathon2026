import type { ReactNode } from 'react';
import { Avatar } from '../components/Avatar.tsx';
import { ContextSelects, Icon, type AskContext } from './ui.tsx';
import type { Span, Understood } from './understand.ts';
import './finn.css';

export type FinnMood = 'welcome' | 'idle' | 'listening' | 'thinking' | 'answer' | 'verified' | 'uncertain' | 'retry';
export type Touched = Partial<Record<'country' | 'client' | 'period', boolean>>;

const LOOPS: ReadonlySet<FinnMood> = new Set(['idle', 'thinking']);

/** The existing Finn assets (apps/web/public/mascots/finn): the GIF animates, the PNG is the still for reduced motion. */
export function Finn({ mood, stamp = 0 }: { mood: FinnMood; stamp?: number }) {
  const base = `/mascots/finn/finn-${mood}`;
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={`${base}.png`} />
      {/* A fresh element per mood (and per search for one-shot moods) restarts the GIF. */}
      <img key={LOOPS.has(mood) ? mood : `${mood}-${stamp}`} className="fs-finn" src={`${base}.gif`} width={256} height={256} alt="" />
    </picture>
  );
}

function Marked({ text, spans }: { text: string; spans: Span[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const s of spans) {
    parts.push(text.slice(at, s.start));
    parts.push(
      <span key={s.start} className="fs-hl" data-field={s.field}>
        {text.slice(s.start, s.end)}
      </span>,
    );
    at = s.end;
  }
  parts.push(text.slice(at));
  return <>{parts}{/* a trailing newline would collapse, which shifts the caret */ text.endsWith('\n') ? ' ' : null}</>;
}

export interface FinnStageProps {
  userName: string;
  userColor: string;
  question: string;
  onQuestion: (q: string) => void;
  onSubmit: () => void;
  understood: Understood;
  context: AskContext;
  clients: string[];
  touched: Touched;
  onContext: (patch: Partial<AskContext>) => void;
  busy: boolean;
  mood: FinnMood;
  /** Finn's line: a question while the user still has to add something, a short result line afterwards. */
  line: string;
  stamp: number;
}

export function FinnStage(p: FinnStageProps) {
  return (
    <div className="fs-stage" data-mood={p.mood}>
      <form
        className="fs-composer"
        role="search"
        data-loading={p.busy}
        aria-busy={p.busy}
        onSubmit={(e) => {
          e.preventDefault();
          p.onSubmit();
        }}
      >
        <div className="fs-head">
          <label className="fs-who" htmlFor="fs-q">
            <Avatar name={p.userName} color={p.userColor} size={22} title={p.userName} />
            Jouw vraag
          </label>
          {p.understood.topic && (
            <span className="fs-tag" data-field="topic">
              <em>Onderwerp</em> {p.understood.topic}
            </span>
          )}
        </div>
        <div className="fs-editor">
          <div className="fs-mirror" aria-hidden="true">
            <Marked text={p.question} spans={p.understood.spans} />
          </div>
          <textarea
            id="fs-q"
            rows={2}
            value={p.question}
            placeholder="Stel een vraag over een klant, procedure of afspraak…"
            aria-label="Stel je vraag"
            spellCheck={false}
            onChange={(e) => p.onQuestion(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              // Enter sends, like the search field it replaces; the question is one line, so there is nothing to break.
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!e.nativeEvent.isComposing) p.onSubmit();
              }
            }}
          />
        </div>
        <div className="fs-foot">
          <div className="fs-ctx" role="group" aria-label="Context van je vraag">
            <ContextSelects value={p.context} clients={p.clients} touched={p.touched} onChange={p.onContext} />
          </div>
          <button type="submit" className="fs-send">
            Vraag Finn <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>

      <div className="fs-agent">
        <p className="fs-say" role={p.mood === 'thinking' ? 'status' : undefined}>
          {p.line}
        </p>
        <Finn mood={p.mood} stamp={p.stamp} />
      </div>
    </div>
  );
}

/** Shown in place of the answer while a new question is processed. The API returns one result, so there is no per-step progress to show. */
export function SearchingCard({ phase }: { phase: 'access' | 'sources' }) {
  return (
    <section className="kn-answer kn-answer--muted fs-searching" aria-busy="true" aria-label="Antwoord in opbouw" data-testid="kn-loading">
      <span className="kn-badge">
        <span className="fs-pulse" aria-hidden="true" /> Antwoord in opbouw
      </span>
      {phase === 'access' ? (
        <h2>Ik controleer je toegang.</h2>
      ) : (
        <>
          <h2>Ik controleer de bronnen.</h2>
          <p className="kn-answer-text">We controleren land, klant, periode en onderbouwing.</p>
          <h3 className="kn-h3">Zo beoordelen we je vraag</h3>
          <ol className="fs-steps">
            <li>Onderwerp herkennen</li>
            <li>Bronnen beoordelen</li>
            <li>Afspraak selecteren</li>
            <li>Antwoord samenstellen</li>
          </ol>
        </>
      )}
    </section>
  );
}
