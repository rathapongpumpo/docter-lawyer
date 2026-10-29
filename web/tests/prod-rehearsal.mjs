// Production rehearsal: the real web image behind Caddy with TLS (deploy/Caddyfile). Checks HTTPS + headers, secure cookies,
// that internal endpoints are not reachable from outside, and that a chat answer streams through the proxy.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://localhost:8443';
const results = [];
const ok = (name, cond, extra = '') => { results.push(name); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'th-TH', viewport: { width: 1300, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });

const login = await page.goto(`${BASE}/login`);
const h = login.headers();
ok('login page over HTTPS', login.status() === 200 && BASE.startsWith('https://'));
ok('HSTS is sent in production', /max-age=31536000/.test(h['strict-transport-security'] ?? ''), JSON.stringify(h));
ok('CSP with a per-request nonce and no unsafe-eval', /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(h['content-security-policy'] ?? '') && !/unsafe-eval/.test(h['content-security-policy']));
ok('upgrade-insecure-requests in CSP', /upgrade-insecure-requests/.test(h['content-security-policy'] ?? ''));
ok('X-Frame-Options, nosniff, referrer policy', h['x-frame-options'] === 'SAMEORIGIN' && h['x-content-type-options'] === 'nosniff' && !!h['referrer-policy']);
ok('the Server header and X-Powered-By are not exposed', !h['server'] && !h['x-powered-by']);
const zip = await page.request.get(`${BASE}/login`, { headers: { 'accept-encoding': 'gzip, zstd' } });
ok('HTML is compressed by Caddy', /gzip|zstd/.test(zip.headers()['content-encoding'] ?? ''));

// internal endpoints are closed to the outside
for (const p of ['/api/metrics', '/api/readyz']) ok(`${p} is not reachable through the proxy`, (await page.request.get(`${BASE}${p}`)).status() === 404);
const hz = await page.request.get(`${BASE}/api/healthz`);
ok('/api/healthz answers through the proxy', hz.status() === 200 && (await hz.json()).status === 'ok');

// guest → consent → chat, streamed through Caddy
await page.getByRole('button', { name: /ทดลองใช้โดยไม่สมัคร/ }).click();
await page.waitForURL('**/consent**');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
await page.waitForURL('**/chat**');
const cookies = await ctx.cookies();
const session = cookies.find((c) => /session_token/.test(c.name));
ok('session cookie is Secure, HttpOnly, SameSite=Lax and __Secure- prefixed', session && session.secure && session.httpOnly && session.sameSite === 'Lax' && session.name.startsWith('__Secure-'), JSON.stringify(session));

const stamps = await page.evaluate(async () => {
  const csrf = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const t0 = performance.now(); const times = []; let text = '';
  const r = await fetch('/api/v1/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ message: 'ส่งงานช้า ลูกค้าจะหักค่าปรับวันละ 2 หมื่น ต้องจ่ายเต็มไหม' }) });
  const reader = r.body.getReader(); const dec = new TextDecoder();
  for (;;) { const { value, done } = await reader.read(); if (done) break; times.push(Math.round(performance.now() - t0)); text += dec.decode(value); }
  return { status: r.status, type: r.headers.get('content-type'), enc: r.headers.get('content-encoding'), times, hasComplete: text.includes('event: complete'), hasChunk: text.includes('event: chunk'), head: text.slice(0, 400) };
});
ok('the chat stream is text/event-stream, not compressed, and completes', stamps.status === 200 && /text\/event-stream/.test(stamps.type) && !stamps.enc && stamps.hasChunk && stamps.hasComplete, JSON.stringify(stamps));
ok('the stream arrives in several pieces (Caddy does not buffer it)', stamps.times.length >= 3, `pieces=${stamps.times.length}`);

// the site still renders (fonts, CSS, hydration)
await page.goto(`${BASE}/library`);
await page.getByRole('heading', { name: 'คลังความรู้', level: 1 }).waitFor();
ok('no client errors and no 5xx', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: 'test-results/prod/library.png' });
await browser.close();
console.log(JSON.stringify({ ok: true, checks: results.length, stream_pieces: stamps.times.length, first_piece_ms: stamps.times[0], total_ms: stamps.times.at(-1) }));
