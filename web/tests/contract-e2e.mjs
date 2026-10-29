// Contract upload pipeline E2E (M12 phase 1): upload → type/size/page checks → ClamAV → encrypted MinIO object → worker extraction → clauses,
// visibility, tenant isolation, deletion. PHASE 1 creates the organizations, 2 uploads, 3 (after the worker ran) reads and deletes.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3205';
const OUT = process.env.OUT_DIR ?? 'test-results/contracts';
const FIX = `${OUT}/fixtures`;
const TS = process.env.TS;
const PHASE = process.env.PHASE;
const PASS = 'correct-horse-9';
const email = (w) => `contract-e2e-${w}-${TS}@example.test`;
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
const ctxs = {};

async function user(who) {
  if (ctxs[who]) return ctxs[who];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
  const page = await context.newPage();
  page.on('response', (r) => { if (r.status() >= 500) console.log('HTTP', r.status(), r.request().method(), new URL(r.url()).pathname); });
  await page.goto(`${BASE}/login`);
  await page.getByLabel('อีเมล').fill(email(who));
  await page.locator('input[name=password]').fill(PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
  await page.waitForURL('**/chat**', { timeout: 20000 });
  return (ctxs[who] = page);
}
const csrf = async (page) => (await page.context().cookies()).find((c) => c.name === 'lc_csrf')?.value ?? '';
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const c = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-csrf-token': c }, body: b ? JSON.stringify(b) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}, [method, path, body]);
const upload = async (page, file, mime) => {
  const buffer = readFileSync(`${FIX}/${file}`);
  const r = await page.request.post(`${BASE}/api/v1/contracts`, { multipart: { file: { name: file, mimeType: mime, buffer } }, headers: { 'x-csrf-token': await csrf(page) } });
  return { status: r.status(), json: await r.json().catch(() => null) };
};
const setActive = (page, orgId) => api(page, 'POST', '/api/auth/organization/set-active', { organizationId: orgId });

if (PHASE === '1') {
  const alice = await user('alice');
  await alice.goto(`${BASE}/org/new`);
  await alice.getByLabel('ชื่อองค์กร').fill('บริษัท เอ จำกัด');
  await alice.getByLabel(/รหัสองค์กร/).fill(`ct-a-${TS}`);
  await alice.getByRole('button', { name: 'สร้าง' }).click();
  await alice.waitForURL('**/chat');
  const orgA = (await api(alice, 'GET', '/api/v1/session')).json.data.active_org_id;
  const dave = await user('dave');
  await dave.goto(`${BASE}/org/new`);
  await dave.getByLabel('ชื่อองค์กร').fill('บริษัท บี จำกัด');
  await dave.getByLabel(/รหัสองค์กร/).fill(`ct-b-${TS}`);
  await dave.getByRole('button', { name: 'สร้าง' }).click();
  await dave.waitForURL('**/chat');
  const orgB = (await api(dave, 'GET', '/api/v1/session')).json.data.active_org_id;
  ok('two organizations exist', !!orgA && !!orgB && orgA !== orgB);
  writeFileSync(`${OUT}/state.json`, JSON.stringify({ orgA, orgB }));
}

if (PHASE === '2') {
  const { orgA } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const [alice, bob, erin] = await Promise.all(['alice', 'bob', 'erin'].map(user));
  await Promise.all([alice, bob].map((p) => setActive(p, orgA)));

  // ---- rejections (FR-CR-001 AC1/AC2): each with a readable reason, nothing stored
  const reject = async (label, file, mime, code) => {
    const r = await upload(alice, file, mime);
    ok(`${label} → ${code}`, r.status === 400 && r.json?.error === code, `${r.status} ${JSON.stringify(r.json)}`);
  };
  await reject('a text file named .pdf', 'notes.pdf', 'application/pdf', 'UNSUPPORTED_TYPE');
  await reject('a password-protected PDF', 'encrypted.pdf', 'application/pdf', 'ENCRYPTED');
  await reject('a 51-page PDF', 'many-pages.pdf', 'application/pdf', 'TOO_MANY_PAGES');
  await reject('a 21 MB file', 'big.pdf', 'application/pdf', 'TOO_LARGE');
  await reject('a DOCX carrying the EICAR test virus', 'infected.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'INFECTED');
  const noOrg = await upload(erin, 'contract.pdf', 'application/pdf');
  ok('a member without an organization workspace cannot upload', noOrg.status === 400 && noOrg.json?.error === 'NO_ORG', JSON.stringify(noOrg.json));
  const noFile = await alice.request.post(`${BASE}/api/v1/contracts`, { multipart: { other: 'x' }, headers: { 'x-csrf-token': await csrf(alice) } });
  ok('a request without a file is refused', noFile.status() === 400);
  const noCsrf = await alice.request.post(`${BASE}/api/v1/contracts`, { multipart: { file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: readFileSync(`${FIX}/contract.pdf`) } } });
  ok('an upload without the CSRF token is refused', noCsrf.status() === 403);
  const list0 = (await api(alice, 'GET', '/api/v1/contracts')).json.data.contracts;
  ok('nothing was stored for the rejected files', list0.length === 0);

  // ---- accepted files, through the real UI
  await alice.goto(`${BASE}/contracts`);
  await alice.getByRole('heading', { name: 'สัญญาขององค์กร' }).waitFor();
  await alice.screenshot({ path: `${OUT}/01-empty.png` });
  await alice.locator('input[type=file]').setInputFiles(`${FIX}/contract.pdf`);
  await alice.getByRole('status').filter({ hasText: 'อัปโหลดแล้ว' }).waitFor({ timeout: 30000 });
  await alice.getByRole('link', { name: 'contract.pdf' }).waitFor();
  ok('a PDF uploads through the page and appears in the list', true);
  await alice.locator('input[type=file]').setInputFiles(`${FIX}/contract.docx`);
  await alice.getByRole('link', { name: 'contract.docx' }).waitFor({ timeout: 30000 });
  await alice.locator('input[type=file]').setInputFiles(`${FIX}/scan.pdf`);
  await alice.getByRole('link', { name: 'scan.pdf' }).waitFor({ timeout: 30000 });
  ok('a DOCX and a scanned PDF are accepted too (the scan is judged later, by the reader)', true);
  await alice.screenshot({ path: `${OUT}/02-uploaded.png` });
  const list = (await api(alice, 'GET', '/api/v1/contracts')).json.data.contracts;
  ok('three contracts, all private, all waiting for extraction', list.length === 3 && list.every((c) => c.visibility === 'private' && c.status === 'uploaded'), JSON.stringify(list.map((c) => c.status)));
  const byName = Object.fromEntries(list.map((c) => [c.file_name, c.id]));
  writeFileSync(`${OUT}/ids.json`, JSON.stringify(byName));
}

// ---- contract review (M12 step 2) with the MOCK backend: R1 starts reviews (the worker has not run yet), R2 reads the results
if (PHASE === 'R1') {
  const { orgA, orgB } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const ids = JSON.parse(readFileSync(`${OUT}/ids.json`, 'utf8'));
  const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map(user));
  await Promise.all([alice, bob].map((p) => setActive(p, orgA)));
  await setActive(dave, orgB);
  const pdf = ids['contract.pdf'];
  const status = (await api(alice, 'GET', `/api/v1/contracts/${pdf}/review`)).json.data;
  ok('the review is switched on (mock) and nothing has been reviewed yet', status.mode === 'mock' && status.review === null, JSON.stringify(status));

  // through the real page: button, privacy note absent for mock, progress state
  await alice.goto(`${BASE}/contracts/${pdf}`);
  await alice.getByRole('heading', { name: 'ตรวจสัญญา' }).waitFor();
  ok('no "sent to the company service" notice for the mock backend', (await alice.getByText('ส่งไปยังบริการตรวจสัญญาของบริษัท').count()) === 0);
  await alice.getByRole('button', { name: 'ตรวจสัญญา' }).click();
  await alice.getByRole('status').filter({ hasText: 'กำลังตรวจสัญญา' }).waitFor({ timeout: 15000 });
  ok('starting a review from the page shows the progress state', true);
  await alice.screenshot({ path: `${OUT}/05-review-running.png` });
  ok('a second start while it runs is refused (409)', (await api(alice, 'POST', `/api/v1/contracts/${pdf}/review`, {})).status === 409);

  const docx = ids['contract.docx'];
  ok('a review can be started through the API too', (await api(alice, 'POST', `/api/v1/contracts/${docx}/review`, {})).status === 200);
  ok('a scanned (unreadable) contract cannot be reviewed', (await api(alice, 'POST', `/api/v1/contracts/${ids['scan.pdf']}/review`, {})).status === 400);
  const noCsrf = await alice.request.post(`${BASE}/api/v1/contracts/${pdf}/review`, { data: {} });
  ok('starting without the CSRF token is refused', noCsrf.status() === 403);
  // access follows the contract: private → uploader only; other organization → 404
  ok('another member cannot start or read the review of a private contract', (await api(bob, 'POST', `/api/v1/contracts/${pdf}/review`, {})).status === 404 && (await api(bob, 'GET', `/api/v1/contracts/${pdf}/review`)).status === 404);
  ok('a member of another organization cannot either', (await api(dave, 'POST', `/api/v1/contracts/${pdf}/review`, {})).status === 404 && (await api(dave, 'GET', `/api/v1/contracts/${pdf}/review`)).status === 404);
  const states = await Promise.all([pdf, docx].map(async (id) => (await api(alice, 'GET', `/api/v1/contracts/${id}`)).json.data.status));
  ok('both contracts are now "reviewing"', states.every((x) => x === 'reviewing'), JSON.stringify(states));
}

