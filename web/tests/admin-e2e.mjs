// Back-office E2E (M10): access matrix, user management, audit viewer, DSR queue + digest, announcement, feedback queue, guardrails,
// usage, and the review workflow guards. Runs on a throwaway database copy (scripts/e2e-admin.sh).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3206';
const OUT = process.env.OUT_DIR ?? 'test-results/admin';
const TS = process.env.TS;
const PHASE = process.env.PHASE;
const PASS = 'correct-horse-9';
const email = (w) => `admin-e2e-${w}-${TS}@example.test`;
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); if (!cond) throw new Error(`FAILED: ${name} ${extra}`); };
const ctxs = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function user(who, { fresh = false } = {}) {
  if (ctxs[who] && !fresh) return ctxs[who];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
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
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: r.status, json, text };
}, [method, path, body]);
const uidOf = async (admin, who) => (await api(admin, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(email(who))}`)).json.data.users[0].id;

if (PHASE === '1') {
  const [admin, editor, reviewer, member] = await Promise.all(['admin', 'editor', 'reviewer', 'member'].map((w) => user(w)));

  // ---- access matrix (FR-ADM-001)
  await admin.goto(`${BASE}/admin`);
  await admin.getByRole('heading', { name: 'ภาพรวม' }).waitFor();
  const adminTabs = await admin.getByRole('navigation', { name: 'เมนูหลังบ้าน' }).getByRole('link').allInnerTexts();
  ok('the admin sees every section', ['งานตรวจเนื้อหา', 'ผู้ใช้', 'ประวัติระบบ', 'คำขอใช้สิทธิ', 'ประกาศระบบ', 'ความเห็นผู้ใช้', 'ระบบความปลอดภัย', 'การใช้งาน'].every((s) => adminTabs.includes(s)), adminTabs.join('|'));
  await admin.screenshot({ path: `${OUT}/01-hub-admin.png` });
  await editor.goto(`${BASE}/admin`);
  const editorTabs = await editor.getByRole('navigation', { name: 'เมนูหลังบ้าน' }).getByRole('link').allInnerTexts();
  ok('an editor sees review and content only', editorTabs.includes('งานตรวจเนื้อหา') && !editorTabs.includes('ผู้ใช้') && !editorTabs.includes('ประวัติระบบ') && !editorTabs.includes('ความเห็นผู้ใช้'), editorTabs.join('|'));
  await reviewer.goto(`${BASE}/admin`);
  const reviewerTabs = await reviewer.getByRole('navigation', { name: 'เมนูหลังบ้าน' }).getByRole('link').allInnerTexts();
  ok('a reviewer sees review, feedback and guardrails', reviewerTabs.includes('ความเห็นผู้ใช้') && reviewerTabs.includes('ระบบความปลอดภัย') && !reviewerTabs.includes('ผู้ใช้'), reviewerTabs.join('|'));
  for (const path of ['/admin/users', '/admin/audit', '/admin/dsr', '/admin/usage', '/admin/announcement']) {
    const r = await editor.goto(`${BASE}${path}`);
    ok(`editor → ${path}: 404 page`, r?.status() === 404, String(r?.status()));
  }
  ok('editor → feedback page: 404', (await editor.goto(`${BASE}/admin/feedback`))?.status() === 404);
  ok('reviewer → users page: 404', (await reviewer.goto(`${BASE}/admin/users`))?.status() === 404);
  ok('a member → /admin: 404', (await member.goto(`${BASE}/admin`))?.status() === 404);
  const forbidden = await api(editor, 'GET', '/api/v1/admin/users');
  ok('API: editor → admin_list_users 403', forbidden.status === 403);
  ok('API: reviewer → admin_audit_log 403', (await api(reviewer, 'GET', '/api/v1/admin/audit')).status === 403);
  ok('API: member → feedback queue 403', (await api(member, 'GET', '/api/v1/admin/feedback')).status === 403);

  // ---- user management (FR-ADM-017)
  await admin.goto(`${BASE}/admin/users`);
  await admin.getByRole('heading', { name: 'ผู้ใช้', exact: true }).waitFor();
  await admin.getByRole('searchbox', { name: /ค้นหา/ }).fill(email('victim'));
  await admin.getByText(email('victim')).waitFor();
  await admin.screenshot({ path: `${OUT}/02-users.png` });
  const victimId = await uidOf(admin, 'victim');
  const short = await api(admin, 'PATCH', `/api/v1/admin/users/${victimId}`, { action: 'suspend', reason: 'x' });
  ok('an action without a real reason is refused', short.status === 400);
  const meId = await uidOf(admin, 'admin');
  ok('an admin cannot suspend themselves', (await api(admin, 'PATCH', `/api/v1/admin/users/${meId}`, { action: 'suspend', reason: 'testing self lockout' })).status === 409);
  ok('...nor demote themselves (also the last admin)', (await api(admin, 'PATCH', `/api/v1/admin/users/${meId}`, { action: 'set_role', role: 'member', reason: 'testing last admin' })).status === 409);

  // through the UI: suspend with a reason
  await admin.getByRole('button', { name: 'ระงับ', exact: true }).first().click();
  await admin.getByRole('dialog').getByLabel('เหตุผล (บังคับ)').fill('ตรวจสอบพบการใช้งานผิดปกติ');
  await admin.getByRole('dialog').getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await admin.getByRole('status').filter({ hasText: 'ดำเนินการแล้ว' }).waitFor();
  ok('suspend through the page', true);
  const victim = await user('victim', { fresh: true }).then(() => null, () => 'blocked');
  ok('a suspended user cannot sign in', victim === 'blocked');
  ok('unsuspend with a reason', (await api(admin, 'PATCH', `/api/v1/admin/users/${victimId}`, { action: 'unsuspend', reason: 'ตรวจแล้วเป็นความเข้าใจผิด' })).status === 200);
  const back = await user('victim', { fresh: true });
  ok('after unsuspending the user signs in again', !!back);
  ok('force sign-out kills the session at once', (await api(admin, 'PATCH', `/api/v1/admin/users/${victimId}`, { action: 'force_logout', reason: 'ทดสอบออกจากระบบ' })).status === 200 && (await api(back, 'GET', '/api/v1/session')).status === 401);

  // role change: takes effect on the next sign-in and is audited with its reason
  const memberId = await uidOf(admin, 'member');
  ok('promote a member to reviewer with a reason', (await api(admin, 'PATCH', `/api/v1/admin/users/${memberId}`, { action: 'set_role', role: 'reviewer', reason: 'ผู้ตรวจเนื้อหาคนใหม่ของทีม' })).status === 200);
  ok("the member's old session is gone (role change signs them out)", (await api(member, 'GET', '/api/v1/session')).status === 401);
  const promoted = await user('member', { fresh: true });
  ok('the promoted user now reaches the reviewer pages', (await promoted.goto(`${BASE}/admin/feedback`))?.status() === 200);
  ok('...but still not the user list', (await promoted.goto(`${BASE}/admin/users`))?.status() === 404);
  await api(admin, 'PATCH', `/api/v1/admin/users/${memberId}`, { action: 'set_role', role: 'member', reason: 'คืนสิทธิ์หลังทดสอบ' });
  const quota = await api(admin, 'PATCH', `/api/v1/admin/users/${memberId}`, { action: 'reset_quota', reason: 'ทดสอบรีเซ็ตโควตา' });
  ok('reset quota works', quota.status === 200);

  // ---- audit viewer (FR-ADM-018)
  await admin.goto(`${BASE}/admin/audit`);
  await admin.getByLabel('ประเภทเหตุการณ์ (ขึ้นต้นด้วย)').fill('user.');
  await admin.getByText('user.suspended').first().waitFor();
  await admin.getByText(/reason=ตรวจสอบพบการใช้งานผิดปกติ/).first().waitFor();
  ok('the audit viewer shows who did what with the stated reason', true);
  await admin.screenshot({ path: `${OUT}/03-audit.png` });
  const rows = (await api(admin, 'GET', '/api/v1/admin/audit?action=auth.forbidden')).json.data.rows;
  ok('the forbidden attempts of the editor and reviewer are in the log', rows.length >= 3 && rows.some((r) => r.actor_role === 'editor'), String(rows.length));
  const csv = await api(admin, 'GET', '/api/v1/admin/audit?action=user.&format=csv');
  ok('audit CSV export (quoted header, rows)', csv.status === 200 && csv.text.replace(/^﻿/, '').startsWith('"id"') && csv.text.includes('user.role_change'));
  for (const m of ['PUT', 'PATCH', 'DELETE', 'POST']) {
    ok(`no ${m} on the audit endpoint`, (await api(admin, m, '/api/v1/admin/audit', {})).status === 405);
  }
  ok('audit export is itself audited', (await api(admin, 'GET', '/api/v1/admin/audit?action=audit.exported')).json.data.rows.length >= 1);

  // ---- announcement (FR-ADM-022)
  await admin.goto(`${BASE}/admin/announcement`);
  await admin.getByLabel('ข้อความภาษาไทย').fill('ระบบจะปิดปรับปรุงคืนวันเสาร์ 22:00–23:00 น.');
  await admin.getByLabel('ข้อความภาษาอังกฤษ').fill('Maintenance on Saturday 22:00–23:00.');
  await admin.getByRole('button', { name: 'เผยแพร่ประกาศ' }).click();
  await admin.getByRole('status').filter({ hasText: 'เผยแพร่แล้ว' }).waitFor();
  const m1 = await user('victim', { fresh: true });
  await m1.getByText('ระบบจะปิดปรับปรุงคืนวันเสาร์').waitFor();
  await m1.screenshot({ path: `${OUT}/04-announcement.png` });
  await m1.getByRole('button', { name: 'ปิดประกาศ' }).click();
  await m1.reload();
  await sleep(500);
  ok('a member sees the announcement and can close it for good', (await m1.getByText('ระบบจะปิดปรับปรุงคืนวันเสาร์').count()) === 0);
  await m1.getByRole('radio', { name: 'EN' }).click();
  await api(admin, 'PUT', '/api/v1/admin/announcement', { th: 'ประกาศใหม่', en: 'A new notice', level: 'warning', starts_at: null, ends_at: null });
  await m1.reload();
  await m1.getByText('A new notice').waitFor();
  ok('a different announcement shows again, in the reader\'s language', true);
  await api(admin, 'PUT', '/api/v1/admin/announcement', { th: 'ล่วงหน้า', en: 'Later', level: 'info', starts_at: new Date(Date.now() + 3600_000).toISOString(), ends_at: null });
  await m1.reload();
  await sleep(500);
  ok('an announcement whose time has not come is not shown', (await m1.getByText('Later').count()) === 0);
  await api(admin, 'DELETE', '/api/v1/admin/announcement');
  ok('an editor cannot set an announcement', (await api(editor, 'PUT', '/api/v1/admin/announcement', { th: 'x', en: 'x' })).status === 403);
  writeFileSync(`${OUT}/state.json`, JSON.stringify({ victimId, memberId }));
}

if (PHASE === '2') {
  // after the shell seeded feedback, guardrail events, DSR rows and a draft glossary term
  const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8'));
  const [admin, editor, reviewer] = await Promise.all(['admin', 'editor', 'reviewer'].map((w) => user(w)));

  // ---- feedback queue (FR-ADM-011)
  await reviewer.goto(`${BASE}/admin/feedback`);
  await reviewer.getByRole('heading', { name: 'ความเห็นผู้ใช้' }).waitFor();
  await reviewer.screenshot({ path: `${OUT}/05-feedback.png` });
  const list = (await api(reviewer, 'GET', '/api/v1/admin/feedback')).json.data.items;
  ok('three 👎 are open in the queue', list.length === 3, String(list.length));
  ok('the list shows the comment masked', list.some((i) => i.comment?.includes('[เบอร์โทร]')) && !JSON.stringify(list).includes('081-234-5678'));
  const allowed = (await api(reviewer, 'GET', `/api/v1/admin/feedback/${seed.fbAllowed}`)).json.data;
  ok('an allowed conversation is readable, masked', allowed.conversation?.question.includes('[เบอร์โทร]') && !JSON.stringify(allowed).includes('081-234-5678') && allowed.conversation.citations.length === 1, JSON.stringify(allowed.conversation));
  const denied = (await api(reviewer, 'GET', `/api/v1/admin/feedback/${seed.fbDenied}`)).json.data;
  ok('without permission only reasons and metadata are visible (AC1)', denied.conversation === null && denied.reasons.length > 0);
  const org = (await api(reviewer, 'GET', `/api/v1/admin/feedback/${seed.fbOrg}`)).json.data;
  ok("an organization's chat is never shown, even when the member ticked the box", org.conversation === null && org.org_chat === true);
  ok('reading a conversation is audited', (await api(admin, 'GET', '/api/v1/admin/audit?action=feedback.conversation_read')).json.data.rows.length >= 1);
  await reviewer.goto(`${BASE}/admin/feedback/${seed.fbAllowed}`);
  await reviewer.getByText('ปกปิดเลขบัตร เบอร์โทร').waitFor();
  await reviewer.getByLabel('สาเหตุ').selectOption('content_gap');
  await reviewer.getByLabel('คำตอบที่ถูกต้อง (ไม่บังคับ)').fill('ควรอธิบายว่าศาลลดเบี้ยปรับได้ตามมาตรา 383 หากสูงเกินส่วน');
  await reviewer.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await reviewer.getByRole('status').filter({ hasText: 'บันทึกแล้ว' }).waitFor();
  ok('the cause list has no answer-writing option', (await reviewer.getByLabel('สาเหตุ').locator('option', { hasText: 'การเขียนคำตอบ' }).count()) === 0);
  ok('there is no add-to-test-set action', (await reviewer.getByRole('button', { name: 'เพิ่มเข้าชุดทดสอบ' }).count()) === 0);
  const saved = (await api(reviewer, 'GET', `/api/v1/admin/feedback/${seed.fbAllowed}`)).json.data;
  ok('the cause and the corrected answer are saved', saved.root_cause === 'content_gap' && saved.corrected_answer?.includes('มาตรา 383'));
  await reviewer.screenshot({ path: `${OUT}/06-feedback-detail.png`, fullPage: true });
  ok('triage state and cause are saved', (await api(reviewer, 'PATCH', `/api/v1/admin/feedback/${seed.fbDenied}`, { review_state: 'wont_fix', root_cause: 'outdated', reviewer_note: 'ข้อมูลตัวบทฉบับเก่า' })).status === 200);
  ok('an editor cannot read the feedback queue', (await api(editor, 'GET', '/api/v1/admin/feedback')).status === 403);

  // ---- guardrails (FR-ADM-015)
  await reviewer.goto(`${BASE}/admin/guardrails`);
  await reviewer.getByRole('heading', { name: 'ระบบความปลอดภัย', exact: true }).waitFor();
  await reviewer.getByRole('button', { name: 'บล็อกผิด' }).first().click();
  await reviewer.getByRole('button', { name: 'ยกเลิกเครื่องหมาย' }).waitFor();
  ok('a reviewer marks a block as a false positive', true);
  await reviewer.screenshot({ path: `${OUT}/07-guardrails.png` });
  const g = (await api(reviewer, 'GET', '/api/v1/admin/guardrails')).json.data;
  ok('events and the daily block rate are listed', g.events.length === 3 && g.daily[0].blocked === 2 && g.events.filter((e) => e.false_positive).length === 1, JSON.stringify(g.daily));
  ok('an editor cannot read guardrail events', (await api(editor, 'GET', '/api/v1/admin/guardrails')).status === 403);

  // ---- DSR queue (FR-ADM-023)
  await admin.goto(`${BASE}/admin/dsr`);
  await admin.getByRole('heading', { name: 'คำขอใช้สิทธิเจ้าของข้อมูล' }).waitFor();
  const dsr = (await api(admin, 'GET', '/api/v1/admin/dsr')).json.data.requests;
  ok('requests are ordered by due date, the near ones flagged', dsr.length >= 3 && dsr[0].due_soon === true && dsr.some((r) => r.overdue), JSON.stringify(dsr.map((r) => [r.type, r.due_soon])));
  await admin.screenshot({ path: `${OUT}/08-dsr.png` });
  const first = dsr[0];
  ok('start a request', (await api(admin, 'PATCH', `/api/v1/admin/dsr/${first.id}`, { status: 'in_progress' })).status === 200);
  ok('a rejection needs a reason', (await api(admin, 'PATCH', `/api/v1/admin/dsr/${first.id}`, { status: 'rejected' })).status === 400);
  ok('complete a request', (await api(admin, 'PATCH', `/api/v1/admin/dsr/${first.id}`, { status: 'completed', notes: 'ส่งข้อมูลให้แล้ว' })).status === 200);
  const created = await api(admin, 'POST', '/api/v1/admin/dsr', { type: 'access', email: email('victim'), notes: 'ได้รับทางอีเมล' });
  ok('a request that arrived by e-mail is logged with its 30-day clock', created.status === 200);
  ok('the handling is audited', (await api(admin, 'GET', '/api/v1/admin/audit?action=dsr.')).json.data.rows.length >= 3);
  ok('an editor cannot open the DSR queue', (await api(editor, 'GET', '/api/v1/admin/dsr')).status === 403);

  // ---- usage (FR-ADM-016)
  await admin.goto(`${BASE}/admin/usage`);
  await admin.getByRole('heading', { name: 'การใช้งาน' }).waitFor();
  await admin.screenshot({ path: `${OUT}/09-usage.png` });
  const usage = (await api(admin, 'GET', '/api/v1/admin/usage')).json.data;
  ok('usage totals and per-day numbers exist', usage.totals.members >= 5 && Array.isArray(usage.daily));
  ok('usage CSV export', (await api(admin, 'GET', '/api/v1/admin/usage?format=csv')).text.startsWith('day,messages'));
  ok('a reviewer cannot open usage', (await api(reviewer, 'GET', '/api/v1/admin/usage')).status === 403);

  // ---- the review workflow guards (a draft glossary term seeded by the shell)
  await editor.goto(`${BASE}/admin/review`);
  await editor.getByRole('link', { name: /คำทดสอบหลังบ้าน/ }).waitFor();
  ok('a draft appears in the review queue', true);
  await editor.screenshot({ path: `${OUT}/10-review-queue.png` });
  const tid = seed.termId;
  const checklist = ['factsMatchLaw', 'factsCited', 'plainLanguage'];
  ok('an editor submits a draft for review', (await api(editor, 'POST', `/api/v1/admin/content/${tid}/submit`, { type: 'glossary', note: 'ตรวจนิยามแล้ว' })).status === 200);
  const approveIncomplete = await api(reviewer, 'POST', `/api/v1/admin/content/${tid}/decision`, { type: 'glossary', decision: 'approve', checklist: ['factsMatchLaw'] });
  ok('approving with an incomplete checklist is refused', approveIncomplete.status === 400);
  const selfApprove = await api(editor, 'POST', `/api/v1/admin/content/${tid}/decision`, { type: 'glossary', decision: 'approve', checklist });
  ok('an editor cannot approve (reviewer role needed)', selfApprove.status === 403);
  const approved = await api(reviewer, 'POST', `/api/v1/admin/content/${tid}/decision`, { type: 'glossary', decision: 'approve', comment: 'ตรงกับตัวบท', checklist });
  ok('the reviewer approves the term', approved.status === 200, approved.text);
  const retired = await api(reviewer, 'POST', `/api/v1/admin/content/${tid}/submit`, { type: 'review_rule' });
  ok('the removed review_rule type is no longer accepted', retired.status === 400, retired.text);
}

console.log(JSON.stringify({ ok: true, phase: PHASE, checks: results.length }));
await browser.close();
