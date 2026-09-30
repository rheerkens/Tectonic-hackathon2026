import { COUNTRIES, COUNTRY_LABELS, type AssessedSource } from '@tectonic/shared';
import { useSources } from '../lib/queries.ts';
import './kaart.css';

type Users = Map<string, { name: string }>;
const level = (score: number) => (score >= 80 ? 'good' : score >= 50 ? 'mid' : 'low');

/** Cell = the best-scoring live source for topic and country; none = a gap. */
function Cell({ list, users, onSelect }: { list: AssessedSource[]; users: Users; onSelect: (id: string) => void }) {
  const live = list.filter((s) => s.status !== 'superseded');
  const best = live.sort((a, b) => b.onderbouwing.score - a.onderbouwing.score)[0];
  if (!best) return <td className="kk-cell kk-cell--gap">Gat</td>;
  const owners = new Set(live.map((s) => s.ownerId).filter((o) => o !== null));
  const sole = owners.size === 1 ? (users.get([...owners][0]!)?.name ?? 'één eigenaar') : null;
  return (
    <td className={`kk-cell kk-cell--${level(best.onderbouwing.score)}`}>
      <button type="button" onClick={() => onSelect(best.id)} aria-label={`${best.code}, onderbouwing ${best.onderbouwing.score} van 100`}>
        <strong>{best.onderbouwing.score}</strong>
        <span>
          {best.code} · {live.length} {live.length === 1 ? 'bron' : 'bronnen'}
        </span>
        {sole && <em className="kk-badge">Enige kenner: {sole}</em>}
      </button>
    </td>
  );
}

export function KennisKaart({ users, onSelect }: { users: Users; onSelect: (id: string) => void }) {
  const { data } = useSources();
  if (!data) return null;
  const topics = [...new Set(data.map((s) => s.topic))].sort();
  return (
    <section className="kk" data-testid="kennis-kaart">
      <h3 className="kn-h3">Kennis-weerkaart</h3>
      <table className="kk-table">
        <thead>
          <tr>
            <th>Onderwerp</th>
            {COUNTRIES.map((c) => (
              <th key={c}>{COUNTRY_LABELS[c]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t}>
              <th scope="row">{t}</th>
              {COUNTRIES.map((c) => (
                <Cell key={c} list={data.filter((s) => s.topic === t && s.country === c)} users={users} onSelect={onSelect} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="kn-footnote">Kleur = beste onderbouwing. Een gat betekent dat er niets is vastgelegd voor dat land.</p>
    </section>
  );
}
