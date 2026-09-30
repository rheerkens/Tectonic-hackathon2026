import { COUNTRIES, SOURCE_KIND_LABELS, type AskInput, type Country, type ProjectDetail, type SourceWithTrust, type TrustLevel, type User } from '@tectonic/shared';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../auth/context.ts';
import { useAsk, useCreateSource, useFlagSource, useSources, useUsers, useVerifySource } from '../lib/queries.ts';
import { Avatar } from './Avatar.tsx';
import { ErrorState } from './States.tsx';
import { useToasts } from './Toasts.tsx';

const EXAMPLES: Array<{ q: string; country: Country }> = [
  { q: 'When is the 13th month paid?', country: 'BE' },
  { q: 'What are the meal voucher rules?', country: 'BE' },
  { q: 'How long is the notice period?', country: 'BE' },
  { q: 'How does sick pay work?', country: 'NL' },
  { q: 'What do I need to take over a portfolio?', country: 'BE' },
];

const LEVEL_TEXT: Record<TrustLevel, string> = {
  high: 'You can rely on this',
  medium: 'Check before you rely on this',
  low: 'Do not rely on this yet',
};

const TONE_ICON = { good: '✓', warn: '!', bad: '✕' } as const;

export function TrustLens({ project }: { project: ProjectDetail }) {
  const [draft, setDraft] = useState('');
  const [country, setCountry] = useState<Country>('BE');
  const [asked, setAsked] = useState<AskInput | null>(null);
  const users = useUsers();
  const byId = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (draft.trim().length >= 3) setAsked({ question: draft.trim(), country });
  };

  return (
    <div className="lens" data-testid="trust-lens">
      <div className="lens-main">
        <form className="ask" onSubmit={submit}>
          <input
            className="ask-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about this client, e.g. “When is the 13th month paid?”"
            aria-label="Your question"
            data-testid="ask-input"
          />
          <div className="segmented" role="group" aria-label="Market">
            {COUNTRIES.map((c) => (
              <button key={c} type="button" className={country === c ? 'is-active' : ''} aria-pressed={country === c} onClick={() => setCountry(c)}>
                {c}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn--primary" data-testid="ask-submit">
            Ask
          </button>
        </form>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.q}
              type="button"
              className="chip chip--example"
              onClick={() => {
                setDraft(ex.q);
                setCountry(ex.country);
                setAsked({ question: ex.q, country: ex.country });
              }}
            >
              {ex.q} <span className="muted">· {ex.country}</span>
            </button>
          ))}
        </div>
        {asked ? <Answer project={project} asked={asked} users={byId} /> : <Intro />}
      </div>
      <Health project={project} users={byId} />
    </div>
  );
}

function Intro() {
  return (
    <div className="lens-intro">
      <h3>From “I found something” to “I understand why I can rely on it”</h3>
      <p className="muted">
        You just inherited this client. Ask a question: the answer comes with the reasons it can, or cannot, be trusted, the sources that disagree, and the colleague who can help.
      </p>
    </div>
  );
}

