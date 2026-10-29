// Knowledge library E2E (FR-KB-001…011/013…016, FR-GUIDE-003/006/007/008, FR-TPL-001…008): category pages, hybrid search,
// glossary + tooltips, statute browsing, guide progress (member = server, guest = browser), print, the template wizard →
// DOCX/PDF, tab titles/icons, mobile overflow, robots/sitemap. The shell then checks the downloaded files and the logs.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3208';
const OUT = process.env.OUT_DIR ?? 'test-results/library';
const TS = process.env.TS;
const MARK = process.env.MARK; // unique text typed into the letter; must never reach a log
const PASS = 'correct-horse-9';
const browser = await chromium.launch();
const results = [];
const errors = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
// The negative API checks below provoke 4xx on purpose, which the browser logs as "Failed to load resource"; a real broken
// asset or page is caught by the response listener instead (anything but /api/v1 and the deliberate /library/NOPE).
const watch = (page) => {
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('response', (r) => {
    const path = new URL(r.url()).pathname;
    if (r.status() >= 400 && !path.startsWith('/api/v1/') && path !== '/library/NOPE') errors.push(`${r.status()} ${path}`);
  });
};
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const c = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-csrf-token': c }, body: b ? JSON.stringify(b) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* binary */ }
  return { status: r.status, json, type: r.headers.get('content-type'), size: text.length };
}, [method, path, body]);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---- members and guests
const mctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'th-TH', acceptDownloads: true });
const page = await mctx.newPage();
watch(page);
await page.goto(`${BASE}/login`);
await page.getByLabel('อีเมล').fill(`lib-e2e-${TS}@example.test`);
await page.locator('input[name=password]').fill(PASS);
await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
await page.waitForURL('**/chat**', { timeout: 20000 });

const gctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'th-TH' });
const guest = await gctx.newPage();
watch(guest);
await guest.goto(`${BASE}/login`);
await guest.getByRole('button', { name: /ทดลองใช้โดยไม่สมัคร/ }).click();
await guest.waitForURL('**/consent**');
await guest.getByRole('checkbox').check();
await guest.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
await guest.waitForURL('**/chat**');

const iconOk = async (p, label) => ok(`${label}: has a tab icon`, (await p.locator('link[rel~="icon"]').count()) > 0);

// ---- FR-KB-001/002: library grid and category page
await page.goto(`${BASE}/library`);
await page.getByRole('heading', { name: 'คลังความรู้', level: 1 }).waitFor();
ok('library title is the tab title', (await page.title()).includes('คลังความรู้'));
await iconOk(page, 'library');
const cards = await page.locator('main ul li a[href^="/library/"]').count();
ok('only categories with content are listed (pilot: contract law + related)', cards >= 2 && cards <= 6, `cards=${cards}`);
ok('the contract category card shows its counts', await page.getByRole('link', { name: /หนี้และสัญญา/ }).getByText(/บทความ \d+/).count() > 0);
await page.screenshot({ path: `${OUT}/01-library.png` });
await page.getByRole('link', { name: /หนี้และสัญญา/ }).click();
await page.waitForURL('**/library/CONTRACT');
ok('category page: breadcrumb and tab title', (await page.locator('nav[aria-label="เส้นทาง"]').innerText()).includes('คลังความรู้') && (await page.title()).includes('หนี้และสัญญา'));
const allArticles = await page.locator('[role=tabpanel] a[href^="/library/articles/"]').count();
ok('category page lists articles', allArticles >= 5, `articles=${allArticles}`);
await page.goto(`${BASE}/library/CONTRACT?tab=article&level=basic`);
const basic = await page.locator('[role=tabpanel] a[href^="/library/articles/"]').count();
ok('level filter narrows by URL (shareable) — basic', basic >= 1 && basic < allArticles, `basic=${basic} all=${allArticles}`);
await page.goto(`${BASE}/library/CONTRACT?tab=law`);
ok('law tab lists statutes', (await page.locator('[role=tabpanel] a[href^="/law/"]').count()) >= 2);
await page.goto(`${BASE}/library/CONTRACT?tab=article&sub=CONTRACT.PENALTY`);
ok('sub-category filter narrows to that sub-category and marks the pill', (await page.locator('a[aria-current="true"]', { hasText: /เบี้ยปรับ/ }).count()) === 1 && (await page.locator('[role=tabpanel] a[href="/library/articles/late-delivery-penalty"]').count()) === 1 && (await page.locator('[role=tabpanel] a[href^="/library/articles/"]').count()) === 1);
ok('an unknown category is a 404', (await page.goto(`${BASE}/library/NOPE`))?.status() === 404);
await page.goto(`${BASE}/library/CONTRACT.BREACH`);
ok('a sub-category page shows its parent in the breadcrumb', (await page.locator('nav[aria-label="เส้นทาง"]').innerText()).includes('หนี้และสัญญา'));

