import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

// Readiness: database and the AI service answer. Returns only ok/error per dependency, nothing about the deployment.
export const dynamic = 'force-dynamic';

async function check(fn: () => Promise<unknown>): Promise<'ok' | 'error'> {
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))]);
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function GET() {
  const [database, ai] = await Promise.all([
    check(() => db.execute(sql`SELECT 1`)),
    check(async () => {
      const r = await fetch(`${env.aiServiceUrl}/readyz`, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error('ai not ready');
    }),
  ]);
  const ok = database === 'ok' && ai === 'ok';
  return Response.json({ status: ok ? 'ok' : 'error', db: database, ai }, { status: ok ? 200 : 503 });
}
