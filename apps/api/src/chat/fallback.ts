import { COUNTRY_LABELS, subjectWords, type AskResult, type AssessedSource, type ChatContext, type ChatTurn, type Source } from '@tectonic/shared';

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const periodLabel = (period: string) => `${MONTHS[Number(period.slice(5)) - 1] ?? period.slice(5)} ${period.slice(0, 4)}`;

/** "België, klant Atlas, oktober 2026": the situation an answer was rated for. */
export const contextLabel = (ctx: ChatContext) => [COUNTRY_LABELS[ctx.country], ctx.client ? `klant ${ctx.client}` : null, periodLabel(ctx.period)].filter(Boolean).join(', ');

// ---- reading the question (no model) ---------------------------------------
const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * A country or month named in the message wins over the context chips ("En voor Nederland?", "En in november?").
 * Deterministic and narrow on purpose: one country, one month (or "volgende/vorige maand"), an optional year.
 * The client is never read from the text; it stays the chip.
 */
export function contextFromText(text: string, base: ChatContext): ChatContext {
  const t = plain(text);
  const nl = /\b(nederland|nederlandse?|nl)\b/.test(t);
  const be = /\b(belgie|belgische?|be)\b/.test(t);
  const country = nl !== be ? (nl ? 'NL' : 'BE') : base.country;

  let [year, month] = base.period.split('-').map(Number) as [number, number];
  const named = MONTHS.map((name, i) => (new RegExp(`\\b${name}\\b`).test(t) ? i + 1 : 0)).filter(Boolean);
  const explicitYear = /\b(20\d\d)\b/.exec(t);
  if (/\bvolgende maand\b/.test(t)) month += 1;
  else if (/\bvorige maand\b/.test(t)) month -= 1;
  else if (named.length === 1) month = named[0]!;
  if (explicitYear) year = Number(explicitYear[1]);
  year += Math.floor((month - 1) / 12);
  month = ((month - 1 + 12) % 12) + 1;
  return { country, client: base.client, period: `${year}-${String(month).padStart(2, '0')}` };
}

export interface FallbackPlan {
  /** What the tools are asked: the last question, plus earlier ones while a message has no subject of its own. */
  question: string;
  /** The chat context with the country/month the last message names. */
  context: ChatContext;
  /** The question continues an earlier one ("En voor Nederland?"). */
  followUp: boolean;
}

/**
 * A message with no subject of its own ("En voor volgende maand?", "En in Nederland?", "Waarom?") continues the previous
 * question: the tools get the previous user question(s) plus this one. A message with a subject ("Mag ik maaltijdcheques
 * uitbetalen?") stands alone, even when it finds nothing: a gap must not be answered with the previous topic.
 */
export function planFallback(messages: ChatTurn[], sources: Array<Pick<Source, 'client'>>, base: ChatContext): FallbackPlan {
  const users = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const last = users.pop() ?? '';
  const parts = [last];
  while (users.length > 0 && parts.length < 3 && subjectWords(parts[0]!, sources, base).length === 0) parts.unshift(users.pop()!);
  return { question: parts.join(' ').slice(-300), context: contextFromText(last, base), followUp: parts.length > 1 };
}

// ---- the answer text -------------------------------------------------------
const WHY: Record<'exception' | 'general', string> = {
  exception: 'Dit is een geldige klantuitzondering en gaat voor de algemene regel.',
  general: 'Dit is de geldende algemene regel voor deze situatie.',
};

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Why a source on the topic was not the answer. Applicable-but-not-chosen sources get a different note than inapplicable ones. */
function whyNot(s: AssessedSource, best: AssessedSource | null): string {
  const base = (() => {
    if (s.verdict.kind === 'exception') return best && best.verdict.kind === 'exception' && best.value !== s.value ? `ook een geldige uitzondering, maar met een andere waarde${s.onderbouwing.score < best.onderbouwing.score ? ' en minder sterk onderbouwd' : ''}` : 'geldige uitzondering, maar minder sterk onderbouwd';
    if (s.verdict.kind === 'general') return best?.verdict.kind === 'exception' ? 'algemene regel, de klantuitzondering gaat voor' : 'algemene regel, maar minder sterk onderbouwd';
    return lower(s.verdict.label);
  })();
  return s.disputed ? `${base}, betwist` : base;
}

const line = (s: AssessedSource, best: AssessedSource | null) => `- [${s.code}] ${s.title} (${s.value}): ${whyNot(s, best)}`;
const list = (codes: string[]) => codes.map((c) => `[${c}]`).join(', ');

/** What the user asked for that differs from the chat chips, so a changed context is never silent. */
function changes(asked: ChatContext, chat: ChatContext): string[] {
  return [
    asked.country !== chat.country ? `${COUNTRY_LABELS[asked.country]} in plaats van ${COUNTRY_LABELS[chat.country]}` : null,
    asked.period !== chat.period ? `${periodLabel(asked.period)} in plaats van ${periodLabel(chat.period)}` : null,
  ].filter((x): x is string => x !== null);
}

