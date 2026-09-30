import { COUNTRY_LABELS, type AssessedSource, type SourceStatus } from '@tectonic/shared';
import { Icon, Tick, VERDICT_TONE, dateLabel } from '../kennis/ui.tsx';

export type UserLookup = (id: string | null) => string | undefined;

const STATUS_TEXT: Record<SourceStatus, string> = { approved: 'Bevestigd', unconfirmed: 'Niet bevestigd', superseded: 'Vervangen' };

/** A source opened inline: what it says, who is responsible, how long it is valid and why it is (not) well substantiated. */
export function SourceCard({ source, userName, id }: { source: AssessedSource; userName: UserLookup; id?: string }) {
  const owner = userName(source.ownerId);
  const approver = userName(source.approvedById);
  const verdictTone = VERDICT_TONE[source.verdict.kind];
  const { score, checks } = source.onderbouwing;
  return (
    <section className="ch-source" id={id} aria-label={`Bron ${source.code}: ${source.title}`} data-testid="ch-source">
      <header className="ch-source-head">
        <Icon name={source.kind === 'chat' ? 'chat' : 'file'} size={18} />
        <h4>
          <span className="ch-source-code">{source.code}</span> {source.title}
          {source.version ? <span className="kn-muted"> · versie {source.version}</span> : null}
        </h4>
        <span className={`kn-verdict kn-verdict--${verdictTone}`}>
          <Tick tone={verdictTone} /> {source.verdict.label}
        </span>
      </header>

      <p className="ch-source-value">{source.value}</p>
      {source.claim && <p className="ch-source-claim">{source.claim}</p>}
      {source.quote && (
        <blockquote className="kn-quote ch-quote">
          <span aria-hidden="true">“</span> {source.quote} <span aria-hidden="true">”</span>
        </blockquote>
      )}

      <dl className="ch-facts">
        <div>
          <dt>Verantwoordelijke</dt>
          <dd>{owner ?? <span className="ch-warn-text">Geen eigenaar bekend</span>}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {STATUS_TEXT[source.status]}
            {source.status === 'approved' && approver ? ` door ${approver}` : ''}
            {source.disputed && <span className="ch-flag"> Betwist</span>}
          </dd>
        </div>
        <div>
          <dt>Geldigheid</dt>
          <dd>
            {dateLabel(source.validFrom)} {source.validTo ? `t/m ${dateLabel(source.validTo)}` : 'en doorlopend'}
          </dd>
        </div>
        <div>
          <dt>Geldt voor</dt>
          <dd>
            {COUNTRY_LABELS[source.country]} · {source.client ?? 'alle klanten'}
          </dd>
        </div>
        <div>
          <dt>Toegang</dt>
          <dd>{source.projectName}</dd>
        </div>
      </dl>

      <div className="ch-score">
        <div className="kn-score-head">
          <strong>Onderbouwing</strong>
          <span>
            <b>{score}</b> / 100
          </span>
        </div>
        <div className="kn-bar" role="progressbar" aria-label={`Onderbouwing van ${source.code}`} aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ transform: `scaleX(${score / 100})` }} />
        </div>
        <ul className="ch-checks">
          {checks.map((c) => (
            <li key={c.key}>
              <Tick tone={c.points >= c.max ? 'good' : c.points <= 0 ? 'bad' : 'warn'} />
              <span>{c.label}</span>
              <span className="kn-points">
                <span className="sr-only">{c.points >= c.max ? 'Voldaan, ' : 'Niet voldaan, '}</span>
                {c.points} / {c.max}
              </span>
            </li>
          ))}
        </ul>
        <p className="kn-score-note">Deze score beoordeelt de onderbouwing, niet de kans dat het antwoord waar is.</p>
      </div>
    </section>
  );
}
