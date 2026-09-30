import { z } from 'zod';

// ---- enums -----------------------------------------------------------------
/** A project is a team ("Payroll België", "Klantteam Atlas"): membership decides which sources you may see. */
export const MEMBER_ROLES = ['viewer', 'editor', 'owner'] as const;
export const MemberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const AUTH_SOURCES = ['dev-bypass', 'clerk'] as const;
export const AuthSourceSchema = z.enum(AUTH_SOURCES);
export type AuthSource = z.infer<typeof AuthSourceSchema>;

export const SOURCE_KINDS = ['agreement', 'procedure', 'manual', 'chat'] as const;
export const SourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SOURCE_STATUSES = ['approved', 'unconfirmed', 'superseded'] as const;
export const SourceStatusSchema = z.enum(SOURCE_STATUSES);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const COUNTRIES = ['BE', 'NL'] as const;
export const CountrySchema = z.enum(COUNTRIES);
export type Country = z.infer<typeof CountrySchema>;
export const COUNTRY_LABELS: Record<Country, string> = { BE: 'België', NL: 'Nederland' };

// ---- entities --------------------------------------------------------------
const isoDate = z.string();
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  color: z.string(),
  createdAt: isoDate,
});
export type User = z.infer<typeof UserSchema>;

export const ProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  ownerId: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Project = z.infer<typeof ProjectSchema>;

export const MeSchema = UserSchema.extend({ authSource: AuthSourceSchema });
export type Me = z.infer<typeof MeSchema>;

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  database: z.enum(['ok', 'error']),
  authMode: AuthSourceSchema,
  timestamp: isoDate,
});
export type Health = z.infer<typeof HealthSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });

// ---- knowledge sources -----------------------------------------------------
export const SourceSchema = z.object({
  id: z.uuid(),
  /** Short reference shown in the UI: S1, S2, ... */
  code: z.string(),
  projectId: z.uuid(),
  title: z.string(),
  kind: SourceKindSchema,
  version: z.number().int().nullable(),
  topic: z.string(),
  keywords: z.string(),
  country: CountrySchema,
  /** null = applies to every client; a name = a client-specific agreement. */
  client: z.string().nullable(),
  /** The headline answer, e.g. "22 oktober 2026". */
  value: z.string(),
  claim: z.string(),
  quote: z.string(),
  validFrom: isoDate,
  validTo: isoDate.nullable(),
  status: SourceStatusSchema,
  ownerId: z.string().nullable(),
  approvedById: z.string().nullable(),
  /** Can the claim be traced back to a document or message? */
  traceable: z.boolean(),
  supersededBy: z.string().nullable(),
  createdAt: isoDate,
});
export type Source = z.infer<typeof SourceSchema>;

export const ONDERBOUWING_KEYS = ['approved', 'owner', 'valid', 'traceable'] as const;
export const OnderbouwingCheckSchema = z.object({
  key: z.enum(ONDERBOUWING_KEYS),
  label: z.string(),
  points: z.number().int(),
  max: z.number().int(),
});
export type OnderbouwingCheck = z.infer<typeof OnderbouwingCheckSchema>;
export const OnderbouwingSchema = z.object({ score: z.number().int(), checks: OnderbouwingCheckSchema.array() });
export type Onderbouwing = z.infer<typeof OnderbouwingSchema>;

export const VERDICT_KINDS = ['exception', 'general', 'unconfirmed', 'expired', 'superseded', 'other-client', 'other-country'] as const;
export const VerdictSchema = z.object({ kind: z.enum(VERDICT_KINDS), label: z.string() });
export type Verdict = z.infer<typeof VerdictSchema>;

export const AssessedSourceSchema = SourceSchema.extend({
  projectName: z.string(),
  onderbouwing: OnderbouwingSchema,
  verdict: VerdictSchema,
});
export type AssessedSource = z.infer<typeof AssessedSourceSchema>;

export const ANSWER_STATUSES = ['onderbouwd', 'deels', 'onvoldoende', 'geen'] as const;
export const AnswerStatusSchema = z.enum(ANSWER_STATUSES);
export type AnswerStatus = z.infer<typeof AnswerStatusSchema>;

export const AskResultSchema = z.object({
  topic: z.string().nullable(),
  status: AnswerStatusSchema,
  statusLabel: z.string(),
  best: AssessedSourceSchema.nullable(),
  /** All sources on the topic: the best one first, then the ones that do not apply and why. */
  sources: AssessedSourceSchema.array(),
});
export type AskResult = z.infer<typeof AskResultSchema>;

export const AccessSchema = z.object({
  teams: z.object({ id: z.uuid(), name: z.string(), color: z.string(), role: MemberRoleSchema }).array(),
  clients: z.string().array(),
  /** Questions the demo data can answer, for the example chips. */
  examples: z.string().array(),
});
export type Access = z.infer<typeof AccessSchema>;

// ---- inputs ----------------------------------------------------------------
export const AskInputSchema = z.object({
  question: z.string().trim().min(3, 'Stel een vraag').max(300),
  country: CountrySchema,
  client: z.string().trim().max(80).nullable(),
  period,
});
export type AskInput = z.input<typeof AskInputSchema>;

// ---- check (paste a Teams message) ------------------------------------------
export const CheckInputSchema = z.object({
  text: z.string().trim().min(3, 'Plak een bericht').max(2000),
  country: CountrySchema,
});
export type CheckInput = z.input<typeof CheckInputSchema>;

export const CheckResultSchema = z.object({
  /** The claims found in the text (one per sentence) and how well the sources back each. */
  claims: z.object({ text: z.string(), topic: z.string().nullable(), status: AnswerStatusSchema, statusLabel: z.string() }).array(),
  /** Per claim, the sources on the same topic that do not apply or disagree, with their trust. */
  contradictions: z.object({ claim: z.string(), source: AssessedSourceSchema }).array(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Role hierarchy helper shared by the API and the UI. */
const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, owner: 2 };
export function roleAtLeast(role: MemberRole | null | undefined, required: MemberRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
