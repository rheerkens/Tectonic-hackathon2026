import { COUNTRIES, COUNTRY_LABELS, scoreSource, type AskInput, type AssessedSource, type Country, type Verdict } from '@tectonic/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../auth/context.ts';
import { Avatar } from '../components/Avatar.tsx';
import { Brand } from '../components/Brand.tsx';
import { UserMenu } from '../components/UserMenu.tsx';
import { ChatPlaceholder } from '../components/ChatPlaceholder.tsx';
import { ConnectionStatus } from '../components/ConnectionStatus.tsx';
import { ErrorState } from '../components/States.tsx';
import { useToasts } from '../components/Toasts.tsx';
import { useAccess, useApproveSource, useAsk, useNaiveAnswer, useUsers } from '../lib/queries.ts';
import { useRealtime, useTeamSubscriptions } from '../realtime/RealtimeProvider.tsx';
import { KennisKaart } from './KennisKaart.tsx';
import { CheckPanel } from './CheckPanel.tsx';
import { DisputeControls } from './DisputeControls.tsx';
import './kennis.css';

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
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg className="kn-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Counts up to `target` when it changes (skipped for reduced motion). */
function useCountUp(target: number, ms = 600): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const v = Math.round(origin + (target - origin) * (1 - (1 - t) ** 3));
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Presence() {
  const { presence } = useRealtime();
  const session = useSession();
  const others = presence.filter((u) => u.userId !== session.user.id);
  if (others.length === 0) return null;
  return (
    <div className="kn-presence" aria-label="Wie is er online" data-testid="presence">
      <span className="presence-avatars">
        {others.map((u) => (
          <Avatar key={u.userId} name={u.name} color={u.color} size={30} title={`${u.name} is online`} />
        ))}
      </span>
    </div>
  );
}

const VERDICT_GLYPH = { good: '✓', neutral: '◎', muted: '–', warn: '!' } as const;

function Tick({ tone }: { tone: keyof typeof VERDICT_GLYPH }) {
  return (
    <span className={`kn-tick kn-tick--${tone}`} aria-hidden="true">
      {VERDICT_GLYPH[tone]}
    </span>
  );
}

function Logo() {
  return (
    <div className="kn-logo">
      <Brand />
      <div className="kn-logo-tag">Van kennis naar vertrouwen.</div>
    </div>
  );
}


type Tone = 'good' | 'neutral' | 'muted' | 'warn';
const VERDICT_TONE: Record<Verdict['kind'], Tone> = {
  exception: 'good',
  general: 'neutral',
  unconfirmed: 'warn',
  expired: 'muted',
  superseded: 'muted',
  'other-client': 'muted',
  'other-country': 'muted',
};

const PERIODS = ['2026-09', '2026-10', '2026-11'];
const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const text = new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const dateLabel = (iso: string) => new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const STATUS_TONE = { onderbouwd: 'good', deels: 'warn', onvoldoende: 'warn', geen: 'muted' } as const;

function Sidebar({ teams }: { teams: Array<{ id: string; name: string }> }) {
  return (
    <aside className="kn-sidebar" aria-label="Werkruimte">
      <div className="kn-section">Werkruimte</div>
      <a href="#/" className="kn-nav is-active" aria-current="page">
        <Icon name="search" /> Kennis zoeken
      </a>
      <hr />
      <div className="kn-section">Mijn toegang</div>
      {teams.map((t) => (
        <div key={t.id} className="kn-nav kn-nav--static">
          <Icon name="users" /> {t.name}
        </div>
      ))}
      <div className="kn-nav kn-nav--static kn-nav--muted">
        <Icon name="lock" /> Toegang gecontroleerd
      </div>
      <div className="kn-demo-note">Demo met fictieve gegevens</div>
    </aside>
  );
}

