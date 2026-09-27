import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Serves the built web app (SPA) from `staticDir`. Anything that is not an
 * existing file falls back to `index.html` so hash-less deep links still work.
 */
export function createStaticHandler(staticDir: string) {
  const root = path.resolve(staticDir);
  const index = path.join(root, 'index.html');
  const available = existsSync(index);

  return async (request: Request): Promise<Response | null> => {
    if (!available) return null;
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const candidate = path.resolve(root, `.${pathname}`);
    if (!candidate.startsWith(root)) return new Response('Forbidden', { status: 403 });

    let filePath = index;
    if (existsSync(candidate) && statSync(candidate).isFile()) filePath = candidate;
    const file = Bun.file(filePath);
    const immutable = filePath !== index && pathname.startsWith('/assets/');
    return new Response(file, {
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  };
}
