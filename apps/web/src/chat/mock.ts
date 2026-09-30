/**
 * DEV-ONLY MOCK for POST /api/chat.
 *
 * Used by `useChat` (lib/queries.ts) only when `import.meta.env.DEV` is true AND the real request fails with
 * HTTP 404, i.e. while the backend of U1 (#20) is not running on the dev server. It calls the real
 * `POST /api/ask` and wraps its result in a ChatResult, so the chat UI shows realistic data (sources, verdicts,
 * onderbouwing checks, knowledge gaps) before `/api/chat` exists.
 *
 * It is reached through a dynamic import behind the build-time `import.meta.env.DEV` constant, so production
 * builds neither include nor chunk this file.
 *
 * TODO(U3 #22): delete this file and the DEV fallback in `useChat` once `/api/chat` is merged.
 */
import type { AssessedSource, ChatInput, ChatResult, ChatToolCall } from '@tectonic/shared';
import { COUNTRY_LABELS } from '@tectonic/shared';
import type { ApiClient } from '../lib/api.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MOCK = '(dev-mock) ';

const list = (codes: string[]) => (codes.length > 0 ? codes.join(', ') : 'geen');

export async function mockChat(api: ApiClient, body: ChatInput): Promise<ChatResult> {
  const question = body.messages.at(-1)!.content.slice(0, 300);
  const { country, client, period } = body.context;

  // Fake "thinking" time so the progress indicator can be seen.
  await sleep(700);
  const started = performance.now();
  const assessment = await api.ask({ question, country, client, period });
  const took = Math.max(1, Math.round(performance.now() - started));

  const best = assessment.best;
  const codes = assessment.sources.map((s) => s.code);
  const calls: ChatToolCall[] = [
    {
      id: 'mock-1',
      name: 'find_knowledge',
      args: { query: question },
      status: 'ok',
      summary: assessment.topic ? `${MOCK}Zocht kennis over '${assessment.topic}': ${codes.length} bronnen (${list(codes)})` : `${MOCK}Zocht kennis: niets gevonden bij deze vraag`,
      sourceCodes: codes,
      error: null,
      durationMs: Math.round(took * 0.4),
    },
    {
      id: 'mock-2',
      name: 'assess_trust',
      args: { question, country, client, period },
      status: 'ok',
      summary: best
        ? `${MOCK}Beoordeelde ${codes.length} bronnen voor ${COUNTRY_LABELS[country]}${client ? `, ${client}` : ''}: beste bron ${best.code} (onderbouwing ${best.onderbouwing.score}/100)`
        : `${MOCK}Beoordeelde ${codes.length} bronnen: geen enkele geldt bevestigd voor deze context`,
      sourceCodes: codes,
      error: null,
      durationMs: Math.round(took * 0.6),
    },
  ];
  if (best) {
    calls.push({ id: 'mock-3', name: 'get_source', args: { code: best.code }, status: 'ok', summary: `${MOCK}Opende ${best.code}: ${best.title}`, sourceCodes: [best.code], error: null, durationMs: 12 });
  }

  await sleep(900);
  return {
    answer: buildAnswer(best, assessment.status, assessment.topic),
    status: assessment.status,
    statusLabel: assessment.statusLabel,
    mode: 'fallback',
    toolCalls: calls,
    citations: best ? [best] : [],
    assessment,
  };
}

function buildAnswer(best: AssessedSource | null, status: ChatResult['status'], topic: string | null): string {
  if (!best) {
    return topic
      ? `Ik kan hier **geen onderbouwd antwoord** op geven. Er is wel kennis over ${topic}, maar geen enkele bron geldt bevestigd voor deze context.`
      : 'Ik vond **geen bron** bij deze vraag in de werkruimtes waar je toegang toe hebt, dus ik geef geen antwoord.';
  }
  const lines = [`**${best.value}** [${best.code}]`, '', `${best.claim} [${best.code}]`, '', `- Onderbouwing: **${best.onderbouwing.score}/100** [${best.code}]`, `- Beoordeling: ${best.verdict.label.toLowerCase()}`];
  if (status !== 'onderbouwd') lines.push('', 'Let op: dit antwoord is niet volledig onderbouwd. Laat het bevestigen voor je het doorgeeft.');
  return lines.join('\n');
}
