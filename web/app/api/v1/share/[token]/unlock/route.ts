import { z } from 'zod';
import { clientIp } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { CSRF_COOKIE, CSRF_HEADER, tokensMatch } from '@/lib/csrf';
import { env } from '@/lib/env';
import { findShare, tryPassword, unlockCookie } from '@/lib/shares';

// operationId unlock_share — public (no session): password of a share link. Origin is checked by proxy.ts; the CSRF token is checked here.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const json = (data: object, status = 200, headers?: HeadersInit) => Response.json({ ...data, build: env.appBuild }, { status, headers });
  const cookieToken = req.headers.get('cookie')?.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))?.[1];
  if (!tokensMatch(cookieToken && decodeURIComponent(cookieToken), req.headers.get(CSRF_HEADER))) return json({ success: false, error_code: 'csrf_failed' }, 403);
  const body = z.object({ password: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ success: false, error_code: 'invalid_input' }, 400);
  const perIp = await rateLimit('share_unlock', `ip:${clientIp(req) ?? 'unknown'}`, 20, 60); // guessing passwords across many links
  if (!perIp.ok) return json({ success: false, error_code: 'rate_limited' }, 429, { 'retry-after': String(perIp.retryAfterSec) });
  const share = await findShare((await ctx.params).token);
  if (!share || share.revoked_at || share.deleted || (share.expires_at && new Date(share.expires_at) <= new Date())) return json({ success: false, error_code: 'not_found' }, 404);
  const result = await tryPassword(share, body.data.password);
  if (result === 'locked') return json({ success: false, error_code: 'rate_limited' }, 429);
  if (result === 'wrong') return json({ success: false, error_code: 'wrong_password' }, 401);
  const c = unlockCookie(share.id);
  return json({ success: true }, 200, { 'set-cookie': `${c.name}=${c.value}; Path=/share; Max-Age=${c.maxAge}; HttpOnly; SameSite=Lax${env.isProd ? '; Secure' : ''}` });
}
