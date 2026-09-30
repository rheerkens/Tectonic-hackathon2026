import { payslips, projectMembers, projects, sources } from '@tectonic/db';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type, type Static, type TSchema } from '@earendil-works/pi-ai';
import { CHAT_MAX_TOOL_RESULT, type ProjectChatToolName } from '@tectonic/shared';
import { and, arrayContained, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import type { AppContext } from '../app.ts';
import { requireProjectAccess } from '../permissions.ts';

export interface TeamToolContext {
  ctx: AppContext;
  anchorProjectId: string;
  userId: string;
  allowedProjectIds: readonly string[];
}

type TeamToolDefinition<Name extends ProjectChatToolName, Parameters extends TSchema> = {
  name: Name;
  label?: string;
  description: string;
  parameters: Parameters;
  run: (context: TeamToolContext, args: Static<Parameters>, signal?: AbortSignal) => Promise<unknown>;
};

function stringifyToolOutput(value: unknown): string {
  const result = JSON.stringify(value);
  if (!result) return 'null';
  return result.length <= CHAT_MAX_TOOL_RESULT ? result : `${result.slice(0, CHAT_MAX_TOOL_RESULT - 20)}… (truncated)`;
}

export function defineTeamTool<Name extends ProjectChatToolName, Parameters extends TSchema>(
  context: TeamToolContext,
  definition: TeamToolDefinition<Name, Parameters>,
): AgentTool<Parameters> {
  return {
    name: definition.name,
    label: definition.label ?? definition.name,
    description: definition.description,
    parameters: definition.parameters,
    execute: async (_toolCallId, args, signal) => {
      try {
        if (signal?.aborted) throw new Error('cancelled');
        // Recheck access at invocation time, since membership may have changed after chat began.
        await requireProjectAccess(context.ctx.db, context.anchorProjectId, context.userId, 'viewer');
        if (signal?.aborted) throw new Error('cancelled');
        const value = await definition.run(context, args, signal);
        if (signal?.aborted) throw new Error('cancelled');
        return { content: [{ type: 'text', text: stringifyToolOutput(value) }], details: undefined };
      } catch {
        throw new Error('Knowledge lookup failed. Check access or connection and try again.');
      }
    },
  };
}

const EmptyParameters = Type.Object({}, { additionalProperties: false });

const SourceSearchParameters = Type.Object({
  query: Type.Optional(Type.String({ minLength: 1, maxLength: 160, description: 'A short topic or phrase to search in source titles, topics, keywords, claims and quotes.' })),
  teamId: Type.Optional(Type.String({ minLength: 36, maxLength: 36, description: 'Limit results to a team ID returned by list_teams.' })),
}, { additionalProperties: false });

const PayslipSearchParameters = Type.Object({
  employee: Type.Optional(Type.String({ minLength: 1, maxLength: 120, description: 'Part of the employee name or the employee number.' })),
  period: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}$', description: 'Payslip month as YYYY-MM, for example 2026-09.' })),
  teamId: Type.Optional(Type.String({ minLength: 36, maxLength: 36, description: 'Limit results to a team ID returned by list_teams.' })),
}, { additionalProperties: false });