if (PHASE === 'R2') {
  const { orgA } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const ids = JSON.parse(readFileSync(`${OUT}/ids.json`, 'utf8'));
  const alice = await user('alice');
  await setActive(alice, orgA);
  const pdf = ids['contract.pdf'];
  const { review, mode } = (await api(alice, 'GET', `/api/v1/contracts/${pdf}/review`)).json.data;
  const clauses = (await api(alice, 'GET', `/api/v1/contracts/${pdf}`)).json.data.clauses;
  ok('the review completed with the mock backend', mode === 'mock' && review.status === 'completed' && review.backend === 'mock', JSON.stringify({ mode, status: review?.status, error: review?.error_code }));
  ok('there is one finding per clause, with a level, a note and a suggestion for each risky one', review.findings.length === clauses.length && review.findings.every((f) => ['high', 'medium', 'low', 'none'].includes(f.risk) && (f.risk === 'none' || (f.note && f.suggestion))));
  const penalty = review.findings.find((f) => f.clause_no === 'ข้อ 3');
  ok('the penalty clause is flagged high or medium', ['high', 'medium'].includes(penalty.risk), penalty.risk);
  ok('the summary quotes the contract: parties and penalty found, nothing invented', review.summary.parties.length === 2 && !!review.summary.penalty);
  ok('the mock never cites a law section in its notes', review.findings.every((f) => !/มาตรา/.test(`${f.note}${f.suggestion}`)));
  ok('counts match the findings', Object.values(review.counts).reduce((a, b) => a + b, 0) === review.findings.length);
  ok('the contract is "reviewed"', (await api(alice, 'GET', `/api/v1/contracts/${pdf}`)).json.data.status === 'reviewed');

  await alice.goto(`${BASE}/contracts/${pdf}`);
  await alice.getByText('ผลจำลองสำหรับทดสอบระบบ').waitFor({ timeout: 15000 });
  await alice.getByRole('heading', { name: 'สรุปสาระสำคัญ' }).waitFor();
  await alice.getByText('ไม่ใช่คำปรึกษาทางกฎหมายสำหรับกรณีเฉพาะ').first().waitFor();
  const all = await alice.getByRole('heading', { level: 4 }).count();
  await alice.getByRole('button', { name: /เสี่ยงสูง/ }).click();
  const high = await alice.getByRole('heading', { level: 4 }).count();
  ok('the page shows the summary, the simulated-result badge, the disclaimer and a filter by level', all === clauses.length && high < all && high === (review.counts.high ?? 0), `${all}/${high}`);
  await alice.screenshot({ path: `${OUT}/06-review-result.png`, fullPage: true });
}

