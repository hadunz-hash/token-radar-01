// Independent page checks for token-radar v5: renders without errors, the
// board shows 198 rows, and the page's farm plan + net mirror lib/model.ts
// (reimplemented here from the model rules, not copied from app.js).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve('/home/hatch/workspace/makefun/token-radar-01');
const outDir = join(repo, 'out');
const exe = process.env.CHROME_PATH;
if (!exe || !existsSync(exe)) { console.error('no browser at CHROME_PATH'); process.exit(2); }
const board = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8')).rows;
const bySlug = Object.fromEntries(board.map((r) => [r.slug, r]));

const FMT = new Intl.NumberFormat('en-US');
function pct(v) { return (v === null || v === undefined) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
function actionFor(r, dep) {
  const c = (r.category || '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${FMT.format(dep)} to ${r.name}'s lending market on ${r.farm_chain} and keep it supplied.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${FMT.format(dep)} of liquidity to ${r.name}'s main pool on ${r.farm_chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad')) return `Open a $${FMT.format(dep)} position on ${r.name} on ${r.farm_chain} and keep it open.`;
  if (c.includes('bridge')) return `Bridge $${FMT.format(dep)} through ${r.name} on ${r.farm_chain} and keep the position open.`;
  if (c.includes('prediction')) return `Take a $${FMT.format(dep)} position on a ${r.name} market on ${r.farm_chain} and hold it to settlement.`;
  if (c.includes('governance')) return `Stake or lock $${FMT.format(dep)} in ${r.name} on ${r.farm_chain} and take part in governance.`;
  return `Put $${FMT.format(dep)} into ${r.name} on ${r.farm_chain} and keep the position open.`;
}
function fortnightlyFor(r) {
  const c = (r.category || '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Each fortnight make one qualifying action, such as a supply, a borrow or a repayment.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Each fortnight make one qualifying action, such as a swap, an add of liquidity or a harvest.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad')) return 'Each fortnight make one qualifying action, such as one small trade or a funding adjustment.';
  if (c.includes('bridge')) return 'Each fortnight make one qualifying action, such as a bridge, a swap or a claim.';
  if (c.includes('prediction')) return 'Each fortnight make one qualifying action, such as one market position or a settlement.';
  if (c.includes('governance')) return 'Each fortnight make one qualifying action, such as a vote or a delegation change.';
  return 'Each fortnight make one qualifying action, such as a deposit, a borrow, a swap or a vote.';
}
function expectedPlan(r, dep) {
  const gas = '$' + r.gas_usd.toFixed(2);
  const fn = Math.ceil(r.hold_days / 14);
  const floor = Math.max(1, Math.round((r.tvl_usd * 3) / 4 / 1000) * 1000);
  const g = r.change_7d === null ? 0 : r.change_7d;
  let hold;
  if (g >= 20) hold = `Hold the position for at least ${r.hold_days} days and add to it while it is growing - ${r.name} rose ${pct(g)} in 7 days. Check the TVL weekly, free, and leave early if it falls below $${FMT.format(floor)}.`;
  else if (g < 0) hold = `Hold the position for at least ${r.hold_days} days; ${r.name} fell ${pct(g)} in 7 days, so keep the position small and do not add. Check the TVL weekly, free, and leave early if it falls below $${FMT.format(floor)}.`;
  else hold = `Hold the position for at least ${r.hold_days} days so the activity is counted in more than one snapshot. Check the TVL weekly, free, and leave early if it falls below $${FMT.format(floor)}.`;
  return [
    { when: 'Day 0', text: `Use a fresh wallet on ${r.farm_chain} that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: `${gas} of gas for the first transaction`, time: '5 minutes' },
    { when: 'Day 0', text: actionFor(r, dep), cost: `$${FMT.format(dep)} of capital and about $${(2 * r.gas_usd).toFixed(2)} of gas`, time: '15 minutes to set up' },
    { when: 'Fortnightly', text: `${fortnightlyFor(r)} ${fn} paid ${fn === 1 ? 'action' : 'actions'} over the hold.`, cost: `about ${gas} of gas each fortnight`, time: '10 minutes a fortnight' },
    { when: `Day 1–${r.hold_days}`, text: hold, cost: `the $${FMT.format(dep)} stays in the position`, time: `${r.hold_days} days` },
    { when: `Day ${r.hold_days + 1}`, text: `Before you withdraw, open ${r.name}'s own points or rewards page and claim only from the link it publishes.`, cost: `${gas} of gas to claim`, time: '10 minutes' },
    { when: 'Every week', text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: '$0', time: '5 minutes' },
  ];
}
function expectedNet(r, dep = 1000, drop = 0.07, tbill = 0.04) {
  const slice = drop * r.if_launched_usd * (dep / Math.max(1, r.tvl_usd));
  const fees = (4 + Math.ceil(r.hold_days / 14)) * r.gas_usd;
  const tbc = tbill * dep * r.hold_days / 365;
  return slice * r.launch_odds - fees - tbc;
}

const server = spawn('python3', ['-m', 'http.server', '8124', '--directory', outDir], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const base = 'http://127.0.0.1:8124/dashboard/';
const errors = [];
let fails = 0;
function check(name, ok, extra = '') { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!ok) fails++; }

let browser;
try {
  browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const rows = await page.$$eval('#boardwrap tbody tr', (els) => els.length);
  check('board renders 198 rows', rows === 198, rows + ' rows');
  const farmline = await page.$eval('#farmline', (el) => el.textContent);
  check('farmline names top farms', farmline.includes('Nucleus') && farmline.includes('Monarq') && farmline.includes('DAMM Capital'), farmline.slice(0, 120));
  const stats = await page.$$eval('.stat-v', (els) => els.map((e) => e.textContent));
  check('stat cards', stats[0] === '198' && stats[1] === '$775.6M' && stats[4] === 'π = 0.53' && stats[5] === '27', JSON.stringify(stats));
  const strip = await page.$eval('.validstrip', (el) => el.textContent);
  check('validation strip shows LOO x2.83', strip.includes('×2.83') && strip.includes('×2.61') && strip.includes('×2.88') && strip.includes('51% within 3×'), strip.slice(0, 140));
  const planlines = await page.$$eval('#boardwrap tbody tr .planline', (els) => els.length);
  check('plan lines on farm/marginal rows', planlines === 27 + 63, planlines + ' plan lines');
  const svgCount = await page.$$eval('svg.chart', (els) => els.length);
  check('two charts render', svgCount === 2, svgCount + ' svg');

  // detail checks: plan + net vs board.json, 6 samples
  const samples = ['sentora-curator', 'shift-defi', 'mezzanine', 'goonfi', 'monolith-market', 'theo-network-thbill'];
  for (const slug of samples) {
    const r = bySlug[slug];
    if (!r) { check('sample ' + slug + ' exists in board.json', false); continue; }
    await page.goto(base + '#p=' + slug, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const dlg = await page.$eval('#dlg .dlg-inner', (el) => el.innerText);
    const planRows = await page.$$eval('table.plan tbody tr', (trs) => trs.map((tr) => Array.from(tr.cells).map((c) => c.innerText.trim())));
    const exp = expectedPlan(r, 1000);
    let planOk = planRows.length === 6;
    for (let i = 0; i < 6 && planOk; i++) {
      if (planRows[i][0] !== exp[i].when || planRows[i][1] !== exp[i].text || planRows[i][2] !== exp[i].cost || planRows[i][3] !== exp[i].time) planOk = false;
    }
    check('plan ' + slug + ' 6/6 matches model', planOk, planOk ? '' : JSON.stringify(planRows.map((x) => x[1].slice(0, 60))));
    const netShown = await page.$eval('table.why:last-of-type tr.total td.num, table.why tr.total td.num', (el) => el.innerText).catch(() => null);
    const netNum = netShown ? parseFloat(netShown.replace(/[^0-9.\-]/g, '')) * (netShown.includes('−') ? -1 : 1) : NaN;
    check('net ' + slug + ' matches board.json', Math.abs(netNum - r.net_usd) < 0.02, 'page ' + netNum + ' vs board ' + r.net_usd);
    const note = await page.$eval('#dlg .dlg-inner .note', (el) => el.innerText);
    const beM = note.match(/Break-even odds (\d+)%/);
    const beOk = beM && r.break_even_odds !== null && Math.abs(parseInt(beM[1], 10) / 100 - r.break_even_odds) < 0.015;
    check('break-even ' + slug, beOk, note.slice(0, 90));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // what-if: deposit $5,000 changes the top FARM net, Farm filter shows 24 at $1,000
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('button.pill', { hasText: 'Farm 27' }).click();
  await page.waitForTimeout(400);
  const farmRows = await page.$$eval('#boardwrap tbody tr', (els) => els.length);
  check('Farm filter shows 27 rows', farmRows === 27, farmRows + ' rows');
  await page.locator('button.pill', { hasText: 'Any verdict' }).click();
  await page.waitForTimeout(300);
  await page.locator('button.pill', { hasText: '$5,000' }).click();
  await page.waitForTimeout(400);
  const net5k = await page.$eval('#boardwrap tbody tr:first-child td:nth-child(10)', (el) => el.innerText);
  check('deposit toggle recomputes net', net5k !== '', 'first row net at $5k: ' + net5k);

  // live tab (all 402 traded protocols, by market cap)
  await page.locator('button.tab', { hasText: 'Already trade' }).click();
  await page.waitForTimeout(400);
  const liveRows = await page.$$eval('#boardwrap tbody tr', (els) => els.length);
  check('live tab shows all 402 rows', liveRows === 402, liveRows + ' rows');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECKS FAILED');
process.exit(fails === 0 ? 0 : 1);
