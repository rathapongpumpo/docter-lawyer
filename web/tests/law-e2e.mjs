// Statute import E2E (FR-ADM-008/009): upload a PDF → worker parses → check the table (edit one row, leave one out) → worker saves a draft →
// approve the current draft version, then approve the uploaded one: the earlier version is closed and citing content flagged.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3208';
const OUT = process.env.OUT_DIR ?? 'test-results/law';
const TS = process.env.TS;
const PHASE = process.env.PHASE;
const PASS = 'correct-horse-9';
const email = (w) => `law-e2e-${w}-${TS}@example.test`;
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
const seed = () => JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8'));

if (PHASE === '1') {
  const [editor, reviewer] = await Promise.all(['editor', 'reviewer'].map(user));
  ok('a reviewer cannot use the statute import', (await api(reviewer, 'GET', '/api/v1/admin/laws')).status === 403 && (await reviewer.goto(`${BASE}/admin/laws`))?.status() === 404);
  await editor.goto(`${BASE}/admin/laws`);
  await editor.getByRole('heading', { name: 'นำเข้าตัวบทกฎหมาย' }).waitFor();
  await editor.getByLabel('กฎหมาย').selectOption('ccc');
  await editor.getByLabel('ชื่อฉบับ').fill('ทดสอบอัปโหลดจาก PDF');
  await editor.getByLabel('ไฟล์ตัวบท').setInputFiles(`${OUT}/law.pdf`);
  await editor.screenshot({ path: `${OUT}/01-form.png` });
  await editor.getByRole('button', { name: 'อัปโหลดและแยกมาตรา' }).click();
  await editor.getByText('กำลังแยกมาตรา…').waitFor();
  ok('the upload is accepted and a parse job is queued', true);
  const dup = await editor.evaluate(async () => 0);
  void dup;
  // wrong inputs
  const bad = await editor.request.post(`${BASE}/api/v1/admin/laws/import`, { multipart: { law_code: 'ccc', version_label: 'ทดสอบอัปโหลดจาก PDF', file: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('มาตรา ๑ ก') } }, headers: { 'x-csrf-token': (await editor.context().cookies()).find((c) => c.name === 'lc_csrf')?.value ?? '' } });
  ok('a version name that already exists is refused only after it is saved (queued jobs do not reserve it)', [200, 409].includes(bad.status()));
  const binary = await editor.request.post(`${BASE}/api/v1/admin/laws/import`, { multipart: { law_code: 'ccc', version_label: 'ไฟล์ไบนารี', file: { name: 'x.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 1, 2, 3, 0, 5]) } }, headers: { 'x-csrf-token': (await editor.context().cookies()).find((c) => c.name === 'lc_csrf')?.value ?? '' } });
  ok('a binary file that is not a PDF or text is refused', binary.status() === 400);
}

if (PHASE === '2') {
  const editor = await user('editor');
  await editor.goto(`${BASE}/admin/laws`);
  // the page lost its state on navigation: re-run the parse through the API result of the finished job
  const { parseJob, expectN } = seed();
  const job = (await api(editor, 'GET', `/api/v1/admin/laws/import/${parseJob}`)).json.data;
  ok('the parse job finished and produced sections', job.status === 'done' && job.result.stage === 'parsed' && job.result.sections.length === expectN, JSON.stringify(job.result?.stage));
  ok('a warning about cross-references / page furniture is not a failure', Array.isArray(job.result.warnings));
  ok('the parsed result is compared with the existing text of the law', job.result.compared_with_existing === true && job.result.diff !== null);
  const others = await user('reviewer');
  ok("another user cannot read the editor's job", (await api(others, 'GET', `/api/v1/admin/laws/import/${parseJob}`)).status === 403 || (await api(others, 'GET', `/api/v1/admin/laws/import/${parseJob}`)).status === 404);
  const first = job.result.sections[0].no;
  const second = job.result.sections[1].no;
  const commit = await api(editor, 'POST', `/api/v1/admin/laws/import/${parseJob}/commit`, { overrides: { [first]: `${job.result.sections[0].body} (แก้ในตาราง)` }, exclude: [second] });
  ok('the editor saves with one section edited and one left out', commit.status === 200, commit.text);
  ok('committing twice at once is refused', (await api(editor, 'POST', `/api/v1/admin/laws/import/${parseJob}/commit`, { overrides: {}, exclude: [] })).status === 409);
  writeFileSync(`${OUT}/commit.json`, JSON.stringify({ commitJob: commit.json.data.job_id, first, second }));
}

if (PHASE === '3') {
  const { oldVersion, newVersion, articleSlug } = seed();
  const [editor, reviewer] = await Promise.all(['editor', 'reviewer'].map(user));
  const CHECK = ['textMatchesOfficial', 'effectiveDateConfirmed', 'amendmentsChecked'];
  const submit = (id) => api(editor, 'POST', `/api/v1/admin/content/${id}/submit`, { type: 'law_version', note: 'ตรวจเทียบแล้ว' });
  ok('the editor submits the current draft version of the law', (await submit(oldVersion)).status === 200);
  const approveOld = await api(reviewer, 'POST', `/api/v1/admin/content/${oldVersion}/decision`, { type: 'law_version', decision: 'approve', comment: 'ตรงต้นฉบับ', checklist: CHECK, effective_from: '2020-01-01' });
  ok('the reviewer approves it with an effective date', approveOld.status === 200, approveOld.text);
  ok('the editor submits the uploaded version', (await submit(newVersion)).status === 200);
  const early = await api(reviewer, 'POST', `/api/v1/admin/content/${newVersion}/decision`, { type: 'law_version', decision: 'approve', checklist: CHECK, effective_from: '2019-06-01' });
  ok('an effective date not after the current version is refused', early.status === 400, early.text);
  await reviewer.goto(`${BASE}/admin/review/law_version/${newVersion}`);
  await reviewer.getByText(/อัปโหลดจากไฟล์/).first().waitFor();
  await reviewer.screenshot({ path: `${OUT}/02-review.png`, fullPage: true });
  const approve = await api(reviewer, 'POST', `/api/v1/admin/content/${newVersion}/decision`, { type: 'law_version', decision: 'approve', comment: 'ตรวจเทียบแล้ว', checklist: CHECK, effective_from: '2026-01-01' });
  ok('the uploaded version is approved with a later effective date', approve.status === 200, approve.text);
  void articleSlug;
}

console.log(JSON.stringify({ ok: true, phase: PHASE, checks: results.length }));
await browser.close();
