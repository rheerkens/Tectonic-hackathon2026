import { AskInputSchema, COUNTRIES, COUNTRY_LABELS, scoreSource, type AskInput, type AssessedSource, type Country } from '@tectonic/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/context.ts';
import { Avatar } from '../components/Avatar.tsx';
import { Brand } from '../components/Brand.tsx';
import { UserMenu } from '../components/UserMenu.tsx';
import { ConnectionStatus } from '../components/ConnectionStatus.tsx';
import { ErrorState } from '../components/States.tsx';
import { useToasts } from '../components/Toasts.tsx';
import { useAccess, useApproveSource, useAsk, useNaiveAnswer, useSources, useUsers } from '../lib/queries.ts';
import { useRealtime, useTeamSubscriptions } from '../realtime/RealtimeProvider.tsx';
import { KennisKaart } from './KennisKaart.tsx';
import { CheckPanel } from './CheckPanel.tsx';
import { VersionChain } from './VersionChain.tsx';
import { SourceAudience } from './SourceAudience.tsx';
import { DisputeControls } from './DisputeControls.tsx';
import { Icon, PERIODS, STATUS_TONE, Tick, VERDICT_TONE, dateLabel, monthLabel, type AskContext } from './ui.tsx';
import { FinnStage, SearchingCard, type FinnMood, type Touched } from './FinnStage.tsx';
import { buildTopicIndex, understand, type Understood } from './understand.ts';
import './kennis.css';

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
      // rAF timestamps can precede `start`; an unclamped negative t makes the easing overshoot.
      const t = Math.max(0, Math.min(1, (now - start) / ms));
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

function Logo() {
  return (
    <div className="kn-logo">
      <Brand />
      <div className="kn-logo-tag">Van kennis naar vertrouwen.</div>
    </div>
  );
}


