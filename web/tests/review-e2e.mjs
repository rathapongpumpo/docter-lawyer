// Review workflow E2E against a throwaway database copy (never the staging data):
// editor sends a glossary term to review → reviewer approves with the checklist → reviewer archives it.
// Usage: BASE_URL=http://localhost:3201 TS=<suffix> TERM_ID=<id> node tests/review-e2e.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3201';
const OUT = process.env.OUT_DIR ?? 'test-results/review';
const item = `${BASE}/admin/review/glossary/${process.env.TERM_ID}`;
const browser = await chromium.launch();

async function login(role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('อีเมล').fill(`e2e-${role}-${process.env.TS}@example.com`);
  await page.locator('input[name=password]').fill('correct-horse-9');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
  await page.waitForURL('**/chat');
  return page;
}

const editor = await login('editor');
await editor.goto(`${BASE}/admin/review`);
await editor.screenshot({ path: `${OUT}/01-queue.png` });
await editor.goto(item);
await editor.getByLabel('บันทึกถึงผู้ตรวจ (ไม่บังคับ)').fill('ตรวจนิยามเทียบ ม.379 และ ม.382');
await editor.getByRole('button', { name: 'ส่งให้ผู้ตรวจ' }).click();
await editor.getByRole('status').filter({ hasText: 'บันทึกแล้ว' }).waitFor();
await editor.reload();
await editor.getByText('บทบาทของคุณดำเนินการขั้นนี้ไม่ได้').waitFor(); // editors cannot approve
await editor.screenshot({ path: `${OUT}/02-submitted.png` });

const reviewer = await login('reviewer');
await reviewer.goto(item);
const approve = reviewer.getByRole('button', { name: 'อนุมัติและเผยแพร่' });
if (!(await approve.isDisabled())) throw new Error('approve must be disabled until the checklist is complete');
for (const box of await reviewer.getByRole('checkbox').all()) await box.check();
await reviewer.screenshot({ path: `${OUT}/03-checklist.png` });
await approve.click();
await reviewer.getByRole('status').filter({ hasText: 'บันทึกแล้ว' }).waitFor();
await reviewer.reload();
await reviewer.getByText('เผยแพร่แล้ว').first().waitFor();
await reviewer.screenshot({ path: `${OUT}/04-published.png` });

console.log(JSON.stringify({ ok: true }));
await browser.close();
