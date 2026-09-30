import { assess, type AskResult, type AssessedSource, type ChatContext, type ChatInput, type ChatResult, type ChatToolCall } from '@tectonic/shared';
import { assessOne, executeTool, type ChatEnv } from './tools.ts';
import { fallbackAnswer, planFallback } from './fallback.ts';

interface Trace {
  calls: ChatToolCall[];
  assessment: AskResult | null;
  /** The context of that assessment; null until a successful assess_trust. */
  context: ChatContext | null;
}

/** Runs a tool, records it in the trace, and remembers the last successful trust assessment. */
function run(env: ChatEnv, trace: Trace, id: string, name: string, input: unknown) {
  const outcome = executeTool(env, id, name, input);
  if (outcome.call) trace.calls.push(outcome.call);
  if (outcome.assessment) {
    trace.assessment = outcome.assessment;
    trace.context = outcome.context;
  }
  return outcome;
}

/** Drops citations the caller cannot see and returns the cited codes in order of first mention. */
function readCitations(env: ChatEnv, answer: string): { answer: string; codes: string[] } {
  const codes: string[] = [];
  let edited = false;
  const cleaned = answer.replace(/\[([^\]\n]+)\]/g, (whole, inner: string) => {
    const parts = inner.split(/[,;\s]+/).filter(Boolean);
    if (!parts.length || !parts.every((p) => /^[A-Za-z]+\d+$/.test(p))) return whole;
    const visible = parts.filter((p) => env.byCode.has(p.toUpperCase()));
    for (const p of visible) {
      const code = env.byCode.get(p.toUpperCase())!.code;
      if (!codes.includes(code)) codes.push(code);
    }
    if (visible.length === parts.length) return whole;
    edited = true;
    return visible.length ? `[${visible.join(', ')}]` : '';
  });
  // Only tidy the gap a removed citation leaves; never touch list indentation elsewhere.
  return { answer: (edited ? cleaned.replace(/(\S) {2,}/g, '$1 ').replace(/ +([.,;:])/g, '$1') : cleaned).trim(), codes };
}

function buildResult(env: ChatEnv, trace: Trace, rawAnswer: string): ChatResult {
  const assessment = trace.assessment ?? assess('', [], env.names, env.context);
  const { answer, codes } = readCitations(env, rawAnswer);
  const assessed = new Map(assessment.sources.map((s) => [s.code.toUpperCase(), s]));
  let citations = codes.flatMap((code): AssessedSource[] => {
    const s = assessed.get(code.toUpperCase()) ?? (env.byCode.has(code.toUpperCase()) ? assessOne(env, env.byCode.get(code.toUpperCase())!) : undefined);
    return s ? [s] : [];
  });
  if (citations.length === 0 && assessment.best) citations = [assessment.best];
  return { answer, status: assessment.status, statusLabel: assessment.statusLabel, context: trace.context ?? env.context, mode: 'fallback', toolCalls: trace.calls, citations, assessment: trace.assessment };
}

/** The tools in a fixed order, then a templated answer. Same input and data give the same text. */
export function runChat(env: ChatEnv, input: ChatInput): ChatResult {
  const trace: Trace = { calls: [], assessment: null, context: null };
  const plan = planFallback(input.messages, env.sources, env.context);
  const { country, client, period } = plan.context;
  run(env, trace, 'fb-1', 'find_knowledge', { query: plan.question });
  run(env, trace, 'fb-2', 'assess_trust', { question: plan.question, country, client, period });
  const best = trace.assessment?.best;
  if (best) run(env, trace, 'fb-3', 'get_source', { code: best.code });
  const assessment = trace.assessment ?? assess('', [], env.names, plan.context);
  return buildResult(env, trace, fallbackAnswer(assessment, plan.context, env.context, plan.followUp));
}
