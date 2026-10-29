import { timingSafeEqual } from 'node:crypto';
import { getKillSwitch } from '@/lib/ops';
import { metrics } from '@/lib/metrics';

// Prometheus scrape endpoint. Closed unless METRICS_TOKEN is set; then it needs `Authorization: Bearer <token>`.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return new Response('not found', { status: 404 });
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response('unauthorized', { status: 401 });
  await getKillSwitch(true).catch(() => undefined); // refresh the gauge before scraping
  return new Response(await metrics().registry.metrics(), { headers: { 'content-type': metrics().registry.contentType, 'cache-control': 'no-store' } });
}
