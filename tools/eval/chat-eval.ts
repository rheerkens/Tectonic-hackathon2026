// Runs example questions through the real project chat (LLM) and checks each answer.
// Usage: [EVAL_PROFILE=e2e] bun tools/eval/chat-eval.ts [filter]   (stack must be running: bun run dev [--profile e2e])
// D10 inserts S33 and needs a throwaway profile: EVAL_PROFILE=e2e.
// Not a test suite: it calls the model, takes minutes, and prints a pass/fail table.
import postgres from '../../packages/db/node_modules/postgres/src/index.js';
import { readFileSync } from 'node:fs';

const PROFILE = process.env.EVAL_PROFILE ?? 'dev';
const runtime = JSON.parse(readFileSync(new URL(`../../.local/${PROFILE}/runtime.json`, import.meta.url), 'utf8'));
const API: string = runtime.urls.api;
const sql = postgres(runtime.env.DATABASE_URL, { onnotice: () => {} });

type Case = {
  id: string;
  user: 'wanne' | 'roy' | 'sebastien';
  q: string | string[]; // several = a conversation; only the last reply is checked
  s33?: boolean; // scenario 3: a second approved source for the same scope, throwaway profile only
  has?: (string | RegExp)[]; // every entry must appear in the reply
  hasNot?: (string | RegExp)[]; // none may appear
  abstain?: boolean; // reply must say the sources do not establish an answer
};

const ABSTAIN = /\bgeen\b|niet (vastgesteld|bevestigen|onderbouwd)|onvoldoende|no source|not establish/i;

