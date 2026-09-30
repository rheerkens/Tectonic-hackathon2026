import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import { CHAT_MODEL, type ChatStatus } from '@tectonic/shared';

type CredentialMode = { provider: 'openai-codex' | 'openai'; token: string };
type JsonObject = Record<string, unknown>;
type CredentialRead = { credential: CredentialMode } | { problem: 'missing' | 'invalid' | 'expired' };

function isObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return true;
}

function authPath(): string {
  const override = process.env.CODEX_AUTH_FILE?.trim();
  if (override) return override;
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
  return join(codexHome, 'auth.json');
}

function isFreshCodexToken(token: string): boolean | undefined {
  const segments = token.split('.');
  if (segments.length !== 3) return undefined;
  let claims: JsonObject | undefined;
  try {
    const decoded: unknown = JSON.parse(atob(segments[1]!.replaceAll('-', '+').replaceAll('_', '/')));
    if (isObject(decoded)) claims = decoded;
  } catch {
    return undefined;
  }
  if (!claims) return undefined;
  const exp = claims.exp;
  if (typeof exp !== 'number') return undefined;
  if (exp <= Math.floor(Date.now() / 1000)) return false;
  const claimsNamespaceValue = claims['https://api.openai.com/auth'];
  const claimsNamespace = isObject(claimsNamespaceValue) ? claimsNamespaceValue : undefined;
  const claimAccountId = claimsNamespace?.chatgpt_account_id;
  return typeof claimAccountId === 'string' && claimAccountId.length > 0;
}

async function readCredential(): Promise<CredentialRead> {
  const filePath = authPath();
  let raw: string;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(filePath, 'r');
    const buffer = Buffer.alloc(64_001);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 64_000) return { problem: 'invalid' };
    raw = buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return { problem: 'missing' };
  } finally {
    await file?.close().catch(() => {});
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { problem: 'invalid' };
  }
  if (!isObject(parsed)) return { problem: 'invalid' };
  const auth = parsed;
  const tokenValue = auth.tokens;
  const tokens = isObject(tokenValue) ? tokenValue : undefined;
  const accessToken = tokens?.access_token;
  const authMode = auth.auth_mode;
  if (authMode === 'api_key') {
    const key = auth.OPENAI_API_KEY;
    return typeof key === 'string' && key.trim()
      ? { credential: { provider: 'openai', token: key } }
      : { problem: 'missing' };
  }
  if (authMode === 'chatgpt' || authMode === undefined) {
    if (typeof accessToken === 'string' && accessToken.trim()) {
      const fresh = isFreshCodexToken(accessToken);
      if (fresh === false) return { problem: 'expired' };
      if (fresh === true) return { credential: { provider: 'openai-codex', token: accessToken } };
      return { problem: 'invalid' };
    }
    if (authMode === 'chatgpt') return { problem: 'missing' };
  } else {
    return { problem: 'invalid' };
  }
  const key = auth.OPENAI_API_KEY;
  return typeof key === 'string' && key.trim()
    ? { credential: { provider: 'openai', token: key } }
    : { problem: 'missing' };
}

export async function readCodexToken(): Promise<string | undefined> {
  const result = await readCredential();
  return 'credential' in result ? result.credential.token : undefined;
}

export async function getCodexStatus(options: { productionLike?: boolean } = {}): Promise<ChatStatus> {
  if (options.productionLike) {
    return { available: false, message: 'Local Codex credentials are unavailable in production.' };
  }
  const result = await readCredential();
  if (!('credential' in result)) {
    if (result.problem === 'expired') {
      return { available: false, message: 'Codex sign-in has expired. Sign in again with the Codex CLI to refresh it.' };
    }
    return { available: false, message: 'Sign in with the Codex CLI on this machine to use project chat.' };
  }
  const model = getBuiltinModel(result.credential.provider, CHAT_MODEL);
  if (!model) {
    return { available: false, message: 'The configured chat model is unavailable in this Pi installation.' };
  }
  return { available: true, model: model.id };
}

export async function getCodexModel(): Promise<{
  provider: 'openai-codex' | 'openai';
  model: ReturnType<typeof getBuiltinModel>;
} | undefined> {
  const result = await readCredential();
  if (!('credential' in result)) return undefined;
  const model = getBuiltinModel(result.credential.provider, CHAT_MODEL);
  return model ? { provider: result.credential.provider, model } : undefined;
}
