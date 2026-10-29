// Chat experience E2E (M2) with the real AI service (extractive engine) on a throwaway database copy:
// history management, folders, feedback, bookmarks, regenerate + versions, scope, background streams and state dots, share links, deep links.
// PHASE=1 runs everything; PHASE=2 (after the shell moved a share link's expiry into the past) checks the expired page.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3204';
const OUT = process.env.OUT_DIR ?? 'test-results/chat';
const TS = process.env.TS;
const PHASE = process.env.PHASE ?? '1';
const PASS = 'correct-horse-9';
const email = (who) => `chat-e2e-${who}-${TS}@example.test`;
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Q1 = 'ส่งงานช้า ลูกค้าจะหักค่าปรับวันละ 2 หมื่น ต้องจ่ายเต็มไหม';

async function login(who) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
  const page = await context.newPage();
  // API failures are the first thing to look at when a step times out
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) console.log('HTTP', r.status(), r.request().method(), new URL(r.url()).pathname); });
  await page.goto(`${BASE}/login`);
  await page.getByLabel('อีเมล').fill(email(who));
  await page.locator('input[name=password]').fill(PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
  await page.waitForURL('**/chat**', { timeout: 20000 });
  return page;
}
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const csrf = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: b ? JSON.stringify(b) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}, [method, path, body]);
const ask = async (page, text) => {
  await page.getByLabel('เล่าเรื่องของคุณ…').fill(text);
  await page.getByLabel('ส่งข้อความ').click();
};
const answered = (page, n = 1) => page.getByRole('button', { name: 'คัดลอกคำตอบ' }).nth(n - 1).waitFor({ timeout: 90000 });
const sidebar = (page) => page.getByRole('navigation', { name: 'เมนูหลัก' });

