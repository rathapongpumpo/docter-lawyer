// Accessibility scan (axe-core, WCAG 2.1 A/AA) over the main screens in light and dark, desktop and 375px, Thai and English.
// Fails on any violation of impact serious/critical; lesser findings are printed. Run by scripts/e2e-a11y.sh.
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3210';
const TS = process.env.TS;
const PASS = 'correct-horse-9';
const browser = await chromium.launch();
const PAGES = [
  ['/login', 'none'], ['/register', 'none'],
  ['/chat', 'member'], ['/library', 'member'], ['/library/CONTRACT', 'member'], ['/library/search?q=%E0%B9%80%E0%B8%A5%E0%B8%B4%E0%B8%81%E0%B8%AA%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B2', 'member'],
  ['/library/glossary', 'member'], ['/law', 'member'], ['/law/ccc', 'member'], ['/law/ccc/383', 'member'], ['/library/articles/late-delivery-penalty', 'member'],
  ['/guides', 'member'], ['/guides/notice-to-cure-then-terminate', 'member'], ['/templates', 'member'], ['/templates/notice-to-cure', 'member'],
  ['/manual', 'member'], ['/manual/member', 'member'],
  ['/saved', 'member'], ['/settings', 'member'], ['/contracts', 'member'],
  ['/admin', 'admin'], ['/admin/review', 'admin'], ['/admin/users', 'admin'], ['/admin/audit', 'admin'], ['/admin/dsr', 'admin'], ['/admin/feedback', 'admin'],
  ['/admin/guardrails', 'admin'], ['/admin/usage', 'admin'], ['/admin/announcement', 'admin'], ['/admin/content', 'admin'], ['/admin/laws', 'admin'], ['/admin/system', 'admin'], ['/admin/orgs', 'admin'],
];
async function login(who, viewport, colorScheme, locale) {
  const context = await browser.newContext({ viewport, locale: 'th-TH', colorScheme });
  const page = await context.newPage();
  if (who !== 'none') {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('อีเมล').fill(`a11y-e2e-${who}-${TS}@example.test`);
    await page.locator('input[name=password]').fill(PASS);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
    await page.waitForURL('**/chat**', { timeout: 20000 });
  }
  if (locale === 'en') await context.addCookies([{ name: process.env.LOCALE_COOKIE ?? 'lc_locale', value: 'en', url: BASE }]);
  return page;
}
const configs = [
  { name: 'desktop-light-th', viewport: { width: 1360, height: 900 }, scheme: 'light', locale: 'th' },
  { name: 'desktop-dark-th', viewport: { width: 1360, height: 900 }, scheme: 'dark', locale: 'th' },
  { name: 'mobile-light-th', viewport: { width: 375, height: 800 }, scheme: 'light', locale: 'th' },
  { name: 'desktop-light-en', viewport: { width: 1360, height: 900 }, scheme: 'light', locale: 'en' },
];
const report = [];
let bad = 0;
for (const cfg of configs) {
  const pages = { none: await login('none', cfg.viewport, cfg.scheme, cfg.locale), member: await login('member', cfg.viewport, cfg.scheme, cfg.locale), admin: await login('admin', cfg.viewport, cfg.scheme, cfg.locale) };
  for (const [path, who] of PAGES) {
    const page = pages[who];
    const res = await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    if (path === '/templates/notice-to-cure') await page.getByRole('heading', { name: /ขั้นที่ 1|Step 1/ }).waitFor().catch(() => {});
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations) {
      const entry = { config: cfg.name, path, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 160), target: v.nodes[0]?.target?.join(' ') };
      report.push(entry);
      if (v.impact === 'serious' || v.impact === 'critical') bad++;
    }
    if (res && res.status() >= 400) report.push({ config: cfg.name, path, id: `http-${res.status()}` });
  }
  await Promise.all(Object.values(pages).map((p) => p.context().close()));
}
writeFileSync(process.env.OUT ?? 'test-results/a11y/report.json', JSON.stringify(report, null, 1));
const byRule = {};
for (const e of report) byRule[`${e.impact ?? '-'} ${e.id}`] = (byRule[`${e.impact ?? '-'} ${e.id}`] ?? 0) + 1;
console.log(JSON.stringify({ pages: PAGES.length * configs.length, findings: report.length, serious_or_critical: bad, byRule }, null, 1));
await browser.close();
if (bad) process.exit(1);
