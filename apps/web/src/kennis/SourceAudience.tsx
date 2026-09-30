import type { Source } from '@tectonic/shared';
import { useAccess } from '../lib/queries.ts';
import './audience.css';

/** Wie deze bron mag zien: het eigen team, plus elk extra team in de doelgroep (allemaal vereist). */
export function SourceAudience({ source, projectName }: { source: Source; projectName: string }) {
  const { data } = useAccess();
  // A viewer who sees the source is in every audience team, so all names resolve from their own teams.
  const extra = source.audienceProjectIds.map((id) => data?.teams.find((t) => t.id === id)?.name).filter((n): n is string => !!n);
  const names = [projectName, ...extra];
  return (
    <div className="kn-audience" data-testid="kn-audience">
      <p className="kn-audience-line">
        {names.map((n, i) => (
          <span key={n}>
            {i > 0 && <span className="kn-audience-and"> en </span>}
            <span className="kn-audience-chip">{n}</span>
          </span>
        ))}
      </p>
      <p className="kn-audience-note">
        {extra.length > 0 ? 'Alleen zichtbaar voor mensen die in al deze teams zitten.' : 'Zichtbaar voor alle leden van dit team.'}
      </p>
    </div>
  );
}