const CASES: Case[] = [
  // D1 client exception beats general rule
  { id: 'D1 loonmutaties Atlas', user: 'wanne', q: 'Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', has: ['22 oktober', 'S4'] },
  { id: 'D1 parafrase', user: 'roy', q: 'Welke aanleverdatum geldt voor de Belgische loonmutaties van Atlas in oktober?', has: ['22 oktober', 'S4'] },
  // D2
  { id: 'D2 ziekmelding BE', user: 'wanne', q: 'Binnen welke termijn moet een ziekmelding doorgegeven worden in België?', has: ['24 uur', 'S6'] },
  // D3 other country
  { id: 'D3a loonmutaties NL', user: 'wanne', q: 'Tot wanneer mag Atlas loonmutaties aanleveren voor Nederland?', has: [/\b18(e| oktober)/, 'S5'] },
  { id: 'D3b ziekmelding NL', user: 'wanne', q: 'Binnen welke termijn moet een ziekmelding doorgegeven worden in Nederland?', has: ['S32'] },
  // D4 gaps
  { id: 'D4a dertiende maand', user: 'wanne', q: 'Wat is de regel voor de dertiende maand?', abstain: true },
  { id: 'D4a bedrijfswagen', user: 'wanne', q: 'Heeft Atlas recht op een bedrijfswagen?', abstain: true },
  { id: 'D4b telewerkvergoeding', user: 'wanne', q: 'Wat is de telewerkvergoeding?', abstain: true },
  { id: 'D4 loonfiche onbekend', user: 'wanne', q: 'Wat staat er op de loonfiche van Jan Peeters voor september 2026?', abstain: true },
  // Loonfiches (seed: payslips)
  { id: 'L1 netto Emma', user: 'wanne', q: 'Wat is het nettoloon van Emma Claes in september 2026?', has: ['2.233,76'] },
  { id: 'L2 overuren Emma', user: 'sebastien', q: 'Heeft Emma Claes overuren op haar loonfiche van oktober 2026? Hoeveel?', has: ['185'] },
  { id: 'L3 Atlas loonfiche wanne', user: 'wanne', q: 'Geef de loonfiche van Sofie Willems voor oktober 2026.', has: ['4.180', 'AT-2001'] },
  { id: 'L4 Atlas loonfiche Sebastien', user: 'sebastien', q: 'Geef de loonfiche van Sofie Willems voor oktober 2026.', hasNot: [/4\.180/, /AT-2001/], abstain: true },
  { id: 'L5 brutototaal', user: 'wanne', q: 'Wat is het brutoloon van Thomas Jacobs in september 2026 inclusief overuren?', has: ['3.515'] },
  // D5 access
  { id: 'D5a loonmutaties Sebastien', user: 'sebastien', q: 'Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', has: ['20 oktober'], hasNot: [/\bS4\b/, /\bS9\b/, /\bS10\b/, /\bS11\b/, /\bS3\b/, '22 oktober'] },
  { id: 'D5b eindejaarspremie wanne', user: 'wanne', q: 'Wanneer wordt de eindejaarspremie voor Atlas uitbetaald?', has: ['15 december', 'S8'] },
  { id: 'D5b eindejaarspremie Sebastien', user: 'sebastien', q: 'Wanneer wordt de eindejaarspremie voor Atlas uitbetaald?', hasNot: [/15 december/i, /\bS8\b/], abstain: true },
  // D6 follow-up in the same conversation
  { id: 'D6 en voor Nederland', user: 'wanne', q: ['Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', 'En voor Nederland?'], has: [/\b18(e| oktober)/, 'S5'] },
  { id: 'D6 en voor november', user: 'wanne', q: ['Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', 'En voor november?'], hasNot: [/(is|tot|op) 22 november/i], abstain: true },
  { id: 'D6 eigen onderwerp', user: 'wanne', q: ['Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', 'En de ziekmelding?'], has: ['24 uur', 'S6'] },
  { id: 'D6 lacune erft niet', user: 'wanne', q: ['Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', 'En de dertiende maand?'], hasNot: [/22 oktober/], abstain: true },
  // D8 general rule only: the question says there is no client
  { id: 'D8 algemene regel', user: 'wanne', q: 'Tot wanneer moeten Belgische loonmutaties voor oktober 2026 worden aangeleverd, zonder klantspecifieke afspraak?', has: ['20 oktober', 'S1'], hasNot: [/\bS4\b/, /22 oktober/] },
  // D10 two approved sources disagree: no final value
  { id: 'D10 tegenstrijdig', user: 'wanne', s33: true, q: 'Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?', has: ['S4', 'S33', '22 oktober', '23 oktober', /tegenstrijdig|conflict|spreken .*tegen|verschil/i] },
  // D7 period
  { id: 'D7 november', user: 'wanne', q: 'Tot wanneer mag Atlas loonmutaties voor november 2026 aanleveren?', hasNot: [/(is|tot|op) 22 november/i], abstain: true },
  // D9 new topics
  { id: 'D9 loonindexering', user: 'wanne', q: 'Welk percentage loonindexering moet ik toepassen?', has: ['S16'] },
  { id: 'D9 maaltijdcheques', user: 'wanne', q: 'Mag ik maaltijdcheques uitbetalen?', has: ['S23'] },
  { id: 'D9 vakantiegeld', user: 'wanne', q: 'Hoe bereken ik het vakantiegeld?', has: ['S21'] },
  { id: 'D9 ziekteloon NL', user: 'wanne', q: 'Hoeveel ziekteloon betaal ik bij ziekte in Nederland?', has: ['S25'] },
  { id: 'D9 verlof', user: 'wanne', q: 'Hoe wordt een verlofaanvraag verwerkt?', has: ['S14'] },
];

const headers = (user: string) => ({ 'x-dev-user': `demo_${user}`, 'content-type': 'application/json' });

async function projectId(user: string): Promise<string> {
  const rows = (await (await fetch(`${API}/api/sources`, { headers: headers(user) })).json()) as { projectId: string }[];
  return rows[0]!.projectId;
}

// The API runs under bun --watch: another agent's edit restarts it mid-run, so a dropped connection is retried.
async function ask(user: string, message: string) {
  for (let restarts = 0; ; ) {
    try {
      return await askOnce(user, message);
    } catch (e) {
      if (!(e instanceof TypeError) || ++restarts > 5) throw e;
      await Bun.sleep(3000);
    }
  }
}

