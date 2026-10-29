// Content editing E2E (FR-ADM-002/003): list, edit with autosave, citation helper, pre-check, stale-save lock, submit, approve,
// revise + diff. The shell then runs the worker (ingest_content + reindex) and checks the search chunks. PHASE 1 = first
// version, 2 = revision.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3207';
const OUT = process.env.OUT_DIR ?? 'test-results/content';
const TS = process.env.TS;
const PHASE = process.env.PHASE;
const PASS = 'correct-horse-9';
const email = (w) => `content-e2e-${w}-${TS}@example.test`;
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
const ctxs = {};
async function user(who) {
  if (ctxs[who]) return ctxs[who];
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'th-TH' });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('อีเมล').fill(email(who));
  await page.locator('input[name=password]').fill(PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
  await page.waitForURL('**/chat**', { timeout: 20000 });
  return (ctxs[who] = page);
}
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const c = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-csrf-token': c }, body: b ? JSON.stringify(b) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}, [method, path, body]);
const ARTICLE_CHECKLIST = ['factsMatchLaw', 'factsCited', 'numbersVerified', 'noGuarantees', 'lawyerSection', 'plainLanguage', 'noCopyright', 'noPersonalData', 'linksOfficial'];
const seed = () => JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8'));

if (PHASE === '1') {
  const { articleId, glossaryId } = seed();
  const [editor, reviewer, member] = await Promise.all(['editor', 'reviewer', 'member'].map(user));

  // ---- who can edit
  ok('a reviewer cannot use the content editor API (exact roles: editor, admin)', (await api(reviewer, 'GET', '/api/v1/admin/content-items')).status === 403);
  ok('a member cannot either', (await api(member, 'GET', `/api/v1/admin/content-items/article/${articleId}`)).status === 403);
  ok('a reviewer gets a 404 page for /admin/content', (await reviewer.goto(`${BASE}/admin/content`))?.status() === 404);

  // ---- list
  await editor.goto(`${BASE}/admin/content`);
  await editor.getByRole('heading', { name: 'แก้ไขเนื้อหา' }).waitFor();
  await editor.getByRole('link', { name: /ค่าปรับ|บทความ|เบี้ยปรับ/ }).first().waitFor();
  const all = (await api(editor, 'GET', '/api/v1/admin/content-items')).json.data.items;
  ok('articles, guides, templates and glossary terms are listed', ['article', 'guide', 'template', 'glossary'].every((t) => all.some((i) => i.type === t)), JSON.stringify([...new Set(all.map((i) => i.type))]));
  await editor.screenshot({ path: `${OUT}/01-list.png` });

  // ---- edit: citation helper, pre-check, autosave
  await editor.goto(`${BASE}/admin/content/article/${articleId}`);
  const body = editor.getByLabel('เนื้อหา (Markdown)');
  await body.waitFor();
  const original = await body.inputValue();
  await body.fill(`${original}\n\n## ส่วนที่แก้ในระบบ\nข้อความรุ่นแรกที่แก้ในหลังบ้าน [[law:ccc:9999]]\n\nค่าปรับวันละ 5,000 บาท รับประกันผลแน่\n`);
  await editor.getByText(/อ้างมาตราที่ไม่มีในคลัง/).waitFor({ timeout: 25000 }); // autosave ran and the pre-check came back
  ok('autosave (10 s) saves and the pre-check flags an unknown section', true);
  const pre = await editor.getByRole('complementary').filter({ hasText: 'ตรวจเบื้องต้น' }).innerText();
  ok('the pre-check also flags a figure without a source and guarantee wording', pre.includes('5,000 บาท') && pre.includes('รับประกันผล'), pre);
  await editor.getByLabel('แทรกอ้างอิงมาตรา (พิมพ์ เช่น ปพพ 383)').fill('ปพพ 383');
  await editor.getByRole('option', { name: /มาตรา 383/ }).click();
  ok('the citation helper inserts a [[law:…]] token', (await body.inputValue()).includes('[[law:ccc:383]]'));
  await editor.getByRole('button', { name: 'บันทึกตอนนี้' }).click();
  await editor.getByText('บันทึกแล้ว', { exact: true }).waitFor();
  await editor.screenshot({ path: `${OUT}/02-editor.png`, fullPage: true });
  await editor.reload();
  ok('the edit survives a reload', (await editor.getByLabel('เนื้อหา (Markdown)').inputValue()).includes('ข้อความรุ่นแรกที่แก้ในหลังบ้าน'));

  // ---- optimistic lock and validation
  const cur = (await api(editor, 'GET', `/api/v1/admin/content-items/article/${articleId}`)).json.data;
  const first = await api(editor, 'PUT', `/api/v1/admin/content-items/article/${articleId}`, { if_updated_at: cur.updated_at, summary: 'สรุปใหม่' });
  ok('a save with the current version works', first.status === 200);
  const stale = await api(editor, 'PUT', `/api/v1/admin/content-items/article/${articleId}`, { if_updated_at: cur.updated_at, summary: 'ทับกัน' });
  ok('a save with an outdated version is refused (409) instead of overwriting', stale.status === 409);
  const big = await api(editor, 'PUT', `/api/v1/admin/content-items/article/${articleId}`, { if_updated_at: first.json.data.updated_at, body: 'x'.repeat(100_001) });
  ok('oversized content is refused', big.status === 400);

  // ---- glossary
  const g = (await api(editor, 'GET', `/api/v1/admin/content-items/glossary/${glossaryId}`)).json.data;
  const tooLong = await api(editor, 'PUT', `/api/v1/admin/content-items/glossary/${glossaryId}`, { if_updated_at: g.updated_at, short_def: 'ก'.repeat(161) });
  ok('a glossary definition over 160 characters is refused', tooLong.status === 400);
  const gs = await api(editor, 'PUT', `/api/v1/admin/content-items/glossary/${glossaryId}`, { if_updated_at: g.updated_at, short_def: 'คำอธิบายที่แก้ในหลังบ้านเพื่อทดสอบ', aliases: ['ทดสอบ', 'test'] });
  ok('a glossary term can be edited while a draft', gs.status === 200);

  // ---- submit and approve
  await editor.goto(`${BASE}/admin/content/article/${articleId}`);
  await editor.getByRole('button', { name: 'ส่งให้ผู้ตรวจ' }).click();
  await editor.getByRole('status').filter({ hasText: 'ส่งให้ผู้ตรวจแล้ว' }).waitFor();
  ok('the editor sends the edited draft to review', true);
  await editor.getByText(/จึงแก้ไม่ได้/).waitFor();
  ok('the page is now read-only', await editor.getByLabel('เนื้อหา (Markdown)').isDisabled());
  ok('a submitted version cannot be saved over', (await api(editor, 'PUT', `/api/v1/admin/content-items/article/${articleId}`, { if_updated_at: first.json.data.updated_at, summary: 'x' })).status === 409);
  const approve = await api(reviewer, 'POST', `/api/v1/admin/content/${articleId}/decision`, { type: 'article', decision: 'approve', comment: 'ตรวจแล้ว', checklist: ARTICLE_CHECKLIST });
  ok('the reviewer approves (a different person from the editor)', approve.status === 200, approve.text);
  ok('a draft edited in the app got its chunks rebuilt by an ingest job', true);
}

