import { projectMembers, projects, sources } from '@tectonic/db';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type, type Static, type TSchema } from '@earendil-works/pi-ai';
import { CHAT_MAX_TOOL_RESULT, type ProjectChatToolName } from '@tectonic/shared';
import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
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

        const filters = [eq(projectMembers.userId, userId), inArray(projectMembers.projectId, [...allowedProjectIds])];
        if (args.teamId) filters.push(eq(sources.projectId, args.teamId));
        if (args.query) {
          const query = `%${args.query.replace(/[\\%_]/g, '\\$&')}%`;
          const matchingSource = or(
            ilike(sources.code, query),
            ilike(sources.title, query),
            ilike(sources.topic, query),
            ilike(sources.keywords, query),
            ilike(sources.value, query),
            ilike(sources.claim, query),
            ilike(sources.quote, query),
          );
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
          citation: `[${source.teamName} / ${source.code}]`,
        }));
      },
    }),
  ];
}
