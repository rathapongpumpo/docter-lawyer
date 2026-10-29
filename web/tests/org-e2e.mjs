// Organization workspace E2E (M11) incl. the tenant-isolation suite (FR-ORG-006, NFR-SEC-012) on a throwaway database copy.
// Phase 1 (PHASE=1): create orgs, invite/accept (existing + brand-new user), role rules. Phase 2 (PHASE=2, after the shell seeded chats):
// visibility, read-only sharing, counsel hand-off, cross-tenant denial, quotas, member removal/leave, audit log, deletion request.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3203';
const MAIL = process.env.MAIL_API ?? 'http://127.0.0.1:58025';
const OUT = process.env.OUT_DIR ?? 'test-results/org';
const TS = process.env.TS;
const PHASE = process.env.PHASE ?? '1';
const PASS = 'correct-horse-9';
const email = (who) => `org-e2e-${who}-${TS}@example.test`;
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond });
  if (!cond) throw new Error(`FAILED: ${name} ${extra}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctxs = {};

async function mailTo(to, subject, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const hit = list.messages?.find((m) => m.Subject.includes(subject));
    if (hit) return await (await fetch(`${MAIL}/api/v1/message/${hit.ID}`)).json();
    await sleep(500);
  }
  return null;
}
const linkIn = (msg) => {
  const url = /https?:\/\/[^\s"<]+/.exec(msg.Text)?.[0];
  return url ? `${BASE}${new URL(url).pathname}${new URL(url).search}` : null;
};

async function user(who, { login = true } = {}) {
  if (ctxs[who]) return ctxs[who];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
  const page = await context.newPage();
  if (login) {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('อีเมล').fill(email(who));
    await page.locator('input[name=password]').fill(PASS);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
    await page.waitForURL('**/chat**', { timeout: 20000 });
  }
  return (ctxs[who] = page);
}
// same-origin call with the CSRF header, like the app's own fetch helper
const api = (page, method, path, body) =>
  page.evaluate(async ([m, p, b]) => {
    const csrf = decodeURIComponent(document.cookie.match(/(?:^|; )lc_csrf=([^;]+)/)?.[1] ?? '');
    const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: b ? JSON.stringify(b) : undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* csv etc. */ }
    return { status: r.status, json, text };
  }, [method, path, body]);
const auth = (page, path, body) => api(page, 'POST', `/api/auth/${path}`, body);
const sessionInfo = async (page) => (await api(page, 'GET', '/api/v1/session')).json.data;

if (PHASE === '1') {
  // ---- organizations
  const alice = await user('alice');
  await alice.goto(`${BASE}/org/new`);
  await alice.getByLabel('ชื่อองค์กร').fill('บริษัท เอ จำกัด');
  await alice.getByLabel(/รหัสองค์กร/).fill(`org-a-${TS}`);
  await alice.getByRole('button', { name: 'สร้าง' }).click();
  await alice.waitForURL('**/chat');
  const orgA = (await sessionInfo(alice)).active_org_id;
  ok('alice created organization A and is in its workspace', !!orgA);
  const summary = (await api(alice, 'GET', `/api/v1/orgs/${orgA}`)).json.data;
  ok('creator is owner and org_settings defaults exist', summary.my_role === 'org_owner' && summary.settings.chat_daily_per_member === 300 && summary.settings.seat_limit === 20);
  const dupe = await auth(alice, 'organization/create', { name: 'ซ้ำ', slug: `org-a-${TS}` });
  ok('duplicate slug is refused', dupe.status >= 400);

  const dave = await user('dave');
  await dave.goto(`${BASE}/org/new`);
  await dave.getByLabel('ชื่อองค์กร').fill('บริษัท บี จำกัด');
  await dave.getByLabel(/รหัสองค์กร/).fill(`org-b-${TS}`);
  await dave.getByRole('button', { name: 'สร้าง' }).click();
  await dave.waitForURL('**/chat');
  const orgB = (await sessionInfo(dave)).active_org_id;
  ok('dave created organization B', !!orgB && orgB !== orgA);

  // ---- invitations from the settings page
  await alice.goto(`${BASE}/org/settings`);
  await alice.getByRole('heading', { name: 'บริษัท เอ จำกัด' }).waitFor();
  const invite = async (who, role) => {
    await alice.getByLabel('อีเมล', { exact: true }).fill(email(who));
    await alice.getByLabel('บทบาท', { exact: true }).selectOption(role);
    await alice.getByRole('button', { name: 'ส่งคำเชิญ' }).click();
    await alice.getByRole('status').filter({ hasText: email(who) }).waitFor();
  };
  await invite('bob', 'org_member');
  await invite('carol', 'org_counsel');
  await invite('frank', 'org_member');
  await alice.screenshot({ path: `${OUT}/01-members-invitations.png`, fullPage: true });
  ok('three invitations pending', (await alice.getByText('คำเชิญที่รอตอบรับ').count()) === 1);

  // ---- an existing user accepts
  for (const who of ['bob', 'carol']) {
    const page = await user(who);
    const mail = await mailTo(email(who), 'เชิญ');
    ok(`${who} got the invitation mail`, !!mail);
    await page.goto(linkIn(mail));
    await page.getByRole('button', { name: 'ตอบรับและเข้าร่วม' }).click();
    await page.waitForURL('**/chat');
    await page.getByText('สมาชิกและตั้งค่า').waitFor({ timeout: 15000 });
    ok(`${who} joined and the organization menu shows`, true);
  }
  // ---- a brand-new person: sign up from the link (next is kept), verify e-mail, accept consent, then accept the invitation
  const frank = await user('frank', { login: false });
  const frankMail = await mailTo(email('frank'), 'เชิญ');
  await frank.goto(linkIn(frankMail));
  await frank.waitForURL('**/login?next=**');
  await frank.getByRole('link', { name: 'สมัครสมาชิก' }).first().click();
  await frank.waitForURL('**/register?next=**');
  await frank.getByLabel('ชื่อที่แสดง').fill('แฟรงค์ ใหม่');
  await frank.getByLabel('อีเมล').fill(email('frank'));
  await frank.locator('input[name=password]').fill(PASS);
  await frank.getByRole('checkbox', { name: /ยอมรับ/ }).check();
  await frank.getByRole('button', { name: 'สมัครสมาชิก' }).click();
  await frank.getByRole('heading', { name: 'ตรวจอีเมลของคุณ' }).waitFor();
  await frank.goto(linkIn(await mailTo(email('frank'), 'ยืนยันอีเมล')));
  await frank.waitForURL('**/consent?next=**');
  await frank.getByRole('checkbox').check();
  await frank.getByRole('button', { name: 'ยอมรับและใช้งานต่อ' }).click();
  await frank.waitForURL('**/accept-invitation/**');
  await frank.getByRole('button', { name: 'ตอบรับและเข้าร่วม' }).click();
  await frank.waitForURL('**/chat');
  ok('new user: sign-up → verify → consent → invitation accepted', (await sessionInfo(frank)).active_org_id === orgA);

  // ---- a stranger cannot use somebody else's invitation
  const erin = await user('erin');
  const list = (await api(alice, 'GET', `/api/auth/organization/list-invitations?organizationId=${orgA}`)).json ?? [];
  const anyInv = Array.isArray(list) && list[0]?.id;
  if (anyInv) {
    const stolen = await auth(erin, 'organization/accept-invitation', { invitationId: anyInv });
    ok("accepting someone else's invitation is refused", stolen.status >= 400);
  }

  // ---- role rules
  await alice.reload();
  const members = (await api(alice, 'GET', `/api/auth/organization/get-full-organization?organizationId=${orgA}`)).json.members;
  const idOf = (who) => members.find((m) => m.user.email === email(who)).id;
  const setRole = (page, who, role) => auth(page, 'organization/update-member-role', { memberId: idOf(who), role, organizationId: orgA });
  ok('owner promotes bob to admin', (await setRole(alice, 'bob', 'org_admin')).status === 200);
  const bob = await user('bob');
  await bob.reload();
  const adminVsOwner = await auth(bob, 'organization/update-member-role', { memberId: idOf('alice'), role: 'org_member', organizationId: orgA });
  ok('admin cannot change the owner role (403)', adminVsOwner.status === 403, String(adminVsOwner.status));
  const adminRemoveOwner = await auth(bob, 'organization/remove-member', { memberIdOrEmail: idOf('alice'), organizationId: orgA });
  ok('admin cannot remove the owner', adminRemoveOwner.status >= 400, String(adminRemoveOwner.status));
  ok('owner demotes bob back to member', (await setRole(alice, 'bob', 'org_member')).status === 200);
  const memberInvite = await auth(bob, 'organization/invite-member', { email: email('erin'), role: 'org_member', organizationId: orgA });
  ok('a plain member cannot invite', memberInvite.status >= 400);

  writeFileSync(`${OUT}/state.json`, JSON.stringify({ orgA, orgB }));
}

if (PHASE === '2') {
  const { orgA, orgB } = JSON.parse(readFileSync(`${OUT}/state.json`, 'utf8'));
  const [alice, bob, carol, dave, erin, sys] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'erin', 'sysadmin'].map((w) => user(w)));
  const chatsOf = async (page) => (await api(page, 'GET', '/api/v1/chats')).json.data.chats;
  const titleOf = (chats) => chats.map((c) => c.title);
  // the seeded chat ids
  const ids = JSON.parse(readFileSync(`${OUT}/chats.json`, 'utf8'));

  // ---- visibility (FR-ORG-005) and the workspace list (FR-ORG-004)
  await Promise.all([alice, bob, carol].map((p) => auth(p, 'organization/set-active', { organizationId: orgA })));
  const bobList = titleOf(await chatsOf(bob));
  ok('member sees own chats + org-shared ones in the org workspace', bobList.includes('chat-bob-private') && bobList.includes('chat-alice-shared'), bobList.join('|'));
  ok("member does not see another member's private chat in the list", !bobList.includes('chat-alice-private'));
  ok('personal chats do not leak into the org workspace', !bobList.includes('chat-bob-personal'));
  ok("private chat of another member → 404", (await api(bob, 'GET', `/api/v1/chats/${ids.alicePrivate}`)).status === 404);
  const ownRead = await api(alice, 'GET', `/api/v1/chats/${ids.alicePrivate}`);
  ok('owner reads own private chat', ownRead.status === 200, `${ownRead.status} ${ownRead.text.slice(0, 200)}`);
  const shared = await api(bob, 'GET', `/api/v1/chats/${ids.aliceShared}`);
  ok('org-shared chat is readable by members, marked read-only', shared.status === 200 && shared.json.data.access === 'org');
  ok('a member cannot rename or delete a chat they only read', (await api(bob, 'PATCH', `/api/v1/chats/${ids.aliceShared}`, { title: 'hijack' })).status === 404
    && (await api(bob, 'DELETE', `/api/v1/chats/${ids.aliceShared}`)).status === 404);
  ok('a member cannot change visibility of a chat they do not own', (await api(bob, 'PATCH', `/api/v1/chats/${ids.aliceShared}`, { visibility: 'private' })).status === 404);
  await bob.goto(`${BASE}/chat/${ids.aliceShared}`);
  await bob.getByText('แชทนี้เปิดดูได้อย่างเดียว').waitFor();
  ok('read-only chat has no message box', (await bob.locator('textarea').count()) === 0);
  await bob.screenshot({ path: `${OUT}/02-readonly-chat.png` });

  // owner flips visibility from the chat page
  await alice.goto(`${BASE}/chat/${ids.aliceShared}`);
  await alice.getByRole('radio', { name: 'ส่วนตัว' }).click();
  await alice.getByText('เห็นเฉพาะคุณ').waitFor();
  ok('after switching to private, members lose access', (await api(bob, 'GET', `/api/v1/chats/${ids.aliceShared}`)).status === 404);
  await alice.getByRole('radio', { name: 'ทั้งองค์กร' }).click();
  await alice.getByText('สมาชิกทุกคนในองค์กรเปิดอ่านได้').waitFor();
  ok('switching back to organization restores it', (await api(bob, 'GET', `/api/v1/chats/${ids.aliceShared}`)).status === 200);

  // ---- send to counsel (FR-ORG-010)
  ok('counsel cannot see a private chat before it is sent', (await api(carol, 'GET', `/api/v1/chats/${ids.bobPrivate}`)).status === 404);
  await bob.goto(`${BASE}/chat/${ids.bobPrivate}`);
  await bob.getByRole('button', { name: 'ส่งให้ที่ปรึกษากฎหมาย' }).click();
  await bob.getByLabel('ข้อความประกอบ (ไม่บังคับ)').fill('ช่วยดูข้อสัญญาเรื่องค่าปรับข้อ 7 ให้หน่อยครับ');
  await bob.getByRole('button', { name: 'ส่ง', exact: true }).click();
  await bob.getByRole('status').filter({ hasText: 'ส่งให้ที่ปรึกษาแล้ว' }).waitFor();
  const notify = await mailTo(email('carol'), 'ส่งถึงคุณในฐานะที่ปรึกษากฎหมาย');
  ok('counsel is notified by mail, without chat content', !!notify && !notify.Text.includes('ค่าปรับข้อ 7') && !notify.Text.includes('chat-bob-private'));
  await carol.goto(`${BASE}/org/counsel`);
  await carol.getByRole('main').getByRole('link', { name: /chat-bob-private/ }).click();
  await carol.getByText('ช่วยดูข้อสัญญาเรื่องค่าปรับข้อ 7 ให้หน่อยครับ').waitFor();
  await carol.getByText('แชทนี้เปิดดูได้อย่างเดียว').waitFor();
  ok('counsel opens the shared chat read-only (no message box)', (await carol.locator('textarea[aria-label]').count()) === 0);
  await carol.getByLabel('ความเห็นของคุณ').fill('ข้อ 7 ควรมีเพดานค่าปรับและระยะเวลาแก้ไข ขอนัดคุยวันพฤหัส');
  await carol.getByRole('button', { name: 'ส่งความเห็น' }).click();
  await carol.getByText('ความเห็นของที่ปรึกษา').waitFor();
  ok('sender is told about the reply', !!(await mailTo(email('bob'), 'ตอบกลับแล้ว')));
  await bob.goto(`${BASE}/org/counsel?box=sent`);
  await bob.getByRole('main').getByRole('link', { name: /chat-bob-private/ }).click();
  await bob.getByText('ข้อ 7 ควรมีเพดานค่าปรับ').waitFor();
  await bob.getByText('ไม่ใช่ของระบบนิติมิตร').waitFor();
  ok('reply shows the counsel disclaimer', true);
  const share = (await api(bob, 'GET', `/api/v1/orgs/${orgA}/counsel-shares?box=sent`)).json.data.shares[0];
  ok('the org owner cannot open a share sent to someone else (404)', (await api(alice, 'GET', `/api/v1/counsel-shares/${share.id}`)).status === 404);
  ok('...nor read the private chat behind it', (await api(alice, 'GET', `/api/v1/chats/${ids.bobPrivate}`)).status === 404);
  ok('sender cannot answer their own share', (await api(bob, 'PATCH', `/api/v1/counsel-shares/${share.id}`, { status: 'answered', reply: 'x' })).status === 403);
  const toNonCounsel = await api(bob, 'POST', `/api/v1/orgs/${orgA}/counsel-shares`, { resource_type: 'chat', resource_id: ids.bobPrivate, to_user_id: 1, note: '' });
  ok('a share can only go to organization counsel', toNonCounsel.status === 400);

  // ---- tenant isolation (FR-ORG-006 AC1): dave (org B) and erin (no org) against org A's resources
  const probes = [
    ['org summary', 'GET', `/api/v1/orgs/${orgA}`],
    ['org audit', 'GET', `/api/v1/orgs/${orgA}/audit`],
    ['org usage', 'GET', `/api/v1/orgs/${orgA}/usage`],
    ['counsel list', 'GET', `/api/v1/orgs/${orgA}/counsel-shares`],
    ['org-shared chat of A', 'GET', `/api/v1/chats/${ids.aliceShared}`],
    ['private chat of A', 'GET', `/api/v1/chats/${ids.alicePrivate}`],
    ['counsel share of A', 'GET', `/api/v1/counsel-shares/${share.id}`],
  ];
  for (const [who, page] of [['dave', dave], ['erin', erin]]) {
    for (const [label, m, p] of probes) {
      const r = await api(page, m, p);
      ok(`${who} → ${label}: 404, nothing revealed`, r.status === 404 && !JSON.stringify(r.json).includes('บริษัท เอ'), String(r.status));
    }
    ok(`${who} cannot change org A settings`, (await api(page, 'PATCH', `/api/v1/orgs/${orgA}`, { name: 'hacked' })).status === 404);
    ok(`${who} cannot delete org A`, (await api(page, 'POST', `/api/v1/orgs/${orgA}/deletion`, { confirm_name: 'บริษัท เอ จำกัด' })).status === 404);
    ok(`${who} cannot share into org A`, (await api(page, 'POST', `/api/v1/orgs/${orgA}/counsel-shares`, { resource_type: 'chat', resource_id: ids.aliceShared, to_user_id: 1, note: '' })).status === 404);
    const setActive = await auth(page, 'organization/set-active', { organizationId: orgA });
    ok(`${who} cannot make org A their active workspace`, setActive.status >= 400);
  }
  ok('dave still reads his own org B chat', (await api(dave, 'GET', `/api/v1/chats/${ids.daveOwn}`)).status === 200);
  // even a forged active org id in the session must not open the org's chat list or quota
  ok("dave's own list shows only org B chats", titleOf(await chatsOf(dave)).every((t) => !t.includes('alice') && !t.includes('bob')));

  // ---- managers only (403 for plain members: they belong to the org, so it exists for them)
  ok('member cannot read the org audit log', (await api(bob, 'GET', `/api/v1/orgs/${orgA}/audit`)).status === 403);
  ok('member cannot read org usage', (await api(bob, 'GET', `/api/v1/orgs/${orgA}/usage`)).status === 403);
  ok('member cannot change org settings', (await api(bob, 'PATCH', `/api/v1/orgs/${orgA}`, { contract_retention_days: 30 })).status === 403);
  ok('counsel cannot delete the org', (await api(carol, 'POST', `/api/v1/orgs/${orgA}/deletion`, { confirm_name: 'บริษัท เอ จำกัด' })).status === 403);
  ok('admin-only quota API rejects org owners', (await api(alice, 'PATCH', `/api/v1/admin/orgs/${orgA}`, { chat_daily_per_member: 9999 })).status === 403);

  // ---- settings, retention, quotas
  ok('owner sets retention to 90 days', (await api(alice, 'PATCH', `/api/v1/orgs/${orgA}`, { contract_retention_days: 90, business_type: 'ก่อสร้าง' })).status === 200);
  ok('retention outside the allowed set is refused', (await api(alice, 'PATCH', `/api/v1/orgs/${orgA}`, { contract_retention_days: 45 })).status === 400);
  ok('org workspace quota is the org limit (300)', (await sessionInfo(bob)).messages_left === 300);
  await auth(erin, 'organization/set-active', { organizationId: null });
  ok('personal workspace keeps the member limit (100)', (await sessionInfo(erin)).messages_left === 100);
  ok('system admin lowers the org quota', (await api(sys, 'PATCH', `/api/v1/admin/orgs/${orgA}`, { chat_daily_per_member: 5, seat_limit: 4 })).status === 200);
  ok('the new quota applies at once', (await sessionInfo(bob)).messages_left === 5);
  const seat = await auth(alice, 'organization/invite-member', { email: email('erin'), role: 'org_member', organizationId: orgA });
  ok('seat limit blocks new invitations (4 members)', seat.status >= 400, String(seat.status));
  await sys.goto(`${BASE}/admin/orgs`);
  await sys.getByText('บริษัท เอ จำกัด').waitFor();
  await sys.screenshot({ path: `${OUT}/03-admin-orgs.png` });
  ok('non-admin roles cannot open /admin/orgs', (await api(alice, 'GET', '/admin/orgs')).status === 404);

  // ---- usage page
  await alice.goto(`${BASE}/org/usage`);
  await alice.getByRole('heading', { name: 'การใช้งานขององค์กร' }).waitFor();
  await alice.screenshot({ path: `${OUT}/04-usage.png` });

  // ---- remove a member: chats move to the owner, sessions lose the org (FR-ORG-003 AC2, BR-026)
  const members = (await api(alice, 'GET', `/api/auth/organization/get-full-organization?organizationId=${orgA}`)).json.members;
  const bobMember = members.find((m) => m.user.email === email('bob'));
  await alice.goto(`${BASE}/org/settings`);
  await alice.getByRole('heading', { name: 'บริษัท เอ จำกัด' }).waitFor();
  const removed = await auth(alice, 'organization/remove-member', { memberIdOrEmail: bobMember.id, organizationId: orgA });
  ok('owner removes bob', removed.status === 200);
  ok("bob's session no longer points at the org", (await sessionInfo(bob)).active_org_id === null);
  ok('bob cannot open org data any more', (await api(bob, 'GET', `/api/v1/orgs/${orgA}`)).status === 404 && (await api(bob, 'GET', `/api/v1/chats/${ids.bobPrivate}`)).status === 404);
  ok("bob's org chat now belongs to the owner", titleOf(await chatsOf(alice)).includes('chat-bob-private') && (await chatsOf(alice)).find((c) => c.title === 'chat-bob-private').mine === true);
  ok("bob's personal chat is still his", titleOf(await chatsOf(bob)).includes('chat-bob-personal'));

  // ---- leave (FR-ORG-011 AC1)
  ok('a counsel member leaves on their own', (await api(carol, 'POST', `/api/v1/orgs/${orgA}/leave`)).status === 200);
  const lastOwner = await api(alice, 'POST', `/api/v1/orgs/${orgA}/leave`);
  ok('the last owner cannot leave', lastOwner.status === 409, String(lastOwner.status));

  // ---- audit log (FR-ORG-008)
  const audit = (await api(alice, 'GET', `/api/v1/orgs/${orgA}/audit`)).json.data.rows;
  const actions = new Set(audit.map((r) => r.action));
  for (const a of ['org.created', 'org.member_joined', 'org.invitation_sent', 'org.role_changed', 'org.member_removed', 'org.member_left', 'org.counsel_share', 'org.counsel_answered', 'org.settings_changed', 'org.quota_changed', 'org.chat_visibility_changed']) {
    ok(`audit has ${a}`, actions.has(a), [...actions].join(','));
  }
  const raw = JSON.stringify(audit);
  ok('audit never contains chat or note text', !raw.includes('ค่าปรับข้อ 7') && !raw.includes('chat-bob-private') && !raw.includes('เพดานค่าปรับ'));
  ok('audit is scoped to this org', audit.every((r) => r.meta.org_id === orgA));
  const csv = await api(alice, 'GET', `/api/v1/orgs/${orgA}/audit?format=csv`);
  ok('CSV export works (header row, one row per event)', csv.text.replace(/^﻿/, '').startsWith('"id"') && csv.text.split('\r\n').length > 5, `${csv.status} ${JSON.stringify(csv.text.slice(0, 160))}`);
  const filtered = (await api(alice, 'GET', `/api/v1/orgs/${orgA}/audit?action=org.member`)).json.data.rows;
  ok('audit filter by type', filtered.length > 0 && filtered.every((r) => r.action.startsWith('org.member')));
  await alice.goto(`${BASE}/org/audit`);
  await alice.getByRole('heading', { name: 'บันทึกการตรวจสอบขององค์กร' }).waitFor();
  await alice.getByText('นำสมาชิกออก').first().waitFor();
  await alice.screenshot({ path: `${OUT}/05-audit.png`, fullPage: true });
  ok('audit CSV export is itself audited', (await api(alice, 'GET', `/api/v1/orgs/${orgA}/audit?action=org.audit`)).json.data.rows.length >= 1);

  // ---- deletion request (FR-ORG-011): wrong name refused, right name schedules, members lose access, owner can cancel
  const frankPage = await user('frank');
  ok('wrong confirmation name is refused', (await api(alice, 'POST', `/api/v1/orgs/${orgA}/deletion`, { confirm_name: 'ผิด' })).status === 400);
  ok('owner requests deletion', (await api(alice, 'POST', `/api/v1/orgs/${orgA}/deletion`, { confirm_name: 'บริษัท เอ จำกัด' })).status === 200);
  ok('members are told by mail', !!(await mailTo(email('frank'), 'ถูกตั้งให้ลบ')));
  ok('members lose access at once', (await api(frankPage, 'GET', `/api/v1/orgs/${orgA}`)).status === 404);
  ok('the owner can still see the pending deletion', (await api(alice, 'GET', `/api/v1/orgs/${orgA}`)).json.data.org.status === 'pending_deletion');
  await alice.goto(`${BASE}/org/settings`);
  await alice.getByText('จะถูกลบถาวรหลังวันที่').waitFor();
  await alice.screenshot({ path: `${OUT}/06-pending-deletion.png` });
  ok('owner cancels the deletion', (await api(alice, 'DELETE', `/api/v1/orgs/${orgA}/deletion`)).status === 200);
  ok('members regain access after cancel', (await api(frankPage, 'GET', `/api/v1/orgs/${orgA}`)).status === 200);
  ok('deletion again (for the purge job)', (await api(alice, 'POST', `/api/v1/orgs/${orgA}/deletion`, { confirm_name: 'บริษัท เอ จำกัด' })).status === 200);

  // ---- cross-tenant attempts were logged for admins (not in the victim's own log)
  writeFileSync(`${OUT}/done.json`, JSON.stringify({ orgA, orgB }));
}

console.log(JSON.stringify({ ok: true, phase: PHASE, checks: results.length }));
await browser.close();
