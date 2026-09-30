import { useMutation } from '@tanstack/react-query';
import type { Country, Verdict } from '@tectonic/shared';
import { useState } from 'react';
import { useApiClient } from '../lib/queries.ts';
import './check.css';

const EXAMPLE = 'ja, dat geldt ook voor NL';
const TONE = { onderbouwd: 'good', deels: 'warn', onvoldoende: 'warn', geen: 'muted' } as const;
const VERDICT_TONE: Record<Verdict['kind'], 'good' | 'neutral' | 'muted' | 'warn'> = {
  exception: 'good', general: 'neutral', unconfirmed: 'warn', expired: 'muted', superseded: 'muted', 'other-client': 'muted', 'other-country': 'muted',
};

export function CheckPanel({ country, client, period }: { country: Country; client: string | null; period: string }) {
  const api = useApiClient();
  const [text, setText] = useState('');
  const check = useMutation({ mutationFn: (t: string) => api.check({ text: t, country, client, period }) });
  const run = (t = text) => t.trim().length >= 3 && check.mutate(t);
  const result = check.data;

  return (
    <section className="kc" data-testid="check-panel">
      <h3 className="kn-h3">Controleer een bericht</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Plak hier een Teams-bericht of mail" aria-label="Bericht om te controleren" />
      <div className="kc-actions">
        <button type="button" className="kn-btn" disabled={check.isPending} onClick={() => run()}>
          Controleer
        </button>
        <button type="button" className="kn-btn kn-btn--outline" onClick={() => { setText(EXAMPLE); run(EXAMPLE); }}>
          Voorbeeld
        </button>
      </div>
      {check.isError && <p className="kc-error">Kon het bericht niet controleren: {check.error.message}</p>}
      {result && result.claims.length === 0 && <p className="kn-muted">Geen beweringen gevonden.</p>}
      {result?.claims.map((c, i) => {
        const conflicts = result.contradictions.filter((x) => x.claim === c.text);
        return (
          <div key={i} className={`kn-answer kn-answer--${TONE[c.conflict ? 'onvoldoende' : c.status]} kc-claim`} data-status={c.status}>
            <span className="kn-badge">{c.conflict ? 'Tegenstrijdig met bron' : c.statusLabel}</span>
            <p className="kn-answer-text">“{c.text}”</p>
            {c.conflict && <p className="kc-conflict">De bron zegt: {c.conflict.value} ({c.conflict.code}).</p>}
            {conflicts.map(({ source: s }) => (
              <p key={s.id} className="kc-conflict">
                <span className={`kn-verdict kn-verdict--${VERDICT_TONE[s.verdict.kind]}`}>{s.verdict.label}</span> {s.code} · {s.title} <span className="kn-muted">(onderbouwing {s.onderbouwing.score}/100)</span>
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}