if (PHASE === '1') {
  const alice = await login('alice');
  await alice.goto(`${BASE}/chat?new=1`);

  // ---- first answer: title, scope selector, citations
  ok('scope selector offers the legal categories', (await alice.getByRole('button', { name: /ขอบเขตกฎหมาย/ }).count()) === 1);
  await ask(alice, Q1);
  await alice.waitForURL(/\/chat\/[0-9a-f-]{36}/);
  await answered(alice);
  const chatA = alice.url().split('/chat/')[1].split(/[?#]/)[0];
  ok('the answer has sources', (await alice.getByText('แหล่งอ้างอิง').count()) > 0);
  // glossary terms in an answer show their definition on hover (FR-CHAT-015)
  const term = alice.locator('[role=log] button.cursor-help').first();
  await term.waitFor({ timeout: 10000 });
  // the answer's layout can still shift for a moment (title, follow-up questions), so retry the hover
  for (let i = 0; i < 6 && (await alice.getByRole('tooltip').count()) === 0; i++) {
    await alice.waitForTimeout(500);
    await term.hover();
  }
  ok('a glossary term in the answer shows its definition', (await alice.getByRole('tooltip').innerText()).length > 20);
  await alice.mouse.move(0, 0);
  await sidebar(alice).getByRole('link', { name: /ค่าปรับ|ส่งงานช้า|หักค่าปรับ/ }).first().waitFor({ timeout: 20000 });
  ok('the sidebar title replaces "new chat" after the first answer (FR-CHAT-020)', true);
  await alice.screenshot({ path: `${OUT}/01-answer.png` });

  // ---- feedback (FR-CHAT-016)
  await alice.getByRole('button', { name: 'คำตอบนี้มีประโยชน์' }).click();
  await alice.getByRole('button', { name: 'คำตอบนี้มีประโยชน์', pressed: true }).waitFor();
  ok('👍 is saved and toggles', true);
  await alice.getByRole('button', { name: 'คำตอบนี้ยังไม่ดี' }).click();
  await alice.getByRole('dialog', { name: 'คำตอบนี้ยังไม่ดีอย่างไร' }).waitFor();
  await alice.getByLabel('ไม่ครบ').check();
  await alice.getByLabel('ล้าสมัย').check();
  await alice.getByLabel('ความเห็นเพิ่มเติม (ไม่บังคับ)').fill('ไม่มีตัวอย่างการคำนวณ');
  await alice.getByLabel(/อนุญาตให้ทีมกฎหมายดู/).check();
  await alice.getByRole('button', { name: 'ส่ง', exact: true }).click();
  await alice.getByRole('button', { name: 'คำตอบนี้ยังไม่ดี', pressed: true }).waitFor();
  ok('👎 with reasons, comment and permission is saved (replaces the 👍)', true);

  // ---- bookmark (FR-CHAT-017/034)
  await alice.getByRole('button', { name: 'บันทึกคำตอบ' }).click();
  await alice.getByRole('button', { name: /บันทึกแล้ว/ }).waitFor();
  await alice.goto(`${BASE}/saved`);
  await alice.getByRole('main').getByRole('link', { name: /ส่งงานช้า|ค่าปรับ|หักค่าปรับ/ }).first().waitFor();
  await alice.screenshot({ path: `${OUT}/02-saved.png` });
  await alice.getByRole('main').getByRole('link', { name: /ส่งงานช้า|ค่าปรับ|หักค่าปรับ/ }).first().click();
  await alice.waitForURL(/\/chat\/[0-9a-f-]{36}#msg-\d+/);
  await answered(alice);
  ok('a saved answer opens its chat at that answer', true);
  await alice.getByRole('button', { name: /บันทึกแล้ว/ }).click(); // un-save
  await alice.goto(`${BASE}/saved`);
  await alice.getByText('ยังไม่มีรายการที่บันทึก').waitFor();
  ok('un-saving removes it from the list', true);

  // ---- regenerate + versions (FR-CHAT-006)
  await alice.goto(`${BASE}/chat/${chatA}`);
  await answered(alice);
  const before = await alice.locator('[role=log]').innerText();
  await alice.getByRole('button', { name: 'สร้างคำตอบใหม่' }).click();
  await alice.getByText('2/2').waitFor({ timeout: 60000 });
  ok('regenerate keeps the old answer as a version (1/2, 2/2)', true);
  await alice.getByRole('button', { name: 'เวอร์ชันก่อนหน้า' }).click();
  await alice.getByText('1/2').waitFor();
  ok('the previous version can be shown again', (await alice.locator('[role=log]').innerText()).includes('ค่าปรับ'));
  const versionsApi = (await api(alice, 'GET', `/api/v1/chats/${chatA}`)).json.data.messages.filter((m) => m.role === 'assistant');
  ok('the server stores both answers, one active', versionsApi.length === 1 && versionsApi[0].versions?.length === 2);
  void before;

  // ---- history menu: rename, pin, folder, delete (FR-CHAT-020..024)
  await ask(alice, 'ลูกค้าไม่จ่ายเงินตามสัญญา ฟ้องได้ไหม');
  await answered(alice, 2);
  const side = sidebar(alice);
  await side.getByRole('button', { name: /เมนูของแชท/ }).first().click({ force: true });
  await alice.getByRole('menuitem', { name: 'เปลี่ยนชื่อ' }).click();
  await alice.getByLabel('เปลี่ยนชื่อ').fill('เรื่องค่าปรับส่งงานช้า');
  await alice.keyboard.press('Enter');
  await side.getByRole('link', { name: /เรื่องค่าปรับส่งงานช้า/ }).waitFor();
  ok('inline rename', true);
  await side.getByRole('button', { name: /เมนูของแชท เรื่องค่าปรับส่งงานช้า/ }).click({ force: true });
  await alice.getByRole('menuitem', { name: 'ปักหมุด' }).click();
  await side.getByText('ปักหมุด', { exact: true }).waitFor();
  ok('pinning moves the chat to the pinned group', true);
  // rename must stick: the AI must not overwrite a user-chosen title (BR-013)
  await alice.reload();
  await side.getByRole('link', { name: /เรื่องค่าปรับส่งงานช้า/ }).waitFor();
  ok('a renamed chat keeps its name', true);

  await side.getByRole('button', { name: 'โฟลเดอร์ใหม่' }).click();
  await alice.getByLabel('ชื่อโฟลเดอร์').fill('สัญญาลูกค้า');
  await alice.keyboard.press('Enter');
  await side.getByRole('button', { name: /^สัญญาลูกค้า/ }).waitFor();
  ok('folder created', true);
  await alice.goto(`${BASE}/chat?new=1`);
  await ask(alice, 'ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน เลิกสัญญาได้ไหม');
  await alice.waitForURL(/\/chat\/[0-9a-f-]{36}/);
  await answered(alice);
  const chatB = alice.url().split('/chat/')[1].split(/[?#]/)[0];
  await side.locator('li:has(a[aria-current=page])').getByRole('button', { name: /^เมนูของแชท/ }).click({ force: true });
  await alice.getByRole('menuitem', { name: 'สัญญาลูกค้า' }).click();
  await side.getByRole('button', { name: /^สัญญาลูกค้า/ }).getByText('1').waitFor();
  ok('moving a chat into a folder shows the count', true);
  await side.getByRole('button', { name: /^สัญญาลูกค้า/ }).click(); // collapse
  await alice.reload();
  ok('collapsed state survives a reload', (await side.getByRole('button', { name: /^สัญญาลูกค้า/ }).getAttribute('aria-expanded')) === 'false');
  await side.getByRole('button', { name: /^สัญญาลูกค้า/ }).click(); // expand again

  // filter (FR-CHAT-019)
  await side.getByRole('searchbox').fill('ซัพพลายเออร์');
  await sidebar(alice).getByRole('link').first().waitFor();
  await side.getByRole('searchbox').fill('ไม่มีคำนี้แน่นอน');
  await side.getByText('ไม่พบแชทที่ตรงกัน').waitFor();
  ok('filter shows "no match"', true);
  await side.getByRole('searchbox').fill('');

  // ---- legal scope (FR-CHAT-011)
  await alice.goto(`${BASE}/chat?new=1`);
  await alice.getByRole('button', { name: /ขอบเขตกฎหมาย/ }).click();
  await alice.getByLabel(/^กระบวนการยุติธรรม/).check();
  await ask(alice, Q1);
  await alice.waitForURL(/\/chat\/[0-9a-f-]{36}/);
  await answered(alice);
  const chatLabor = alice.url().split('/chat/')[1].split(/[?#]/)[0];
  const laborAnswer = (await api(alice, 'GET', `/api/v1/chats/${chatLabor}`)).json.data;
  ok('scope is stored with the chat', JSON.stringify(laborAnswer.chat.scope) === '["PROCEDURE"]', JSON.stringify(laborAnswer.chat.scope));
  await alice.goto(`${BASE}/chat/${chatLabor}`);
  await alice.getByRole('button', { name: /ขอบเขตกฎหมาย: 1 หมวด/ }).waitFor();
  ok("the chat's scope is shown when it is reopened (AC3)", true);
  await alice.getByRole('button', { name: /ขอบเขตกฎหมาย/ }).click();
  await alice.getByLabel('อัตโนมัติ').check();
  await sleep(500);
  await ask(alice, Q1);
  await answered(alice, 2);
  const after = (await api(alice, 'GET', `/api/v1/chats/${chatLabor}`)).json.data;
  ok('back to automatic → sources again', after.messages.filter((m) => m.role === 'assistant').at(-1).citations.length > 0);

  // ---- background streams and state dots (FR-CHAT-025)
  const pageBg = await login('alice');
  let held = 0;
  await pageBg.route('**/api/v1/chat/stream', async (route) => { held += 1; await sleep(5000); await route.continue(); });
  await pageBg.goto(`${BASE}/chat?new=1`);
  await ask(pageBg, 'ค่าปรับสัญญาลดได้ไหม');
  await pageBg.waitForFunction(() => document.querySelector('[aria-label="กำลังตอบ"]') === null); // chat id arrives only after the delay
  await pageBg.getByRole('link', { name: 'แชทใหม่' }).click(); // leave while the answer is being written
  await pageBg.waitForURL('**/chat?new=1');
  ok('the first stream keeps running after leaving the chat', held === 1);
  await pageBg.getByRole('img', { name: 'กำลังตอบ' }).waitFor({ timeout: 15000 }).catch(() => undefined);
  await pageBg.getByRole('img', { name: 'มีคำตอบใหม่' }).waitFor({ timeout: 60000 });
  ok('the sidebar shows "new answer" for the chat that finished in the background', true);
  await pageBg.getByRole('link').filter({ has: pageBg.getByRole('img', { name: 'มีคำตอบใหม่' }) }).click();
  await answered(pageBg);
  ok('opening it shows the finished answer and clears the dot', (await pageBg.getByRole('img', { name: 'มีคำตอบใหม่' }).count()) === 0);
  await pageBg.close();

  // ---- share links (FR-CHAT-026/027)
  await alice.goto(`${BASE}/chat?new=1`);
  await ask(alice, 'ลูกค้าโทร 081-234-5678 ขอให้ลดค่าปรับ ทำได้ไหม');
  await alice.waitForURL(/\/chat\/[0-9a-f-]{36}/);
  await answered(alice);
  const chatShare = alice.url().split('/chat/')[1].split(/[?#]/)[0];
  await alice.getByRole('button', { name: 'แชร์ลิงก์' }).click();
  await alice.getByRole('dialog', { name: /แชร์แชทนี้/ }).waitFor();
  await alice.getByText(/พบข้อมูลที่อาจเป็นข้อมูลส่วนตัว/).waitFor();
  ok('a phone number in the chat triggers the PII warning before a link is made', true);
  await alice.getByLabel('ตั้งรหัสผ่านให้ลิงก์').check();
  await alice.getByLabel('รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)').fill('sharepw1');
  await alice.getByRole('button', { name: 'สร้างลิงก์' }).click();
  const shareUrl = await alice.getByLabel('ลิงก์แชร์').inputValue();
  ok('link is /share/<256-bit token>', /\/share\/[A-Za-z0-9_-]{43}$/.test(shareUrl));
  const shareLocal = `${BASE}${new URL(shareUrl).pathname}`;
  await alice.screenshot({ path: `${OUT}/03-share-dialog.png` });

  const anon = await browser.newContext({ locale: 'th-TH' });
  const viewer = await anon.newPage();
  await viewer.goto(shareLocal);
  await viewer.getByRole('heading', { name: 'ลิงก์นี้ตั้งรหัสผ่านไว้' }).waitFor();
  ok('a password-protected link asks for the password first', (await viewer.getByText('ทำสัญญา').count()) === 0);
  ok('the share page is noindex', (await viewer.locator('meta[name=robots]').getAttribute('content'))?.includes('noindex'));
  await viewer.locator('input[name=password]').fill('wrong-pass');
  await viewer.getByRole('button', { name: 'เปิดดู' }).click();
  await viewer.getByRole('alert').filter({ hasText: 'ไม่ถูกต้อง' }).waitFor();
  await viewer.locator('input[name=password]').fill('sharepw1');
  await viewer.getByRole('button', { name: 'เปิดดู' }).click();
  await viewer.getByRole('link', { name: 'ถามต่อในนิติมิตร' }).waitFor();
  const html = await viewer.content();
  ok('the shared page shows the conversation, never the owner', html.includes('081-234-5678') && !html.includes(email('alice')) && !html.includes('alice'));
  await viewer.screenshot({ path: `${OUT}/04-shared-page.png` });
  const anon2 = await browser.newContext({ locale: 'th-TH' });
  const attacker = await anon2.newPage();
  await attacker.goto(shareLocal);
  for (let i = 0; i < 5; i++) {
    await attacker.locator('input[name=password]').fill(`nope-${i}-xx`);
    await attacker.getByRole('button', { name: 'เปิดดู' }).click();
    await attacker.getByRole('alert').first().waitFor();
    await sleep(200);
  }
  await attacker.reload();
  await attacker.getByRole('heading', { name: 'ลิงก์ถูกล็อกชั่วคราว' }).waitFor();
  ok('5 wrong passwords lock the link for 15 minutes', true);
  await anon2.close();

  // expiry for phase 2 (the shell moves the expiry into the past), then revoke another link by hand
  writeFileSync(`${OUT}/state.json`, JSON.stringify({ shareLocal, chatShare }));
  await alice.getByRole('button', { name: 'ยกเลิกลิงก์' }).click();
  await sleep(500);
  const p3 = await anon.newPage();
  await p3.goto(shareLocal);
  await p3.getByRole('heading', { name: 'ลิงก์นี้ไม่สามารถใช้งานได้' }).waitFor();
  ok('a revoked link says it is not available', true);
  // a fresh link for phase 2 (expiry)
  // (on chat A, which stays alive: deleting chatShare below revokes its links, and the expiry page must be the one shown)
  const created = await api(alice, 'POST', `/api/v1/chats/${chatA}/shares`, { days: 7 });
  writeFileSync(`${OUT}/state.json`, JSON.stringify({ shareLocal: `${BASE}${new URL(created.json.data.url).pathname}`, chatShare }));

  // deleting a chat revokes its links (FR-CHAT-022)
  const doomed = (await api(alice, 'POST', `/api/v1/chats/${chatShare}/shares`, { days: 7 })).json.data.url;
  await alice.goto(`${BASE}/chat/${chatShare}`);
  const p4 = await anon.newPage();
  ok('link works before deletion', (await p4.goto(`${BASE}${new URL(doomed).pathname}`))?.status() === 200);
  await api(alice, 'DELETE', `/api/v1/chats/${chatShare}`);
  await p4.reload();
  await p4.getByRole('heading', { name: 'ลิงก์นี้ไม่สามารถใช้งานได้' }).waitFor();
  ok('deleting the chat kills its public links', true);

  // ---- deep links (FR-CHAT-030)
  await alice.goto(`${BASE}/chat?q=${encodeURIComponent('ทดสอบคำถามจากลิงก์')}`);
  ok('?q= fills the box but does not send', (await alice.getByLabel('เล่าเรื่องของคุณ…').inputValue()) === 'ทดสอบคำถามจากลิงก์' && (await alice.locator('[role=log] .rounded-br-sm').count()) === 0);
  await alice.evaluate(() => sessionStorage.clear());
  const bob = await login('bob');
  await bob.goto(`${BASE}/chat/${chatB}`);
  await bob.getByText('ไม่พบแชทที่ขอ').waitFor();
  ok("someone else's chat id → 'not found' and a fresh chat", (await bob.locator('[role=log] .rounded-br-sm').count()) === 0);
  await alice.goto(`${BASE}/chat/${chatA}`);
  await answered(alice).catch(async (e) => { await alice.screenshot({ path: `${OUT}/99-reopen-failed.png` }); throw e; });
  await alice.goto(`${BASE}/chat`);
  await alice.waitForURL(`**/chat/${chatA}`);
  ok('/chat reopens the last chat', true);
  await alice.goto(`${BASE}/chat?new=1`);
  ok('/chat?new=1 is an empty chat', (await alice.getByText('มีเรื่องกฎหมายอะไรให้ช่วยวันนี้?').count()) === 1);

  // ---- folder deletion with chats, chat deletion dialog (FR-CHAT-022/023)
  await alice.goto(`${BASE}/chat?new=1`);
  await side.getByRole('button', { name: /เมนูของโฟลเดอร์ สัญญาลูกค้า/ }).click({ force: true });
  await alice.getByRole('menuitem', { name: 'ลบโฟลเดอร์' }).click();
  await alice.getByRole('alertdialog').getByRole('button', { name: 'ลบเฉพาะโฟลเดอร์' }).click();
  await side.getByRole('button', { name: /^สัญญาลูกค้า/ }).waitFor({ state: 'detached' });
  ok('deleting only the folder keeps its chats in the main list (AC2)', (await api(alice, 'GET', `/api/v1/chats/${chatB}`)).status === 200 && (await sidebar(alice).getByRole('link', { name: /ซัพพลายเออร์/ }).count()) >= 1);
  await alice.goto(`${BASE}/chat/${chatB}`);
  await answered(alice);
  await sidebar(alice).locator('li:has(a[aria-current=page])').getByRole('button', { name: /^เมนูของแชท/ }).click({ force: true });
  await alice.getByRole('menuitem', { name: 'ลบแชท' }).click();
  await alice.getByRole('alertdialog').getByRole('button', { name: 'ลบแชท' }).click();
  await alice.waitForURL('**/chat?new=1');
  ok('deleting the open chat returns to a new chat (AC1)', (await api(alice, 'GET', `/api/v1/chats/${chatB}`)).status === 404);

  // ---- guests (FR-CHAT-017 AC2, 023 members only)
  const gctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
  const guest = await gctx.newPage();
  await guest.goto(`${BASE}/login`);
  await guest.getByRole('button', { name: /ทดลองใช้โดยไม่สมัคร/ }).click();
  await guest.waitForURL('**/consent**');
  await guest.getByRole('checkbox').check();
  await guest.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
  await guest.waitForURL('**/chat**');
  ok('guests have no folder button', (await guest.getByRole('button', { name: 'โฟลเดอร์ใหม่' }).count()) === 0);
  await ask(guest, Q1);
  await answered(guest);
  await guest.getByRole('button', { name: 'บันทึกคำตอบ' }).click();
  await guest.getByText('สมัครสมาชิกเพื่อบันทึกคำตอบไว้ดูภายหลัง').waitFor();
  ok('a guest pressing save is invited to sign up', true);
  ok('guests cannot create share links', (await guest.getByRole('button', { name: 'แชร์ลิงก์' }).count()) === 0);
  await guest.screenshot({ path: `${OUT}/05-guest.png` });
}

if (PHASE === '2') {
  const { shareLocal } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const anon = await browser.newContext({ locale: 'th-TH' });
  const p = await anon.newPage();
  await p.goto(shareLocal);
  await p.getByRole('heading', { name: 'ลิงก์นี้หมดอายุแล้ว' }).waitFor();
  ok('an expired link shows the expiry page', true);
}

console.log(JSON.stringify({ ok: true, phase: PHASE, checks: results.length }));
await browser.close();
