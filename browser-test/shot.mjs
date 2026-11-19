// Screenshots of the Token Radar dashboard (1440x900): the board, a detail
// view and a filtered view. Serves the built out/ directory over localhost
// and captures the real page with headless Chromium (playwright-core).
// Usage: CHROME_PATH=<headless_shell|chrome> node shot.mjs [outDir]
// Writes 1-board.png, 2-detail.png, 3-filtered.png into <repo>/screenshots/.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '/home/hatch/workspace/makefun/token-radar-01');
const outDir = join(repo, 'out');
const shotsDir = join(repo, 'screenshots');
const exe = process.env.CHROME_PATH;
if (!exe || !existsSync(exe)) {
  console.error(`shot: no browser at CHROME_PATH=${exe ?? '(unset)'}: install Chromium first`);
  process.exit(2);
}

const server = spawn('python3', ['-m', 'http.server', '8123', '--directory', outDir], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const base = 'http://127.0.0.1:8123/dashboard/';

let browser;
try {
  browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error('page console error:', m.text()); });
  page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));

  // 1. The board, top of the page.
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shotsDir, '1-board.png') });

  // 2. Detail view: the top FARM row's dialog (best net of fees).
  const rows = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8')).rows;
  const topFarm = rows.filter((r) => r.verdict === 'FARM').sort((a, b) => b.net_usd - a.net_usd)[0];
  await page.goto(base + '#p=' + topFarm.slug, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shotsDir, '2-detail.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 3. Filtered view: the Farm verdict filter in the filter control itself.
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('button.pill', { hasText: 'Farm' }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shotsDir, '3-filtered.png') });

  for (const f of ['1-board.png', '2-detail.png', '3-filtered.png']) {
    const p = join(shotsDir, f);
    console.log(f, statSync(p).size, 'bytes');
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log('shot: done');