async function askOnce(user: string, message: string) {
  const id = await projectId(user);
  for (;;) {
    const res = await fetch(`${API}/api/projects/${id}/chat`, { method: 'POST', headers: headers(user), body: JSON.stringify({ message }) });
    if (res.status === 429) { await Bun.sleep(Number(res.headers.get('retry-after') ?? 10) * 1000); continue; }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    let turn: { reply: string; status: string; tools: { name: string }[] } | undefined;
    let error: string | undefined;
    for (const line of (await res.text()).split('\n').filter(Boolean)) {
      const ev = JSON.parse(line);
      if (ev.type === 'done') turn = ev.turn;
      if (ev.type === 'error') error = ev.message;
    }
    if (!turn) throw new Error(error ?? 'no done event');
    return { ...turn, error };
  }
}

const hit = (text: string, p: string | RegExp) => (typeof p === 'string' ? text.includes(p) : p.test(text));

const S33 = `INSERT INTO sources (code, project_id, title, kind, version, topic, keywords, country, client, value, claim, quote, valid_from, valid_to, status, owner_id, approved_by_id, traceable, superseded_by, audience_project_ids)
SELECT 'S33', project_id, 'Aanvullend akkoord Atlas', kind, version, topic, keywords, country, client, '23 oktober 2026',
 'Atlas mag de volledige reguliere loonmutaties voor oktober tot en met 23 oktober 2026 aanleveren.',
 'Scenarioadaptatie van dossier S8. Roy keurt voor Atlas België ontvangst van de volledige reguliere loonmutaties voor oktober 2026 op 23 oktober 2026 goed. Deze afspraak bevat geen intrekking of vervanging van S4.',
 valid_from, valid_to, status, owner_id, approved_by_id, traceable, NULL, audience_project_ids FROM sources WHERE code = 'S4'`;

const filter = process.argv[2]?.toLowerCase();
let failed = 0;
for (const c of CASES.filter((c) => !filter || c.id.toLowerCase().includes(filter))) {
  await sql`delete from chat_turns`; // each case starts without earlier turns as model context
  const t0 = Date.now();
  const problems: string[] = [];
  let reply = '';
  let tools = '';
  try {
    if (c.s33) {
      if (PROFILE === 'dev') throw new Error('D10 inserts S33: run it with EVAL_PROFILE=e2e on a throwaway database');
      await sql`delete from sources where code = 'S33'`;
      await sql.unsafe(S33);
    }
    const turns = [c.q].flat();
    for (const earlier of turns.slice(0, -1)) await ask(c.user, earlier);
    const r = await ask(c.user, turns.at(-1)!);
    reply = r.reply;
    tools = r.tools.map((t) => t.name).join(',');
    if (r.status !== 'completed') problems.push(`status ${r.status}${r.error ? `: ${r.error}` : ''}`);
    if (!r.tools.length) problems.push('no tool used');
    for (const p of c.has ?? []) if (!hit(reply, p)) problems.push(`missing ${p}`);
    for (const p of c.hasNot ?? []) if (hit(reply, p)) problems.push(`forbidden ${p}`);
    if (c.abstain && !ABSTAIN.test(reply)) problems.push('expected abstain');
  } catch (e) {
    problems.push(String(e));
  } finally {
    if (c.s33 && PROFILE !== 'dev') await sql`delete from sources where code = 'S33'`;
  }
  if (problems.length) failed++;
  console.log(`\n${problems.length ? 'FAIL' : 'PASS'}  ${c.id}  [${c.user}] ${((Date.now() - t0) / 1000).toFixed(0)}s tools=${tools}`);
  console.log(`  Q: ${[c.q].flat().join(' -> ')}`);
  console.log(`  A: ${reply.replace(/\s+/g, ' ').slice(0, 600)}`);
  if (problems.length) console.log(`  !! ${problems.join('; ')}`);
}
await sql.end();
console.log(`\n${failed ? `${failed} failed` : 'all passed'}`);
process.exit(failed ? 1 : 0);
