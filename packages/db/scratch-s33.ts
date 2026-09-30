import { createDb } from './src/client.ts';

const runtime = await Bun.file('../../.local/dev/runtime.json').json();
const { sql, close } = createDb(runtime.env.DATABASE_URL, { max: 1 });
const mode = process.argv[2];
if (mode === 'add') {
  await sql`INSERT INTO sources
(code, project_id, title, kind, version, topic, keywords, country, client,
 value, claim, quote, valid_from, valid_to, status, owner_id, approved_by_id,
 traceable, superseded_by, audience_project_ids)
SELECT 'S33', project_id, 'Aanvullend akkoord Atlas', kind, version, topic,
 keywords, country, client, '23 oktober 2026',
 'Atlas mag de volledige reguliere loonmutaties voor oktober tot en met 23 oktober 2026 aanleveren.',
 'Scenarioadaptatie van dossier S8. Roy keurt voor Atlas België ontvangst op 23 oktober 2026 goed.',
 valid_from, valid_to, status, owner_id, approved_by_id, traceable, NULL,
 audience_project_ids FROM sources WHERE code = 'S4'`;
} else {
  await sql`DELETE FROM sources WHERE code = 'S33'`;
}
await close();
console.log(mode, 'done');
