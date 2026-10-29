// Visual smoke check: signs up a fresh user, sends one message, captures key screens (light + dark).
// Run inside the Playwright container:  docker run --rm --network host -v $PWD:/w -w /w mcr.microsoft.com/playwright:vX-noble node tests/screens.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const OUT = process.env.OUT_DIR ?? 'test-results/screens';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
// which request produced a console error (the browser message itself has no URL)
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));

await page.goto(`${BASE}/login`);
// tab icons never show in screenshots, so check them explicitly (logged out, like a first visit)
for (const rel of ['icon', 'apple-touch-icon', 'manifest']) {
  const href = await page.locator(`link[rel="${rel}"]`).first().getAttribute('href');
  const res = href && (await page.request.get(new URL(href, BASE).toString()));
  if (!res || !res.ok()) throw new Error(`missing or broken <link rel="${rel}">: ${href}`);
}
await page.screenshot({ path: `${OUT}/01-login.png`, caret: 'initial' });

await page.goto(`${BASE}/register`);
const email = `smoke${Date.now()}@example.com`;
await page.getByLabel('ชื่อที่แสดง').fill('วิทย์ ศรีสุข');
await page.getByLabel('อีเมล').fill(email);
await page.locator('input[name=password]').fill('correct-horse-9');
await page.getByRole('checkbox', { name: /ยอมรับ/ }).check();
await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
try {
  await page.waitForURL('**/chat', { timeout: 15000 });
} catch (e) {
  await page.screenshot({ path: `${OUT}/debug-register.png` });
  console.log(JSON.stringify({ url: page.url(), errors }));
  throw e;
}
await page.screenshot({ path: `${OUT}/02-chat-empty.png` });

await page.getByRole('button', { name: /สลับพื้นที่ทำงาน/ }).click();
await page.getByRole('link', { name: 'สร้างพื้นที่ทำงานองค์กร' }).click();
await page.waitForURL('**/org/new');
await page.getByLabel('ชื่อองค์กร').fill('วิทย์ อินทีเรีย จำกัด');
await page.getByLabel(/รหัสองค์กร/).fill(`witt-${Date.now()}`);
await page.getByRole('button', { name: 'สร้าง' }).click();
await page.waitForURL('**/chat');

await page.getByRole('button', { name: /ส่งงานช้า ลูกค้าจะหักค่าปรับ/ }).click();
await page.waitForURL(/\/chat\/[0-9a-f-]{36}/);
await page.getByRole('button', { name: 'คัดลอกคำตอบ' }).waitFor({ timeout: 60000 });
const chatUrl = page.url();
const toTop = (p) => p.evaluate(() => document.querySelector('[role=log]')?.scrollTo(0, 0));
await toTop(page);
await page.screenshot({ path: `${OUT}/03-chat-answer.png` });
await page.evaluate(() => document.querySelector('[role=log]')?.scrollTo(0, 1e6));
await page.screenshot({ path: `${OUT}/04-answer-bottom.png` });

// citation chip → source panel → full statute page
await page.getByRole('button', { name: 'แหล่งอ้างอิงที่ 3' }).first().click();
await page.getByRole('dialog', { name: 'แหล่งอ้างอิงของคำตอบ' }).waitFor();
await page.screenshot({ path: `${OUT}/05-source-panel.png` });
await page.locator('[data-n="3"]').getByRole('link', { name: 'เปิดดูฉบับเต็ม' }).click();
await page.waitForURL(/\/law\/ccc\/381/);
await page.screenshot({ path: `${OUT}/06-law-section.png` });
await page.goto(`${BASE}/guides/respond-to-penalty-deduction`);
await page.screenshot({ path: `${OUT}/07-guide.png` });

await page.goto(`${BASE}/library`);
await page.screenshot({ path: `${OUT}/07b-library.png` });

// reload the chat: citations come back from the database; theme is switched with the header control
await page.goto(chatUrl);
await page.getByRole('button', { name: 'คัดลอกคำตอบ' }).waitFor({ timeout: 30000 });
await page.getByRole('radio', { name: 'มืด' }).click();
await toTop(page);
await page.screenshot({ path: `${OUT}/08-chat-dark.png` });

// switch the interface to English
await page.getByRole('radio', { name: 'EN' }).click();
await page.getByRole('button', { name: 'Copy answer' }).waitFor({ timeout: 30000 });
await page.goto(`${BASE}/law/ccc/381`);
await page.screenshot({ path: `${OUT}/08b-law-en-dark.png` });
await page.getByRole('radio', { name: 'ไทย' }).click();
await page.getByRole('radio', { name: 'Light' }).waitFor();
await page.getByRole('radio', { name: 'สว่าง' }).click();
await page.goto(chatUrl);

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
const mp = await mobile.newPage();
await mp.goto(page.url());
await mp.getByRole('button', { name: 'คัดลอกคำตอบ' }).waitFor({ timeout: 30000 });
await toTop(mp);
await mp.screenshot({ path: `${OUT}/09-mobile.png` });
await mp.getByRole('button', { name: 'แหล่งอ้างอิงที่ 2' }).first().click();
await mp.getByRole('dialog').waitFor();
await mp.screenshot({ path: `${OUT}/10-mobile-sources.png` });

console.log(JSON.stringify({ ok: true, console_errors: errors }, null, 1));
await browser.close();