if (PHASE === '3') {
  const { orgA, orgB } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const ids = JSON.parse(readFileSync(`${OUT}/ids.json`, 'utf8'));
  const [alice, bob, carol, dave, erin] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'erin'].map(user));
  await Promise.all([alice, bob, carol].map((p) => setActive(p, orgA)));

  // ---- extraction result (FR-CR-002)
  const pdf = (await api(alice, 'GET', `/api/v1/contracts/${ids['contract.pdf']}`)).json.data;
  ok('the PDF was read and is ready (or already reviewed)', ['ready', 'reviewed'].includes(pdf.status), pdf.status);
  ok('its clauses were split by number, with pages', JSON.stringify(pdf.clauses.map((c) => c.ref)) === JSON.stringify(['ส่วนต้น', 'ข้อ 1', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4', 'ข้อ 5']), JSON.stringify(pdf.clauses.map((c) => c.ref)));
  const penalty = pdf.clauses.find((c) => c.ref === 'ข้อ 3');
  ok('the penalty clause keeps its text, its sub-clause and starts on page 2', penalty.text.includes('20,000') && penalty.text.includes('3.1') && penalty.page === 2, JSON.stringify(penalty));
  ok('the page count is stored', pdf.page_count === 2);
  ok('the parties were found in the text', pdf.counterparty_hint === 'บริษัท เอ็กซ์ก่อสร้าง จำกัด / บริษัท วายเทค จำกัด', pdf.counterparty_hint);
  const docx = (await api(alice, 'GET', `/api/v1/contracts/${ids['contract.docx']}`)).json.data;
  ok('the DOCX was read: clauses, and the table row too', ['ready', 'reviewed'].includes(docx.status) && docx.clauses.some((c) => c.ref === 'ข้อ 2') && docx.clauses.some((c) => c.text.includes('จำนวน 100 ชุด')), JSON.stringify(docx.clauses.map((c) => c.ref)));
  const scan = (await api(alice, 'GET', `/api/v1/contracts/${ids['scan.pdf']}`)).json.data;
  ok('the scanned PDF is reported as unsupported, not guessed at', scan.status === 'unsupported_scan' && scan.clauses.length === 0, scan.status);

  await alice.goto(`${BASE}/contracts/${ids['contract.pdf']}`);
  await alice.getByRole('heading', { name: 'ข้อ 3 — กำหนดส่งมอบและค่าปรับ', level: 3 }).waitFor();
  await alice.getByText('ยังไม่ได้ยืนยัน').first().waitFor();
  await alice.screenshot({ path: `${OUT}/03-detail.png`, fullPage: true });
  await alice.goto(`${BASE}/contracts/${ids['scan.pdf']}`);
  await alice.getByText('ไฟล์นี้เป็นภาพสแกน').waitFor();
  ok('the detail page explains why a scan cannot be read', true);
  await alice.goto(`${BASE}/contracts`);
  await alice.getByText(/พร้อมแล้ว|ตรวจแล้ว/).first().waitFor();
  await alice.getByRole('searchbox', { name: /ค้นหา/ }).fill('วายเทค');
  await alice.getByRole('link', { name: 'contract.pdf' }).waitFor();
  ok('the list can be searched by counterparty', (await alice.getByRole('link', { name: 'contract.docx' }).count()) === 0);
  await alice.screenshot({ path: `${OUT}/04-list.png` });

  // ---- visibility (FR-CR-012): private = the uploader only, even for org admins
  const id = ids['contract.pdf'];
  ok("another member does not see a private contract in the list", (await api(bob, 'GET', '/api/v1/contracts')).json.data.contracts.length === 0);
  ok('...and gets 404 for it', (await api(bob, 'GET', `/api/v1/contracts/${id}`)).status === 404);
  ok('...also an org admin cannot read it', (await api(carol, 'GET', `/api/v1/contracts/${id}`)).status === 404);
  ok('a non-uploader cannot change its visibility', (await api(bob, 'PATCH', `/api/v1/contracts/${id}`, { visibility: 'org' })).status === 404);
  ok('a plain member cannot delete it', (await api(bob, 'DELETE', `/api/v1/contracts/${id}`)).status === 404);
  ok('the uploader shares it with the organization', (await api(alice, 'PATCH', `/api/v1/contracts/${id}`, { visibility: 'org' })).status === 200);
  const shared = await api(bob, 'GET', `/api/v1/contracts/${id}`);
  ok('now members can read it', shared.status === 200 && shared.json.data.clauses.length === 6 && shared.json.data.mine === false && shared.json.data.uploader === 'alice');
  ok('a plain member still cannot delete it', (await api(bob, 'DELETE', `/api/v1/contracts/${id}`)).status === 404);

  // ---- tenant isolation (FR-ORG-006): dave belongs to another organization, erin to none
  for (const [who, page] of [['dave', dave], ['erin', erin]]) {
    ok(`${who} → contract of org A: 404`, (await api(page, 'GET', `/api/v1/contracts/${id}`)).status === 404);
    ok(`${who} cannot delete it`, (await api(page, 'DELETE', `/api/v1/contracts/${id}`)).status === 404);
    ok(`${who} cannot change its visibility`, (await api(page, 'PATCH', `/api/v1/contracts/${id}`, { visibility: 'private' })).status === 404);
  }
  await setActive(dave, orgB);
  ok("org B's list has none of org A's contracts", (await api(dave, 'GET', '/api/v1/contracts')).json.data.contracts.length === 0);
  ok('an unknown id is a plain 404', (await api(alice, 'GET', '/api/v1/contracts/not-a-uuid')).status === 404);

  // ---- deletion (FR-CR-009): the org admin may delete a contract they cannot read
  const gone = ids['contract.docx'];
  ok('the org admin deletes a private contract of a member', (await api(carol, 'DELETE', `/api/v1/contracts/${gone}`)).status === 200);
  ok('it is gone at once (404)', (await api(alice, 'GET', `/api/v1/contracts/${gone}`)).status === 404);
  ok('and out of the list', !(await api(alice, 'GET', '/api/v1/contracts')).json.data.contracts.some((c) => c.id === gone));
  await alice.goto(`${BASE}/contracts/${ids['scan.pdf']}`);
  await alice.getByRole('button', { name: 'ลบสัญญา' }).click();
  await alice.getByRole('alertdialog').getByRole('button', { name: 'ลบถาวร' }).click();
  await alice.waitForURL('**/contracts');
  ok('the uploader deletes through the page (confirm dialog)', (await api(alice, 'GET', `/api/v1/contracts/${ids['scan.pdf']}`)).status === 404);
  writeFileSync(`${OUT}/deleted.json`, JSON.stringify({ gone, scan: ids['scan.pdf'], kept: id }));
}

if (PHASE === '4') {
  const { orgA } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const alice = await user('alice');
  await setActive(alice, orgA);
  const r = await upload(alice, 'contract.pdf', 'application/pdf');
  ok('one more contract is uploaded into the organization', r.status === 200, JSON.stringify(r.json));
  const del = await api(alice, 'POST', `/api/v1/orgs/${orgA}/deletion`, { confirm_name: 'บริษัท เอ จำกัด' });
  ok('the owner asks to delete the organization', del.status === 200);
  ok('its contracts are unreachable while it waits for deletion', (await api(alice, 'GET', '/api/v1/contracts')).status === 400);
}

console.log(JSON.stringify({ ok: true, phase: PHASE, checks: results.length }));
await browser.close();