function Ring({ value, level }: { value: number; level: TrustLevel }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ring--${level}`} viewBox="0 0 112 112" role="img" aria-label={`Confidence ${value} out of 100`}>
      <circle className="ring-track" cx="56" cy="56" r={r} />
      <circle className="ring-value" cx="56" cy="56" r={r} strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 56 56)" />
      <text x="56" y="62" textAnchor="middle" className="ring-text">
        {value}
      </text>
    </svg>
  );
}

/** Shows how the confidence moved when somebody else changed the knowledge base. */
function useDelta(value: number | undefined, key: string) {
  const prev = useRef<{ key: string; value: number } | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (value === undefined) return;
    if (prev.current?.key === key && prev.current.value !== value) {
      setDelta(value - prev.current.value);
      const t = setTimeout(() => setDelta(null), 6_000);
      prev.current = { key, value };
      return () => clearTimeout(t);
    }
    prev.current = { key, value };
  }, [value, key]);
  return delta;
}

function Answer({ project, asked, users }: { project: ProjectDetail; asked: AskInput; users: Map<string, User> }) {
  const ask = useAsk(project.id, asked);
  const delta = useDelta(ask.data?.confidence, `${asked.question}|${asked.country}`);
  if (ask.isError) return <ErrorState title="Couldn't answer" message={ask.error.message} onRetry={() => void ask.refetch()} />;
  if (!ask.data) return <div className="card skeleton-block" aria-busy="true" />;
  const r = ask.data;
  const name = (id: string) => users.get(id)?.name ?? id;

  return (
    <div className="answer" data-testid="answer" data-level={r.level}>
      <section className={`card answer-card answer-card--${r.level}`}>
        <div className="answer-body">
          <span className="eyebrow">{r.answer ? `Answer for ${asked.country}` : 'Knowledge gap'}</span>
          <h2 data-testid="answer-text">{r.answer ?? 'We cannot answer this reliably.'}</h2>
          {r.best && (
            <p className="muted">
              From <strong>{r.best.title}</strong> · {SOURCE_KIND_LABELS[r.best.kind]}
            </p>
          )}
          <p className={`verdict verdict--${r.level}`}>{r.answer ? LEVEL_TEXT[r.level] : 'Ask a colleague who knows.'}</p>
        </div>
        <div className="answer-score" data-testid="confidence" data-value={r.confidence}>
          <Ring value={r.confidence} level={r.level} />
          <span className="eyebrow">Confidence</span>
          {delta !== null && delta !== 0 && (
            <span className={`delta ${delta > 0 ? 'delta--up' : 'delta--down'}`} data-testid="delta">
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} live
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <h3>Why this level</h3>
        <ul className="reasons">
          {r.reasons.map((x) => (
            <li key={x.text} className={`reason reason--${x.tone}`}>
              <span className="reason-icon" aria-hidden="true">
                {TONE_ICON[x.tone]}
              </span>
              {x.text}
            </li>
          ))}
        </ul>
        {r.best && <Factors source={r.best} />}
      </section>

      {r.conflicts.length > 0 && r.best && (
        <section className="card" data-testid="conflicts">
          <h3>Sources disagree</h3>
          <div className="conflicts">
            {[r.best, ...r.conflicts].map((s, i) => (
              <div key={s.id} className={`conflict ${i === 0 ? 'conflict--best' : ''}`}>
                <span className="eyebrow">{i === 0 ? 'Most trusted' : 'Disagrees'}</span>
                <strong>{s.claim}</strong>
                <span className="muted small">
                  {s.title} · trust {s.trust.score}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(r.experts.length > 0 || r.level !== 'high') && (
        <section className="card" data-testid="experts">
          <h3>{r.level === 'high' ? 'Who knows this' : 'Who can help'}</h3>
          {r.experts.length === 0 && <p className="muted">Nobody owns this topic yet. Add what you learn below so the next person can rely on it.</p>}
          <ul className="experts">
            {r.experts.map((e) => {
              const u = users.get(e.userId);
              if (!u) return null;
              const mail = `mailto:${u.email ?? ''}?subject=${encodeURIComponent(`Question about ${r.topic ?? 'a client topic'}`)}&body=${encodeURIComponent(`${asked.question} (${asked.country})`)}`;
              return (
                <li key={e.userId}>
                  <Avatar name={u.name} color={u.color} />
                  <span className="expert-text">
                    <strong>{u.name}</strong>
                    <span className="muted small">{e.reason}</span>
                  </span>
                  <a className="btn btn--sm" href={mail}>
                    Ask {u.name.split(' ')[0]}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {r.sources.length > 0 && (
        <section className="card">
          <h3>Sources behind this answer</h3>
          <ul className="source-list">
            {r.sources.map((s) => (
              <SourceRow key={s.id} project={project} source={s} users={users} name={name} />
            ))}
          </ul>
          {r.inapplicable.length > 0 && (
            <p className="muted small">
              Ignored (written for another market): {r.inapplicable.map((s) => s.title).join(', ')}
            </p>
          )}
        </section>
      )}
      <AddKnowledge project={project} topic={r.topic} country={asked.country} />
    </div>
  );
}

function Factors({ source }: { source: SourceWithTrust }) {
  return (
    <div className="factors" data-testid="factors">
      {source.trust.factors.map((f) => (
        <div key={f.key} className="factor">
          <span className="factor-label">{f.label}</span>
          <span className="bar">
            <span className={`bar-fill bar-fill--${f.value >= 0.75 ? 'good' : f.value >= 0.4 ? 'warn' : 'bad'}`} style={{ width: `${Math.round(f.value * 100)}%` }} />
          </span>
          <span className="muted small factor-note">
            {f.note} · counts for {Math.round(f.weight * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function SourceRow({ project, source, users, name }: { project: ProjectDetail; source: SourceWithTrust; users: Map<string, User>; name: (id: string) => string }) {
  const session = useSession();
  const toasts = useToasts();
  const verify = useVerifySource(project.id);
  const flag = useFlagSource(project.id);
  const canEdit = project.role !== 'viewer';
  const canVerify = canEdit && (source.ownerId === session.user.id || (project.role === 'owner' && !source.ownerId));
  const fail = (e: Error) => toasts.push({ kind: 'error', title: 'Not allowed', message: e.message });
  return (
    <li className="source" data-testid="source-row" data-flagged={source.flaggedOutdated}>
      <div className="source-head">
        <span className="chip">{SOURCE_KIND_LABELS[source.kind]}</span>
        <strong>{source.title}</strong>
        <span className="spacer" />
        <span className={`score score--${source.trust.level}`}>{source.trust.score}</span>
      </div>
      <p className="muted small">{source.claim}</p>
      <div className="source-foot small muted">
        {source.ownerId ? (
          <>
            <Avatar name={name(source.ownerId)} color={users.get(source.ownerId)?.color ?? '#888'} size={18} /> {name(source.ownerId)}
          </>
        ) : (
          <span className="warn-text">No owner</span>
        )}
        {source.verifiedById && <span>· verified by {name(source.verifiedById)}</span>}
        <span className="spacer" />
        {canVerify && (
          <button type="button" className="btn btn--sm" disabled={verify.isPending} onClick={() => verify.mutate(source.id, { onError: fail })} data-testid="verify">
            Confirm still correct
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={flag.isPending}
            onClick={() => flag.mutate({ id: source.id, flagged: !source.flaggedOutdated }, { onError: fail })}
            data-testid="flag"
          >
            {source.flaggedOutdated ? 'Clear outdated flag' : 'Flag as outdated'}
          </button>
        )}
      </div>
    </li>
  );
}

function AddKnowledge({ project, topic, country }: { project: ProjectDetail; topic: string | null; country: Country }) {
  const create = useCreateSource(project.id);
  const toasts = useToasts();
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState(topic ?? '');
  if (project.role === 'viewer') return null;
  if (!open)
    return (
      <button type="button" className="btn btn--ghost add-knowledge" onClick={() => setOpen(true)} data-testid="add-knowledge">
        + Add what you know
      </button>
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { title, kind: 'expert_note', topic: slug, country, claim, content: '' },
      {
        onSuccess: () => {
          setOpen(false);
          setClaim('');
          setTitle('');
          toasts.push({ kind: 'success', title: 'Knowledge captured', message: 'You own it now, so others can trust it.' });
        },
        onError: (e) => toasts.push({ kind: 'error', title: 'Could not save', message: e.message }),
      },
    );
  };
  return (
    <form className="card add-form" onSubmit={submit}>
      <h3>Add what you know</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Note from client call" required maxLength={160} aria-label="Title" />
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Topic slug, e.g. 13th-month" required aria-label="Topic" />
      <input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder={`The answer, for ${country}, in one sentence`} required maxLength={300} aria-label="Answer" />
      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={create.isPending}>
          Save as {country} expert note
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Health({ project, users }: { project: ProjectDetail; users: Map<string, User> }) {
  const sources = useSources(project.id);
  if (!sources.data) return <aside className="lens-rail card skeleton-block" aria-busy="true" />;
  const { issues, sources: all } = sources.data;
  const groups = [
    { type: 'conflict', label: 'Contradictions' },
    { type: 'outdated', label: 'Outdated' },
    { type: 'ownerless', label: 'No owner' },
  ] as const;
  const owners = new Set(all.map((s) => s.ownerId).filter(Boolean));
  return (
    <aside className="lens-rail" data-testid="health">
      <div className="card">
        <h3>Knowledge health</h3>
        <p className="muted small">
          {all.length} sources · {owners.size} owners · {issues.length} issue{issues.length === 1 ? '' : 's'}
        </p>
        {groups.map((g) => {
          const items = issues.filter((i) => i.type === g.type);
          if (items.length === 0) return null;
          return (
            <div key={g.type} className="issue-group">
              <span className={`eyebrow issue-${g.type}`}>
                {g.label} · {items.length}
              </span>
              <ul>
                {items.map((i) => (
                  <li key={i.type + i.sourceIds.join()} className="small">
                    {i.text}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h3>Who holds the knowledge</h3>
        <ul className="experts">
          {[...owners].map((id) => {
            const u = users.get(id!);
            const n = all.filter((s) => s.ownerId === id).length;
            return u ? (
              <li key={id}>
                <Avatar name={u.name} color={u.color} size={24} />
                <span className="expert-text">
                  <strong>{u.name}</strong>
                  <span className="muted small">
                    owns {n} source{n === 1 ? '' : 's'}
                  </span>
                </span>
              </li>
            ) : null;
          })}
        </ul>
      </div>
    </aside>
  );
}
