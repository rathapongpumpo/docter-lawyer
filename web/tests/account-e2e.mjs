// Account flows E2E (FR-AUTH-*) against a throwaway database copy: register + consent, e-mail verification,
// forgot/reset password, lockout, consent gate, settings (text size / theme / language), 2FA, export, deletion
// grace period, idle sign-out. Mail is read from mailpit (http://127.0.0.1:58025).
// Usage: BASE_URL=http://localhost:3202 MAIL_API=http://127.0.0.1:58025 node tests/account-e2e.mjs
import { createHmac } from 'node:crypto';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3202';
const MAIL = process.env.MAIL_API ?? 'http://127.0.0.1:58025';
const OUT = process.env.OUT_DIR ?? 'test-results/account';
const TS = Date.now();
const email = `acct-e2e-${TS}@example.test`;
const email2 = `acct-e2e-consent-${TS}@example.test`;
const PASS1 = 'correct-horse-9';
const PASS2 = 'battery-staple-77';
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  if (!cond) throw new Error(`FAILED: ${name} ${extra}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mailTo(to, subject, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const hit = list.messages?.find((m) => m.Subject.includes(subject));
    if (hit) return (await (await fetch(`${MAIL}/api/v1/message/${hit.ID}`)).json());
    await sleep(500);
  }
  return null;
}
const linkIn = (msg) => {
  const url = /https?:\/\/[^\s"<]+/.exec(msg.Text)?.[0];
  if (!url) return null;
  const u = new URL(url);
  return `${BASE}${u.pathname}${u.search}`; // keep the token, point at the test server
};

function totp(base32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function login(p, mail, password) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel('อีเมล').fill(mail);
  await p.locator('input[name=password]').fill(password);
  await p.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
}

// 1. register (verification required, like prod): consent box is mandatory, neutral "check your email" screen
await page.goto(`${BASE}/register`);
await page.getByLabel('ชื่อที่แสดง').fill('ทดสอบ บัญชี');
await page.getByLabel('อีเมล').fill(email);
await page.locator('input[name=password]').fill(PASS1);
await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
ok('register blocked without accepting terms', await page.getByRole('alert').filter({ hasText: 'ติ๊กยอมรับ' }).isVisible());
await page.getByRole('checkbox', { name: /ยอมรับ/ }).check();
await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
await page.getByRole('heading', { name: 'ตรวจอีเมลของคุณ' }).waitFor();
const verifyMail = await mailTo(email, 'ยืนยันอีเมล');
ok('verification mail sent in Thai', !!verifyMail);
await page.screenshot({ path: `${OUT}/01-check-email.png` });

// registering the same address again shows the same neutral screen (no account enumeration)
await page.goto(`${BASE}/register`);
await page.getByLabel('ชื่อที่แสดง').fill('ซ้ำ');
await page.getByLabel('อีเมล').fill(email);
await page.locator('input[name=password]').fill(PASS1);
await page.getByRole('checkbox', { name: /ยอมรับ/ }).check();
await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
await page.getByRole('heading', { name: 'ตรวจอีเมลของคุณ' }).waitFor();
ok('duplicate registration gets the neutral screen', true);

// sign-in before verifying is refused and mails a fresh link
await login(page, email, PASS1);
await page.getByRole('alert').filter({ hasText: 'ยังไม่ได้ยืนยันอีเมล' }).waitFor();
ok('sign-in refused until e-mail is verified', true);

// 2. verification link → signed in → consent gate (the form could not record consent without a session)
await page.goto(linkIn(verifyMail));
await page.waitForURL('**/consent**', { timeout: 20000 });
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
await page.waitForURL('**/chat**');
ok('verified, signed in and consent recorded', (await page.getByText('ยังไม่ได้ยืนยัน').count()) === 0);

// 3. settings: text size, theme, language
await page.goto(`${BASE}/settings`);
await page.getByRole('main').getByRole('radio', { name: 'ใหญ่มาก' }).click();
await page.waitForFunction(() => document.documentElement.style.fontSize === '125%');
await page.getByRole('main').getByRole('radio', { name: 'มืด' }).click();
await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
await page.screenshot({ path: `${OUT}/02-settings-dark-large.png`, fullPage: true });
await page.reload();
ok('text size persists after reload', (await page.evaluate(() => document.documentElement.style.fontSize)) === '125%');
await page.getByRole('main').getByRole('radio', { name: 'English' }).click();
await page.getByRole('heading', { name: 'Account settings' }).waitFor();
ok('language switched to English', true);
const saved = await page.evaluate(async () => (await (await fetch('/api/v1/me/settings')).json()).data);
ok('settings saved to the account', saved.locale === 'en' && saved.text_scale === 125 && saved.theme === 'dark', JSON.stringify(saved));
await page.getByRole('main').getByRole('radio', { name: 'ไทย' }).click();
await page.getByRole('heading', { name: 'ตั้งค่าบัญชี' }).waitFor();
await page.getByRole('main').getByRole('radio', { name: 'ปกติ' }).click();
await page.getByRole('main').getByRole('radio', { name: 'สว่าง' }).click();

// 4. data export
const exp = await page.evaluate(async () => {
  const r = await fetch('/api/v1/me/export');
  return { status: r.status, type: r.headers.get('content-disposition'), body: await r.json() };
});
ok('export downloads own data', exp.status === 200 && exp.body.account.email === email && exp.body.active_consents.service_terms && /attachment/.test(exp.type));

// 5. two-factor: enable via API (the QR is an image), sign out, sign in with a code
const enabled = await page.evaluate(async (password) => {
  const r = await fetch('/api/auth/two-factor/enable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  return r.json();
}, PASS1);
const secret = new URL(enabled.totpURI).searchParams.get('secret');
ok('2FA enable returns secret and backup codes', secret && enabled.backupCodes?.length >= 8);
const verified = await page.evaluate(async (code) => (await fetch('/api/auth/two-factor/verify-totp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).status, totp(secret));
ok('2FA confirmed with a valid code', verified === 200, String(verified));
await ctx.clearCookies();
await login(page, email, PASS1);
await page.waitForURL('**/two-factor**');
await page.locator('input[name=code]').fill('000000');
await page.getByRole('button', { name: 'ยืนยัน' }).click();
await page.getByRole('alert').filter({ hasText: 'รหัสไม่ถูกต้อง' }).waitFor();
await page.locator('input[name=code]').fill(totp(secret, Date.now() + 30_000)); // next window is accepted too; avoids reuse of the confirm code
await page.getByRole('button', { name: 'ยืนยัน' }).click();
await page.waitForURL('**/chat**');
ok('sign-in with 2FA code', true);
// turn 2FA off again through the UI so the later steps stay simple
await page.goto(`${BASE}/settings`);
await page.getByRole('button', { name: 'ปิดใช้งาน' }).click();
await page.locator('input[name=password]').fill(PASS1);
await page.getByRole('button', { name: 'ปิดใช้งาน' }).last().click();
await page.getByText('ปิดอยู่').waitFor();
ok('2FA turned off in the UI', true);

// 6. forgot / reset password
await ctx.clearCookies();
await page.goto(`${BASE}/forgot-password`);
await page.getByLabel('อีเมล').fill(email);
await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' }).click();
await page.getByRole('status').filter({ hasText: 'ส่งลิงก์' }).waitFor();
const resetMail = await mailTo(email, 'ตั้งรหัสผ่านใหม่');
ok('reset mail sent', !!resetMail);
await page.goto(linkIn(resetMail));
await page.waitForURL('**/reset-password**');
await page.locator('input[name=password]').fill(PASS2);
await page.locator('input[name=confirm]').fill(PASS2);
await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
await page.getByRole('status').filter({ hasText: 'ตั้งรหัสผ่านใหม่เรียบร้อย' }).waitFor();
ok('password changed notice mail', !!(await mailTo(email, 'รหัสผ่านของคุณถูกเปลี่ยนแล้ว')));
const reuse = await fetch(linkIn(resetMail), { redirect: 'manual' });
ok('reset link is single-use', (reuse.headers.get('location') ?? '').includes('error=INVALID_TOKEN'), reuse.headers.get('location') ?? '');
await login(page, email, PASS1);
await page.getByRole('alert').filter({ hasText: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }).waitFor();
ok('old password rejected', true);
await login(page, email, PASS2);
await page.waitForURL('**/chat**');
ok('new password works', true);

// 7. account deletion grace period: signed out at once, sign in again to cancel
await page.goto(`${BASE}/settings`);
await page.getByRole('button', { name: 'ขอลบบัญชี' }).click();
await page.locator('input[name=password]').fill('wrong-password-1');
await page.getByRole('button', { name: 'ขอลบบัญชี' }).last().click();
await page.getByRole('alert').filter({ hasText: 'รหัสผ่านไม่ถูกต้อง' }).waitFor();
await page.locator('input[name=password]').fill(PASS2);
await page.getByRole('button', { name: 'ขอลบบัญชี' }).last().click();
await page.waitForURL('**/login?reason=deletion');
ok('signed out right after requesting deletion', true);
ok('deletion mail sent', !!(await mailTo(email, 'ได้รับคำขอลบบัญชี')));
const apiAfter = await page.evaluate(async () => (await fetch('/api/v1/session')).status);
ok('old session is dead', apiAfter === 401, String(apiAfter));
await login(page, email, PASS2);
await page.waitForURL('**/chat**');
await page.getByText('จะถูกลบถาวรหลังวันที่').waitFor();
await page.getByRole('button', { name: 'ยกเลิกการลบบัญชี' }).click();
await page.getByText('จะถูกลบถาวรหลังวันที่').waitFor({ state: 'detached' });
ok('deletion can be cancelled after signing in again', true);

// 8. idle sign-out (fake clock)
await page.clock.install();
await page.goto(`${BASE}/chat`);
await page.clock.runFor('55:30');
await page.getByRole('alert').filter({ hasText: 'ระบบจะออกจากระบบใน' }).waitFor();
ok('idle warning shown five minutes before sign-out', true);
await page.getByRole('button', { name: 'ต่อเวลา' }).click();
await page.clock.runFor('10:00');
ok('extending the session keeps it alive', !page.url().includes('/login'));
await page.clock.runFor('55:00');
await page.waitForURL('**/login?reason=idle**');
await page.getByRole('status').filter({ hasText: 'ไม่มีการใช้งานนาน' }).waitFor();
ok('signed out after idle timeout', true);

// 9. lockout after 5 wrong passwords (first let the per-minute sign-in rate limit of earlier steps expire)
await sleep(61_000);
for (let i = 0; i < 5; i++) {
  await login(page, email, `wrong-password-${i}x`);
  await page.getByRole('alert').first().waitFor();
}
await login(page, email, PASS2);
await page.getByRole('alert').filter({ hasText: 'ถูกล็อก' }).waitFor();
ok('account locked even with the right password', true);
ok('lock notice mail sent', !!(await mailTo(email, 'บัญชีถูกล็อกชั่วคราว')));
await page.screenshot({ path: `${OUT}/03-locked.png` });

// 10. consent gate: an account created without going through the form must accept the terms first
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/login`); // establishes origin + csrf cookie
const created = await p2.evaluate(async ([e, pw]) => (await fetch('/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: pw, name: 'ยังไม่ยอมรับ' }) })).status, [email2, PASS1]);
ok('second account created via API', created === 200, String(created));
await ctx2.clearCookies();
const verify2 = await mailTo(email2, 'ยืนยันอีเมล');
await p2.goto(linkIn(verify2)); // verification signs the user in; the gate then asks for consent
await p2.waitForURL('**/consent**');
await p2.screenshot({ path: `${OUT}/04-consent.png` });
await p2.goto(`${BASE}/chat`);
await p2.waitForURL('**/consent**'); // the gate cannot be bypassed by navigating away
await p2.getByRole('checkbox').check();
await p2.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
await p2.waitForURL('**/chat**');
ok('consent gate blocks until terms are accepted', true);
await p2.goto(`${BASE}/legal/privacy`);
ok('privacy page is readable and marked draft', await p2.getByText('ฉบับร่างสำหรับระบบทดสอบ').isVisible());

// 11. guests must accept the terms too, and can change display preferences locally
const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
const p3 = await ctx3.newPage();
await p3.goto(`${BASE}/login`);
await p3.getByRole('button', { name: /ทดลองใช้โดยไม่สมัคร/ }).click();
await p3.waitForURL('**/consent**');
ok('guest is asked to accept the terms first', true);
await p3.getByRole('checkbox').check();
await p3.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
await p3.waitForURL('**/chat**');
await p3.goto(`${BASE}/settings`);
await p3.getByRole('main').getByRole('radio', { name: 'ใหญ่' }).first().click();
await p3.waitForFunction(() => document.documentElement.style.fontSize === '112%');
ok('guest text size works without an account', true);

console.log(JSON.stringify({ ok: true, checks: results.length, consoleErrors }));
await browser.close();
