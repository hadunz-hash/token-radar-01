/* Token Radar — radar-4. Dense terminal board: every pre-token protocol priced
   from the snapshot, with the farm verdict costed out. Reads window.RADAR. */
(function () {
  'use strict';
  var R = window.RADAR;
  var V = R.validation;
  var M = R.model;
  var $ = function (id) { return document.getElementById(id); };
  var fmtInt = new Intl.NumberFormat('en-US');
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'text') el.textContent = attrs[k]; else if (k === 'html') el.innerHTML = attrs[k]; else el.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c === null || c === undefined) continue; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return el;
  }
  function money(v) { // $44.8M / $1.08B / $980K / $12
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v.toFixed(0);
  }
  function money2(v) { // $40.44, -$5.65
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
  }
  function pct(v) { return (v === null || v === undefined || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function oddsPct(v) { return Math.round(v * 100) + '%'; }
  function ageLabel(d) {
    if (d === null || d === undefined) return 'not listed';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    var y = d / 365; return (y >= 10 ? Math.round(y) : y.toFixed(1)) + 'y';
  }

  /* --- verdict math, mirroring lib/model.ts exactly --- */
  function netFor(r, dep, drop, tbill) {
    var slice = drop * r.if_launched_usd * (dep / Math.max(1, r.tvl_usd));
    var expected = slice * r.launch_odds;
    var fortnights = Math.ceil(r.hold_days / 14);
    var fees = (4 + fortnights) * r.gas_usd;
    var tbc = tbill * dep * r.hold_days / 365;
    return { slice: slice, expected: expected, fees: fees, tbill: tbc, net: expected - fees - tbc, fortnights: fortnights };
  }
  function verdictOf(net) { return net >= M.farm_threshold_usd ? 'FARM' : (net > 0 ? 'MARGINAL' : 'SKIP'); }
  function minDep(r, drop, tbill) {
    var fortnights = Math.ceil(r.hold_days / 14);
    var fees = (4 + fortnights) * r.gas_usd;
    var per = drop * r.if_launched_usd / Math.max(1, r.tvl_usd) * r.launch_odds - tbill * r.hold_days / 365;
    if (per <= 0) return null;
    return Math.max(0, (fees + M.farm_threshold_usd) / per);
  }
  function breakEven(r, dep, drop, tbill) {
    var slice = drop * r.if_launched_usd * (dep / Math.max(1, r.tvl_usd));
    if (slice <= 0) return null;
    var fortnights = Math.ceil(r.hold_days / 14);
    var fees = (4 + fortnights) * r.gas_usd;
    var tbc = tbill * dep * r.hold_days / 365;
    return Math.min(1, Math.max(0, (fees + tbc) / slice));
  }

  /* --- farm plan, mirroring lib/model.ts farmSteps --- */
  function actionFor(r, dep) {
    var c = (r.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + fmtInt.format(dep) + ' to ' + r.name + "'s lending market on " + r.farm_chain + ' and keep it supplied.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + fmtInt.format(dep) + ' of liquidity to ' + r.name + "'s main pool on " + r.farm_chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Open a $' + fmtInt.format(dep) + ' position on ' + r.name + ' on ' + r.farm_chain + ' and keep it open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + fmtInt.format(dep) + ' through ' + r.name + ' on ' + r.farm_chain + ' and keep the position open.';
    if (c.indexOf('prediction') >= 0) return 'Take a $' + fmtInt.format(dep) + ' position on a ' + r.name + ' market on ' + r.farm_chain + ' and hold it to settlement.';
    if (c.indexOf('governance') >= 0) return 'Stake or lock $' + fmtInt.format(dep) + ' in ' + r.name + ' on ' + r.farm_chain + ' and take part in governance.';
    return 'Put $' + fmtInt.format(dep) + ' into ' + r.name + ' on ' + r.farm_chain + ' and keep the position open.';
  }
  function fortnightlyFor(r) {
    var c = (r.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Each fortnight make one qualifying action, such as a supply, a borrow or a repayment.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Each fortnight make one qualifying action, such as a swap, an add of liquidity or a harvest.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Each fortnight make one qualifying action, such as one small trade or a funding adjustment.';
    if (c.indexOf('bridge') >= 0) return 'Each fortnight make one qualifying action, such as a bridge, a swap or a claim.';
    if (c.indexOf('prediction') >= 0) return 'Each fortnight make one qualifying action, such as one market position or a settlement.';
    if (c.indexOf('governance') >= 0) return 'Each fortnight make one qualifying action, such as a vote or a delegation change.';
    return 'Each fortnight make one qualifying action, such as a deposit, a borrow, a swap or a vote.';
  }
  function planFor(r, dep) {
    var gas = '$' + r.gas_usd.toFixed(2);
    var n = netFor(r, dep, S.drop, S.tbill);
    var floor = Math.max(1, Math.round((r.tvl_usd * 3) / 4 / 1000) * 1000);
    var g = r.change_7d === null ? 0 : r.change_7d;
    var holdTxt;
    if (g >= 20) holdTxt = 'Hold the position for at least ' + r.hold_days + ' days and add to it while it is growing - ' + r.name + ' rose ' + pct(g) + ' in 7 days. Check the TVL weekly, free, and leave early if it falls below $' + fmtInt.format(floor) + '.';
    else if (g < 0) holdTxt = 'Hold the position for at least ' + r.hold_days + ' days; ' + r.name + ' fell ' + pct(g) + ' in 7 days, so keep the position small and do not add. Check the TVL weekly, free, and leave early if it falls below $' + fmtInt.format(floor) + '.';
    else holdTxt = 'Hold the position for at least ' + r.hold_days + ' days so the activity is counted in more than one snapshot. Check the TVL weekly, free, and leave early if it falls below $' + fmtInt.format(floor) + '.';
    return [
      { when: 'Day 0', text: 'Use a fresh wallet on ' + r.farm_chain + ' that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas + ' of gas for the first transaction', time: '5 minutes' },
      { when: 'Day 0', text: actionFor(r, dep), cost: '$' + fmtInt.format(dep) + ' of capital and about $' + (2 * r.gas_usd).toFixed(2) + ' of gas', time: '15 minutes to set up' },
      { when: 'Fortnightly', text: fortnightlyFor(r) + ' ' + n.fortnights + ' paid ' + (n.fortnights === 1 ? 'action' : 'actions') + ' over the hold.', cost: 'about ' + gas + ' of gas each fortnight', time: '10 minutes a fortnight' },
      { when: 'Day 1–' + r.hold_days, text: holdTxt, cost: 'the $' + fmtInt.format(dep) + ' stays in the position', time: r.hold_days + ' days' },
      { when: 'Day ' + (r.hold_days + 1), text: 'Before you withdraw, open ' + r.name + "'s own points or rewards page and claim only from the link it publishes.", cost: gas + ' of gas to claim', time: '10 minutes' },
      { when: 'Every week', text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: '$0', time: '5 minutes' }
    ];
  }

  /* --- state --- */
  var S = { q: '', cat: '', chn: '', ver: 'all', scope: 'all', tab: 'pre', sort: 'implied', dir: -1, sel: null, dep: 1000, drop: 0.07, tbill: 0.04 };
  var app = document.getElementById('app');

  function visibleRows() {
    var rows = R.rows.filter(function (r) {
      if (S.scope === 'watchlist' && !r.watchlist) return false;
      if (S.scope === 'offlist' && (r.watchlist || r.tvl_usd < R.floor_usd)) return false;
      if (S.scope === 'early' && (r.watchlist || r.tvl_usd >= R.floor_usd)) return false;
      var v = verdictOf(netFor(r, S.dep, S.drop, S.tbill).net);
      if (S.ver !== 'all' && v !== S.ver) return false;
      if (S.q && r.name.toLowerCase().indexOf(S.q) < 0 && r.slug.indexOf(S.q) < 0) return false;
      if (S.cat && r.category !== S.cat) return false;
      if (S.chn && r.chains.indexOf(S.chn) < 0) return false;
      return true;
    });
    var key = S.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name; bv = b.name; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'if') { av = a.if_launched_usd; bv = b.if_launched_usd; }
      else if (key === 'odds') { av = a.launch_odds; bv = b.launch_odds; }
      else if (key === 'net') { av = netFor(a, S.dep, S.drop, S.tbill).net; bv = netFor(b, S.dep, S.drop, S.tbill).net; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      var d = av < bv ? -1 : av > bv ? 1 : 0;
      return d * S.dir;
    });
    return rows;
  }

  /* --- header --- */
  function buildHeader() {
    var totalImp = R.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var farms = R.rows.filter(function (r) { return verdictOf(netFor(r, S.dep, S.drop, S.tbill).net) === 'FARM'; })
      .sort(function (a, b) { return netFor(b, S.dep, S.drop, S.tbill).net - netFor(a, S.dep, S.drop, S.tbill).net; }).slice(0, 3);
    var cov = V.coverage;
    var hdr = h('header', { 'class': 'hdr' },
      h('div', { 'class': 'topbar' },
        h('span', { 'class': 'logo', text: '◆ TOKEN RADAR' }),
        h('span', { 'class': 'topmeta', text: 'Snapshot ' + R.as_of + ' · DefiLlama protocol index · radar-4 model' }),
        h('span', { 'class': 'topmeta', text: R.board_size + ' protocols' })),
      h('h1', { text: 'What each unlaunched token would be worth, and whether farming it pays' }),
      h('p', { 'class': 'covline', text: cov.total + '/' + cov.total + ' protocols placed · ' + cov.ranked + '/' + R.watchlist_size + ' watchlist ranked · ' + cov.ranked + ' record no token · ' + cov.already_token + ' already trade · ' + (cov.bridge + cov.staking + cov.exchange + cov.versioned + cov.wrapped) + ' set aside' }),
      h('p', { 'class': 'modelline', text: 'implied value = sizeCurve(TVL) × growthCarry(7d change) × launchOdds(time with no token) — how it is priced' }),
      h('p', { 'class': 'farmline', id: 'farmline' })
    );
    app.appendChild(hdr);
    drawFarmLine(farms);
    var stats = h('div', { 'class': 'stats' });
    var card = function (k, v, sub) {
      return h('div', { 'class': 'stat' }, h('div', { 'class': 'stat-k', text: k }), h('div', { 'class': 'stat-v', text: v }), h('div', { 'class': 'stat-s', text: sub }));
    };
    stats.appendChild(card('RANKED', String(R.board_size), R.watchlist_size + ' watchlist + ' + R.early_size + ' early'));
    stats.appendChild(card('IMPLIED VALUE', money(totalImp), 'sum of all 198 rows'));
    stats.appendChild(card('OUT-OF-SAMPLE MISS', '×' + V.fit.loo_median.toFixed(2), 'flat multiple ×' + V.fit.loo_flat_median.toFixed(2) + ' · time split ×' + V.fit.time_median.toFixed(2)));
    stats.appendChild(card('RANGE HOLDS', Math.round(V.fit.range_hold * 100) + '%', 'P25–P75 from leave-one-out residuals'));
    stats.appendChild(card('LAUNCH ODDS, FITTED', 'π = ' + V.odds.pi.toFixed(2), 'half-life ' + V.odds.half_life_days + ' days · ' + V.odds.dated + ' dated protocols'));
    stats.appendChild(card('WORTH FARMING', String(V.verdicts.farm), V.verdicts.marginal + ' marginal · ' + V.verdicts.skip + ' skip at $1,000 each'));
    app.appendChild(stats);
    var segs = [['ranked', cov.ranked, '#3fae8a'], ['already trade', cov.already_token, '#5b7fa6'], ['bridge', cov.bridge, '#8a6d3b'], ['staking', cov.staking, '#7a5b8a'], ['exchange', cov.exchange, '#6b7c5e'], ['versioned', cov.versioned, '#96505a'], ['wrapped', cov.wrapped, '#5e6b7a']];
    var bar = h('div', { 'class': 'covbar' });
    segs.forEach(function (s) { bar.appendChild(h('div', { 'class': 'seg', style: 'width:' + (s[1] / cov.total * 100).toFixed(2) + '%;background:' + s[2], title: s[0] + ' ' + s[1] })); });
    var leg = h('div', { 'class': 'covleg' });
    segs.forEach(function (s) { leg.appendChild(h('span', { 'class': 'leg', html: '<i style="background:' + s[2] + '"></i>' + s[0] + ' ' + s[1] })); });
    app.appendChild(bar); app.appendChild(leg);
  }
  function drawFarmLine(farms) {
    var el = document.getElementById('farmline'); if (!el) return;
    if (!farms) farms = R.rows.filter(function (r) { return verdictOf(netFor(r, S.dep, S.drop, S.tbill).net) === 'FARM'; })
      .sort(function (a, b) { return netFor(b, S.dep, S.drop, S.tbill).net - netFor(a, S.dep, S.drop, S.tbill).net; }).slice(0, 3);
    var names = farms.map(function (r) { return r.name + ' +' + money2(netFor(r, S.dep, S.drop, S.tbill).net); }).join(' · ');
    el.textContent = 'farm next: ' + names + ' — ' + V.verdicts.farm + ' FARM, ' + V.verdicts.marginal + ' marginal, ' + V.verdicts.skip + ' skip at $' + fmtInt.format(S.dep) + ' each';
  }

  /* --- what-if controls --- */
  function buildControls() {
    var wrap = h('div', { 'class': 'controls' });
    function group(label, opts, cur, fn) {
      var g = h('div', { 'class': 'ctl' }, h('span', { 'class': 'ctl-k', text: label }));
      opts.forEach(function (o) {
        var b = h('button', { 'class': 'pill' + (o.v === cur ? ' on' : ''), text: o.t });
        b.onclick = function () { fn(o.v); draw(); };
        g.appendChild(b);
      });
      return g;
    }
    wrap.appendChild(group('DEPOSIT', [{ t: '$1,000', v: 1000 }, { t: '$5,000', v: 5000 }, { t: '$25,000', v: 25000 }], S.dep, function (v) { S.dep = v; }));
    wrap.appendChild(group('DROP SHARE', [{ t: '3.5%', v: 0.035 }, { t: '7%', v: 0.07 }, { t: '14%', v: 0.14 }], S.drop, function (v) { S.drop = v; }));
    wrap.appendChild(group('T-BILL YIELD', [{ t: '0%', v: 0 }, { t: '4%', v: 0.04 }, { t: '8%', v: 0.08 }], S.tbill, function (v) { S.tbill = v; }));
    var exp = h('button', { 'class': 'pill exp', text: 'Export CSV' });
    exp.onclick = exportCsv;
    wrap.appendChild(exp);
    app.appendChild(wrap);
  }
  function exportCsv() {
    var rows = visibleRows();
    var lines = ['rank,name,category,chains,tvl_usd,change_7d,no_token,age_days,if_launched_usd,launch_odds,implied_value_usd,range_lo_usd,range_hi_usd,net_usd,verdict'];
    rows.forEach(function (r) {
      var n = netFor(r, S.dep, S.drop, S.tbill);
      lines.push([r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', '"' + r.chains.join(' ') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d.toFixed(2), ageLabel(r.age_days), r.age_days === null ? '' : r.age_days, Math.round(r.if_launched_usd), r.launch_odds.toFixed(2), Math.round(r.implied_value_usd), Math.round(r.range_lo_usd), Math.round(r.range_hi_usd), n.net.toFixed(2), verdictOf(n.net)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'token-radar-board.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* --- filters + board --- */
  function buildFilters() {
    var f = h('div', { 'class': 'filters' });
    var scopeN = { all: R.board_size, watchlist: R.watchlist_size, offlist: R.rows.filter(function (r) { return !r.watchlist && r.tvl_usd >= R.floor_usd; }).length, early: R.rows.filter(function (r) { return !r.watchlist && r.tvl_usd < R.floor_usd; }).length };
    var scopeB = h('div', { 'class': 'fgroup' });
    [['all', 'All'], ['watchlist', 'Watchlist'], ['offlist', 'Off-list'], ['early', 'Early']].forEach(function (o) {
      var b = h('button', { 'class': 'pill' + (S.scope === o[0] ? ' on' : ''), text: o[1] + ' ' + scopeN[o[0]] });
      b.onclick = function () { S.scope = o[0]; draw(); };
      scopeB.appendChild(b);
    });
    f.appendChild(scopeB);
    var verB = h('div', { 'class': 'fgroup' });
    [['all', 'Any verdict'], ['FARM', 'Farm'], ['MARGINAL', 'Marginal'], ['SKIP', 'Skip']].forEach(function (o) {
      var n = o[0] === 'all' ? R.board_size : V.verdicts[o[0].toLowerCase()];
      var b = h('button', { 'class': 'pill' + (S.ver === o[0] ? ' on' : ''), text: o[1] + ' ' + n });
      b.onclick = function () { S.ver = o[0]; draw(); };
      verB.appendChild(b);
    });
    f.appendChild(verB);
    var q = h('input', { id: 'q', type: 'search', placeholder: 'Search a protocol…', value: S.q });
    q.oninput = function () { S.q = q.value.trim().toLowerCase(); draw(); };
    f.appendChild(q);
    var cats = Array.from(new Set(R.rows.map(function (r) { return r.category; }).filter(Boolean))).sort();
    var cat = h('select', { id: 'cat' });
    cat.appendChild(h('option', { value: '', text: 'All categories' }));
    cats.forEach(function (c) { cat.appendChild(h('option', { value: c, text: c })); });
    cat.value = S.cat; cat.onchange = function () { S.cat = cat.value; draw(); };
    f.appendChild(cat);
    var chns = Array.from(new Set(R.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var chn = h('select', { id: 'chn' });
    chn.appendChild(h('option', { value: '', text: 'All chains' }));
    chns.forEach(function (c) { chn.appendChild(h('option', { value: c, text: c })); });
    chn.value = S.chn; chn.onchange = function () { S.chn = chn.value; draw(); };
    f.appendChild(chn);
    var tabs = h('div', { 'class': 'tabs' });
    var t1 = h('button', { 'class': 'tab' + (S.tab === 'pre' ? ' on' : ''), text: 'Pre-token · ' + R.board_size });
    t1.onclick = function () { S.tab = 'pre'; draw(); };
    var t2 = h('button', { 'class': 'tab' + (S.tab === 'live' ? ' on' : ''), text: 'Already trade · ' + R.live_size });
    t2.onclick = function () { S.tab = 'live'; draw(); };
    tabs.appendChild(t1); tabs.appendChild(t2);
    f.appendChild(tabs);
    app.appendChild(f);
  }
  function drawBoard() {
    var wrap = document.getElementById('boardwrap');
    wrap.innerHTML = '';
    if (S.tab === 'live') {
      var lt = h('table', { 'class': 'board' });
      lt.appendChild(h('thead', {}, h('tr', {},
        h('th', { text: 'PROTOCOL' }), h('th', { 'class': 'num', text: 'TVL' }), h('th', { 'class': 'num', text: '7D' }), h('th', { 'class': 'num', text: 'MARKET CAP' }), h('th', { 'class': 'num', text: 'MCAP / TVL' }))));
      var lb = h('tbody', {});
      R.live.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).forEach(function (r) {
        lb.appendChild(h('tr', {},
          h('td', {}, h('span', { 'class': 'pname', text: r.name }), h('span', { 'class': 'pcat', text: ' ' + (r.category || '') + ' · ' + r.chains.join(', ') })),
          h('td', { 'class': 'num', text: money(r.tvl_usd) }),
          h('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'dn'), text: pct(r.change_7d) }),
          h('td', { 'class': 'num', text: money(r.mcap_usd) }),
          h('td', { 'class': 'num', text: (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' })));
      });
      lt.appendChild(lb);
      wrap.appendChild(lt);
      wrap.appendChild(h('p', { 'class': 'note', text: 'Top ' + R.live_size + ' by market cap of the ' + V.coverage.already_token + ' protocols in the snapshot that already trade. They are the comparables the size curve is fitted on, not rows to farm.' }));
      return;
    }
    var rows = visibleRows();
    var cols = [['rank', '#'], ['name', 'PROTOCOL'], ['tvl', 'TVL'], ['growth', '7D'], ['age', 'NO TOKEN'], ['if', 'IF LAUNCHED'], ['odds', 'ODDS'], ['implied', 'IMPLIED VALUE'], ['range', 'RANGE'], ['net', 'NET OF FEES'], ['verdict', 'VERDICT']];
    var t = h('table', { 'class': 'board' });
    var tr = h('tr', {});
    cols.forEach(function (c) {
      var th = h('th', { 'class': (c[0] === 'name' ? '' : 'num') + (S.sort === c[0] ? ' sorted' : ''), text: c[1] + (S.sort === c[0] ? (S.dir === -1 ? ' ↓' : ' ↑') : '') });
      th.onclick = function () { if (S.sort === c[0]) S.dir = -S.dir; else { S.sort = c[0]; S.dir = c[0] === 'name' ? 1 : -1; } draw(); };
      tr.appendChild(th);
    });
    t.appendChild(h('thead', {}, tr));
    var tb = h('tbody', {});
    rows.forEach(function (r) {
      var n = netFor(r, S.dep, S.drop, S.tbill);
      var v = verdictOf(n.net);
      var row = h('tr', { 'class': 'row', id: 'r-' + r.slug });
      row.onclick = function () { openDetail(r); };
      row.appendChild(h('td', { 'class': 'num rank', text: String(r.rank) }));
      row.appendChild(h('td', {}, h('span', { 'class': 'pname', text: r.name }), h('span', { 'class': 'pcat', text: ' ' + (r.category || '') + ' · ' + r.chains.join(', ') })));
      row.appendChild(h('td', { 'class': 'num', text: money(r.tvl_usd) }));
      row.appendChild(h('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'dn'), text: pct(r.change_7d) }));
      row.appendChild(h('td', { 'class': 'num', text: ageLabel(r.age_days) }));
      row.appendChild(h('td', { 'class': 'num', text: money(r.if_launched_usd) }));
      row.appendChild(h('td', { 'class': 'num', text: oddsPct(r.launch_odds) }));
      row.appendChild(h('td', { 'class': 'num strong', text: money(r.implied_value_usd) }));
      row.appendChild(h('td', { 'class': 'num range', text: money(r.range_lo_usd) + '–' + money(r.range_hi_usd) }));
      row.appendChild(h('td', { 'class': 'num ' + (n.net >= 0 ? 'up' : 'dn'), text: money2(n.net) }));
      row.appendChild(h('td', { 'class': 'num' }, h('span', { 'class': 'verdict v-' + v.toLowerCase(), text: v })));
      tb.appendChild(row);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    wrap.appendChild(h('p', { 'class': 'note', text: rows.length + ' rows · implied value = if launched × launch odds · net of fees at a $' + fmtInt.format(S.dep) + ' deposit, ' + Math.round(S.drop * 100) + '% drop share, ' + Math.round(S.tbill * 100) + '% T-bill yield · FARM means net ≥ $' + M.farm_threshold_usd + ' · click a row for the farm plan' }));
  }

  /* --- out-of-sample panel --- */
  function scatterSVG() {
    var W = 520, Hh = 300, pad = 34;
    var x0 = 5.5, x1 = 9.6, y0 = 5.0, y1 = 9.9;
    function X(v) { return pad + (v - x0) / (x1 - x0) * (W - 2 * pad); }
    function Y(v) { return Hh - pad - (v - y0) / (y1 - y0) * (Hh - 2 * pad); }
    var dots = R.comps.map(function (p) { return '<circle cx="' + X(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(p.mcap_usd)).toFixed(1) + '" r="2.2" fill="#5b7fa6" opacity="0.55"/>'; }).join('');
    var f = V.fit;
    var line = '<line x1="' + X(x0) + '" y1="' + Y(f.intercept + f.slope * x0) + '" x2="' + X(x1) + '" y2="' + Y(f.intercept + f.slope * x1) + '" stroke="#3fae8a" stroke-width="2"/>';
    var flat = '<line x1="' + X(x0) + '" y1="' + Y(x0 + Math.log10(f.flat_median)) + '" x2="' + X(x1) + '" y2="' + Y(x1 + Math.log10(f.flat_median)) + '" stroke="#96505a" stroke-width="1.5" stroke-dasharray="5 4"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="chart">' +
      '<text x="' + (W / 2) + '" y="16" class="ct" text-anchor="middle">Market cap vs TVL — 128 traded protocols (log scale)</text>' +
      '<text x="14" y="' + (Hh / 2) + '" class="ca" transform="rotate(-90 14 ' + (Hh / 2) + ')" text-anchor="middle">log market cap</text>' +
      '<text x="' + (W / 2) + '" y="' + (Hh - 8) + '" class="ca" text-anchor="middle">log TVL</text>' +
      dots + flat + line +
      '<text x="' + (W - pad - 4) + '" y="' + (Y(f.intercept + f.slope * x1) - 6) + '" class="cl" text-anchor="end">size curve</text>' +
      '<text x="' + (W - pad - 4) + '" y="' + (Y(x1 + Math.log10(f.flat_median)) + 14) + '" class="cl2" text-anchor="end">flat ×' + f.flat_median.toFixed(2) + '</text>' +
      '</svg>';
  }
  function oddsBarsSVG() {
    var W = 520, Hh = 190, pad = 34, bw = 26;
    var bk = V.odds.buckets;
    var n = bk.length, step = (W - 2 * pad) / n;
    var bars = bk.map(function (b, i) {
      var x = pad + i * step + (step - bw * 2 - 4) / 2;
      var ha = b.actual_no_token * (Hh - 2 * pad), hm = b.predicted_no_token * (Hh - 2 * pad);
      return '<rect x="' + x.toFixed(1) + '" y="' + (Hh - pad - ha).toFixed(1) + '" width="' + bw + '" height="' + ha.toFixed(1) + '" fill="#3fae8a"/>' +
        '<rect x="' + (x + bw + 4).toFixed(1) + '" y="' + (Hh - pad - hm).toFixed(1) + '" width="' + bw + '" height="' + hm.toFixed(1) + '" fill="none" stroke="#e8e6df" stroke-width="1.2"/>' +
        '<text x="' + (x + bw + 2).toFixed(1) + '" y="' + (Hh - 12) + '" class="ca" text-anchor="middle">' + b.lo_days + '–' + (b.hi_days >= 100000 ? '∞' : b.hi_days) + 'd</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="chart">' +
      '<text x="' + (W / 2) + '" y="16" class="ct" text-anchor="middle">Launch odds — share with no token, by age (actual vs model)</text>' +
      bars +
      '<text x="' + pad + '" y="' + (Hh - pad + 22) + '" class="cl">■ actual</text><text x="' + (pad + 70) + '" y="' + (Hh - pad + 22) + '" class="cl">□ model</text>' +
      '</svg>';
  }
  function buildOOS() {
    var f = V.fit;
    var sec = h('section', { 'class': 'oos' },
      h('h2', { text: 'Does it hold on tokens it never saw?' }),
      h('p', { 'class': 'oos-sub', text: 'Every term is tested twice: leave-one-out across the 128 traded protocols, and a time split that fits on protocols listed before 2024-07-15 and checks the newer ones. A term is kept only if it wins both. Growth is the exception: it loses leave-one-out but wins the time split, so it stays out of the fit and is used as a labelled projection instead.' }));
    var grid = h('div', { 'class': 'oos-grid' });
    var left = h('div', { 'class': 'oos-col' });
    var tt = h('table', { 'class': 'mini' });
    tt.appendChild(h('thead', {}, h('tr', {}, h('th', { text: 'TERM' }), h('th', { 'class': 'num', text: 'LEAVE-ONE-OUT' }), h('th', { 'class': 'num', text: 'TIME SPLIT' }), h('th', { 'class': 'num', text: 'KEPT' }))));
    var tb = h('tbody', {});
    f.terms.forEach(function (t) {
      tb.appendChild(h('tr', {},
        h('td', { text: t.term }),
        h('td', { 'class': 'num', text: '×' + t.loo_median.toFixed(2) }),
        h('td', { 'class': 'num', text: '×' + t.time_median.toFixed(2) }),
        h('td', { 'class': 'num', text: t.kept ? 'yes' : 'no' })));
    });
    tb.appendChild(h('tr', { 'class': 'flatrow' },
      h('td', { text: 'flat median multiple' }),
      h('td', { 'class': 'num', text: '×' + f.loo_flat_median.toFixed(2) }),
      h('td', { 'class': 'num', text: '×' + f.time_flat_median.toFixed(2) }),
      h('td', { 'class': 'num', text: 'no' })));
    tt.appendChild(tb);
    left.appendChild(tt);
    left.appendChild(h('p', { 'class': 'note', text: 'Median miss: the size curve is off by ×' + f.loo_median.toFixed(2) + ' on a token it never saw (flat multiple ×' + f.loo_flat_median.toFixed(2) + '); three quarters of misses are under ×' + f.loo_p75.toFixed(2) + '. The P25–P75 range holds ' + Math.round(f.range_hold * 100) + '% of actual market caps.' }));
    left.appendChild(h('p', { 'class': 'note', text: 'Launch odds are a survival fit on the ' + V.odds.dated + ' dated protocols that stand alone like the board’s rows — bridges, exchanges and staking products are left out, because their value accrues to a token that already trades. π = ' + V.odds.pi.toFixed(2) + ' ever launch, half-life ' + V.odds.half_life_days + ' days. The time split fits the older cohort and checks the newer one: it overstates the newer cohort’s no-token share by 3–12 points in the 180–365 day bucket — the launch rate is not stationary.' }));
    grid.appendChild(left);
    var right = h('div', { 'class': 'oos-col' });
    right.innerHTML = scatterSVG() + oddsBarsSVG();
    grid.appendChild(right);
    sec.appendChild(grid);
    app.appendChild(sec);
  }

  /* --- model section --- */
  function buildModel() {
    var f = V.fit, o = V.odds;
    var sec = h('section', { 'class': 'model' },
      h('h2', { text: 'How it is priced' }),
      h('p', { 'class': 'model-formula', text: 'implied value = sizeCurve(TVL) × growthCarry(7d change) × launchOdds(time with no token)' }),
      h('p', { 'class': 'model-note', text: 'sizeCurve is the log-log fit on ' + f.comps + ' traded protocols: log₁₀(market cap) = ' + f.intercept.toFixed(3) + ' + ' + f.slope.toFixed(3) + ' × log₁₀(TVL). The flat median multiple is ' + f.flat_median.toFixed(3) + ' — it misses by ×' + f.loo_flat_median.toFixed(2) + ' where the curve misses by ×' + f.loo_median.toFixed(2) + '.' }),
      h('p', { 'class': 'model-note', text: 'growthCarry = 1 + (7d change − market ' + f.market_growth.toFixed(2) + '%) / 100, clamped to [0.30, 5.00]. It is a projection, not a fit: 7-day growth inside the fit loses leave-one-out (×' + f.terms[1].loo_median.toFixed(2) + ' vs ×' + f.loo_median.toFixed(2) + ').' }),
      h('p', { 'class': 'model-note', text: 'launchOdds comes from a survival model: a fraction π = ' + o.pi.toFixed(2) + ' of protocols ever launch, launchers launch with a constant hazard, half-life ' + o.half_life_days + ' days. At 30 days the odds are 52%, at 4 years 26%. A protocol with no listed date takes π.' }),
      h('p', { 'class': 'model-note', text: 'The farm verdict is costed at a $' + fmtInt.format(S.dep) + ' deposit, a ' + Math.round(S.drop * 100) + '% drop share and a ' + Math.round(S.tbill * 100) + '% T-bill yield: slice = drop share × if launched × deposit / TVL, expected = slice × odds, fees = (4 + ceil(hold / 14)) × gas ($' + M.gas_cheap_usd.toFixed(2) + ' a transaction off Ethereum, $' + M.gas_ethereum_usd.toFixed(2) + ' on it, cheapest chain), T-bill cost = yield × deposit × hold / 365. FARM means net ≥ $' + M.farm_threshold_usd + '; MARGINAL means net above $0; the rest are SKIP. Hold is 45 days under 6 months old, 60 days under 18 months, 90 days older.' }),
      h('p', { 'class': 'model-note', text: 'What the model does not do: it cannot see a protocol’s team, its token design, or whether a drop will happen at all. The odds are a population rate, not a promise for any one row. Values are model estimates, not prices.' }));
    app.appendChild(sec);
  }

  /* --- detail dialog --- */
  var dlg = null;
  function buildDialog() {
    dlg = h('div', { id: 'dlg', 'class': 'dlg', style: 'display:none' });
    dlg.onclick = function (e) { if (e.target === dlg) closeDetail(); };
    document.body.appendChild(dlg);
  }
  function openDetail(r) {
    S.sel = r.slug;
    var n = netFor(r, S.dep, S.drop, S.tbill);
    var v = verdictOf(n.net);
    var md = minDep(r, S.drop, S.tbill);
    var be = breakEven(r, S.dep, S.drop, S.tbill);
    var base = r.if_launched_usd / r.growth_carry;
    var inner = h('div', { 'class': 'dlg-inner' });
    var x = h('button', { 'class': 'dlg-x', text: '✕' });
    x.onclick = closeDetail;
    inner.appendChild(x);
    inner.appendChild(h('h2', {}, h('span', { text: '#' + r.rank + ' ' + r.name + ' ' }), h('span', { 'class': 'verdict v-' + v.toLowerCase(), text: v })));
    inner.appendChild(h('p', { 'class': 'dlg-sub', text: (r.category || '') + ' · ' + r.chains.join(', ') + ' · TVL ' + money(r.tvl_usd) + ' · ' + (r.change_7d === null ? 'no 7d change' : pct(r.change_7d) + ' in 7 days') + ' · no token for ' + ageLabel(r.age_days) }));
    inner.appendChild(h('h3', { text: 'Why ' + money(r.implied_value_usd) }));
    inner.appendChild(h('table', { 'class': 'mini why' },
      h('tbody', {},
        h('tr', {}, h('td', { text: 'TVL ' + money(r.tvl_usd) + ' through the size curve' }), h('td', { 'class': 'num', text: money(base) })),
        h('tr', {}, h('td', { text: '× growth carry ' + r.growth_carry.toFixed(2) + ' (' + pct(r.change_7d === null ? 0 : r.change_7d) + ' vs market ' + V.fit.market_growth.toFixed(1) + '%)' }), h('td', { 'class': 'num', text: '= ' + money(r.if_launched_usd) + ' if launched' })),
        h('tr', {}, h('td', { text: '× launch odds ' + oddsPct(r.launch_odds) + ' (' + ageLabel(r.age_days) + ' with no token)' }), h('td', { 'class': 'num', text: '= ' + money(r.implied_value_usd) })),
        h('tr', {}, h('td', { text: 'P25–P75 range, from leave-one-out residuals' }), h('td', { 'class': 'num', text: money(r.range_lo_usd) + ' – ' + money(r.range_hi_usd) })))));
    inner.appendChild(h('h3', { text: 'Farm plan — $' + fmtInt.format(S.dep) + ' on ' + r.farm_chain }));
    var pt = h('table', { 'class': 'mini plan' });
    pt.appendChild(h('thead', {}, h('tr', {}, h('th', { text: 'WHEN' }), h('th', { text: 'STEP' }), h('th', { 'class': 'num', text: 'COST' }), h('th', { 'class': 'num', text: 'TIME' }))));
    var pb = h('tbody', {});
    planFor(r, S.dep).forEach(function (s) {
      pb.appendChild(h('tr', {}, h('td', { text: s.when }), h('td', { text: s.text }), h('td', { 'class': 'num', text: s.cost }), h('td', { 'class': 'num', text: s.time })));
    });
    pt.appendChild(pb);
    inner.appendChild(pt);
    inner.appendChild(h('h3', { text: 'Net of fees' }));
    inner.appendChild(h('table', { 'class': 'mini why' },
      h('tbody', {},
        h('tr', {}, h('td', { text: 'slice if it launches (' + Math.round(S.drop * 100) + '% of ' + money(r.if_launched_usd) + ' × $' + fmtInt.format(S.dep) + ' / TVL)' }), h('td', { 'class': 'num', text: money2(n.slice) })),
        h('tr', {}, h('td', { text: '× launch odds ' + oddsPct(r.launch_odds) }), h('td', { 'class': 'num', text: money2(n.expected) })),
        h('tr', {}, h('td', { text: '− fees (' + (4 + n.fortnights) + ' transactions on ' + r.farm_chain + ')' }), h('td', { 'class': 'num', text: '−' + money2(n.fees) })),
        h('tr', {}, h('td', { text: '− T-bill cost (' + Math.round(S.tbill * 100) + '% × $' + fmtInt.format(S.dep) + ' × ' + r.hold_days + ' days)' }), h('td', { 'class': 'num', text: '−' + money2(n.tbill) })),
        h('tr', { 'class': 'total' }, h('td', { text: 'net' }), h('td', { 'class': 'num', text: money2(n.net) })))));
    inner.appendChild(h('p', { 'class': 'note', text: 'Break-even odds ' + (be === null ? '—' : oddsPct(be)) + ' · pays from a deposit of ' + (md === null ? '— never at this drop share' : '$' + fmtInt.format(Math.ceil(md))) + ' · the verdict uses the current what-if settings: deposit $' + fmtInt.format(S.dep) + ', drop share ' + Math.round(S.drop * 100) + '%, T-bill ' + Math.round(S.tbill * 100) + '%.' }));
    dlg.innerHTML = '';
    dlg.appendChild(inner);
    dlg.style.display = 'flex';
    history.replaceState(null, '', '#p=' + r.slug);
  }
  function closeDetail() {
    S.sel = null;
    dlg.style.display = 'none';
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* --- footer + boot --- */
  function buildFooter() {
    app.appendChild(h('footer', { 'class': 'foot', text: 'Built from the ' + R.as_of + ' DefiLlama protocol snapshot (758 protocols). Values are model estimates, not prices. Not financial advice. Model ' + R.model_version + '.' }));
  }
  function draw() {
    drawBoard();
    drawFarmLine();
    var q = document.getElementById('q'); if (q && document.activeElement !== q) q.value = S.q;
  }
  function boot() {
    buildHeader();
    buildControls();
    buildFilters();
    app.appendChild(h('div', { id: 'boardwrap' }));
    drawBoard();
    buildOOS();
    buildModel();
    buildFooter();
    buildDialog();
    var m = location.hash.match(/#p=([\w-]+)/);
    if (m) {
      var r = R.rows.find(function (x) { return x.slug === m[1]; });
      if (r) openDetail(r);
    }
    window.addEventListener('hashchange', function () {
      var mm = location.hash.match(/#p=([\w-]+)/);
      if (mm) {
        var rr = R.rows.find(function (x) { return x.slug === mm[1]; });
        if (rr) openDetail(rr);
      } else closeDetail();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });
  }
  boot();
})();
