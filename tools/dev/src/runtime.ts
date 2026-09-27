import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PortSet } from './ports.ts';

export type StackStatus = 'starting' | 'ready' | 'stopped' | 'failed';

/** Written to `.local/<profile>/runtime.json` so humans, tests and agents can discover the stack. */
export interface RuntimeInfo {
  status: StackStatus;
  profile: string;
  worktree: { root: string; name: string; id: string };
  launcherPid: number;
  startedAt: string;
  updatedAt: string;
  ports: PortSet;
  urls: {
    web: string;
    webLan: string[];
    api: string;
    apiHealth: string;
    ws: string;
    database: string;
  };
  env: { DATABASE_URL: string; API_PORT: string; WEB_PORT: string; AUTH_MODE: string };
  pids: { api: number | null; web: number | null; postgres: number | null };
  paths: { local: string; postgresData: string; logs: string; lock: string; runtime: string };
  error?: string;
}

export function runtimeFile(localDir: string): string {
  return path.join(localDir, 'runtime.json');
}

export function readRuntime(localDir: string): RuntimeInfo | null {
  const file = runtimeFile(localDir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as RuntimeInfo;
  } catch {
    return null;
  }
}

export function writeRuntime(localDir: string, info: RuntimeInfo): void {
  mkdirSync(localDir, { recursive: true });
  const file = runtimeFile(localDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...info, updatedAt: new Date().toISOString() }, null, 2));
  renameSync(tmp, file); // atomic replace, so pollers never read a half-written file
}

/** Non-internal IPv4 addresses, e.g. LAN and Tailscale, for sharing URLs with other devices. */
export function lanAddresses(): string[] {
  const result: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push(entry.address);
    }
  }
  return result;
}

export function buildUrls(ports: PortSet, databaseUrl: string): RuntimeInfo['urls'] {
  return {
    web: `http://localhost:${ports.web}`,
    webLan: lanAddresses().map((ip) => `http://${ip}:${ports.web}`),
    api: `http://localhost:${ports.api}`,
    apiHealth: `http://localhost:${ports.api}/api/health`,
    ws: `ws://localhost:${ports.api}/ws`,
    database: databaseUrl,
  };
}
