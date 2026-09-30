import type Anthropic from '@anthropic-ai/sdk';
import type { SourceRow } from '@tectonic/db';
import {
  CHAT_TOOL_ARGS,
  CHAT_TOOL_NAMES,
  assess,
  scoreSource,
  verdictFor,
  type AskResult,
  type AssessedSource,
  type ChatContext,
  type ChatToolCall,
  type ChatToolName,
  type Source,
} from '@tectonic/shared';
import { z } from 'zod';
import { serializeSource } from '../serializers.ts';

/**
 * Everything a chat request may touch: the caller's visible sources and nothing else. Tools only
 * ever see this object, so a source outside the caller's teams cannot leak through any of them.
 */
export interface ChatEnv {
  /** Sorted by code so ties in the engine resolve the same way every time. */
  sources: Source[];
  names: Map<string, string>;
  byCode: Map<string, Source>;
  context: ChatContext;
}

export function createChatEnv(teams: Array<{ id: string; name: string }>, rows: SourceRow[], context: ChatContext): ChatEnv {
  const sources = rows.map(serializeSource).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  return {
    sources,
    names: new Map(teams.map((t) => [t.id, t.name])),
    byCode: new Map(sources.map((s) => [s.code.toUpperCase(), s])),
    context,
  };
}

/** Scores a visible source for the chat context, so a cited source has the same shape as an assessed one. */
export function assessOne(env: ChatEnv, source: Source, ctx = env.context): AssessedSource {
  return { ...source, projectName: env.names.get(source.projectId) ?? '', onderbouwing: scoreSource(source, ctx), verdict: verdictFor(source, ctx) };
}

// ---- definitions for the model ---------------------------------------------
const DESCRIPTIONS: Record<ChatToolName, string> = {
  find_knowledge:
    'Zoekt welke bronnen over het onderwerp van de zoekvraag gaan. Geeft het gevonden onderwerp en de bronnen erop (code, titel, land, klant, status). Beoordeelt de bronnen niet: gebruik assess_trust om het antwoord te bepalen.',
  assess_trust:
    'Beoordeelt alle bronnen over het onderwerp van de vraag voor een land, klant en periode: het beste antwoord, per bron of ze van toepassing is (klantuitzondering, algemene regel, vervangen, verlopen, niet bevestigd, ander land, andere klant) en de onderbouwingscontroles met score. Laat country, client en period weg om de context van het gesprek te gebruiken. Dit is de enige bron voor het antwoord en de betrouwbaarheid.',
  get_source: 'Leest één bron volledig (citaat, eigenaar, geldigheid, status) aan de hand van haar code, bv. "S4". Alleen bronnen die de gebruiker mag zien.',
};

export const TOOL_DEFINITIONS: Anthropic.Tool[] = CHAT_TOOL_NAMES.map((name) => {
  const { $schema: _omit, ...schema } = z.toJSONSchema(CHAT_TOOL_ARGS[name], { io: 'input' }) as Record<string, unknown>;
  return { name, description: DESCRIPTIONS[name], input_schema: schema as unknown as Anthropic.Tool.InputSchema };
});

