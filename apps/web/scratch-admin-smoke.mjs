import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const SERVER_LOG = 'C:/Users/ibrah/AppData/Local/Temp/claude/c--Users-ibrah-aspire-bloods/3b035aa7-1ebb-425c-a3eb-bca526be5711/scratchpad/server.log';

function latestOtpCode() {
  const log = readFileSync(SERVER_LOG, 'utf8');
  const matches = [...log.matchAll(/verification code is (\d{6})/g)];
  return matches.at(-1)?.[1];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (err) => console.log('PAGEERROR', String(err)));

// login as admin
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.fill('input[name=email]', 'admin@aspireshield.dev');
await page.fill('input[name=password]', 'DevAdminPass123!');
await page.click('button[type=submit]');
await page.waitForSelector('text=verification code');
const code = latestOtpCode();
await page.fill('input[name=code]', code);
await page.click('button[type=submit]');
await page.waitForSelector('text=Welcome');

console.log('after otp, url=', page.url());

// go to admin reports list directly
await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
console.log('after goto /admin, url=', page.url());
await page.screenshot({ path: 'scratch-admin-1-list.png', fullPage: true });

// open the UPLOADED report (second one created) - find row with status "UPLOADED"
try {
  await page.click('text=UPLOADED', { timeout: 10000 });
  await page.waitForSelector('text=Parse PDF', { timeout: 10000 });
  await page.screenshot({ path: 'scratch-admin-2-uploaded.png', fullPage: true });

  await page.click('text=Parse PDF');
  await page.waitForSelector('text=Verify extracted results', { timeout: 10000 });
  await page.screenshot({ path: 'scratch-admin-3-verify-table.png', fullPage: true });
} catch (e) {
  console.log('STEP FAILED:', String(e));
  await page.screenshot({ path: 'scratch-admin-error.png', fullPage: true });
}

await browser.close();
