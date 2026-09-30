import { COUNTRY_LABELS, type AssessedSource, type ChatContext } from '@tectonic/shared';
import { useEffect, useId, useMemo, useState } from 'react';
import { Icon, StatusBadge, Tick, VERDICT_TONE, isSupporting, monthLabel } from '../kennis/ui.tsx';
import { Markdown, type CitationLookup } from './Markdown.tsx';
import { SourceCard, type UserLookup } from './SourceCard.tsx';
import { ToolTrace } from './ToolTrace.tsx';
import type { AssistantEntry, ChatErrorInfo, UserEntry } from './useConversation.ts';

export const contextLabel = (c: ChatContext) => [COUNTRY_LABELS[c.country], c.client ?? 'Alle klanten', monthLabel(c.period)].join(' · ');

export function UserMessage({ entry }: { entry: UserEntry }) {
  return (
    <article className="ch-msg ch-msg--user" aria-label="Jouw vraag" data-testid="ch-user">
      <p>{entry.content}</p>
    </article>
  );
}

/** "Waarom niet?": the other sources on the topic and the plain-language reason each one does not apply (or only partly). */
function WhyNot({ assessment, userName, baseId }: { assessment: NonNullable<AssistantEntry['result']['assessment']>; userName: UserLookup; baseId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const others = assessment.sources.filter((s) => s.id !== assessment.best?.id);
  if (others.length === 0) return null;
  return (
    <details className="ch-fold ch-why" open data-testid="ch-why">
      <summary>
        <Icon name="info" size={16} /> Waarom niet? ({others.length})
      </summary>
      <p className="kn-muted ch-why-intro">
        {assessment.best ? 'Deze bronnen zijn ook gevonden, maar zijn niet gekozen.' : 'Deze bronnen zijn gevonden, maar geen ervan geldt bevestigd voor deze context.'}
      </p>
      <ul className="ch-why-list">
        {others.map((s) => {
          const tone = VERDICT_TONE[s.verdict.kind];
          const open = openId === s.id;
          const panelId = `${baseId}-why-${s.id}`;
          return (
            <li key={s.id}>
              <button type="button" className="ch-why-row" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpenId(open ? null : s.id)}>
                <span className="kn-src-id">{s.code}</span>
                <span className="ch-why-title">{s.title}</span>
                <span className={`kn-verdict kn-verdict--${tone}`}>
                  <Tick tone={tone} /> {s.verdict.label}
                </span>
                <Icon name="chevron" size={16} />
              </button>
              {open && <SourceCard source={s} userName={userName} id={panelId} />}
            </li>
          );
        })}
      </ul>
      <p className="kn-footnote">
        <Icon name="info" size={15} /> Een geldig document is niet automatisch van toepassing.
      </p>
    </details>
  );
}

function GapNote({ topic, context }: { topic: string | null; context: ChatContext }) {
  return (
    <div className="ch-gap" role="note" data-testid="ch-gap">
      <Icon name="info" size={20} />
      <div>
        <strong>Kennislacune</strong>
        <p>
          {topic
            ? `Er is kennis over “${topic}”, maar geen enkele bron geldt bevestigd voor ${contextLabel(context)}. Bekijk hieronder waarom, en vraag de eigenaar of een collega om de bron te bevestigen.`
            : 'Bij deze vraag vonden we geen bron in de werkruimtes waar je toegang toe hebt. Dit is een gat in de kennis: vraag een collega en leg het antwoord daarna vast.'}
        </p>
      </div>
    </div>
  );
}