// Tijdreis: herbereken de onderbouwing voor een andere periode, puur in de browser.
const TRAVEL = Array.from({ length: 24 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);

function TimeTravel({ source, country, client }: { source: AssessedSource; country: Country; client: string | null }) {
  const [i, setI] = useState(TRAVEL.indexOf('2026-10'));
  const period = TRAVEL[i]!;
  const { score, checks } = scoreSource(source, { country, client, period });
  const shown = useCountUp(score, 350);
  const valid = checks.find((c) => c.key === 'valid')!;
  return (
    <>
      <h3 className="kn-h3">Tijdreis</h3>
      <input type="range" min={0} max={TRAVEL.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Periode" style={{ width: '100%' }} />
      <p className="kn-line">
        <Icon name="calendar" /> {monthLabel(period)}: <b>{shown}</b> / 100 · {valid.label} {valid.points}/{valid.max}
      </p>
      <hr />
    </>
  );
}

function Panel({ source, users, canApprove, canDispute, canResolve, country, client }: { source: AssessedSource; users: Map<string, { name: string; email: string | null }>; canApprove: boolean; canDispute: boolean; canResolve: boolean; country: Country; client: string | null }) {
  const approve = useApproveSource();
  const score = useCountUp(source.onderbouwing.score);
  const toasts = useToasts();
  const owner = source.ownerId ? users.get(source.ownerId) : undefined;
  return (
    <aside className="kn-panel" data-testid="kn-panel" aria-label="Geselecteerde bron">
      <div className="kn-section">Geselecteerde bron</div>
      <h2>{source.title}</h2>
      <p className="kn-panel-sub">
        {source.code}
        {source.version ? ` · versie ${source.version}` : ''}
      </p>
      <div className="kn-score-head">
        <strong>Onderbouwing</strong>
        <span>
          <b data-testid="kn-score">{score}</b> / 100
        </span>
      </div>
      <div className="kn-bar" role="progressbar" aria-label="Onderbouwing" aria-valuenow={source.onderbouwing.score} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ transform: `scaleX(${source.onderbouwing.score / 100})` }} />
      </div>
      <ul className="kn-checks">
        {source.onderbouwing.checks.map((c) => (
          <li key={c.key}>
            <Tick tone={c.points === c.max ? 'good' : 'warn'} />
            <span>{c.label}</span>
            <span className="kn-points">
              {c.points} / {c.max}
            </span>
          </li>
        ))}
      </ul>
      <p className="kn-score-note">Deze score beoordeelt de onderbouwing, niet de kans dat het antwoord waar is.</p>
      <hr />
      <h3 className="kn-h3">Verantwoordelijke</h3>
      {owner ? (
        <div className="kn-owner">
          <span className="kn-avatar">{owner.name[0]}</span>
          <strong>{owner.name}</strong>
        </div>
      ) : (
        <p className="kn-muted">Geen eigenaar bekend</p>
      )}
      <hr />
      <h3 className="kn-h3">Geldigheid</h3>
      <p className="kn-line">
        <Icon name="calendar" /> {dateLabel(source.validFrom)} {source.validTo ? `t/m ${dateLabel(source.validTo)}` : 'en doorlopend'}
      </p>
      <hr />
      <TimeTravel key={source.id} source={source} country={country} client={client} />
      <h3 className="kn-h3">Toegang</h3>
      <p className="kn-line">
        <Icon name="lock" /> {source.projectName}
      </p>
      {canApprove && (
        <button
          type="button"
          className="kn-btn kn-btn--full"
          disabled={approve.isPending}
          onClick={() => approve.mutate(source.id, { onError: (e) => toasts.push({ kind: 'error', title: 'Niet toegestaan', message: e.message }) })}
        >
          Bevestig deze bron
        </button>
      )}
      <DisputeControls source={source} canDispute={canDispute} canResolve={canResolve} disputerName={source.disputedById ? users.get(source.disputedById)?.name : undefined} />
      {owner?.email && (
        <a className="kn-btn kn-btn--outline" href={`mailto:${owner.email}?subject=${encodeURIComponent(`Verduidelijking: ${source.title}`)}`}>
          Vraag verduidelijking
        </a>
      )}
    </aside>
  );
}