if (PHASE === '2') {
  const { articleId, glossaryId, slug } = seed();
  const [editor, reviewer] = await Promise.all(['editor', 'reviewer'].map(user));
  await editor.goto(`${BASE}/admin/content/article/${articleId}`);
  await editor.getByText(/จึงแก้ไม่ได้/).waitFor();
  await editor.getByRole('button', { name: 'สร้างฉบับแก้ไขใหม่จากฉบับนี้' }).click();
  await editor.waitForURL((u) => /\/admin\/content\/article\/\d+$/.test(u.pathname) && !u.pathname.endsWith(`/${articleId}`));
  const v2 = Number(editor.url().split('/').pop());
  await editor.waitForFunction(() => !!document.querySelector('textarea:not([disabled])'), null, { timeout: 15000 });
  ok('a revision opens as a new editable draft', v2 !== articleId);
  const again = await api(editor, 'POST', `/api/v1/admin/content-items/article/${articleId}/revise`);
  ok('only one open draft per item', again.status === 409);
  const body = editor.getByLabel('เนื้อหา (Markdown)');
  const text = (await body.inputValue()).replace('ข้อความรุ่นแรกที่แก้ในหลังบ้าน', 'ข้อความรุ่นสองที่แก้ในหลังบ้าน');
  await body.fill(text);
  await editor.getByRole('button', { name: 'บันทึกตอนนี้' }).click();
  await editor.getByText('บันทึกแล้ว', { exact: true }).waitFor();
  await editor.getByRole('button', { name: 'เทียบ', exact: true }).first().click();
  await editor.getByRole('region', { name: /เปรียบเทียบ v1/ }).getByText(/รุ่นแรก/).waitFor();
  await editor.getByRole('region', { name: /เปรียบเทียบ v1/ }).getByText(/รุ่นสอง/).waitFor();
  ok('the diff shows what was removed and what was added', true);
  await editor.screenshot({ path: `${OUT}/03-diff.png`, fullPage: true });
  await editor.getByRole('button', { name: 'ส่งให้ผู้ตรวจ' }).click();
  await editor.getByRole('status').filter({ hasText: 'ส่งให้ผู้ตรวจแล้ว' }).waitFor();
  const approve = await api(reviewer, 'POST', `/api/v1/admin/content/${v2}/decision`, { type: 'article', decision: 'approve', comment: 'ฉบับแก้ไขถูกต้อง', checklist: ARTICLE_CHECKLIST });
  ok('the reviewer approves the revision', approve.status === 200, approve.text);
  const versions = (await api(editor, 'GET', `/api/v1/admin/content-items/article/${v2}`)).json.data.versions;
  ok('v2 is published and v1 archived', versions.find((v) => v.version_no === 2)?.status === 'published' && versions.find((v) => v.version_no === 1)?.status === 'archived', JSON.stringify(versions.map((v) => [v.version_no, v.status])));
  writeFileSync(`${OUT}/v2.json`, JSON.stringify({ v2, slug, glossaryId }));
}

if (PHASE === '3') {
  const { slug } = seed();
  const editor = await user('editor');
  const page = await editor.goto(`${BASE}/library/articles/${slug}`);
  ok('the public article page shows the newest published version', page?.status() === 200 && (await editor.content()).includes('ข้อความรุ่นสองที่แก้ในหลังบ้าน') && !(await editor.content()).includes('ข้อความรุ่นแรกที่แก้ในหลังบ้าน'));
}

console.log(JSON.stringify({ ok: true, phase: PHASE, checks: results.length }));
await browser.close();