export function AssistantMessage({ entry, userName }: { entry: AssistantEntry; userName: UserLookup }) {
  const { result, context } = entry;
  const baseId = useId();
  const [openCode, setOpenCode] = useState<string | null>(null);

  const byCode = useMemo(() => {
    const map = new Map<string, AssessedSource>();
    for (const s of [...result.citations, ...(result.assessment?.best ? [result.assessment.best] : []), ...(result.assessment?.sources ?? [])]) {
      if (!map.has(s.code.toUpperCase())) map.set(s.code.toUpperCase(), s);
    }
    return map;
  }, [result]);

  const cite = useMemo<CitationLookup>(
    () => ({
      has: (code) => byCode.has(code),
      title: (code) => byCode.get(code)?.title ?? code,
      offLabel: (code) => {
        const s = byCode.get(code);
        return s && !isSupporting(s.verdict) ? s.verdict.label : undefined;
      },
      isOpen: (code) => openCode === code,
      toggle: (code) => setOpenCode((cur) => (cur === code ? null : code)),
      panelId: (code) => `${baseId}-src-${code}`,
    }),
    [byCode, openCode, baseId],
  );

  const opened = openCode ? byCode.get(openCode) : undefined;
  const best = result.assessment?.best ?? null;

  return (
    <article className="ch-msg ch-msg--assistant" aria-label="Antwoord" data-testid="ch-assistant" data-status={result.status} data-mode={result.mode}>
      <header className="ch-trust">
        <StatusBadge status={result.status} label={result.statusLabel} />
        {best && (
          <span className="kn-muted">
            Onderbouwing {best.onderbouwing.score}/100
          </span>
        )}
        {result.mode === 'fallback' && (
          <span className="ch-mode" title="Dit antwoord is samengesteld met vaste regels, zonder taalmodel.">
            Zonder AI-model (regels)
          </span>
        )}
      </header>

      <div className="ch-answer" data-testid="ch-answer">
        <Markdown text={result.answer} cite={cite} />
      </div>

      {result.status === 'geen' && <GapNote topic={result.assessment?.topic ?? null} context={context} />}

      {result.citations.length > 0 && (
        <div className="ch-sources" data-testid="ch-sources">
          <span className="ch-label">Bronnen</span>
          {result.citations.map((s) => {
            const code = s.code.toUpperCase();
            const open = openCode === code;
            const off = !isSupporting(s.verdict);
            return (
              <button key={s.id} type="button" className={`ch-source-pill${open ? ' is-open' : ''}${off ? ' ch-source-pill--off' : ''}`} aria-expanded={open} aria-controls={open ? `${baseId}-src-${code}` : undefined} onClick={() => cite.toggle(code)}>
                {off ? <Tick tone={VERDICT_TONE[s.verdict.kind]} /> : <Icon name={s.kind === 'chat' ? 'chat' : 'file'} size={15} />}
                <span className="kn-src-id">{s.code}</span> {s.title}
                {off && <span className="ch-pill-note"> · {s.verdict.label}</span>}
              </button>
            );
          })}
        </div>
      )}
      {opened && <SourceCard source={opened} userName={userName} id={`${baseId}-src-${openCode}`} />}

      {result.assessment && <WhyNot assessment={result.assessment} userName={userName} baseId={baseId} />}
      <ToolTrace calls={result.toolCalls} />
      <footer className="ch-asof">Antwoord voor {contextLabel(context)}</footer>
    </article>
  );
}

const STAGES = ['Kennis zoeken', 'Vertrouwen beoordelen', 'Antwoord schrijven'] as const;
const STAGE_AT_MS = [0, 1100, 2600];

/** The API does not stream, so this is a timed indicator; the real trace replaces it when the answer arrives. */
export function PendingMessage() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = STAGE_AT_MS.slice(1).map((ms, i) => window.setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(window.clearTimeout);
  }, []);
  return (
    <article className="ch-msg ch-msg--assistant ch-pending" aria-label="Antwoord wordt opgesteld" data-testid="ch-pending">
      <p className="sr-only">Bezig met antwoorden</p>
      <ol className="ch-progress">
        {STAGES.map((label, i) => (
          <li key={label} className={i < stage ? 'is-done' : i === stage ? 'is-current' : ''} aria-current={i === stage ? 'step' : undefined}>
            {i < stage ? <Tick tone="good" /> : <span className={`ch-dot${i === stage ? ' is-pulsing' : ''}`} aria-hidden="true" />}
            <span>
              {label}
              {i <= stage ? '…' : ''}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function ErrorMessage({ error, onRetry, busy }: { error: ChatErrorInfo; onRetry: () => void; busy: boolean }) {
  return (
    <article className="ch-msg ch-msg--error" role="alert" aria-label="Fout" data-testid="ch-error">
      <strong>{error.title}</strong>
      <p>{error.message}</p>
      {error.issues.length > 0 && (
        <ul>
          {error.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {error.technical && <p className="kn-muted">{error.technical}</p>}
      <button type="button" className="kn-btn kn-btn--outline ch-retry" onClick={onRetry} disabled={busy}>
        <Icon name="refresh" size={16} /> Opnieuw proberen
      </button>
    </article>
  );
}
