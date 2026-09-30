import { COUNTRY_LABELS, type AskResult, type AssessedSource, type ChatContext } from '@tectonic/shared';

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const periodLabel = (period: string) => `${MONTHS[Number(period.slice(5)) - 1] ?? period.slice(5)} ${period.slice(0, 4)}`;

/** "België, klant Atlas, oktober 2026": the situation an answer was rated for. */
export const contextLabel = (ctx: ChatContext) => [COUNTRY_LABELS[ctx.country], ctx.client ? `klant ${ctx.client}` : null, periodLabel(ctx.period)].filter(Boolean).join(', ');

const WHY: Record<'exception' | 'general', string> = {
  exception: 'Dit is een geldige klantuitzondering en gaat voor de algemene regel.',
  general: 'Dit is de geldende algemene regel voor deze situatie.',
};

/** Why a source on the topic was not the answer. Applicable-but-not-chosen sources get a different note than inapplicable ones. */
function whyNot(s: AssessedSource, best: AssessedSource | null): string {
  const base = (() => {
    if (s.verdict.kind === 'exception') return 'geldige uitzondering, maar minder sterk onderbouwd';
    if (s.verdict.kind === 'general') return best?.verdict.kind === 'exception' ? 'algemene regel, de klantuitzondering gaat voor' : 'algemene regel, maar minder sterk onderbouwd';
    return s.verdict.label.toLowerCase();
  })();
  return s.disputed ? `${base}, betwist` : base;
}

const line = (s: AssessedSource, best: AssessedSource | null) => `- [${s.code}] ${s.title} (${s.value}): ${whyNot(s, best)}`;

/**
 * The answer text without a model: a template over the deterministic assessment, so the same
 * question and data always read the same. Every number and date comes from a source.
 */
export function fallbackAnswer(a: AskResult, ctx: ChatContext): string {
  const { best } = a;
  const others = a.sources.filter((s) => s !== best);

  if (!best) {
    if (!a.topic) {
      return 'Hier is geen onderbouwd antwoord voor deze vraag. Ik vond geen bron over dit onderwerp in de teams waar je toegang toe hebt.';
    }
    return [
      `Hier is geen onderbouwd antwoord voor **${a.topic}** (${contextLabel(ctx)}). Er is wel kennis over dit onderwerp, maar geen bron die voor deze situatie geldt:`,
      ...others.map((s) => line(s, null)),
      '',
      'Laat een bevoegde collega de juiste bron bevestigen, of controleer het land, de klant en de periode.',
    ].join('\n');
  }

  const out: string[] = [`**${best.value}** [${best.code}]`, '', best.claim];
  if (best.quote) out.push('', `Bron: "${best.quote}"`);
  out.push('', `**${a.statusLabel}**: onderbouwing ${best.onderbouwing.score}/100 voor ${contextLabel(ctx)}. ${WHY[best.verdict.kind === 'exception' ? 'exception' : 'general']}`);
  out.push(...best.onderbouwing.checks.map((c) => `- ${c.label}: ${c.points === c.max ? 'ja' : 'nee'} (${c.points}/${c.max})`));
  if (a.status === 'deels' || a.status === 'onvoldoende') {
    out.push('', `Let op: dit antwoord is ${a.status === 'deels' ? 'maar deels' : 'onvoldoende'} onderbouwd. Controleer de punten met "nee" voordat je erop bouwt.`);
  }
  if (best.disputed) out.push('', `Let op: bron ${best.code} wordt betwist.`);
  if (others.length) out.push('', '**Andere bronnen over dit onderwerp**', ...others.map((s) => line(s, best)));
  return out.join('\n');
}