// ---- FR-KB-009/010: search
await page.goto(`${BASE}/library`);
await page.getByLabel('ค้นหาในคลังความรู้').fill('ปพพ ๓๘๓');
await page.getByRole('button', { name: 'ค้นหา' }).click();
await page.waitForURL('**/library/search**');
await page.getByText('ตรงกับที่ค้นหา').first().waitFor({ timeout: 20000 });
const firstHit = await page.locator('main section ul li').first().innerText();
ok('searching "ปพพ ๓๘๓" (Thai digits) puts section 383 first', /383/.test(firstHit) && /ตรงกับที่ค้นหา/.test(firstHit), firstHit.slice(0, 120));
await page.screenshot({ path: `${OUT}/02-search-section.png` });
await page.goto(`${BASE}/library/search?q=${encodeURIComponent('ปพพ 1336/1')}`);
await page.getByText(/ไม่พบมาตรา 1336\/1/).waitFor({ timeout: 20000 });
ok('a section that is not in the library is reported, not invented', true);
await page.goto(`${BASE}/library/search?q=${encodeURIComponent('ค่าปรับส่งงานช้า')}`);
await page.locator('main section ul li').first().waitFor({ timeout: 20000 });
const groups = await page.locator('main section h2').allInnerTexts();
ok('a topic search returns results grouped by type', groups.length >= 1, groups.join('|'));
await page.goto(`${BASE}/library/search?q=${encodeURIComponent('เลิกสัญญา')}&kind=template`);
await page.locator('main section ul li').first().waitFor({ timeout: 20000 });
const kindOnly = await page.locator('main section h2').allInnerTexts();
ok('the type filter keeps a single group', kindOnly.length === 1 && /แบบหนังสือ/.test(kindOnly[0]), kindOnly.join('|'));
ok('the words searched are highlighted in the snippets', (await page.locator('main mark').count()) >= 1);
await page.goto(`${BASE}/library/search?q=${encodeURIComponent('qzxwvjkq')}`);
await page.getByText(/ไม่พบเนื้อหาที่ตรงกับ/).waitFor({ timeout: 20000 });
ok('no result offers "ask Nitimitr instead"', (await page.getByRole('link', { name: 'ถามนิติมิตรแทน' }).count()) >= 1);
ok('search tab title', (await page.title()).includes('ผลการค้นหา'));

// ---- FR-KB-005/006/010: statutes
await page.goto(`${BASE}/law`);
await page.getByRole('heading', { name: 'ตัวบทกฎหมาย', level: 1 }).waitFor();
ok('/law lists the statutes', (await page.locator('main ul li a[href^="/law/"]').count()) >= 3);
await page.goto(`${BASE}/law?q=${encodeURIComponent('ปพพ')}`);
ok('"ปพพ" finds the civil and commercial code (abbreviation without dots)', (await page.locator('main ul li a[href="/law/ccc"]').count()) === 1);
await page.getByRole('link', { name: /ประมวลกฎหมายแพ่งและพาณิชย์/ }).first().click();
await page.waitForURL('**/law/ccc');
ok('the statute page lists its sections', (await page.locator('main ul li a[href^="/law/ccc/"]').count()) >= 50);
await page.locator('main ul li a[href="/law/ccc/383"]').click();
await page.waitForURL('**/law/ccc/383');
await page.getByRole('heading', { level: 1 }).first().waitFor();
const saveCount = await page.getByRole('button', { name: 'บันทึก', exact: true }).count();
ok('a section page has a specific tab title and a save button for members', (await page.title()).includes('383') && saveCount === 1, `${await page.title()} save=${saveCount}`);

