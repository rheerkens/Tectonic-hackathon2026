import { COUNTRIES, COUNTRY_LABELS, type AnswerStatus, type Country, type Verdict } from '@tectonic/shared';
import type { ReactNode } from 'react';

/** Small pieces shared by the Kennis page and the chat: icons, ticks, status badge, tones, date labels, context selects. */

const ICONS: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.7 0 4.5 1.8 4.5 4.5" /></>,
  building: <path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 7h3M8 11h3M8 15h3" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  quote: <path d="M9 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2M19 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.5L20 16" /><path d="M20 20v-4h-4" /></>,
  steps: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  shrink: <path d="M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7" />,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg className="kn-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export type Tone = 'good' | 'neutral' | 'muted' | 'warn' | 'bad';
const GLYPH: Record<Tone, string> = { good: '✓', neutral: '◎', muted: '–', warn: '!', bad: '✕' };

export function Tick({ tone }: { tone: Tone }) {
  return (
    <span className={`kn-tick kn-tick--${tone}`} aria-hidden="true">
      {GLYPH[tone]}
    </span>
  );
}

export const VERDICT_TONE: Record<Verdict['kind'], Tone> = {
  exception: 'good',
  general: 'neutral',
  unconfirmed: 'warn',
  expired: 'muted',
  superseded: 'muted',
  'other-client': 'muted',
  'other-country': 'muted',
};

/** Only an exception or the general rule backs an answer; expired, superseded, other-client/-country and unconfirmed sources do not. */
export const isSupporting = (verdict: Verdict) => verdict.kind === 'exception' || verdict.kind === 'general';

export const STATUS_TONE: Record<AnswerStatus, 'good' | 'warn' | 'muted'> = { onderbouwd: 'good', deels: 'warn', onvoldoende: 'warn', geen: 'muted' };

/** The coloured status pill of an answer ("Onderbouwd", "Deels onderbouwd", ...). */
export function StatusBadge({ status, label }: { status: AnswerStatus; label: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`kn-badge kn-badge--${tone}`} data-status={status}>
      <Tick tone={tone} /> {label}
    </span>
  );
}

export const PERIODS = ['2026-09', '2026-10', '2026-11'];
export const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const text = new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const dateLabel = (iso: string) => new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

export interface AskContext {
  country: Country;
  client: string | null;
  period: string;
}

/**
 * The country / client / period selects. The Kennis page and the chat share one context, so both views render these.
 * `touched` marks the ones the user has answered (typed or picked), as opposed to the defaults.
 */
export function ContextSelects({ value, clients, touched, onChange }: { value: AskContext; clients: string[]; touched?: Partial<Record<keyof AskContext, boolean>>; onChange: (patch: Partial<AskContext>) => void }) {
  const cls = (field: keyof AskContext) => `kn-chip${touched?.[field] ? ' is-set' : ''}`;
  return (
    <>
      <select className={cls('country')} data-field="country" value={value.country} aria-label="Land" onChange={(e) => onChange({ country: e.target.value as Country })}>
        {COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {COUNTRY_LABELS[c]}
          </option>
        ))}
      </select>
      <select className={cls('client')} data-field="client" value={value.client ?? ''} aria-label="Klant" onChange={(e) => onChange({ client: e.target.value || null })}>
        <option value="">Alle klanten</option>
        {clients.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select className={cls('period')} data-field="period" value={value.period} aria-label="Periode" onChange={(e) => onChange({ period: e.target.value })}>
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {monthLabel(p)}
          </option>
        ))}
      </select>
    </>
  );
}
