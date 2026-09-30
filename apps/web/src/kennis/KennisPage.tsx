import { scoreSource, type AskInput, type AssessedSource, type Country } from '@tectonic/shared';
import { Activity, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/context.ts';
import { Avatar } from '../components/Avatar.tsx';
import { ConnectionStatus } from '../components/ConnectionStatus.tsx';
import { ErrorState } from '../components/States.tsx';
import { useToasts } from '../components/Toasts.tsx';
import { useAccess, useApproveSource, useAsk, useNaiveAnswer, useUsers } from '../lib/queries.ts';
import { useRealtime, useTeamSubscriptions } from '../realtime/RealtimeProvider.tsx';
import { KennisKaart } from './KennisKaart.tsx';
import { CheckPanel } from './CheckPanel.tsx';
import { DisputeControls } from './DisputeControls.tsx';
import { ContextSelects, Icon, type AskContext, STATUS_TONE, Tick, VERDICT_TONE, dateLabel, monthLabel } from './ui.tsx';
import './kennis.css';
import { ChatView } from '../chat/ChatView.tsx';

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
  return (
    <div className="kn-presence" aria-label="Wie is er online" data-testid="presence">
      <span className="presence-avatars">
        {presence.map((u) => (
          <Avatar key={u.userId} name={u.name} color={u.color} size={30} title={u.userId === session.user.id ? `${u.name} (jij)` : u.name} />
        ))}
      </span>
      <span className="kn-muted">{others.length > 0 ? `${others.map((u) => u.name).join(', ')} ${others.length > 1 ? 'zijn' : 'is'} online` : 'Alleen jij'}</span>
    </div>
  );
}

function Logo() {
  return (
    <div className="kn-logo">
      <svg width="30" height="40" viewBox="205 205 215 290" aria-hidden="true">
        <polygon points="212,350 247,350 262,425 227,425" fill="#797e9b" />
        <polygon points="290,290 326,290 304,487 268,487" fill="#e80137" />
        <polygon points="375,213 412,213 366,425 330,425" fill="#f7a901" />
      </svg>
      <div>
        <div className="kn-logo-name">SD Trust</div>
        <div className="kn-logo-tag">Kennis met onderbouwing</div>
      </div>
    </div>
  );
}


/** Two views share the page shell: the question-and-sources page and the conversation. The view lives in the URL hash so it can be linked to (`#/chat`). */
type View = 'zoeken' | 'chat';
const readView = (): View => (window.location.hash.startsWith('#/chat') ? 'chat' : 'zoeken');
function useView(): View {
  const [view, setView] = useState<View>(readView);
  useEffect(() => {
    const onChange = () => setView(readView());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return view;
}

const VIEWS: Array<{ view: View; href: string; label: string; icon: string }> = [
  { view: 'zoeken', href: '#/', label: 'Kennis zoeken', icon: 'search' },
  { view: 'chat', href: '#/chat', label: 'Chat', icon: 'chat' },
];

/** Compact view switch for narrow screens, where the sidebar sits at the bottom of the page. */
function ViewTabs({ view }: { view: View }) {
  return (
    <nav className="kn-views" aria-label="Weergave">
      {VIEWS.map((v) => (
        <a key={v.view} href={v.href} className={`kn-view${v.view === view ? ' is-active' : ''}`} aria-current={v.view === view ? 'page' : undefined}>
          <Icon name={v.icon} size={18} /> {v.label}
        </a>
      ))}
    </nav>
  );
}

function Sidebar({ teams, view }: { teams: Array<{ id: string; name: string }>; view: View }) {
  return (
    <aside className="kn-sidebar" aria-label="Werkruimte">
      <nav className="kn-sidebar-views" aria-label="Weergave">
        <div className="kn-section">Werkruimte</div>
        {VIEWS.map((v) => (
          <a key={v.view} href={v.href} className={`kn-nav${v.view === view ? ' is-active' : ''}`} aria-current={v.view === view ? 'page' : undefined}>
            <Icon name={v.icon} /> {v.label}
          </a>
        ))}
        <hr />
      </nav>
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
        <span style={{ width: `${source.onderbouwing.score}%` }} />
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
  const view = useView();

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

  // One context for both views: changing it in the chat also re-asks the question on the Kennis page, so the two never disagree.
  const changeContext = (patch: Partial<AskContext>) => {
    if (patch.country) setCountry(patch.country);
    if (patch.client !== undefined) setClient(patch.client);
    if (patch.period) setPeriod(patch.period);
    run(patch);
  };

  return (
    <div className={`kn${view === 'chat' ? ' kn--chat' : ''}`} data-testid="kennis-page" data-view={view}>
      <header className="kn-top">
        <Logo />
        <div className="kn-user">
          <Presence />
          <ConnectionStatus />
          <span className="kn-avatar kn-avatar--lg">{session.user.name[0]}</span>
          <div>
            <strong>{session.user.name}</strong>
            <div className="kn-muted">Payrollconsultant</div>
          </div>
          <button type="button" className="kn-link" onClick={session.signOut}>
            Wissel
          </button>
        </div>
      </header>
      <ViewTabs view={view} />
      <a className="kn-skip" href="#kn-main" onClick={(e) => { e.preventDefault(); document.getElementById('kn-main')?.focus(); }}>
        Naar hoofdinhoud
      </a>
      <Sidebar teams={access.data?.teams ?? []} view={view} />
      <ChatView active={view === 'chat'} context={{ country, client, period }} onContextChange={changeContext} />
      <Activity mode={view === 'zoeken' ? 'visible' : 'hidden'}>
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
        <div className="kn-chips">
          <ContextSelects value={{ country, client, period }} clients={access.data?.clients ?? []} onChange={changeContext} />
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
              <h3 className="kn-h3">Trust Lens</h3>
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
      </Activity>
    </div>
  );
}