// ---- FR-KB-011: glossary, tooltip, save
await page.goto(`${BASE}/library/glossary`);
await page.getByRole('heading', { name: 'อภิธานศัพท์', level: 1 }).waitFor();
const letters = await page.locator('nav[aria-label="ข้ามไปยังตัวอักษร"] a').allInnerTexts();
ok('glossary is grouped by Thai letters in dictionary order', letters.length >= 5, letters.join(''));
const termTexts = await page.locator('main section ul li a span.font-semibold').allInnerTexts();
const sorted = [...termTexts].sort((a, b) => a.localeCompare(b, 'th'));
ok('terms are in Thai collation order', JSON.stringify(sorted) === JSON.stringify(termTexts), termTexts.join(','));
await page.goto(`${BASE}/library/glossary?q=${encodeURIComponent('มัดจำ')}`);
ok('glossary search filters', (await page.locator('main section ul li').count()) >= 1);
await page.locator('main section ul li a').first().click();
await page.waitForURL('**/library/glossary/**');
ok('term page shows the definition and related sections', (await page.getByRole('heading', { name: 'มาตราที่เกี่ยวข้อง' }).count()) === 1);
const tipsRes = await api(page, 'GET', '/api/v1/glossary');
const tips = tipsRes.json.data.terms;
ok('the glossary API lists terms with aliases for tooltips', tipsRes.status === 200 && tips.length >= 20 && tips.every((t) => t.terms.length && t.def));

await page.goto(`${BASE}/library/articles/late-delivery-penalty`);
await page.getByRole('heading', { level: 1 }).first().waitFor();
const trigger = page.locator('article button.cursor-help').first();
await trigger.waitFor({ timeout: 10000 }).catch(async (e) => { console.log((await page.locator('article').innerHTML()).slice(0, 2500)); throw e; });
const termText = (await trigger.innerText()).trim();
await trigger.hover();
const tooltip = page.getByRole('tooltip');
await tooltip.waitFor();
const shown = await tooltip.innerText();
const entry = tips.find((t) => t.terms.includes(termText));
ok('hovering a glossary term shows its definition', entry && shown.includes(entry.def.slice(0, 20)), `${termText} → ${shown.slice(0, 60)}`);
await page.screenshot({ path: `${OUT}/03-tooltip.png` });
await page.keyboard.press('Escape');
ok('Escape closes the definition', (await tooltip.count()) === 0);
await page.mouse.move(0, 0);
await trigger.focus();
ok('keyboard focus also opens it', (await tooltip.count()) === 1);
await page.mouse.move(0, 0);
ok('article page: title, updated date, breadcrumb', (await page.title()).length > 5 && (await page.getByText(/ปรับปรุงล่าสุด/).count()) === 1);
await iconOk(page, 'article');
await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
await page.getByRole('button', { name: 'บันทึกแล้ว' }).waitFor();
await page.goto(`${BASE}/saved`);
await page.getByRole('link', { name: /ส่งงานช้าแล้วโดนปรับ/ }).waitFor({ timeout: 10000 });
ok('a saved article shows in "Saved"', true);
await guest.goto(`${BASE}/library/articles/late-delivery-penalty`);
await guest.getByRole('heading', { level: 1 }).first().waitFor();
ok('guests see no save button', (await guest.getByRole('button', { name: 'บันทึก', exact: true }).count()) === 0);

