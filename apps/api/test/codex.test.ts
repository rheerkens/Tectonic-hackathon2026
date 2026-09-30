import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHAT_MODEL } from '@tectonic/shared';
import { getCodexStatus, readCodexToken } from '../src/project-chat/codex.ts';

let directory: string;
const previous = {
  CODEX_AUTH_FILE: process.env.CODEX_AUTH_FILE,
  CODEX_HOME: process.env.CODEX_HOME,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

async function setAuth(value: unknown) {
  await writeFile(join(directory, 'auth.json'), JSON.stringify(value));
}

describe('Codex credential adapter', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'codex-chat-test-'));
    delete process.env.OPENAI_API_KEY;
    process.env.CODEX_AUTH_FILE = join(directory, 'auth.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('reports the configured Pi model without returning credential data', async () => {
    const token = jwt({ exp: Math.floor(Date.now() / 1000) + 3600, 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } });
    await setAuth({ auth_mode: 'chatgpt', tokens: { access_token: token } });

    expect(await getCodexStatus()).toEqual({ available: true, model: CHAT_MODEL });
    expect(await readCodexToken()).toBe(token);
  });

  test('blocks local credentials in production and reports expired sign-in', async () => {
    await setAuth({ auth_mode: 'chatgpt', tokens: { access_token: jwt({ exp: 1, chatgpt_account_id: 'fixture-account' }) } });

    expect(await getCodexStatus({ productionLike: true })).toEqual({ available: false, message: 'Local Codex credentials are unavailable in production.' });
    expect(await getCodexStatus()).toEqual({ available: false, message: 'Codex sign-in has expired. Sign in again with the Codex CLI to refresh it.' });
  });

  test('honors explicit API key mode and ignores shell-only keys', async () => {
    await setAuth({ auth_mode: 'api_key', OPENAI_API_KEY: 'fixture-key' });
    expect(await getCodexStatus()).toEqual({ available: true, model: CHAT_MODEL });
    expect(await readCodexToken()).toBe('fixture-key');

    await rm(join(directory, 'auth.json'));
    process.env.OPENAI_API_KEY = 'environment-only-key';
    expect(await getCodexStatus()).toMatchObject({ available: false });
  });

  test('rejects oversized or malformed auth files without exposing contents', async () => {
    await writeFile(join(directory, 'auth.json'), `${'x'.repeat(65_000)}`);
    expect(await getCodexStatus()).toMatchObject({ available: false });
    await setAuth({ auth_mode: 'chatgpt', tokens: { access_token: 'secret-invalid-token' } });
    expect(await getCodexStatus()).toMatchObject({ available: false });
  });
});