const euro = (cents: number) => `€ ${(cents / 100).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function createTeamTools(context: TeamToolContext): AgentTool[] {
  return [
    defineTeamTool(context, {
      name: 'list_teams',
      label: 'List accessible teams',
      description: 'Discover every team the authenticated user can access. Use this before searching across teams.',
      parameters: EmptyParameters,
      run: async ({ ctx, userId, allowedProjectIds }) => ctx.db
        .select({ id: projects.id, name: projects.name, description: projects.description, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, [...allowedProjectIds])))
        .orderBy(asc(projects.name))
        .limit(100),
    }),
    defineTeamTool(context, {
      name: 'list_sources',
      label: 'List knowledge sources',
      description: 'Search up to 100 knowledge sources across all teams the authenticated user can access. Use a short query; optionally restrict to a team ID from list_teams. Includes source status, country, client, validity and traceability.',
      parameters: SourceSearchParameters,
      run: async ({ ctx, userId, allowedProjectIds }, args, signal) => {
        if (signal?.aborted) throw new Error('cancelled');
        if (args.teamId && !allowedProjectIds.includes(args.teamId)) throw new Error('Team is outside this turn context');
        if (args.teamId) await requireProjectAccess(ctx.db, args.teamId, userId, 'viewer');
        if (signal?.aborted) throw new Error('cancelled');

        const currentMemberships = await ctx.db.select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, userId));
        const currentAllowedProjectIds = allowedProjectIds.filter((projectId) =>
          currentMemberships.some((membership) => membership.projectId === projectId),
        );
        if (signal?.aborted) throw new Error('cancelled');

        const filters = [
          eq(projectMembers.userId, userId),
          inArray(projectMembers.projectId, currentAllowedProjectIds),
          arrayContained(sources.audienceProjectIds, currentAllowedProjectIds),
        ];
        // A replacement the caller cannot see must not leak through its code, whatever the query or limit.
        const visibleCodes = new Set((await ctx.db
          .select({ code: sources.code })
          .from(sources)
          .innerJoin(projectMembers, and(eq(projectMembers.projectId, sources.projectId), eq(projectMembers.userId, userId)))
          .where(and(...filters))).map((r) => r.code));
        if (args.teamId) filters.push(eq(sources.projectId, args.teamId));
        // ponytail: any word of the query may match any column (a model sends phrases like "Atlas loonmutaties deadline"); ranking is by team/topic, not relevance.
        const words = (args.query ?? '').split(/\s+/).filter((word) => word.length >= 3);
        if (words.length) {
          const columns = [sources.code, sources.title, sources.topic, sources.keywords, sources.value, sources.claim, sources.quote];
          const matchingSource = or(...words.flatMap((word) => columns.map((column) => ilike(column, `%${word.replace(/[\\%_]/g, '\\$&')}%`))));
          if (matchingSource) filters.push(matchingSource);
        }
        const rows = await ctx.db
          .select({
            teamId: projects.id,
            teamName: projects.name,
            code: sources.code,
            title: sources.title,
            kind: sources.kind,
            version: sources.version,
            topic: sources.topic,
            keywords: sources.keywords,
            country: sources.country,
            client: sources.client,
            value: sources.value,
            claim: sources.claim,
            quote: sources.quote,
            validFrom: sources.validFrom,
            validTo: sources.validTo,
            status: sources.status,
            disputed: sources.disputed,
            traceable: sources.traceable,
            supersededBy: sources.supersededBy,
          })
          .from(sources)
          .innerJoin(projects, eq(projects.id, sources.projectId))
          .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
          .where(and(...filters))
          .orderBy(asc(projects.name), asc(sources.topic), asc(sources.code))
          .limit(100);

        return rows.map((source) => ({
          ...source,
          supersededBy: visibleCodes.has(source.supersededBy ?? '') ? source.supersededBy : null,
          citation: `[${source.teamName} / ${source.code}]`,
        }));
      },
    }),
    defineTeamTool(context, {
      name: 'list_payslips',
      label: 'Look up payslips',
      description: 'Look up monthly payslips (loonfiches) of employees in the teams the authenticated user can access. Filter by employee name or number and/or period (YYYY-MM). Returns gross, net and every line with exact amounts. Returns an empty list when the user has no access or nothing matches.',
      parameters: PayslipSearchParameters,
      run: async ({ ctx, userId, allowedProjectIds }, args) => {
        if (args.teamId && !allowedProjectIds.includes(args.teamId)) throw new Error('Team is outside this turn context');
        const filters = [eq(projectMembers.userId, userId), inArray(payslips.projectId, [...allowedProjectIds])];
        if (args.teamId) filters.push(eq(payslips.projectId, args.teamId));
        if (args.period) filters.push(eq(payslips.period, args.period));
        // ponytail: one phrase matched against name and number; "Emma Claes" works, "Claes Emma" does not.
        if (args.employee) {
          const like = `%${args.employee.trim().replace(/[\\%_]/g, '\\$&')}%`;
          filters.push(or(ilike(payslips.employeeName, like), ilike(payslips.employeeNumber, like))!);
        }
        const rows = await ctx.db
          .select({ teamName: projects.name, payslip: payslips })
          .from(payslips)
          .innerJoin(projects, eq(projects.id, payslips.projectId))
          .innerJoin(projectMembers, eq(projectMembers.projectId, payslips.projectId))
          .where(and(...filters))
          .orderBy(asc(payslips.employeeName), asc(payslips.period))
          .limit(50);
        return rows.map(({ teamName, payslip: p }) => ({
          teamId: p.projectId,
          teamName,
          employee: p.employeeName,
          employeeNumber: p.employeeNumber,
          period: p.period,
          country: p.country,
          client: p.client,
          gross: euro(p.grossCents),
          net: euro(p.netCents),
          lines: p.lines.map((line) => ({ label: line.label, kind: line.kind, amount: euro(line.amountCents) })),
          citation: `[${teamName} / loonfiche ${p.employeeNumber} ${p.period}]`,
        }));
      },
    }),
  ];
}
