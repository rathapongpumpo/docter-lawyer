import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard rails for the API surface (CLAUDE.md §2.3 rule 11): every route handler goes through defineOperation (session, role, CSRF,
// per-minute limit, metrics) unless it is on this short, reviewed list; and no operation switches CSRF off.
const ROOT = join(__dirname, '../../app/api');
const PUBLIC_ROUTES: Record<string, string> = {
  'healthz/route.ts': 'liveness probe, no data',
  'readyz/route.ts': 'readiness probe, ok/error only',
  'metrics/route.ts': 'Prometheus scrape, bearer token, closed unless METRICS_TOKEN is set, blocked by Caddy',
  'auth/[...all]/route.ts': 'Better Auth handler (its own CSRF/origin/rate-limit rules)',
  'v1/share/[token]/unlock/route.ts': 'public share password check: token + password, own lockout, no session by design',
};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === 'route.ts' ? [p] : [];
  });
}

describe('API route guards', () => {
  const files = routes(ROOT).map((p) => [relative(ROOT, p), readFileSync(p, 'utf8')] as const);

  it('finds the routes', () => expect(files.length).toBeGreaterThan(40));

  it('every handler uses defineOperation unless it is on the reviewed public list', () => {
    const unguarded = files.filter(([f, src]) => !src.includes('defineOperation(') && !(f in PUBLIC_ROUTES)).map(([f]) => f);
    expect(unguarded).toEqual([]);
  });

  it('every exported method of a guarded route is an operation', () => {
    for (const [f, src] of files) {
      if (f in PUBLIC_ROUTES) continue;
      const methods = [...src.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      for (const m of methods) expect(src, `${f} ${m}`).toMatch(new RegExp(`export const ${m} = defineOperation\\(`));
    }
  });

  it('no operation disables the CSRF check', () => {
    expect(files.filter(([, src]) => /csrf:\s*false/.test(src)).map(([f]) => f)).toEqual([]);
  });

  it('every operation has an operationId and a role', () => {
    for (const [f, src] of files) {
      if (f in PUBLIC_ROUTES) continue;
      for (const block of src.split('defineOperation(').slice(1)) {
        const head = block.slice(0, 400);
        expect(head, `${f}: operationId`).toMatch(/operationId:\s*'[a-z_]+'/);
        expect(head, `${f}: role`).toMatch(/role:\s*'(guest|member|editor|reviewer|admin)'/);
      }
    }
  });
});
