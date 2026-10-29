// Operations E2E (docs/03 §7.13): kill switch from the back office (guest chat / all chat / uploads), per-minute rate limits
// (API-wide, chat), Retry-After header, audit of switch changes, and role gating of the page.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3209';
const TS = process.env.TS;
const PASS = 'correct-horse-9';
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
const email = (w) => `ops-e2e-${w}-${TS}@example.test`;
async function login(who) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'th-TH' });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('อีเมล').fill(email(who));
  await page.locator('input[name=password]').fill(PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
  await page.waitForURL('**/chat**', { timeout: 20000 });
  return page;
}
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const c = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-csrf-token': c }, body: b ? JSON.stringify(b) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* sse */ }
  return { status: r.status, json, text, retryAfter: r.headers.get('retry-after') };
}, [method, path, body]);
const chat = (page, message) => api(page, 'POST', '/api/v1/chat/stream', { message });
const events = (text) => [...text.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => [m[1], JSON.parse(m[2])]);

const admin = await login('admin');
const member = await login('member');
const gctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'th-TH' });
const guest = await gctx.newPage();
await guest.goto(`${BASE}/login`);
await guest.getByRole('button', { name: /ทดลองใช้โดยไม่สมัคร/ }).click();
await guest.waitForURL('**/consent**');
await guest.getByRole('checkbox').check();
await guest.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
await guest.waitForURL('**/chat**');

// ---- who can reach the switches
ok('a member gets a 404 page for /admin/system', (await member.goto(`${BASE}/admin/system`))?.status() === 404);
ok('a member cannot call the API (403)', (await api(member, 'PUT', '/api/v1/admin/system', { guests_chat: true, all_chat: false, uploads: false, note: '' })).status === 403);

// ---- the page: flip guests' chat off
await admin.goto(`${BASE}/admin/system`);
await admin.getByRole('heading', { name: 'ระบบ', level: 1 }).waitFor();
ok('page has a tab title', (await admin.title()).includes('ระบบ'));
await admin.getByRole('checkbox', { name: /หยุดแชทของผู้ทดลองใช้/ }).check();
await admin.getByLabel('ข้อความถึงผู้ใช้').fill('ปิดปรับปรุงระบบ 30 นาที');
await admin.getByRole('button', { name: 'บันทึก', exact: true }).click();
await admin.getByText(/บันทึกแล้ว มีผลภายในไม่กี่วินาที/).waitFor();
await admin.getByText(/สวิตช์ฉุกเฉินกำลังทำงานอยู่/).waitFor();
await admin.screenshot({ path: 'test-results/ops/01-system.png' });

const blocked = events((await chat(guest, 'ส่งงานช้าโดนปรับ')).text);
const g = blocked.find(([e]) => e === 'guardrail');
ok('guest chat is answered with the maintenance notice and the admin note', g && g[1].kind === 'maintenance' && g[1].text === 'ปิดปรับปรุงระบบ 30 นาที', JSON.stringify(blocked));
const memberEvents = events((await chat(member, 'ส่งงานช้าโดนปรับ')).text);
ok('members are not affected by the guest switch', !memberEvents.some(([e, d]) => e === 'guardrail' && d.kind === 'maintenance'));

// ---- all chat
await api(admin, 'PUT', '/api/v1/admin/system', { guests_chat: false, all_chat: true, uploads: false, note: '' });
const all = events((await chat(member, 'ทดสอบ')).text).find(([e]) => e === 'guardrail');
ok('with "all chat" off a member is stopped too, with the default text', all && all[1].kind === 'maintenance' && /หยุดให้บริการชั่วคราว/.test(all[1].text), JSON.stringify(all));

// ---- uploads
await api(admin, 'PUT', '/api/v1/admin/system', { guests_chat: false, all_chat: false, uploads: true, note: '' });
const upload = await member.evaluate(async () => {
  const c = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const fd = new FormData(); fd.append('file', new File(['x'], 'a.pdf', { type: 'application/pdf' }));
  const r = await fetch('/api/v1/contracts', { method: 'POST', headers: { 'x-csrf-token': c }, body: fd });
  return { status: r.status, body: await r.json() };
});
ok('uploads are refused (503 UPLOADS_PAUSED) while paused', upload.status === 503 && upload.body.error === 'UPLOADS_PAUSED', JSON.stringify(upload));

// ---- switch everything off again
await api(admin, 'PUT', '/api/v1/admin/system', { guests_chat: false, all_chat: false, uploads: false, note: '' });
await new Promise((r) => setTimeout(r, 300));
const back = events((await chat(guest, 'ทดสอบ')).text);
ok('after switching off, guest chat reaches the AI service again', !back.some(([e, d]) => e === 'guardrail' && d.kind === 'maintenance'));

// ---- per-minute limits (server started with RATE_API_PER_MIN=40, RATE_CHAT_PER_MIN=3)
const limited = await member.evaluate(async () => {
  const out = []; for (let i = 0; i < 60; i++) { const r = await fetch('/api/v1/session'); out.push([r.status, r.headers.get('retry-after')]); } return out;
});
const first429 = limited.findIndex(([s]) => s === 429);
ok('the API-wide per-minute limit answers 429 with Retry-After', first429 > 0 && first429 <= 40 && Number(limited[first429][1]) >= 1, JSON.stringify(limited.slice(first429 - 1, first429 + 1)));
ok('requests before the limit are normal', limited.slice(0, first429).every(([s]) => s === 200));

const chatty = await login('chatty');
let notice = null;
for (let i = 0; i < 6 && !notice; i++) {
  const g2 = events((await chat(chatty, `คำถามที่ ${i}`)).text).find(([e, d]) => e === 'guardrail' && d.kind === 'rate_limit');
  if (g2) notice = { i, g2 };
}
ok('chat is limited per minute (3) with a clear message', notice && notice.i === 3 && /ถามถี่เกินไป/.test(notice.g2[1].text), JSON.stringify(notice));

ok('another user is not affected by that user\'s limits', (await api(admin, 'GET', '/api/v1/admin/system')).status === 200);
await browser.close();
console.log(JSON.stringify({ ok: true, checks: results.length }));
