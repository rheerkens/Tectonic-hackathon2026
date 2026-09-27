import net from 'node:net';

export const PORT_RANGE = { min: 10_000, max: 59_999 } as const;
export const PORTS_PER_STACK = 3; // web, api, postgres

async function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error: NodeJS.ErrnoException) => {
      // Unsupported address family (e.g. no IPv6) does not mean the port is taken.
      resolve(error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL');
    });
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** True when nothing is bound on the port for any interface (IPv4 wildcard, loopback, IPv6 wildcard). */
export async function isPortFree(port: number): Promise<boolean> {
  for (const host of ['0.0.0.0', '127.0.0.1', '::']) {
    if (!(await canListen(port, host))) return false;
  }
  return true;
}

export interface PortSet {
  web: number;
  api: number;
  postgres: number;
}

export interface AllocateOptions {
  /** Ports recorded by a previous run of this worktree; reused when still free. */
  preferred?: Partial<PortSet> | null;
  /** Hash-derived starting point for fresh allocations. */
  seed: number;
  /** Ports recorded by *other* worktrees; skipped even if their stack is currently down. */
  reserved?: Iterable<number>;
  /** Injectable for tests. */
  probe?: (port: number) => Promise<boolean>;
  maxAttempts?: number;
}

/**
 * Picks three free ports for the stack. Preferred (previously recorded) ports win
 * when they are still free; otherwise a contiguous block starting at a
 * hash-derived offset is probed, moving up until every port is actually free.
 * A path hash only chooses where to start looking, it never guarantees uniqueness.
 */
export async function allocatePorts(options: AllocateOptions): Promise<PortSet> {
  const probe = options.probe ?? isPortFree;
  const reserved = new Set(options.reserved ?? []);
  const usable = async (port: number) => port >= PORT_RANGE.min && port <= PORT_RANGE.max && !reserved.has(port) && (await probe(port));

  const preferred = options.preferred;
  if (preferred?.web && preferred.api && preferred.postgres) {
    const ports = [preferred.web, preferred.api, preferred.postgres];
    const distinct = new Set(ports).size === ports.length;
    if (distinct && (await Promise.all(ports.map(usable))).every(Boolean)) {
      return { web: preferred.web, api: preferred.api, postgres: preferred.postgres };
    }
  }

  const span = PORT_RANGE.max - PORT_RANGE.min + 1;
  const blockCount = Math.floor(span / 10);
  const startBlock = options.seed % blockCount;
  const attempts = options.maxAttempts ?? blockCount;
  for (let i = 0; i < attempts; i++) {
    const base = PORT_RANGE.min + ((startBlock + i) % blockCount) * 10;
    const candidate: PortSet = { web: base, api: base + 1, postgres: base + 2 };
    const free = await Promise.all([usable(candidate.web), usable(candidate.api), usable(candidate.postgres)]);
    if (free.every(Boolean)) return candidate;
  }
  throw new Error(`Could not find ${PORTS_PER_STACK} free ports in ${PORT_RANGE.min}-${PORT_RANGE.max}`);
}