// ---- FR-GUIDE-003/006/008: guide progress
const GUIDE = 'notice-to-cure-then-terminate';
await page.goto(`${BASE}/guides/${GUIDE}`);
await page.getByRole('heading', { level: 1 }).first().waitFor();
ok('guide tab title and icon', (await page.title()).includes('บอกกล่าว'));
await iconOk(page, 'guide');
const boxes = page.locator('article input[type=checkbox]');
const total = await boxes.count();
ok('the checklist and the steps are tick-able', total >= 8, `total=${total}`);
await page.getByText(/ทำแล้ว 0 จาก/).waitFor();
await Promise.all([page.waitForResponse((r) => r.url().includes('/progress') && r.request().method() === 'PUT'), boxes.nth(0).check()]);
await Promise.all([page.waitForResponse((r) => r.url().includes('/progress') && r.request().method() === 'PUT'), boxes.nth(total - 1).check()]);
await page.getByText(/ทำแล้ว 2 จาก/).waitFor();
let prog = (await api(page, 'GET', `/api/v1/guides/${GUIDE}/progress`)).json.data;
ok('a member\'s ticks are saved on the server', prog.checked.length === 2 && prog.completed === false, JSON.stringify(prog));
await page.reload();
await page.getByText(/ทำแล้ว 2 จาก/).waitFor();
ok('ticks survive a reload', (await boxes.nth(0).isChecked()) && (await boxes.nth(total - 1).isChecked()));
await page.screenshot({ path: `${OUT}/04-guide.png` });
await Promise.all([page.waitForResponse((r) => r.url().includes('/progress') && r.request().method() === 'PUT'), page.getByRole('button', { name: 'ทำเสร็จแล้ว', exact: true }).click()]);
prog = (await api(page, 'GET', `/api/v1/guides/${GUIDE}/progress`)).json.data;
ok('"done" is recorded', prog.completed === true);
await Promise.all([page.waitForResponse((r) => r.url().includes('/progress') && r.request().method() === 'PUT'), page.getByRole('button', { name: 'เริ่มใหม่' }).click()]);
prog = (await api(page, 'GET', `/api/v1/guides/${GUIDE}/progress`)).json.data;
ok('"start over" clears ticks and done', prog.checked.length === 0 && prog.completed === false);
const bogus = await api(page, 'PUT', `/api/v1/guides/${GUIDE}/progress`, { checked: ['contract', 'not-a-key'], completed: false });
ok('only keys the guide has are stored', bogus.status === 200 && JSON.stringify(bogus.json.data.checked) === '["contract"]', JSON.stringify(bogus.json));
ok('unknown guide → 404', (await api(page, 'PUT', '/api/v1/guides/nope/progress', { checked: [], completed: false })).status === 404);
ok('the step link asks the assistant about that step', (await page.locator('article a[href^="/chat?q="]').count()) >= 3);

// guests keep progress in the browser
await guest.goto(`${BASE}/guides/${GUIDE}`);
await guest.getByText(/ทำแล้ว 0 จาก/).waitFor();
await guest.locator('article input[type=checkbox]').nth(1).check();
await guest.reload();
await guest.getByText(/ทำแล้ว 1 จาก/).waitFor();
ok('a guest\'s ticks stay in this browser across reloads', await guest.locator('article input[type=checkbox]').nth(1).isChecked());
ok('the guest is told where progress lives', (await guest.getByText(/จำไว้ในเบราว์เซอร์นี้เท่านั้น/).count()) === 1);
ok('the server refuses guest progress', (await api(guest, 'PUT', `/api/v1/guides/${GUIDE}/progress`, { checked: [], completed: false })).status === 403);

// print (FR-GUIDE-006): no app chrome, address + date footer
await page.emulateMedia({ media: 'print' });
ok('print view hides the sidebar and header', !(await page.locator('aside').first().isVisible()) && !(await page.locator('header').first().isVisible()));
ok('print view keeps the checklist and adds URL + date', (await page.locator('article input[type=checkbox]').first().isVisible()) && (await page.getByText(/พิมพ์เมื่อ .* · http/).isVisible()));
writeFileSync(`${OUT}/guide-print.pdf`, await page.pdf({ format: 'A4' }));
await page.emulateMedia({ media: 'screen' });

