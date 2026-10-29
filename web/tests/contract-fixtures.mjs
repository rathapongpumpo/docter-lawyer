// Builds the PDF fixtures for the contract E2E with Chromium: a Thai contract with a real text layer, and an image-only "scan".
import { chromium } from '@playwright/test';

const out = process.env.FIXTURE_DIR ?? 'test-results/contracts/fixtures';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${process.cwd()}/tests/fixtures/contract.html`);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: `${out}/contract.pdf`, format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
await page.goto(`file://${process.cwd()}/tests/fixtures/scan.html`);
await page.pdf({ path: `${out}/scan.pdf`, width: '600px', height: '800px', printBackground: true });
await browser.close();
console.log('fixtures written');