function Sidebar({ teams }: { teams: Array<{ id: string; name: string }> }) {
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = sidebar.current!;
    const resize = () => element.style.setProperty('--sidebar-top', `${Math.max(22, element.getBoundingClientRect().top)}px`);
    resize();
    window.addEventListener('scroll', resize, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <aside ref={sidebar} className="kn-sidebar" aria-label="Werkruimte">
      <nav aria-label="Hoofdnavigatie">
        <div className="kn-section" id="nav-use">Kennis gebruiken</div>
        <div className="kn-nav-group" role="group" aria-labelledby="nav-use">
          <a href="#kn-main" className="kn-nav is-active" aria-current="page" onClick={(e) => { e.preventDefault(); document.querySelector<HTMLTextAreaElement>('#fs-q')?.focus(); }}>
            <Icon name="search" /> Kennis zoeken
          </a>
          <button type="button" className="kn-nav" disabled><Icon name="file" /> Kennisbank</button>
          <button type="button" className="kn-nav" disabled><Icon name="users" /> Experts</button>
        </div>
        <div className="kn-section kn-section--next" id="nav-monitor">Kennis bewaken</div>
        <div className="kn-nav-group" role="group" aria-labelledby="nav-monitor">
          <button type="button" className="kn-nav" disabled><Icon name="chat" /> Bericht controleren</button>
          <button type="button" className="kn-nav" disabled><Icon name="signal" /> Signalen</button>
          <button type="button" className="kn-nav" disabled><Icon name="coverage" /> Kennisdekking</button>
        </div>
      </nav>
      <div className="kn-sidebar-footer">
        <div className="kn-section">Jouw teams</div>
        <ul className="kn-teams">
          {teams.map((t) => <li key={t.id}><Icon name="users" size={16} /> {t.name}</li>)}
        </ul>
        <p className="kn-team-note">Je ziet kennis uit deze teams.</p>
        <div className="kn-demo-note">Demo met fictieve gegevens</div>
      </div>
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

function Panel({ source, all, users, canApprove, canDispute, canResolve, country, client }: { source: AssessedSource; all: AssessedSource[]; users: Map<string, { name: string; email: string | null }>; canApprove: boolean; canDispute: boolean; canResolve: boolean; country: Country; client: string | null }) {
  const approve = useApproveSource();
  const score = useCountUp(source.onderbouwing.score);
  const toasts = useToasts();
  const owner = source.ownerId ? users.get(source.ownerId) : undefined;
  return (
    <div className="kn-panel" data-testid="kn-panel">
      <h2 id="source-title">{source.title}</h2>
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
      <VersionChain source={source} all={all} canEdit={canResolve} />
      <TimeTravel key={source.id} source={source} country={country} client={client} />
      <h3 className="kn-h3">Toegang</h3>
      <p className="kn-line">
        <Icon name="lock" /> Wie mag dit zien
      </p>
      <SourceAudience source={source} projectName={source.projectName} />
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
    </div>
  );
}

// Scoped per user: a search is private input and must never reach another identity in the same tab.
const searchKey = (userId: string) => `kennis-search:${userId}`;
function readSavedSearch(userId: string, clients: string[]): AskInput | null {
  try {
    sessionStorage.removeItem('kennis-search'); // legacy unscoped key: owner unknown, so discard
    const parsed = AskInputSchema.safeParse(JSON.parse(sessionStorage.getItem(searchKey(userId)) ?? 'null'));
    return parsed.success && (!parsed.data.client || clients.includes(parsed.data.client)) ? parsed.data : null;
  } catch {
    return null;
  }
}

export function KennisPage() {
  const session = useSession();
  const access = useAccess();
  const users = useUsers();
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const [question, setQuestion] = useState('');
  const [country, setCountry] = useState<Country>('BE');
  const [client, setClient] = useState<string | null>(null);
  const [period, setPeriod] = useState('2026-10');
  const [asked, setAsked] = useState<AskInput | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState(0); // bumps on every search so the answer replays its arrival animation
  const [touched, setTouched] = useState<Touched>({}); // which context fields the user has answered, as opposed to the defaults
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<number>(undefined);
  const [welcomed, setWelcomed] = useState(() => sessionStorage.getItem('finn-welcomed') === '1');
  const sources = useSources();
  const clients = useMemo(() => access.data?.clients ?? [], [access.data]);
  const topicIndex = useMemo(() => buildTopicIndex(sources.data ?? []), [sources.data]);
  const understood = useMemo(() => understand(question, { clients, periods: PERIODS, topics: topicIndex }), [question, clients, topicIndex]);
  const seen = useRef<Understood | null>(null); // what the question said before the latest keystroke
  useEffect(() => () => window.clearTimeout(typingTimer.current), []);

  useTeamSubscriptions(useMemo(() => access.data?.teams.map((t) => t.id) ?? [], [access.data]));

  // First load: restore this tab's last search; only when there is none, prefill the first example (and the first client: the demo scenario) and ask once.
  useEffect(() => {
    if (!access.data || asked) return;
    const saved = readSavedSearch(session.user.id, access.data.clients);
    const q = saved?.question ?? access.data.examples[0] ?? '';
    const c = saved ? saved.client : access.data.clients[0] ?? null;
    if (saved) {
      setCountry(saved.country);
      setPeriod(saved.period);
      setTouched({ country: true, client: true, period: true });
    }
    setQuestion(q);
    setClient(c);
    if (c && !saved) setTouched((t) => ({ ...t, client: true }));
    seen.current = understand(q, { clients: access.data.clients, periods: PERIODS, topics: topicIndex });
    if (q) setAsked(saved ?? { question: q, country, client: c, period });
  }, [access.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (asked) try { sessionStorage.setItem(searchKey(session.user.id), JSON.stringify(asked)); } catch { /* storage blocked: the search just is not remembered */ }
  }, [asked]);

  const [compare, setCompare] = useState(false);
  const ask = useAsk(asked, runs);
  const naive = useNaiveAnswer(asked, compare);
  const userMap = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);
  // `useAsk` keeps the previous result while a new question loads; that result must not pass as the answer to the new one.
  const result = ask.isPlaceholderData ? undefined : ask.data;
  const searching = asked !== null && !result && ask.isFetching;
  const selected = result?.sources.find((s) => s.id === selectedId) ?? sources.data?.find((s) => s.id === selectedId) ?? result?.best ?? result?.sources[0] ?? null;
  const roleOf = (projectId: string) => access.data?.teams.find((t) => t.id === projectId)?.role;
  const canApprove = !!selected && selected.status === 'unconfirmed' && roleOf(selected.projectId) !== 'viewer' && (selected.ownerId === session.user.id || (selected.ownerId === null && roleOf(selected.projectId) === 'owner'));

  const isOwner = !!selected && roleOf(selected.projectId) !== 'viewer' && (selected.ownerId === session.user.id || (selected.ownerId === null && roleOf(selected.projectId) === 'owner'));
  const canDispute = !!selected && roleOf(selected.projectId) !== 'viewer';

  const openSource = (id: string) => {
    setSelectedId(id);
    sourceDialog.current?.showModal();
  };

  const run = (next?: Partial<AskInput>) => {
    const input: AskInput = { question, country, client, period, ...next };
    if (input.question.trim().length < 3) return;
    window.clearTimeout(typingTimer.current);
    setTyping(false);
    setAsked(input);
    setRuns((n) => n + 1);
    setTouched({ country: true, client: true, period: true }); // sending accepts the context as shown
  };

  // Typing: Finn reads the question as it arrives. A country, client or period that is newly named moves the context chips;
  // nothing is asked until the user sends.
  const editQuestion = (text: string) => {
    setQuestion(text);
    const now = understand(text, { clients, periods: PERIODS, topics: topicIndex });
    const before = seen.current;
    seen.current = now;
    const patch: Partial<AskContext> = {};
    if (now.country && now.country !== before?.country) patch.country = now.country;
    if (now.client !== undefined && now.client !== before?.client) patch.client = now.client;
    if (now.period && now.period !== before?.period) patch.period = now.period;
    if (patch.country) setCountry(patch.country);
    if (patch.client !== undefined) setClient(patch.client);
    if (patch.period) setPeriod(patch.period);
    if (Object.keys(patch).length) setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(patch).map((k) => [k, true])) }));
    setTyping(true);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 700);
  };

  // One context for the page and the chat: changing it in either re-asks the page's question, so the two never disagree.
  const changeContext = (patch: Partial<AskContext>) => {
    if (patch.country) setCountry(patch.country);
    if (patch.client !== undefined) setClient(patch.client);
    if (patch.period) setPeriod(patch.period);
    run(patch);
  };

  const firstName = session.user.name.split(' ')[0] ?? session.user.name;
  const dirty = question.trim() !== (asked?.question.trim() ?? '');
  /** One question at a time, for the first thing the question still leaves open. */
  const openQuestion = (): string | null => {
    if (!understood.topic && !sources.isPending && sources.data?.length) return 'Waar gaat je vraag over?';
    if (!touched.country) return `Gaat het om ${COUNTRIES.map((c) => COUNTRY_LABELS[c]).join(' of ')}?`;
    if (clients.length > 0 && !touched.client) return clients.length === 1 ? `Is dit voor ${clients[0]}, of voor alle klanten?` : 'Voor welke klant is dit, of voor alle klanten?';
    if (!touched.period) return 'Over welke maand gaat het?';
    return null;
  };
  // Finn follows the real request state. A fast answer shows at once; nothing here waits for an animation.
  function finnSays(): { mood: FinnMood; line: string } {
    if (access.isPending) return { mood: 'thinking', line: 'Ik controleer je toegang.' };
    if (access.isError) return { mood: 'retry', line: 'Je toegang laden lukte niet.' };
    if (searching) return { mood: 'thinking', line: 'Ik controleer de bronnen.' };
    if (ask.isError) return { mood: 'retry', line: 'Dat lukte niet. Probeer het opnieuw.' };
    if (!question.trim()) return { mood: welcomed ? 'idle' : 'welcome', line: `Hoi ${firstName}! Wat wil je weten?` };
    if (typing || dirty) return { mood: 'listening', line: openQuestion() ?? 'Helder! Druk op Enter, dan zoek ik het uit.' };
    if (!result) return { mood: 'idle', line: '' };
    const best = result.best;
    if (!best) return { mood: 'uncertain', line: 'Ik vond geen bron die hier geldt.' };
    if (best.disputed) return { mood: 'uncertain', line: `${best.code} is betwist. Gebruik dit antwoord nog niet.` };
    if (result.status === 'onderbouwd') {
      const by = best.approvedById ? userMap.get(best.approvedById)?.name.split(' ')[0] : undefined;
      return { mood: 'verified', line: `Gebaseerd op ${best.code}${by ? `, bevestigd door ${by}` : ''}.` };
    }
    if (result.status === 'deels') return { mood: 'answer', line: 'Dit antwoord rust maar deels op goedgekeurde bronnen.' };
    return { mood: 'uncertain', line: 'Dit antwoord is onvoldoende onderbouwd. Vraag de eigenaar om verduidelijking.' };
  }

  // The welcome wave plays once per browser tab session.
  useEffect(() => {
    if (welcomed || question.trim() || access.isPending) return;
    const t = window.setTimeout(() => { sessionStorage.setItem('finn-welcomed', '1'); setWelcomed(true); }, 3600);
    return () => window.clearTimeout(t);
  }, [welcomed, question, access.isPending]);

  const finn = finnSays();

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
        <FinnStage
          userName={session.user.name}
          userColor={session.user.color}
          question={question}
          onQuestion={editQuestion}
          onSubmit={() => run()}
          understood={understood}
          context={{ country, client, period }}
          clients={clients}
          touched={touched}
          onContext={changeContext}
          busy={ask.isFetching}
          mood={finn.mood}
          run={runs}
          line={finn.line}
        />
        <div className="kn-chips">
          <button type="button" className={`kn-chip kn-chip--toggle${compare ? ' is-on' : ''}`} aria-pressed={compare} onClick={() => setCompare(!compare)}>
            Vergelijk
          </button>
        </div>

        {access.isError && <ErrorState title="Kon je toegang niet laden" message={access.error.message} onRetry={() => void access.refetch()} />}
        {ask.isError && <ErrorState title="Kon geen antwoord geven" message={ask.error.message} onRetry={() => void ask.refetch()} />}

        {(access.isPending || searching) && <SearchingCard phase={access.isPending ? 'access' : 'sources'} />}

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
            <section key={`${result.status}-${result.best?.id ?? ''}-${runs}`} className={`kn-answer kn-answer--${STATUS_TONE[result.status]}`} data-testid="kn-answer" data-status={result.status} role="status" aria-live="polite" aria-busy={ask.isFetching}>
              <span className="kn-badge">
                <Tick tone={STATUS_TONE[result.status]} /> {result.statusLabel}
              </span>
              {ask.isFetching && <p className="kn-meta">Bronnen worden opnieuw gecontroleerd.</p>}
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
                    <a className="kn-source-link" href="#source-title" onClick={(e) => { e.preventDefault(); openSource(result.best!.id); }}>
                      <Icon name="file" /> {result.best.code} · {result.best.title}
                      {result.best.version ? ` · versie ${result.best.version}` : ''}
                    </a>
                    <button type="button" className="kn-btn" onClick={() => openSource(result.best!.id)}>
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
                        <tr key={s.id} className={s.id === selected?.id ? 'is-selected' : ''} onClick={() => openSource(s.id)} tabIndex={0} aria-current={s.id === selected?.id} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSource(s.id); } }}>
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
        <KennisKaart users={userMap} onSelect={openSource} />
        <CheckPanel country={country} client={client} period={period} />
      </main>
      <dialog ref={sourceDialog} className="kn-source-dialog" aria-labelledby="source-title">
        <form method="dialog" className="kn-source-close">
          <button type="submit" className="kn-btn" aria-label="Bron sluiten"><Icon name="close" /></button>
        </form>
        {selected && <Panel source={selected} all={sources.data ?? result?.sources ?? []} users={userMap} canApprove={canApprove} canDispute={canDispute} canResolve={isOwner} country={country} client={client} />}
      </dialog>
    </div>
  );
}