// ---- FR-TPL: template wizard → DOCX / PDF
await page.goto(`${BASE}/templates`);
ok('templates list', (await page.locator('main ul li a[href^="/templates/"]').count()) >= 5);
await page.goto(`${BASE}/templates/notice-to-cure`);
await page.getByRole('heading', { name: /ขั้นที่ 1 จาก/ }).waitFor();
ok('template tab title and icon', (await page.title()).includes('หนังสือบอกกล่าว'));
await iconOk(page, 'template');
const stepTotal = Number((await page.getByRole('heading', { name: /ขั้นที่ 1 จาก/ }).innerText()).match(/จาก (\d+)/)[1]);
ok('the form is split into pages of at most five fields', stepTotal >= 2);
const skipLabel = 'ระยะเวลาที่ให้แก้ไข';
let sawHelp = false;
async function fillPage() {
  const ids = await page.locator('input[id^="tpl-f"], textarea[id^="tpl-f"]').evaluateAll((els) => els.map((e) => ({ id: e.id, type: e.type })));
  ok('at most five fields on a page', ids.length >= 1 && ids.length <= 5, String(ids.length));
  for (const { id, type } of ids) {
    const label = (await page.locator(`label[for="${id}"]`).innerText()).replace(/\s*\(ไม่บังคับ\)/, '').trim();
    if (label === skipLabel) {
      const help = page.getByRole('button', { name: `คำอธิบายช่อง ${skipLabel}` });
      await help.click();
      await page.getByText(/ไม่ได้กำหนดจำนวนวัน|ระยะเวลาพอสมควร/).first().waitFor();
      ok('the (i) help explains the field and links the section', (await page.locator(`#${id}-help a[href="/law/ccc/387"]`).count()) === 1);
      ok('help button is keyboard-reachable with aria-expanded', (await help.getAttribute('aria-expanded')) === 'true');
      sawHelp = true;
      continue;
    }
    await page.locator(`#${id}`).fill(type === 'date' ? '2026-09-24' : label === 'ชื่อคู่สัญญา' ? MARK : `ทดสอบ ${label}`);
  }
}
for (let i = 0; i < stepTotal; i++) {
  await fillPage();
  await page.getByRole('button', { name: /^(ถัดไป|ไปตรวจทาน)$/ }).click();
}
await page.getByRole('heading', { name: 'ตรวจทานก่อนดาวน์โหลด' }).waitFor();
ok('the optional-field help was exercised', sawHelp);
ok('review warns about the one empty field', (await page.getByText(/ยังมี 1 ช่องที่ไม่ได้กรอก/).count()) === 1);
const preview = await page.getByTestId('tpl-preview').innerText();
ok('the preview shows answers, Buddhist-era dates and the empty field as [name]', preview.includes(MARK) && /24 กันยายน 2569/.test(preview) && preview.includes(`[${skipLabel}]`), preview.slice(0, 200));
await page.screenshot({ path: `${OUT}/05-template-review.png` });
await page.getByTestId('tpl-preview').getByRole('button', { name: MARK }).click();
ok('clicking a highlighted answer returns to that field', (await page.locator('input[id^="tpl-f"]:focus').inputValue()) === MARK);
for (let i = 0; i < stepTotal; i++) await page.getByRole('button', { name: /^(ถัดไป|ไปตรวจทาน)$/ }).click().catch(() => {});
await page.getByRole('heading', { name: 'ตรวจทานก่อนดาวน์โหลด' }).waitFor();
const dlDocx = page.getByRole('button', { name: 'ดาวน์โหลด DOCX' });
ok('downloads are locked until the disclaimer is acknowledged', await dlDocx.isDisabled());
await page.getByRole('checkbox', { name: /ฉันเข้าใจว่านี่เป็นแบบตัวอย่าง/ }).check();
const [docx] = await Promise.all([page.waitForEvent('download'), dlDocx.click()]);
await docx.saveAs(`${OUT}/notice.docx`);
ok('DOCX download', docx.suggestedFilename() === 'notice-to-cure.docx');
const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลด PDF' }).click()]);
await pdf.saveAs(`${OUT}/notice.pdf`);
ok('PDF download', pdf.suggestedFilename() === 'notice-to-cure.pdf');
const [blank] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DOCX', exact: true }).click()]);
await blank.saveAs(`${OUT}/blank.docx`);
ok('blank form download', true);
await page.reload();
await page.getByRole('heading', { name: /ขั้นที่ 1 จาก/ }).waitFor();
ok('the draft is kept in this browser', (await page.locator('input[id^="tpl-f"], textarea[id^="tpl-f"]').first().inputValue()).startsWith('ทดสอบ'));
await page.getByRole('button', { name: 'ล้างข้อมูลที่กรอก' }).click();
ok('"clear" empties the draft', (await page.locator('input[id^="tpl-f"], textarea[id^="tpl-f"]').first().inputValue()) === '');

