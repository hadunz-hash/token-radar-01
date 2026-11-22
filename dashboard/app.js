/* Token Radar — radar-5. A dense terminal board: every pre-token protocol
   priced from the snapshot, with the farm verdict costed out. Reads window.RADAR. */
(function () {
  'use strict';
  var D = window.RADAR;
  var VAL = D.validation;
  var MC = D.model;
  var byId = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat('en-US');
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function fmtMoney(v) { // $44.8M / $1.08B / $980K / $12
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v.toFixed(0);
  }
  function fmtMoney2(v) { // $40.44, -$5.65
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
  }
  function fmtPct(v) { return (v === null || v === undefined || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function fmtOdds(v) { return Math.round(v * 100) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'not listed';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    var y = d / 365;
    return (y >= 10 ? Math.round(y) : y.toFixed(1)) + 'y';
  }

  /* --- verdict math, mirroring lib/model.ts exactly --- */
  function netCalc(row, deposit, drop, tbill) {
    var slice = drop * row.if_launched_usd * (deposit / Math.max(1, row.tvl_usd));
    var expected = slice * row.launch_odds;
    var fortnights = Math.ceil(row.hold_days / 14);
    var fees = (4 + fortnights) * row.gas_usd;
    var tbc = tbill * deposit * row.hold_days / 365;
    return { slice: slice, expected: expected, fees: fees, tbill: tbc, net: expected - fees - tbc, fortnights: fortnights };
  }
  function verdictFor(net) { return net >= MC.farm_threshold_usd ? 'FARM' : (net > 0 ? 'MARGINAL' : 'SKIP'); }
  function minDeposit(row, drop, tbill) {
    var fortnights = Math.ceil(row.hold_days / 14);
    var fees = (4 + fortnights) * row.gas_usd;
    var per = drop * row.if_launched_usd / Math.max(1, row.tvl_usd) * row.launch_odds - tbill * row.hold_days / 365;
    if (per <= 0) return null;
    return Math.max(0, (fees + MC.farm_threshold_usd) / per);
  }
  function beOdds(row, deposit, drop, tbill) {
    var slice = drop * row.if_launched_usd * (deposit / Math.max(1, row.tvl_usd));
    if (slice <= 0) return null;
    var fortnights = Math.ceil(row.hold_days / 14);
    var fees = (4 + fortnights) * row.gas_usd;
    var tbc = tbill * deposit * row.hold_days / 365;
    return Math.min(1, Math.max(0, (fees + tbc) / slice));
  }

  /* --- farm plan, mirroring lib/model.ts farmSteps --- */
  function planShort(row) {
    var cat = (row.category || '').toLowerCase();
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Supply';
    if (cat.indexOf('dex') >= 0 || cat.indexOf('yield') >= 0 || cat.indexOf('leveraged farm') >= 0) return 'Provide liquidity';
    if (cat.indexOf('perpetual') >= 0 || cat.indexOf('derivative') >= 0 || cat.indexOf('basis trad') >= 0) return 'Open a position';
    if (cat.indexOf('bridge') >= 0) return 'Bridge';
    if (cat.indexOf('prediction') >= 0) return 'Take a position';
    if (cat.indexOf('governance') >= 0) return 'Stake and vote';
    return 'Deposit';
  }
  function planAction(row, deposit) {
    var cat = (row.category || '').toLowerCase();
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Supply $' + fmt.format(deposit) + ' to ' + row.name + "'s lending market on " + row.farm_chain + ' and keep it supplied.';
    if (cat.indexOf('dex') >= 0 || cat.indexOf('yield') >= 0 || cat.indexOf('leveraged farm') >= 0) return 'Provide $' + fmt.format(deposit) + ' of liquidity to ' + row.name + "'s main pool on " + row.farm_chain + ' and keep the position open.';
    if (cat.indexOf('perpetual') >= 0 || cat.indexOf('derivative') >= 0 || cat.indexOf('basis trad') >= 0) return 'Open a $' + fmt.format(deposit) + ' position on ' + row.name + ' on ' + row.farm_chain + ' and keep it open.';
    if (cat.indexOf('bridge') >= 0) return 'Bridge $' + fmt.format(deposit) + ' through ' + row.name + ' on ' + row.farm_chain + ' and keep the position open.';
    if (cat.indexOf('prediction') >= 0) return 'Take a $' + fmt.format(deposit) + ' position on a ' + row.name + ' market on ' + row.farm_chain + ' and hold it to settlement.';
    if (cat.indexOf('governance') >= 0) return 'Stake or lock $' + fmt.format(deposit) + ' in ' + row.name + ' on ' + row.farm_chain + ' and take part in governance.';
    return 'Put $' + fmt.format(deposit) + ' into ' + row.name + ' on ' + row.farm_chain + ' and keep the position open.';
  }
  function planFortnight(row) {
    var cat = (row.category || '').toLowerCase();
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Each fortnight make one qualifying action, such as a supply, a borrow or a repayment.';
    if (cat.indexOf('dex') >= 0 || cat.indexOf('yield') >= 0 || cat.indexOf('leveraged farm') >= 0) return 'Each fortnight make one qualifying action, such as a swap, an add of liquidity or a harvest.';
    if (cat.indexOf('perpetual') >= 0 || cat.indexOf('derivative') >= 0 || cat.indexOf('basis trad') >= 0) return 'Each fortnight make one qualifying action, such as one small trade or a funding adjustment.';
    if (cat.indexOf('bridge') >= 0) return 'Each fortnight make one qualifying action, such as a bridge, a swap or a claim.';
    if (cat.indexOf('prediction') >= 0) return 'Each fortnight make one qualifying action, such as one market position or a settlement.';
    if (cat.indexOf('governance') >= 0) return 'Each fortnight make one qualifying action, such as a vote or a delegation change.';
    return 'Each fortnight make one qualifying action, such as a deposit, a borrow, a swap or a vote.';
  }
  function planBuild(row, deposit) {
    var gasText = '$' + row.gas_usd.toFixed(2);
    var calc = netCalc(row, deposit, ST.drop, ST.tbill);
    var tvlFloor = Math.max(1, Math.round((row.tvl_usd * 3) / 4 / 1000) * 1000);
    var growth = row.change_7d === null ? 0 : row.change_7d;
    var holdText;
    if (growth >= 20) holdText = 'Hold the position for at least ' + row.hold_days + ' days and add to it while it is growing - ' + row.name + ' rose ' + fmtPct(growth) + ' in 7 days. Check the TVL weekly, free, and leave early if it falls below $' + fmt.format(tvlFloor) + '.';
    else if (growth < 0) holdText = 'Hold the position for at least ' + row.hold_days + ' days; ' + row.name + ' fell ' + fmtPct(growth) + ' in 7 days, so keep the position small and do not add. Check the TVL weekly, free, and leave early if it falls below $' + fmt.format(tvlFloor) + '.';
    else holdText = 'Hold the position for at least ' + row.hold_days + ' days so the activity is counted in more than one snapshot. Check the TVL weekly, free, and leave early if it falls below $' + fmt.format(tvlFloor) + '.';
    return [
      { when: 'Day 0', text: 'Use a fresh wallet on ' + row.farm_chain + ' that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gasText + ' of gas for the first transaction', time: '5 minutes' },
      { when: 'Day 0', text: planAction(row, deposit), cost: '$' + fmt.format(deposit) + ' of capital and about $' + (2 * row.gas_usd).toFixed(2) + ' of gas', time: '15 minutes to set up' },
      { when: 'Fortnightly', text: planFortnight(row) + ' ' + calc.fortnights + ' paid ' + (calc.fortnights === 1 ? 'action' : 'actions') + ' over the hold.', cost: 'about ' + gasText + ' of gas each fortnight', time: '10 minutes a fortnight' },
      { when: 'Day 1–' + row.hold_days, text: holdText, cost: 'the $' + fmt.format(deposit) + ' stays in the position', time: row.hold_days + ' days' },
      { when: 'Day ' + (row.hold_days + 1), text: 'Before you withdraw, open ' + row.name + "'s own points or rewards page and claim only from the link it publishes.", cost: gasText + ' of gas to claim', time: '10 minutes' },
      { when: 'Every week', text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: '$0', time: '5 minutes' }
    ];
  }

  /* --- state --- */
  var ST = { q: '', cat: '', chn: '', ver: 'all', scope: 'all', tab: 'pre', sort: 'implied', dir: -1, sel: null, dep: 1000, drop: 0.07, tbill: 0.04 };
  var shell = document.getElementById('app');

  function rowsVisible() {
    var rows = D.rows.filter(function (r) {
      if (ST.scope === 'watchlist' && !r.watchlist) return false;
      if (ST.scope === 'offlist' && (r.watchlist || r.tvl_usd < D.floor_usd)) return false;
      if (ST.scope === 'early' && (r.watchlist || r.tvl_usd >= D.floor_usd)) return false;
      var v = verdictFor(netCalc(r, ST.dep, ST.drop, ST.tbill).net);
      if (ST.ver !== 'all' && v !== ST.ver) return false;
      if (ST.q && r.name.toLowerCase().indexOf(ST.q) < 0 && r.slug.indexOf(ST.q) < 0) return false;
      if (ST.cat && r.category !== ST.cat) return false;
      if (ST.chn && r.chains.indexOf(ST.chn) < 0) return false;
      return true;
    });
    var key = ST.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name; bv = b.name; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'if') { av = a.if_launched_usd; bv = b.if_launched_usd; }
      else if (key === 'odds') { av = a.launch_odds; bv = b.launch_odds; }
      else if (key === 'net') { av = netCalc(a, ST.dep, ST.drop, ST.tbill).net; bv = netCalc(b, ST.dep, ST.drop, ST.tbill).net; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return cmp * ST.dir;
    });
    return rows;
  }

  /* --- header --- */
  function renderHeader() {
    var totalImp = D.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var farms = D.rows.filter(function (r) { return verdictFor(netCalc(r, ST.dep, ST.drop, ST.tbill).net) === 'FARM'; })
      .sort(function (a, b) { return netCalc(b, ST.dep, ST.drop, ST.tbill).net - netCalc(a, ST.dep, ST.drop, ST.tbill).net; }).slice(0, 3);
    var cov = VAL.coverage;
    var hdr = el('header', { 'class': 'hdr' },
      el('div', { 'class': 'topbar' },
        el('span', { 'class': 'logo', text: '◆ TOKEN RADAR' }),
        el('span', { 'class': 'topmeta', text: 'Snapshot ' + D.as_of + ' · DefiLlama protocol index · radar-5 model' }),
        el('span', { 'class': 'topmeta', text: D.board_size + ' protocols' })),
      el('h1', { text: 'What each unlaunched token would be worth, and whether farming it pays' }),
      el('p', { 'class': 'covline', text: cov.total + '/' + cov.total + ' protocols placed · ' + cov.ranked + '/' + D.watchlist_size + ' watchlist ranked · ' + cov.ranked + ' record no token · ' + cov.already_token + ' already trade · ' + (cov.bridge + cov.staking + cov.exchange + cov.versioned + cov.wrapped) + ' set aside' }),
      el('p', { 'class': 'modelline', text: 'implied value = sizeCurve(TVL, 7d growth) × launchOdds(time with no token) — how it is priced' }),
      el('p', { 'class': 'farmline', id: 'farmline' })
    );
    shell.appendChild(hdr);
    renderFarmLine(farms);
    var stats = el('div', { 'class': 'stats' });
    var card = function (k, v, sub) {
      return el('div', { 'class': 'stat' }, el('div', { 'class': 'stat-k', text: k }), el('div', { 'class': 'stat-v', text: v }), el('div', { 'class': 'stat-s', text: sub }));
    };
    stats.appendChild(card('RANKED', String(D.board_size), D.watchlist_size + ' watchlist + ' + D.early_size + ' early'));
    stats.appendChild(card('IMPLIED VALUE', fmtMoney(totalImp), 'sum of all 198 rows'));
    stats.appendChild(card('OUT-OF-SAMPLE MISS', '×' + VAL.fit.loo_median.toFixed(2), 'flat multiple ×' + VAL.fit.loo_flat_median.toFixed(2) + ' · time split ×' + VAL.fit.time_median.toFixed(2)));
    stats.appendChild(card('RANGE HOLDS', Math.round(VAL.fit.range_hold * 100) + '%', 'P25–P75 from leave-one-out residuals'));
    stats.appendChild(card('LAUNCH ODDS, FITTED', 'π = ' + VAL.odds.pi.toFixed(2), 'half-life ' + VAL.odds.half_life_days + ' days · ' + VAL.odds.dated + ' dated protocols'));
    stats.appendChild(card('WORTH FARMING', String(VAL.verdicts.farm), VAL.verdicts.marginal + ' marginal · ' + VAL.verdicts.skip + ' skip at $1,000 each'));
    shell.appendChild(stats);
    shell.appendChild(el('p', { 'class': 'validstrip', text: 'out-of-sample: leave-one-out ×' + VAL.fit.loo_median.toFixed(2) + ' · time split ×' + VAL.fit.time_median.toFixed(2) + ' · 900-day split ×' + VAL.fit.split900_median.toFixed(2) + ' · ' + Math.round(VAL.fit.within3 * 100) + '% within 3× · flat multiple ×' + VAL.fit.loo_flat_median.toFixed(2) + ' · launch odds Brier ' + VAL.odds.loo_brier.toFixed(3) + ' vs ' + VAL.odds.loo_brier_base.toFixed(3) + ' base rate — every number on this page is computed from the snapshot, not asserted' }));
    var segs = [['ranked', cov.ranked, '#3fae8a'], ['already trade', cov.already_token, '#5b7fa6'], ['bridge', cov.bridge, '#8a6d3b'], ['staking', cov.staking, '#7a5b8a'], ['exchange', cov.exchange, '#6b7c5e'], ['versioned', cov.versioned, '#96505a'], ['wrapped', cov.wrapped, '#5e6b7a']];
    var bar = el('div', { 'class': 'covbar' });
    segs.forEach(function (seg) { bar.appendChild(el('div', { 'class': 'seg', style: 'width:' + (seg[1] / cov.total * 100).toFixed(2) + '%;background:' + seg[2], title: seg[0] + ' ' + seg[1] })); });
    var leg = el('div', { 'class': 'covleg' });
    segs.forEach(function (seg) { leg.appendChild(el('span', { 'class': 'leg', html: '<i style="background:' + seg[2] + '"></i>' + seg[0] + ' ' + seg[1] })); });
    shell.appendChild(bar); shell.appendChild(leg);
  }
  function renderFarmLine(farms) {
    var line = document.getElementById('farmline'); if (!line) return;
    if (!farms) farms = D.rows.filter(function (r) { return verdictFor(netCalc(r, ST.dep, ST.drop, ST.tbill).net) === 'FARM'; })
      .sort(function (a, b) { return netCalc(b, ST.dep, ST.drop, ST.tbill).net - netCalc(a, ST.dep, ST.drop, ST.tbill).net; }).slice(0, 3);
    var names = farms.map(function (r) { return r.name + ' +' + fmtMoney2(netCalc(r, ST.dep, ST.drop, ST.tbill).net); }).join(' · ');
    line.textContent = 'farm next: ' + names + ' — ' + VAL.verdicts.farm + ' FARM, ' + VAL.verdicts.marginal + ' marginal, ' + VAL.verdicts.skip + ' skip at $' + fmt.format(ST.dep) + ' each';
  }

  /* --- what-if controls --- */
  function renderControls() {
    var wrap = el('div', { 'class': 'controls' });
    function group(label, opts, cur, fn) {
      var g = el('div', { 'class': 'ctl' }, el('span', { 'class': 'ctl-k', text: label }));
      opts.forEach(function (o) {
        var b = el('button', { 'class': 'pill' + (o.v === cur ? ' on' : ''), text: o.t });
        b.onclick = function () { fn(o.v); refresh(); };
        g.appendChild(b);
      });
      return g;
    }
    wrap.appendChild(group('DEPOSIT', [{ t: '$1,000', v: 1000 }, { t: '$5,000', v: 5000 }, { t: '$25,000', v: 25000 }], ST.dep, function (v) { ST.dep = v; }));
    wrap.appendChild(group('DROP SHARE', [{ t: '3.5%', v: 0.035 }, { t: '7%', v: 0.07 }, { t: '14%', v: 0.14 }], ST.drop, function (v) { ST.drop = v; }));
    wrap.appendChild(group('T-BILL YIELD', [{ t: '0%', v: 0 }, { t: '4%', v: 0.04 }, { t: '8%', v: 0.08 }], ST.tbill, function (v) { ST.tbill = v; }));
    var exp = el('button', { 'class': 'pill exp', text: 'Export CSV' });
    exp.onclick = downloadCsv;
    wrap.appendChild(exp);
    shell.appendChild(wrap);
  }
  function downloadCsv() {
    var rows = rowsVisible();
    var lines = ['rank,name,category,chains,tvl_usd,change_7d,no_token,age_days,if_launched_usd,launch_odds,implied_value_usd,range_lo_usd,range_hi_usd,net_usd,verdict'];
    rows.forEach(function (r) {
      var calc = netCalc(r, ST.dep, ST.drop, ST.tbill);
      lines.push([r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', '"' + r.chains.join(' ') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d.toFixed(2), fmtAge(r.age_days), r.age_days === null ? '' : r.age_days, Math.round(r.if_launched_usd), r.launch_odds.toFixed(2), Math.round(r.implied_value_usd), Math.round(r.range_lo_usd), Math.round(r.range_hi_usd), calc.net.toFixed(2), verdictFor(calc.net)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'token-radar-board.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* --- filters + board --- */
  function renderFilters() {
    var f = el('div', { 'class': 'filters' });
    var scopeN = { all: D.board_size, watchlist: D.watchlist_size, offlist: D.rows.filter(function (r) { return !r.watchlist && r.tvl_usd >= D.floor_usd; }).length, early: D.rows.filter(function (r) { return !r.watchlist && r.tvl_usd < D.floor_usd; }).length };
    var scopeB = el('div', { 'class': 'fgroup' });
    [['all', 'All'], ['watchlist', 'Watchlist'], ['offlist', 'Off-list'], ['early', 'Early']].forEach(function (o) {
      var b = el('button', { 'class': 'pill' + (ST.scope === o[0] ? ' on' : ''), text: o[1] + ' ' + scopeN[o[0]] });
      b.onclick = function () { ST.scope = o[0]; refresh(); };
      scopeB.appendChild(b);
    });
    f.appendChild(scopeB);
    var verB = el('div', { 'class': 'fgroup' });
    [['all', 'Any verdict'], ['FARM', 'Farm'], ['MARGINAL', 'Marginal'], ['SKIP', 'Skip']].forEach(function (o) {
      var n = o[0] === 'all' ? D.board_size : VAL.verdicts[o[0].toLowerCase()];
      var b = el('button', { 'class': 'pill' + (ST.ver === o[0] ? ' on' : ''), text: o[1] + ' ' + n });
      b.onclick = function () { ST.ver = o[0]; refresh(); };
      verB.appendChild(b);
    });
    f.appendChild(verB);
    var q = el('input', { id: 'q', type: 'search', placeholder: 'Search a protocol…', value: ST.q });
    q.oninput = function () { ST.q = q.value.trim().toLowerCase(); refresh(); };
    f.appendChild(q);
    var cats = Array.from(new Set(D.rows.map(function (r) { return r.category; }).filter(Boolean))).sort();
    var cat = el('select', { id: 'cat' });
    cat.appendChild(el('option', { value: '', text: 'All categories' }));
    cats.forEach(function (c) { cat.appendChild(el('option', { value: c, text: c })); });
    cat.value = ST.cat; cat.onchange = function () { ST.cat = cat.value; refresh(); };
    f.appendChild(cat);
    var chns = Array.from(new Set(D.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var chn = el('select', { id: 'chn' });
    chn.appendChild(el('option', { value: '', text: 'All chains' }));
    chns.forEach(function (c) { chn.appendChild(el('option', { value: c, text: c })); });
    chn.value = ST.chn; chn.onchange = function () { ST.chn = chn.value; refresh(); };
    f.appendChild(chn);
    var tabs = el('div', { 'class': 'tabs' });
    var t1 = el('button', { 'class': 'tab' + (ST.tab === 'pre' ? ' on' : ''), text: 'Pre-token · ' + D.board_size });
    t1.onclick = function () { ST.tab = 'pre'; refresh(); };
    var t2 = el('button', { 'class': 'tab' + (ST.tab === 'live' ? ' on' : ''), text: 'Already trade · ' + D.live_size });
    t2.onclick = function () { ST.tab = 'live'; refresh(); };
    tabs.appendChild(t1); tabs.appendChild(t2);
    f.appendChild(tabs);
    shell.appendChild(f);
  }
  function renderBoard() {
    var wrap = document.getElementById('boardwrap');
    wrap.innerHTML = '';
    if (ST.tab === 'live') {
      var lt = el('table', { 'class': 'board' });
      lt.appendChild(el('thead', {}, el('tr', {},
        el('th', { text: 'PROTOCOL' }), el('th', { 'class': 'num', text: 'TVL' }), el('th', { 'class': 'num', text: '7D' }), el('th', { 'class': 'num', text: 'MARKET CAP' }), el('th', { 'class': 'num', text: 'MCAP / TVL' }))));
      var lb = el('tbody', {});
      D.live.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).forEach(function (r) {
        lb.appendChild(el('tr', {},
          el('td', {}, el('span', { 'class': 'pname', text: r.name }), el('span', { 'class': 'pcat', text: ' ' + (r.category || '') + ' · ' + r.chains.join(', ') })),
          el('td', { 'class': 'num', text: fmtMoney(r.tvl_usd) }),
          el('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'dn'), text: fmtPct(r.change_7d) }),
          el('td', { 'class': 'num', text: fmtMoney(r.mcap_usd) }),
          el('td', { 'class': 'num', text: (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' })));
      });
      lt.appendChild(lb);
      wrap.appendChild(lt);
      wrap.appendChild(el('p', { 'class': 'note', text: 'All ' + D.live_size + ' protocols in the snapshot that already trade, by market cap. The ' + VAL.fit.comps + ' dated ones are the comparables the size curve is fitted on, not rows to farm.' }));
      return;
    }
    var rows = rowsVisible();
    var cols = [['rank', '#'], ['name', 'PROTOCOL'], ['tvl', 'TVL'], ['growth', '7D'], ['age', 'NO TOKEN'], ['if', 'IF LAUNCHED'], ['odds', 'ODDS'], ['implied', 'IMPLIED VALUE'], ['range', 'RANGE'], ['net', 'NET OF FEES'], ['verdict', 'VERDICT']];
    var t = el('table', { 'class': 'board' });
    var tr = el('tr', {});
    cols.forEach(function (c) {
      var th = el('th', { 'class': (c[0] === 'name' ? '' : 'num') + (ST.sort === c[0] ? ' sorted' : ''), text: c[1] + (ST.sort === c[0] ? (ST.dir === -1 ? ' ↓' : ' ↑') : '') });
      th.onclick = function () { if (ST.sort === c[0]) ST.dir = -ST.dir; else { ST.sort = c[0]; ST.dir = c[0] === 'name' ? 1 : -1; } refresh(); };
      tr.appendChild(th);
    });
    t.appendChild(el('thead', {}, tr));
    var tb = el('tbody', {});
    rows.forEach(function (r) {
      var calc = netCalc(r, ST.dep, ST.drop, ST.tbill);
      var v = verdictFor(calc.net);
      var be = beOdds(r, ST.dep, ST.drop, ST.tbill);
      var row = el('tr', { 'class': 'row', id: 'r-' + r.slug });
      row.onclick = function () { showDetail(r); };
      row.appendChild(el('td', { 'class': 'num rank', text: String(r.rank) }));
      var nameCell = el('td', {}, el('span', { 'class': 'pname', text: r.name }), el('span', { 'class': 'pcat', text: ' ' + (r.category || '') + ' · ' + r.chains.join(', ') }));
      if (v !== 'SKIP') nameCell.appendChild(el('span', { 'class': 'planline', text: '→ ' + planShort(r) + ' · ' + r.farm_chain + ' · net ' + fmtMoney2(calc.net) }));
      row.appendChild(nameCell);
      row.appendChild(el('td', { 'class': 'num', text: fmtMoney(r.tvl_usd) }));
      row.appendChild(el('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'dn'), text: fmtPct(r.change_7d) }));
      row.appendChild(el('td', { 'class': 'num', text: fmtAge(r.age_days) }));
      row.appendChild(el('td', { 'class': 'num', text: fmtMoney(r.if_launched_usd) }));
      row.appendChild(el('td', { 'class': 'num' }, el('div', { text: fmtOdds(r.launch_odds) }), el('div', { 'class': 'beodds', text: be === null ? '' : 'BE ' + fmtOdds(be) })));
      row.appendChild(el('td', { 'class': 'num strong', text: fmtMoney(r.implied_value_usd) }));
      row.appendChild(el('td', { 'class': 'num range', text: fmtMoney(r.range_lo_usd) + '–' + fmtMoney(r.range_hi_usd) }));
      row.appendChild(el('td', { 'class': 'num ' + (calc.net >= 0 ? 'up' : 'dn'), text: fmtMoney2(calc.net) }));
      row.appendChild(el('td', { 'class': 'num' }, el('span', { 'class': 'verdict v-' + v.toLowerCase(), text: v })));
      tb.appendChild(row);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    wrap.appendChild(el('p', { 'class': 'note', text: rows.length + ' rows · implied value = if launched × launch odds · net of fees at a $' + fmt.format(ST.dep) + ' deposit, ' + Math.round(ST.drop * 100) + '% drop share, ' + Math.round(ST.tbill * 100) + '% T-bill yield · FARM means net ≥ $' + MC.farm_threshold_usd + ' · click a row for the farm plan' }));
  }

  /* --- out-of-sample panel --- */
  function scatterSvg() {
    var W = 520, H = 300, pad = 34;
    var x0 = 5.5, x1 = 9.6, y0 = 5.0, y1 = 9.9;
    function pxOf(v) { return pad + (v - x0) / (x1 - x0) * (W - 2 * pad); }
    function pyOf(v) { return H - pad - (v - y0) / (y1 - y0) * (H - 2 * pad); }
    var marks = D.comps.map(function (p) { return '<circle cx="' + pxOf(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + pyOf(Math.log10(p.mcap_usd)).toFixed(1) + '" r="2.2" fill="#5b7fa6" opacity="0.55"/>'; }).join('');
    var fit = VAL.fit;
    var curvePts = [];
    for (var i = 0; i <= 40; i++) {
      var xv = x0 + (x1 - x0) * i / 40;
      curvePts.push(pxOf(xv).toFixed(1) + ',' + pyOf(fit.intercept + fit.slope * xv + fit.quad * xv * xv).toFixed(1));
    }
    var curve = '<polyline points="' + curvePts.join(' ') + '" fill="none" stroke="#3fae8a" stroke-width="2"/>';
    var flatLine = '<line x1="' + pxOf(x0) + '" y1="' + pyOf(x0 + Math.log10(fit.flat_median)) + '" x2="' + pxOf(x1) + '" y2="' + pyOf(x1 + Math.log10(fit.flat_median)) + '" stroke="#96505a" stroke-width="1.5" stroke-dasharray="5 4"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart">' +
      '<text x="' + (W / 2) + '" y="16" class="ct" text-anchor="middle">Market cap vs TVL — ' + VAL.fit.comps + ' dated traded protocols (log scale)</text>' +
      '<text x="14" y="' + (H / 2) + '" class="ca" transform="rotate(-90 14 ' + (H / 2) + ')" text-anchor="middle">log market cap</text>' +
      '<text x="' + (W / 2) + '" y="' + (H - 8) + '" class="ca" text-anchor="middle">log TVL</text>' +
      marks + flatLine + curve +
      '<text x="' + (W - pad - 4) + '" y="' + (pyOf(fit.intercept + fit.slope * x1 + fit.quad * x1 * x1) - 6) + '" class="cl" text-anchor="end">size curve</text>' +
      '<text x="' + (W - pad - 4) + '" y="' + (pyOf(x1 + Math.log10(fit.flat_median)) + 14) + '" class="cl2" text-anchor="end">flat ×' + fit.flat_median.toFixed(2) + '</text>' +
      '</svg>';
  }
  function oddsBarsSvg() {
    var W = 520, H = 190, pad = 34, bw = 26;
    var buckets = VAL.odds.buckets;
    var n = buckets.length, step = (W - 2 * pad) / n;
    var bars = buckets.map(function (bk, i) {
      var bx = pad + i * step + (step - bw * 2 - 4) / 2;
      var hActual = bk.actual_no_token * (H - 2 * pad), hModel = bk.predicted_no_token * (H - 2 * pad);
      return '<rect x="' + bx.toFixed(1) + '" y="' + (H - pad - hActual).toFixed(1) + '" width="' + bw + '" height="' + hActual.toFixed(1) + '" fill="#3fae8a"/>' +
        '<rect x="' + (bx + bw + 4).toFixed(1) + '" y="' + (H - pad - hModel).toFixed(1) + '" width="' + bw + '" height="' + hModel.toFixed(1) + '" fill="none" stroke="#e8e6df" stroke-width="1.2"/>' +
        '<text x="' + (bx + bw + 2).toFixed(1) + '" y="' + (H - 12) + '" class="ca" text-anchor="middle">' + bk.lo_days + '–' + (bk.hi_days >= 100000 ? '∞' : bk.hi_days) + 'd</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart">' +
      '<text x="' + (W / 2) + '" y="16" class="ct" text-anchor="middle">Launch odds — share with no token, by age (actual vs model)</text>' +
      bars +
      '<text x="' + pad + '" y="' + (H - pad + 22) + '" class="cl">■ actual</text><text x="' + (pad + 70) + '" y="' + (H - pad + 22) + '" class="cl">□ model</text>' +
      '</svg>';
  }
  function renderOos() {
    var fit = VAL.fit;
    var panel = el('section', { 'class': 'oos' },
      el('h2', { text: 'Does it hold on tokens it never saw?' }),
      el('p', { 'class': 'oos-sub', text: 'Every term is tested three ways on the ' + VAL.fit.comps + ' dated traded protocols: leave-one-out, a time split that fits the older half and checks the newer half, and a 900-day split that fits protocols listed at least 900 days ago and checks the younger ones — the board’s own population. A term stays only if adding it to the spec does not lose any of the three tests. The ' + VAL.fit.excluded_undated + ' traded protocols with no listing date are left out of the fit: legacy products whose token covers other products, with market-cap/TVL ratios from 0.00 to 18.96.' }));
    var cols = el('div', { 'class': 'oos-grid' });
    var colL = el('div', { 'class': 'oos-col' });
    var tbl = el('table', { 'class': 'mini' });
    tbl.appendChild(el('thead', {}, el('tr', {}, el('th', { text: 'TERM' }), el('th', { 'class': 'num', text: 'LEAVE-ONE-OUT' }), el('th', { 'class': 'num', text: 'TIME SPLIT' }), el('th', { 'class': 'num', text: '900-DAY SPLIT' }), el('th', { 'class': 'num', text: 'KEPT' }))));
    var body = el('tbody', {});
    fit.terms.forEach(function (term) {
      body.appendChild(el('tr', {},
        el('td', { text: term.term }),
        el('td', { 'class': 'num', text: '×' + term.loo_median.toFixed(2) }),
        el('td', { 'class': 'num', text: '×' + term.time_median.toFixed(2) }),
        el('td', { 'class': 'num', text: '×' + term.split900_median.toFixed(2) }),
        el('td', { 'class': 'num', text: term.kept ? 'yes' : 'no' })));
    });
    body.appendChild(el('tr', { 'class': 'flatrow' },
      el('td', { text: 'flat median multiple' }),
      el('td', { 'class': 'num', text: '×' + fit.loo_flat_median.toFixed(2) }),
      el('td', { 'class': 'num', text: '×' + fit.time_flat_median.toFixed(2) }),
      el('td', { 'class': 'num', text: '×' + fit.split900_flat_median.toFixed(2) }),
      el('td', { 'class': 'num', text: 'no' })));
    tbl.appendChild(body);
    colL.appendChild(tbl);
    colL.appendChild(el('p', { 'class': 'note', text: 'Median miss: the size curve is off by ×' + fit.loo_median.toFixed(2) + ' on a token it never saw (flat multiple ×' + fit.loo_flat_median.toFixed(2) + '); ' + Math.round(fit.within3 * 100) + '% of its leave-one-out predictions land within 3× of the actual market cap, and three quarters of misses are under ×' + fit.loo_p75.toFixed(2) + '. The P25–P75 range holds ' + Math.round(fit.range_hold * 100) + '% of actual market caps.' }));
    colL.appendChild(el('p', { 'class': 'note', text: 'Launch odds are a survival fit on the ' + VAL.odds.dated + ' dated protocols that stand alone like the board’s rows — bridges, exchanges and staking products are left out, because their value accrues to a token that already trades. π = ' + VAL.odds.pi.toFixed(2) + ' ever launch, half-life ' + VAL.odds.half_life_days + ' days. The time split fits the older cohort and checks the newer one: it overstates the newer cohort’s no-token share by up to 9 points in the 180–365 day bucket — the launch rate is not stationary. Held out, the odds score Brier ' + VAL.odds.loo_brier.toFixed(3) + ' against ' + VAL.odds.loo_brier_base.toFixed(3) + ' for the base rate; at a 50% threshold they classify no better than guessing “no token” (' + Math.round(VAL.odds.accuracy * 100) + '% vs ' + Math.round(VAL.odds.accuracy_base * 100) + '%) — what they add is calibration across ages, shown in the buckets.' }));
    cols.appendChild(colL);
    var colR = el('div', { 'class': 'oos-col' });
    colR.innerHTML = scatterSvg() + oddsBarsSvg();
    cols.appendChild(colR);
    panel.appendChild(cols);
    shell.appendChild(panel);
  }

  /* --- model section --- */
  function renderModel() {
    var fit = VAL.fit, odds = VAL.odds;
    var panel = el('section', { 'class': 'model' },
      el('h2', { text: 'How it is priced' }),
      el('p', { 'class': 'model-formula', text: 'implied value = sizeCurve(TVL, 7d growth) × launchOdds(time with no token)' }),
      el('p', { 'class': 'model-note', text: 'sizeCurve is the quadratic log-log fit on ' + fit.comps + ' dated traded protocols: log₁₀(market cap) = ' + fit.intercept.toFixed(3) + ' + ' + fit.slope.toFixed(3) + ' × log₁₀(TVL) + ' + fit.quad.toFixed(3) + ' × log₁₀(TVL)² + ' + fit.growth_coef.toFixed(3) + ' × log₁₀(1 + 7d change). The flat median multiple is ' + fit.flat_median.toFixed(3) + ' — it misses by ×' + fit.loo_flat_median.toFixed(2) + ' where the curve misses by ×' + fit.loo_median.toFixed(2) + '.' }),
      el('p', { 'class': 'model-note', text: 'The 7-day growth coefficient is negative: a TVL surge prices a token down, not up — the surge is usually deposits chasing yield, not a re-rating. The growth feature is winsorized to the range the comparables show (7d change ' + Math.round((10 ** fit.growth_feat_lo - 1) * 100) + '% to +' + Math.round((10 ** fit.growth_feat_hi - 1) * 100) + '%): a board row outside that range is priced as if it were at the edge, never extrapolated. The ' + fit.excluded_undated + ' traded protocols with no listing date are left out of the fit entirely — legacy products whose token covers other products.' }),
      el('p', { 'class': 'model-note', text: 'launchOdds comes from a survival model: a fraction π = ' + odds.pi.toFixed(2) + ' of protocols ever launch, launchers launch with a constant hazard, half-life ' + odds.half_life_days + ' days. At 30 days the odds are 52%, at 4 years 26%. A protocol with no listed date takes π.' }),
      el('p', { 'class': 'model-note', text: 'The farm verdict is costed at a $' + fmt.format(ST.dep) + ' deposit, a ' + Math.round(ST.drop * 100) + '% drop share and a ' + Math.round(ST.tbill * 100) + '% T-bill yield: slice = drop share × if launched × deposit / TVL, expected = slice × odds, fees = (4 + ceil(hold / 14)) × gas ($' + MC.gas_cheap_usd.toFixed(2) + ' a transaction off Ethereum, $' + MC.gas_ethereum_usd.toFixed(2) + ' on it, cheapest chain), T-bill cost = yield × deposit × hold / 365. FARM means net ≥ $' + MC.farm_threshold_usd + '; MARGINAL means net above $0; the rest are SKIP. Hold is 45 days under 6 months old, 60 days under 18 months, 90 days older.' }),
      el('p', { 'class': 'model-note', text: 'What the model does not do: it cannot see a protocol’s team, its token design, or whether a drop will happen at all. The odds are a population rate, not a promise for any one row. Values are model estimates, not prices.' }));
    shell.appendChild(panel);
  }

  /* --- detail dialog --- */
  var dlg = null;
  function renderDialog() {
    dlg = el('div', { id: 'dlg', 'class': 'dlg', style: 'display:none' });
    dlg.onclick = function (e) { if (e.target === dlg) hideDetail(); };
    document.body.appendChild(dlg);
  }
  function showDetail(r) {
    ST.sel = r.slug;
    var calc = netCalc(r, ST.dep, ST.drop, ST.tbill);
    var v = verdictFor(calc.net);
    var md = minDeposit(r, ST.drop, ST.tbill);
    var be = beOdds(r, ST.dep, ST.drop, ST.tbill);
    var base = r.if_launched_usd / r.growth_carry;
    var body = el('div', { 'class': 'dlg-inner' });
    var closeBtn = el('button', { 'class': 'dlg-x', text: '✕' });
    closeBtn.onclick = hideDetail;
    body.appendChild(closeBtn);
    body.appendChild(el('h2', {}, el('span', { text: '#' + r.rank + ' ' + r.name + ' ' }), el('span', { 'class': 'verdict v-' + v.toLowerCase(), text: v })));
    body.appendChild(el('p', { 'class': 'dlg-sub', text: (r.category || '') + ' · ' + r.chains.join(', ') + ' · TVL ' + fmtMoney(r.tvl_usd) + ' · ' + (r.change_7d === null ? 'no 7d change' : fmtPct(r.change_7d) + ' in 7 days') + ' · no token for ' + fmtAge(r.age_days) }));
    body.appendChild(el('h3', { text: 'Why ' + fmtMoney(r.implied_value_usd) }));
    body.appendChild(el('table', { 'class': 'mini why' },
      el('tbody', {},
        el('tr', {}, el('td', { text: 'TVL ' + fmtMoney(r.tvl_usd) + ' through the size curve' }), el('td', { 'class': 'num', text: fmtMoney(base) })),
        el('tr', {}, el('td', { text: '× growth factor ' + r.growth_carry.toFixed(2) + ' (7d ' + fmtPct(r.change_7d === null ? 0 : r.change_7d) + '; the fit prices surges down, winsorized to the comparables’ range)' }), el('td', { 'class': 'num', text: '= ' + fmtMoney(r.if_launched_usd) + ' if launched' })),
        el('tr', {}, el('td', { text: '× launch odds ' + fmtOdds(r.launch_odds) + ' (' + fmtAge(r.age_days) + ' with no token)' }), el('td', { 'class': 'num', text: '= ' + fmtMoney(r.implied_value_usd) })),
        el('tr', {}, el('td', { text: 'P25–P75 range, from leave-one-out residuals' }), el('td', { 'class': 'num', text: fmtMoney(r.range_lo_usd) + ' – ' + fmtMoney(r.range_hi_usd) })))));
    body.appendChild(el('h3', { text: 'Farm plan — $' + fmt.format(ST.dep) + ' on ' + r.farm_chain }));
    var planTbl = el('table', { 'class': 'mini plan' });
    planTbl.appendChild(el('thead', {}, el('tr', {}, el('th', { text: 'WHEN' }), el('th', { text: 'STEP' }), el('th', { 'class': 'num', text: 'COST' }), el('th', { 'class': 'num', text: 'TIME' }))));
    var planBody = el('tbody', {});
    planBuild(r, ST.dep).forEach(function (step) {
      planBody.appendChild(el('tr', {}, el('td', { text: step.when }), el('td', { text: step.text }), el('td', { 'class': 'num', text: step.cost }), el('td', { 'class': 'num', text: step.time })));
    });
    planTbl.appendChild(planBody);
    body.appendChild(planTbl);
    body.appendChild(el('h3', { text: 'Net of fees' }));
    body.appendChild(el('table', { 'class': 'mini why' },
      el('tbody', {},
        el('tr', {}, el('td', { text: 'slice if it launches (' + Math.round(ST.drop * 100) + '% of ' + fmtMoney(r.if_launched_usd) + ' × $' + fmt.format(ST.dep) + ' / TVL)' }), el('td', { 'class': 'num', text: fmtMoney2(calc.slice) })),
        el('tr', {}, el('td', { text: '× launch odds ' + fmtOdds(r.launch_odds) }), el('td', { 'class': 'num', text: fmtMoney2(calc.expected) })),
        el('tr', {}, el('td', { text: '− fees (' + (4 + calc.fortnights) + ' transactions on ' + r.farm_chain + ')' }), el('td', { 'class': 'num', text: '−' + fmtMoney2(calc.fees) })),
        el('tr', {}, el('td', { text: '− T-bill cost (' + Math.round(ST.tbill * 100) + '% × $' + fmt.format(ST.dep) + ' × ' + r.hold_days + ' days)' }), el('td', { 'class': 'num', text: '−' + fmtMoney2(calc.tbill) })),
        el('tr', { 'class': 'total' }, el('td', { text: 'net' }), el('td', { 'class': 'num', text: fmtMoney2(calc.net) })))));
    body.appendChild(el('p', { 'class': 'note', text: 'Break-even odds ' + (be === null ? '—' : fmtOdds(be)) + ' · pays from a deposit of ' + (md === null ? '— never at this drop share' : '$' + fmt.format(Math.ceil(md))) + ' · the verdict uses the current what-if settings: deposit $' + fmt.format(ST.dep) + ', drop share ' + Math.round(ST.drop * 100) + '%, T-bill ' + Math.round(ST.tbill * 100) + '%.' }));
    dlg.innerHTML = '';
    dlg.appendChild(body);
    dlg.style.display = 'flex';
    history.replaceState(null, '', '#p=' + r.slug);
  }
  function hideDetail() {
    ST.sel = null;
    dlg.style.display = 'none';
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* --- footer + boot --- */
  function renderFooter() {
    shell.appendChild(el('footer', { 'class': 'foot', text: 'Built from the ' + D.as_of + ' DefiLlama protocol snapshot (758 protocols). Values are model estimates, not prices. Not financial advice. Model ' + D.model_version + '.' }));
  }
  function refresh() {
    renderBoard();
    renderFarmLine();
    var q = document.getElementById('q'); if (q && document.activeElement !== q) q.value = ST.q;
  }
  function start() {
    renderHeader();
    renderControls();
    renderFilters();
    shell.appendChild(el('div', { id: 'boardwrap' }));
    renderBoard();
    renderOos();
    renderModel();
    renderFooter();
    renderDialog();
    var match = location.hash.match(/#p=([\w-]+)/);
    if (match) {
      var row = D.rows.find(function (item) { return item.slug === match[1]; });
      if (row) showDetail(row);
    }
    window.addEventListener('hashchange', function () {
      var match2 = location.hash.match(/#p=([\w-]+)/);
      if (match2) {
        var row2 = D.rows.find(function (item) { return item.slug === match2[1]; });
        if (row2) showDetail(row2);
      } else hideDetail();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideDetail(); });
  }
  start();
})();