export function KennisPage() {
  const session = useSession();
  const access = useAccess();
  const users = useUsers();
  const [question, setQuestion] = useState('');
  const [country, setCountry] = useState<Country>('BE');
  const [client, setClient] = useState<string | null>(null);
  const [period, setPeriod] = useState('2026-10');
  const [asked, setAsked] = useState<AskInput | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useTeamSubscriptions(useMemo(() => access.data?.teams.map((t) => t.id) ?? [], [access.data]));

  // First load: prefill the first example, and the first client (the demo scenario) and ask once.
  useEffect(() => {
    if (!access.data || asked) return;
    const q = access.data.examples[0] ?? '';
    const c = access.data.clients[0] ?? null;
    setQuestion(q);
    setClient(c);
    if (q) setAsked({ question: q, country, client: c, period });
  }, [access.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const [compare, setCompare] = useState(false);
  const ask = useAsk(asked);
  const naive = useNaiveAnswer(asked, compare);
  const userMap = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);
  const result = ask.data;
  const selected = result?.sources.find((s) => s.id === selectedId) ?? result?.best ?? result?.sources[0] ?? null;
  const roleOf = (projectId: string) => access.data?.teams.find((t) => t.id === projectId)?.role;
  const canApprove = !!selected && selected.status === 'unconfirmed' && roleOf(selected.projectId) !== 'viewer' && (selected.ownerId === session.user.id || (selected.ownerId === null && roleOf(selected.projectId) === 'owner'));

  const isOwner = !!selected && roleOf(selected.projectId) !== 'viewer' && (selected.ownerId === session.user.id || (selected.ownerId === null && roleOf(selected.projectId) === 'owner'));
  const canDispute = !!selected && roleOf(selected.projectId) !== 'viewer';

  const run = (next?: Partial<AskInput>) => {
    const input: AskInput = { question, country, client, period, ...next };
    if (input.question.trim().length >= 3) setAsked(input);
  };

  return (
    <div className="kn" data-testid="kennis-page">
      <header className="kn-top">
        <Logo />
        <div className="kn-user">
          <Presence />
          <ConnectionStatus />
          <UserMenu />
        </div>
      </header>
      <a className="kn-skip" href="#kn-main" onClick={(e) => { e.preventDefault(); document.getElementById('kn-main')?.focus(); }}>
        Naar hoofdinhoud
      </a>
      <Sidebar teams={access.data?.teams ?? []} />
      <main className="kn-main" id="kn-main" tabIndex={-1}>
        <nav className="kn-crumbs" aria-label="Kruimelpad">
          {[client ?? 'Alle klanten', 'Payroll', monthLabel(period)].map((c, i) => (
            <span key={c}>
              {i > 0 && <span className="kn-sep">/</span>}
              {c}
            </span>
          ))}
        </nav>
        <h1>Welke afspraak geldt?</h1>
        <form
          className="kn-ask"
          role="search"
          data-loading={ask.isFetching}
          aria-busy={ask.isFetching}
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Stel je vraag" aria-label="Stel je vraag" />
          <button type="submit" aria-label="Zoek">
            <Icon name="arrow" />
          </button>
        </form>
        <span className="sr-only" role="status">{ask.isFetching ? 'Bronnen worden gecontroleerd.' : ''}</span>
        <div className="kn-chips">
          <select className="kn-chip" value={country} aria-label="Land" onChange={(e) => { setCountry(e.target.value as Country); run({ country: e.target.value as Country }); }}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_LABELS[c]}
              </option>
            ))}
          </select>
          <select className="kn-chip" value={client ?? ''} aria-label="Klant" onChange={(e) => { const v = e.target.value || null; setClient(v); run({ client: v }); }}>
            <option value="">Alle klanten</option>
            {(access.data?.clients ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="kn-chip" value={period} aria-label="Periode" onChange={(e) => { setPeriod(e.target.value); run({ period: e.target.value }); }}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {monthLabel(p)}
              </option>
            ))}
          </select>
          <button type="button" className={`kn-chip kn-chip--toggle${compare ? ' is-on' : ''}`} aria-pressed={compare} onClick={() => setCompare(!compare)}>
            Vergelijk
          </button>
        </div>

        {access.isError && <ErrorState title="Kon je toegang niet laden" message={access.error.message} onRetry={() => void access.refetch()} />}
        {ask.isError && <ErrorState title="Kon geen antwoord geven" message={ask.error.message} onRetry={() => void ask.refetch()} />}

        {(access.isPending || ask.isFetching) && !result && (
          <section className="kn-answer kn-answer--muted" aria-busy="true" aria-label="Antwoord laden" data-testid="kn-loading">
            <span className="skeleton skeleton-text" style={{ width: 140 }} />
            <span className="skeleton skeleton-text" style={{ width: '50%', height: 40, marginTop: 14 }} />
            <span className="skeleton skeleton-text" style={{ width: '90%', marginTop: 14 }} />
          </section>
        )}

        {compare && result && (
          <section className="kn-compare" data-testid="kn-compare">
            <div className="kn-compare-col kn-compare-col--naive">
              <h3 className="kn-h3">Gewone AI</h3>
              {naive.isError ? <p>Kon geen antwoord ophalen.</p> : naive.data ? <p className="kn-answer-text">{naive.data.answer ?? 'Geen antwoord gevonden.'}</p> : <p className="kn-muted">Laden…</p>}
              <p className="kn-muted">Stellig, zonder score en zonder uitleg.</p>
            </div>
            <div className="kn-compare-col kn-compare-col--lens">
              <h3 className="kn-h3">SDtrust</h3>
              <span className="kn-badge">
                <Tick tone={STATUS_TONE[result.status]} /> {result.statusLabel}
                {result.best ? ` · onderbouwing ${result.best.onderbouwing.score}/100` : ''}
              </span>
              <p className="kn-answer-text">{result.best ? result.best.claim : 'Geen onderbouwd antwoord.'}</p>
              <ul className="kn-reasons">
                {result.sources.map((s) => (
                  <li key={s.id}>
                    <strong>{s.code}</strong> {s.verdict.label}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {result && (
          <>
            <section key={`${result.status}-${result.best?.id ?? ''}`} className={`kn-answer kn-answer--${STATUS_TONE[result.status]}`} data-testid="kn-answer" data-status={result.status} role="status" aria-live="polite" aria-busy={ask.isFetching}>
              <span className="kn-badge">
                <Tick tone={STATUS_TONE[result.status]} /> {result.statusLabel}
              </span>
              {result.best ? (
                <>
                  <h2>{result.best.value}</h2>
                  <p className="kn-answer-text">{result.best.claim}</p>
                  <p className="kn-meta">
                    Geldig voor {monthLabel(period)}
                    {result.best.approvedById ? ` · Bevestigd door ${userMap.get(result.best.approvedById)?.name ?? 'een collega'}` : ''}
                  </p>
                  {result.best.quote && (
                    <blockquote className="kn-quote">
                      <span aria-hidden="true">“</span> {result.best.quote} <span aria-hidden="true">”</span>
                    </blockquote>
                  )}
                  <div className="kn-answer-foot">
                    <a className="kn-source-link" href="#/" onClick={(e) => { e.preventDefault(); setSelectedId(result.best!.id); }}>
                      <Icon name="file" /> {result.best.code} · {result.best.title}
                      {result.best.version ? ` · versie ${result.best.version}` : ''}
                    </a>
                    <button type="button" className="kn-btn" onClick={() => setSelectedId(result.best!.id)}>
                      Bekijk bron
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>Geen onderbouwd antwoord</h2>
                  <p className="kn-answer-text">
                    {result.topic ? 'Geen enkele bron geldt bevestigd voor deze context. Bekijk hieronder waarom.' : 'We vonden geen bron bij deze vraag in de werkruimtes waar je toegang toe hebt.'}
                  </p>
                </>
              )}
            </section>

            {result.sources.length > 0 && (
              <section>
                <h3 className="kn-h3">Waarom deze bron?</h3>
                <table className="kn-table" aria-label="Bronnen en beoordeling">
                  <thead>
                    <tr>
                      <th>Bron</th>
                      <th>Beoordeling</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sources.map((s) => {
                      const tone = VERDICT_TONE[s.verdict.kind];
                      return (
                        <tr key={s.id} className={s.id === selected?.id ? 'is-selected' : ''} onClick={() => setSelectedId(s.id)} tabIndex={0} aria-current={s.id === selected?.id} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(s.id); } }}>
                          <td>
                            <span className="kn-src">
                              <Icon name={s.kind === 'chat' ? 'chat' : 'file'} size={18} />
                              <span className="kn-src-id">{s.code}</span>
                              {s.title}
                            </span>
                          </td>
                          <td>
                            <span className={`kn-verdict kn-verdict--${tone}`}>
                              <Tick tone={tone} /> {s.verdict.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="kn-footnote">
                  <Icon name="info" size={15} /> Een geldig document is niet automatisch van toepassing.
                </p>
              </section>
            )}
          </>
        )}
        <KennisKaart users={userMap} onSelect={setSelectedId} />
        <CheckPanel country={country} />
      </main>
      {selected ? <Panel source={selected} users={userMap} canApprove={canApprove} canDispute={canDispute} canResolve={isOwner} country={country} client={client} /> : <aside className="kn-panel" aria-label="Geselecteerde bron"><p className="kn-muted">Selecteer een bron om de onderbouwing te zien.</p></aside>}
      <ChatPlaceholder />
    </div>
  );
}