// render API contract
ok('unknown template → 404', (await api(page, 'POST', '/api/v1/templates/nope/render', { answers: {}, format: 'docx' })).status === 404);
ok('bad format → 400', (await api(page, 'POST', '/api/v1/templates/notice-to-cure/render', { answers: {}, format: 'exe' })).status === 400);
ok('an over-long answer → 400', (await api(page, 'POST', '/api/v1/templates/notice-to-cure/render', { answers: { f1: 'x'.repeat(2001) }, format: 'docx' })).status === 400);
ok('a made-up field key → 400', (await api(page, 'POST', '/api/v1/templates/notice-to-cure/render', { answers: { evil: 'x' }, format: 'docx' })).status === 400);
const noCsrf = await page.evaluate(async () => (await fetch('/api/v1/templates/notice-to-cure/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"answers":{},"format":"docx"}' })).status);
ok('no CSRF token → 403', noCsrf === 403);
const guestDoc = await api(guest, 'POST', '/api/v1/templates/notice-to-cure/render', { answers: {}, format: 'pdf' });
ok('guests can make a document', guestDoc.status === 200 && guestDoc.type === 'application/pdf');
let last = 200;
for (let i = 0; i < 14; i++) last = (await api(guest, 'POST', '/api/v1/templates/notice-to-cure/render', { answers: {}, format: 'docx' })).status;
ok('rendering is rate limited per user (429)', last === 429, String(last));

// ---- FR-KB-002 AC2 / mobile: no horizontal scroll at 375px
const mobile = await (await browser.newContext({ viewport: { width: 375, height: 800 }, locale: 'th-TH', storageState: await mctx.storageState() })).newPage();
watch(mobile);
for (const path of ['/library', '/library/CONTRACT', '/library/search?q=%E0%B8%9B%E0%B8%9E%E0%B8%9E+383', '/library/glossary', '/law', '/law/ccc', `/guides/${GUIDE}`, '/templates/notice-to-cure', '/library/articles/late-delivery-penalty']) {
  await mobile.goto(`${BASE}${path}`);
  await mobile.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20000 });
  ok(`no horizontal scroll at 375px: ${path}`, await noOverflow(mobile));
}
await mobile.goto(`${BASE}/templates/notice-to-cure`);
await mobile.screenshot({ path: `${OUT}/06-template-mobile.png` });
await mobile.goto(`${BASE}/library/articles/late-delivery-penalty`);
const mt = mobile.locator('article button.cursor-help').first();
await mt.click();
const box = await mobile.getByRole('tooltip').boundingBox();
ok('the glossary tooltip stays on screen on a phone', box && box.x >= 0 && box.x + box.width <= 376, JSON.stringify(box));
await mobile.screenshot({ path: `${OUT}/07-tooltip-mobile.png` });

// ---- dark theme renders (tokens only)
await page.goto(`${BASE}/library`);
await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.screenshot({ path: `${OUT}/08-library-dark.png` });

// ---- public files
const anon = await browser.newContext();
const robots = await anon.request.get(`${BASE}/robots.txt`, { maxRedirects: 0 });
ok('robots.txt is public and closes the app', robots.status() === 200 && (await robots.text()).includes('Disallow: /api/'));
const sitemap = await anon.request.get(`${BASE}/sitemap.xml`, { maxRedirects: 0 });
ok('sitemap.xml is public', sitemap.status() === 200 && (await sitemap.text()).includes('/legal/terms'));

ok('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(JSON.stringify({ ok: true, checks: results.length }));
