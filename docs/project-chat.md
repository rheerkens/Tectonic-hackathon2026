# Project chat

Open the chat button at the bottom right of SD Trust. Ask a question about your knowledge sources. The assistant discovers relevant teams and sources within your current access, so there is no context selector. Replies stream into the panel, and each lookup appears as an expandable tool row. The API reads `PROJECT_CHAT_MODEL` from the server environment and defaults to `gpt-6-luna` when it is empty. Set a supported OpenAI model ID in `.env` and restart the stack to change it. Model names and controls remain hidden in the panel. The request schema accepts only a message.

Each member has a private conversation anchored to an accessible team for storage. The anchor does not restrict lookups to that team. Postgres stores completed, failed, and cancelled turns. The panel loads the latest 100 authorized turns, and the model receives the latest 20 authorized turns with completed replies. Each turn records its accessible-team snapshot and a hash of source IDs and access rules in those teams. Source additions, deletions, moves, and audience changes invalidate earlier turns for display and model reuse. If any of those memberships is lost, the turn is excluded from history and model context. Turns saved before source-access hashes were introduced are preserved in the database but excluded from reuse. Switching identities starts a separate conversation. Removing access to the conversation’s storage team makes that history unavailable.

## Use the installation's Codex login

Sign in with `codex login`, then start the worktree with `bun run dev`. The API reads `auth.json` under `CODEX_HOME`, which defaults to `~/.codex`. `CODEX_AUTH_FILE` can point to a different credential file on the server.

The API uses the ChatGPT access token with Pi's Codex Responses transport. If the file contains API key authentication, it uses Pi's OpenAI transport. Credentials stay on the server. The API reads the file again before each provider request and never writes it.

Codex owns token refresh. When the login expires, use the Codex CLI to refresh it or sign in again, then reopen the panel. Local credential reuse is disabled in production and Railway environments.

## Add a lookup tool

Tool definitions live in `apps/api/src/project-chat/tools.ts`. Add a definition through `defineTeamTool` and register it in `createTeamTools`. Define its input with TypeBox and put the lookup in its `run` handler. Pi validates the arguments before execution.

The helper binds the user and conversation anchor from the authenticated request. It checks access again before each call and bounds the result sent to the model. Discovery tools join current team membership, and explicit team filters must pass their own access check. A connector should use those identities to select its connection and credentials. Keep connector credentials out of returned tool data.

Tool names use lowercase letters, digits, and underscores. The shared event schema and panel accept registered connector names without changes. The current tools are `list_teams` and `list_sources`, both read-only. The registry does not expose shell commands or local files.

## Source references

The local source checkouts are `/tmp/t3code` and `/tmp/pi-agent`. The panel follows T3 Code's chat composer, timeline, and tool activity presentation. Pi provides the agent loop, argument validation, tool execution, and provider transport through the pinned `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` packages.