/**
 * The answer text without a model: a template over the deterministic assessment, so the same
 * question and data always read the same. Every number and date comes from a source.
 * `chat` is the context the user picked; `ctx` is what the answer was rated for (they differ when the question names another country or month).
 */
export function fallbackAnswer(a: AskResult, ctx: ChatContext, chat: ChatContext = ctx, followUp = false): string {
  const { best } = a;
  const others = a.sources.filter((s) => s !== best);
  const intro: string[] = [];
  const changed = changes(ctx, chat);
  if (changed.length) intro.push(`Ik beoordeel dit voor ${changed.join(' en voor ')}, omdat je dat in je vraag noemt.`);
  if (followUp) intro.push('Ik lees dit als vervolg op je vorige vraag.');
  const head = intro.length ? [intro.join(' '), ''] : [];

  if (!best) {
    if (!a.topic) {
      return [...head, 'Hier is geen onderbouwd antwoord voor deze vraag. Ik vond geen bron over dit onderwerp in de teams waar je toegang toe hebt.', '', 'Dit is een gat in de kennis: vraag het een collega en laat het antwoord daarna door een bevoegde eigenaar vastleggen.'].join('\n');
    }
    const expired = others.filter((s) => s.verdict.kind === 'expired').map((s) => s.code);
    const otherCountry = others.filter((s) => s.verdict.kind === 'other-country').map((s) => s.code);
    return [
      ...head,
      `Hier is geen onderbouwd antwoord voor **${a.topic}** (${contextLabel(ctx)}). Er is wel kennis over dit onderwerp, maar geen bron die voor deze situatie geldt:`,
      ...others.map((s) => line(s, null)),
      '',
      ...(expired.length ? [`Bronnen die voor een andere periode gelden (${list(expired)}) neem ik niet over voor ${periodLabel(ctx.period)}.`] : []),
      ...(otherCountry.length ? [`Bronnen voor een ander land (${list(otherCountry)}) gelden niet voor ${COUNTRY_LABELS[ctx.country]}.`] : []),
      'Laat een bevoegde collega de juiste bron bevestigen, of controleer het land, de klant en de periode.',
    ].join('\n');
  }

  const out: string[] = [...head, `**${best.value}** [${best.code}]`, '', best.claim];
  if (best.quote) out.push('', `Bron: "${best.quote}"`);
  out.push('', `**${a.statusLabel}**: onderbouwing ${best.onderbouwing.score}/100 voor ${contextLabel(ctx)}. ${WHY[best.verdict.kind === 'exception' ? 'exception' : 'general']}`);
  const failed = best.onderbouwing.checks.filter((c) => c.points < c.max);
  out.push(failed.length ? `Niet gehaald: ${failed.map((c) => `${c.label.toLowerCase()} (0/${c.max})`).join(', ')}.` : `Alle vier de controles gehaald: ${best.onderbouwing.checks.map((c) => c.label.toLowerCase()).join(', ')}.`);
  if (a.status === 'deels' || a.status === 'onvoldoende') {
    out.push('', `Let op: dit antwoord is ${a.status === 'deels' ? 'maar deels' : 'onvoldoende'} onderbouwd. Controleer de controles die niet gehaald zijn voordat je erop bouwt.`);
  }
  // An answer for a named client that rests on the general rule only: absence of a confirmed exception in what the user may read is not proof that none exists.
  if (ctx.client && best.verdict.kind === 'general') {
    const unconfirmed = others.filter((s) => s.client === ctx.client && s.verdict.kind === 'unconfirmed').map((s) => s.code);
    out.push(
      '',
      unconfirmed.length
        ? `Let op: voor klant ${ctx.client} vond ik geen bevestigde afspraak. ${list(unconfirmed)} ${unconfirmed.length === 1 ? 'is' : 'zijn'} niet bevestigd en ${unconfirmed.length === 1 ? 'telt' : 'tellen'} niet mee. Laat dit bevestigen bij de klantverantwoordelijke voordat je de algemene regel als klantantwoord gebruikt.`
        : `Let op: ik vond geen specifieke afspraak voor klant ${ctx.client} in ${COUNTRY_LABELS[ctx.country]}, in de teams waar je toegang toe hebt. Dat betekent niet dat er geen bestaat: bevestig dit bij de klantverantwoordelijke voordat je de algemene regel als klantantwoord gebruikt.`,
    );
  }
  if (best.disputed) out.push('', `Let op: bron ${best.code} wordt betwist.`);
  // Two equally applicable sources with different values: the ranking picked one, the consultant must know about the other.
  const rivals = others.filter((s) => s.verdict.kind === best.verdict.kind && s.value !== best.value);
  if (rivals.length) out.push('', `Let op: ${list(rivals.map((s) => s.code))} ${rivals.length === 1 ? 'geeft' : 'geven'} een andere waarde en ${rivals.length === 1 ? 'geldt' : 'gelden'} evenzeer voor deze situatie. Laat bevestigen welke juist is voordat je de klant antwoordt.`);
  if (others.length) out.push('', '**Andere bronnen over dit onderwerp**', ...others.map((s) => line(s, best)));
  return out.join('\n');
}
