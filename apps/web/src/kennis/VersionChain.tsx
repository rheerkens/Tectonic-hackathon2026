import { isSuperseded, type AssessedSource } from '@tectonic/shared';
import { useState } from 'react';
import { useToasts } from '../components/Toasts.tsx';
import { useSupersedeSource } from '../lib/queries.ts';
import './versions.css';

/** Versieketen van een bron (oudste eerst) en, voor editors, het markeren als vervangen door een nieuwere bron. */
export function VersionChain({ source, all, canEdit }: { source: AssessedSource; all: AssessedSource[]; canEdit: boolean }) {
  const supersede = useSupersedeSource();
  const toasts = useToasts();
  const [next, setNext] = useState('');
  // ponytail: chains are built from the topic list of one ask; a hop outside it ends the chain. The API refuses cycles.
  const chain = [source];
  for (let s = all.find((o) => o.code === source.supersededBy); s && chain.length < 20; s = all.find((o) => o.code === s!.supersededBy)) chain.push(s);
  for (let s = all.find((o) => o.supersededBy === source.code); s && chain.length < 20; s = all.find((o) => o.supersededBy === s!.code)) chain.unshift(s);
  const options = all.filter((o) => o.topic === source.topic && o.id !== source.id && !isSuperseded(o));
  const canMark = canEdit && !isSuperseded(source) && options.length > 0;
  if (chain.length < 2 && !canMark) return null;
  return (
    <>
      <h3 className="kn-h3">Versies</h3>
      {chain.length > 1 && (
        <ol className="kn-versions" data-testid="kn-versions">
          {chain.map((s) => (
            <li key={s.id} className={`${s.id === source.id ? 'is-current' : ''} ${isSuperseded(s) ? 'is-old' : ''}`}>
              <span>
                <b>{s.code}</b> {s.version ? `versie ${s.version}` : 'geen versie'}
              </span>
              <span className="kn-versions-tag">{isSuperseded(s) ? 'Vervangen' : 'Actueel'}</span>
            </li>
          ))}
        </ol>
      )}
      {isSuperseded(source) && <p className="kn-versions-note">Deze bron blijft leesbaar maar kan het antwoord niet meer zijn.</p>}
      {canMark && (
        <div className="kn-versions-form">
          <select value={next} onChange={(e) => setNext(e.target.value)} aria-label="Vervangen door">
            <option value="">Vervangen door…</option>
            {options.map((o) => (
              <option key={o.id} value={o.code}>
                {o.code} · {o.title}
                {o.version ? ` (v${o.version})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="kn-btn kn-btn--outline kn-btn--full"
            disabled={!next || supersede.isPending}
            onClick={() => supersede.mutate({ sourceId: source.id, supersededBy: next }, { onSuccess: () => setNext(''), onError: (e) => toasts.push({ kind: 'error', title: 'Niet gelukt', message: e.message }) })}
          >
            Markeer als vervangen
          </button>
        </div>
      )}
      <hr />
    </>
  );
}