// ---- compact results for the model -----------------------------------------
/** Enough to explain trust (verdict, checks, validity, owner, dispute) without dumping rows. */
function compact(s: AssessedSource) {
  return {
    code: s.code,
    title: s.title,
    team: s.projectName,
    country: s.country,
    client: s.client,
    value: s.value,
    claim: s.claim,
    quote: s.quote,
    validFrom: s.validFrom,
    validTo: s.validTo,
    sourceStatus: s.status,
    supersededBy: s.supersededBy,
    disputed: s.disputed,
    ownerKnown: s.ownerId !== null,
    traceable: s.traceable,
    verdict: s.verdict,
    score: s.onderbouwing.score,
    checks: s.onderbouwing.checks.map((c) => ({ check: c.label, points: c.points, max: c.max })),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const codes = (list: Array<{ code: string }>) => list.map((s) => s.code);
const issues = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.') || 'argumenten'}: ${i.message}`).join('; ');

export interface ToolOutcome {
  /** null only for a tool name we do not have: there is nothing to put in the trace. */
  call: ChatToolCall | null;
  /** JSON (or a plain error sentence) handed back to the model as the tool_result. */
  content: string;
  isError: boolean;
  /** Set by a successful assess_trust; the route reports the last one as the answer's trust. */
  assessment: AskResult | null;
}

const NOT_FOUND = (code: string) => `Bron ${code} niet gevonden`;

/** Runs one tool call for the caller: validates the arguments, reads only `env`, never throws. */
export function executeTool(env: ChatEnv, id: string, name: string, input: unknown): ToolOutcome {
  const started = performance.now();
  const rawArgs = input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const finish = (status: 'ok' | 'error', args: Record<string, unknown>, summary: string, sourceCodes: string[], error: string | null, content: unknown, assessment: AskResult | null = null): ToolOutcome => ({
    call: { id, name: name as ChatToolName, args, status, summary, sourceCodes, error, durationMs: Math.round(performance.now() - started) },
    content: typeof content === 'string' ? content : JSON.stringify(content),
    isError: status === 'error',
    assessment,
  });

  if (!(CHAT_TOOL_NAMES as readonly string[]).includes(name)) {
    return { call: null, content: `Onbekende tool "${name}". Beschikbaar: ${CHAT_TOOL_NAMES.join(', ')}.`, isError: true, assessment: null };
  }
  const toolName = name as ChatToolName;
  const parsed = CHAT_TOOL_ARGS[toolName].safeParse(rawArgs);
  if (!parsed.success) {
    const message = issues(parsed.error);
    return finish('error', rawArgs, `Ongeldige argumenten voor ${toolName}`, [], message, `Ongeldige argumenten: ${message}`);
  }

  const { context } = env;
  switch (toolName) {
    case 'find_knowledge': {
      const { query } = parsed.data as z.infer<(typeof CHAT_TOOL_ARGS)['find_knowledge']>;
      const found = assess(query, env.sources, env.names, context);
      const list = found.sources.map((s) => ({ code: s.code, title: s.title, country: s.country, client: s.client, status: s.status, disputed: s.disputed }));
      const summary = list.length
        ? `Zocht kennis over "${query}": ${plural(list.length, 'bron', 'bronnen')} (${codes(list).join(', ')})`
        : `Zocht kennis over "${query}": geen bronnen gevonden`;
      return finish('ok', { query }, summary, codes(list), null, { topic: found.topic, sources: list });
    }
    case 'assess_trust': {
      const a = parsed.data as z.infer<(typeof CHAT_TOOL_ARGS)['assess_trust']>;
      // Omitted = chat context; an explicit null client means "no specific client".
      const ctx = { country: a.country ?? context.country, client: a.client === undefined ? context.client : a.client, period: a.period ?? context.period };
      const result = assess(a.question, env.sources, env.names, ctx);
      const label = [ctx.country, ctx.client, ctx.period].filter(Boolean).join(' / ');
      const summary = `Beoordeelde vertrouwen voor ${label}: ${result.statusLabel}${result.best ? ` (${result.best.code}, ${result.best.onderbouwing.score})` : ''}`;
      const view = {
        context: ctx,
        topic: result.topic,
        status: result.status,
        statusLabel: result.statusLabel,
        best: result.best ? compact(result.best) : null,
        otherSources: result.sources.filter((s) => s !== result.best).map(compact),
      };
      return finish('ok', { question: a.question, ...ctx }, summary, codes(result.sources), null, view, result);
    }
    case 'get_source': {
      const { code } = parsed.data as z.infer<(typeof CHAT_TOOL_ARGS)['get_source']>;
      const source = env.byCode.get(code.toUpperCase());
      // Same answer for "does not exist" and "exists in a team you cannot see": access is part of trust.
      if (!source) return finish('error', { code }, NOT_FOUND(code), [], NOT_FOUND(code), NOT_FOUND(code));
      const view = assessOne(env, source);
      return finish('ok', { code }, `Las bron ${source.code}: ${source.title} (${source.value})`, [source.code], null, compact(view));
    }
  }
}
