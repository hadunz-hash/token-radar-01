// Token Radar's model (radar-4): one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a
// ceiling) and adds the early radar: every pre-token protocol the watchlist
// does not name that stands alone, by the watchlist's own exclusion rule.
// This snapshot holds 198 such protocols (40 on the watchlist, 138 below
// the floor and 20 above it that the watchlist leaves out) of 758; the
// other 560 are set aside, each group for one stated reason, and the
// dashboard accounts for all of them.
//
// Implied value follows only from the snapshot's own figures, through a
// fitted curve, not a hand-picked multiple:
//
//   sizeCurve   = the log-log line log10(market cap) = a + b x log10(TVL),
//                 fitted by least squares on the snapshot's own traded
//                 protocols (128 of them). No coefficient is hardcoded: the
//                 fit is computed from the snapshot at every run.
//   ifLaunched  = sizeCurve(TVL) x growthCarry, the value if the protocol
//                 launched a token at the market's own pricing.
//   growthCarry = clamp(1 + (clamp(change_7d, -70, 500) - marketGrowth) / 100,
//                 0.30, 5.00), where marketGrowth is the median seven-day
//                 change of every protocol in the snapshot. A protocol that
//                 outgrew the market carries that momentum forward; one that
//                 shrank is cut. The carry is a PROJECTION, not a fit: it is
//                 labelled as one wherever it appears, because adding growth
//                 to the fitted curve itself loses both out-of-sample tests.
//   launchOdds  = the share of protocols this old with no token that ever
//                 launch one, from a survival model fitted on the 383 dated
//                 protocols that stand alone like the board's rows (bridges,
//                 exchanges and staking products are left out, because their
//                 value accrues to a token that already trades): a fraction
//                 pi of protocols ever launch, and launchers launch with a
//                 constant hazard lambda, so the share with a token by age t
//                 is pi x (1 - e^(-lambda x t)). The fit (pi = 0.53,
//                 half-life 866 days) is found by maximum likelihood on the
//                 snapshot itself, and the curve is checked against the age
//                 buckets it never saw in isolation. At 30 days the odds are
//                 0.52, at 4 years 0.26: older no-token protocols are less
//                 likely ever to launch. A protocol with no listed date
//                 takes pi, the share that ever launches at all.
//   implied     = round(ifLaunched x launchOdds), with a P25-P75 range from
//                 the leave-one-out residuals of the size curve.
//
// Every claim the dashboard prints about the model is computed from the
// snapshot at run time and validated out of sample, two ways: leave-one-out
// (each traded token priced from a fit that never saw it) and a time split
// (the older half of the traded tokens fits, the newer half is predicted).
// Terms that do not win both tests are dropped and the dashboard says so:
// growth inside the fit, chain count, age inside the fit, and a category
// premium all fail at least one test. A protocol that records no token is
// described as recording none, never as having none: the record is not proof.
//
// A row's farm verdict follows from the same numbers, at a $1,000 deposit,
// a 7% drop share and a 4% T-bill yield unless the reader changes them:
//   slice       = dropShare x ifLaunched x deposit / TVL
//   expected    = slice x launchOdds
//   fees        = (4 + ceil(holdDays / 14)) x gas, gas $0.50 a transaction
//                 off Ethereum and $1.50 on it, on the cheapest of the
//                 protocol's chains: one to fund the wallet, two to approve
//                 and deposit, one per fortnight of active farming, one to
//                 claim. Weekly checks are reads and cost nothing.
//   given up    = T-bill yield x deposit x holdDays / 365
//   net         = expected - fees - given up
//   FARM when net is at least $10, MARGINAL when it is positive but below
//   $10, SKIP when it is zero or negative. The detail view also prints the
//   break-even launch odds and the smallest deposit that pays.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the page may read. */
export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  carry_floor: number;
  carry_cap: number;
  unknown_age_days: number;
  deposit_usd: number;
  deposit_options: number[];
  drop_share: number;
  drop_share_options: number[];
  tbill_yield: number;
  tbill_options: number[];
  farm_threshold_usd: number;
  gas_cheap_usd: number;
  gas_ethereum_usd: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -70,
  growth_cap: 500,
  carry_floor: 0.3,
  carry_cap: 5.0,
  unknown_age_days: 365,
  deposit_usd: 1000,
  deposit_options: [1000, 5000, 25000],
  drop_share: 0.07,
  drop_share_options: [0.035, 0.07, 0.14],
  tbill_yield: 0.04,
  tbill_options: [0, 0.04, 0.08],
  farm_threshold_usd: 10,
  gas_cheap_usd: 0.5,
  gas_ethereum_usd: 1.5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A protocol counts as rising when its TVL grew at least this much in 7 days. */
export const RISING_PCT = 20;

/** One out-of-sample test of a value term: leave-one-out and time-split median misses. */
export interface TermTest {
  term: string;
  loo_median: number;
  time_median: number;
  kept: boolean;
  note: string;
}

/** The fitted size curve and the two tests that validate it. */
export interface SizeFit {
  comps: number;
  intercept: number;
  slope: number;
  flat_median: number;
  market_growth: number;
  loo_median: number;
  loo_p75: number;
  loo_flat_median: number;
  loo_flat_p75: number;
  time_median: number;
  time_flat_median: number;
  range_lo_factor: number;
  range_hi_factor: number;
  range_hold: number;
  terms: TermTest[];
}

/** One age bucket of the launch-odds calibration. */
export interface OddsBucket {
  lo_days: number;
  hi_days: number;
  n: number;
  actual_no_token: number;
  predicted_no_token: number;
}

/** The fitted launch-odds curve and its calibration. */
export interface OddsFit {
  dated: number;
  pi: number;
  lambda_per_day: number;
  half_life_days: number;
  buckets: OddsBucket[];
  time_split: OddsBucket[];
}

/** How the 758 protocols split between ranked and set aside, each for one reason. */
export interface Coverage {
  ranked: number;
  already_token: number;
  bridge: number;
  staking: number;
  exchange: number;
  versioned: number;
  wrapped: number;
  total: number;
}

/** How many rows each verdict holds at the default deposit, drop share and T-bill yield. */
export interface VerdictCounts {
  farm: number;
  marginal: number;
  skip: number;
}

/** The validation the dashboard prints, all computed from the snapshot at run time. */
export interface Validation {
  fit: SizeFit;
  odds: OddsFit;
  coverage: Coverage;
  verdicts: VerdictCounts;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  if_launched_usd: number;
  launch_odds: number;
  range_lo_usd: number;
  range_hi_usd: number;
  growth_carry: number;
  hold_days: number;
  farm_chain: string;
  gas_usd: number;
  fees_usd: number;
  tbill_usd: number;
  slice_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  break_even_odds: number | null;
  min_deposit_usd: number | null;
  model: {
    fit_intercept: number;
    fit_slope: number;
    market_growth: number;
    growth_pct: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  if_launched_usd: number;
  launch_odds: number;
  range_lo_usd: number;
  range_hi_usd: number;
  growth_carry: number;
  hold_days: number;
  farm_chain: string;
  gas_usd: number;
  fees_usd: number;
  tbill_usd: number;
  slice_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  break_even_odds: number | null;
  min_deposit_usd: number | null;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One traded protocol's TVL and market cap, for the size-curve chart. */
export interface CompPoint {
  tvl_usd: number;
  mcap_usd: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  validation: Validation;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: CompPoint[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty sorted array. */
function medianOf(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted array by linear interpolation. */
function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The miss of a prediction against the truth: the larger over the smaller, at least 1. */
function missOf(pred: number, actual: number): number {
  if (pred <= 0 || actual <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(pred, actual) / Math.min(pred, actual);
}

/** Solve a small dense linear system by Gauss-Jordan with partial pivoting. */
function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const k = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    const div = m[c]![c]!;
    if (div === 0) return new Array(k).fill(0);
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / div;
      for (let cc = c; cc <= k; cc++) m[r]![cc]! -= f * m[c]![cc]!;
    }
  }
  return m.map((row, i) => row[k]! / row[i]!);
}

/** Least squares for log10(mcap) on the given features of the traded protocols. */
function olsFit(rows: SnapshotProtocol[], features: ((p: SnapshotProtocol) => number)[]): number[] {
  const k = 1 + features.length;
  const a: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const b: number[] = new Array(k).fill(0);
  for (const p of rows) {
    const x = [1, ...features.map((f) => f(p))];
    const y = Math.log10(p.mcap_usd!);
    for (let i = 0; i < k; i++) {
      b[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) a[i]![j]! += x[i]! * x[j]!;
    }
  }
  return solveLinear(a, b);
}

/** The fitted value of a protocol under coefficients `beta` and `features`. */
function olsPredict(beta: number[], features: ((p: SnapshotProtocol) => number)[], p: SnapshotProtocol): number {
  let s = beta[0]!;
  for (let i = 0; i < features.length; i++) s += beta[i + 1]! * features[i]!(p);
  return 10 ** s;
}

const logTvl = (p: SnapshotProtocol): number => Math.log10(Math.max(1, p.tvl_usd));
const growthFeat = (p: SnapshotProtocol): number => {
  const g = finite(p.change_7d, 0);
  return Math.log10(1 + Math.max(-0.9, Math.min(9, g / 100)));
};
const chainsFeat = (p: SnapshotProtocol): number => Math.log10(Math.max(1, p.chains.length));
const ageFeat = (p: SnapshotProtocol, asOf: string): number => {
  const age = ageDays(asOf, p.listed_at);
  return Math.log10(Math.max(1, age ?? 365));
};

/** The traded protocols: a market cap and a TVL, both positive. */
function tradedComps(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Leave-one-out median and p75 miss of a feature set, plus the log residuals. */
function looTest(comps: SnapshotProtocol[], features: ((p: SnapshotProtocol) => number)[]): { median: number; p75: number; residuals: number[] } {
  const misses: number[] = [];
  const residuals: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const beta = olsFit(rest, features);
    const pred = olsPredict(beta, features, comps[i]!);
    misses.push(missOf(pred, comps[i]!.mcap_usd!));
    residuals.push(Math.log10(comps[i]!.mcap_usd!) - Math.log10(pred));
  }
  misses.sort((a, b) => a - b);
  residuals.sort((a, b) => a - b);
  return { median: medianOf(misses), p75: quantileOf(misses, 0.75), residuals };
}

/** Time-split median miss: the older half fits, the newer half is predicted. */
function timeSplitTest(comps: SnapshotProtocol[], features: ((p: SnapshotProtocol) => number)[]): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const old = dated.slice(0, half);
  const recent = dated.slice(half);
  const beta = olsFit(old, features);
  const misses = recent.map((p) => missOf(olsPredict(beta, features, p), p.mcap_usd!)).sort((a, b) => a - b);
  return medianOf(misses);
}

/** Leave-one-out median miss of the flat multiple (the median market-cap/TVL, refit each fold). */
function looFlatTest(comps: SnapshotProtocol[]): { median: number; p75: number } {
  const misses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const ratios = rest.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
    const med = medianOf(ratios);
    misses.push(missOf(med * comps[i]!.tvl_usd, comps[i]!.mcap_usd!));
  }
  misses.sort((a, b) => a - b);
  return { median: medianOf(misses), p75: quantileOf(misses, 0.75) };
}

/** Time-split median miss of the flat multiple (the older half's median prices the newer half). */
function timeSplitFlatTest(comps: SnapshotProtocol[]): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const old = dated.slice(0, half);
  const recent = dated.slice(half);
  const ratios = old.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const med = medianOf(ratios);
  const misses = recent.map((p) => missOf(med * p.tvl_usd, p.mcap_usd!)).sort((a, b) => a - b);
  return medianOf(misses);
}

/** Leave-one-out median miss with a shrunk category premium on the log residuals (min 3 comps). */
function looCategoryTest(comps: SnapshotProtocol[]): number {
  const misses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const beta = olsFit(rest, [logTvl]);
    const p = comps[i]!;
    let premium = 0;
    const same = rest.filter((q) => (q.category ?? 'Other') === (p.category ?? 'Other'));
    if (same.length >= 3) {
      const res = same.map((q) => Math.log10(q.mcap_usd!) - (beta[0]! + beta[1]! * Math.log10(q.tvl_usd))).sort((a, b) => a - b);
      premium = 0.5 * medianOf(res);
    }
    const pred = 10 ** (beta[0]! + beta[1]! * Math.log10(p.tvl_usd) + premium);
    misses.push(missOf(pred, p.mcap_usd!));
  }
  misses.sort((a, b) => a - b);
  return medianOf(misses);
}

/** Time-split median miss with the same shrunk category premium. */
function timeSplitCategoryTest(comps: SnapshotProtocol[]): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const old = dated.slice(0, half);
  const recent = dated.slice(half);
  const beta = olsFit(old, [logTvl]);
  const misses = recent.map((p) => {
    let premium = 0;
    const same = old.filter((q) => (q.category ?? 'Other') === (p.category ?? 'Other'));
    if (same.length >= 3) {
      const res = same.map((q) => Math.log10(q.mcap_usd!) - (beta[0]! + beta[1]! * Math.log10(q.tvl_usd))).sort((a, b) => a - b);
      premium = 0.5 * medianOf(res);
    }
    return missOf(10 ** (beta[0]! + beta[1]! * Math.log10(p.tvl_usd) + premium), p.mcap_usd!);
  }).sort((a, b) => a - b);
  return medianOf(misses);
}

/** The fitted size curve and every term the model tested and kept or dropped. */
export function fitSizeCurve(protocols: SnapshotProtocol[], asOf: string): SizeFit {
  const comps = tradedComps(protocols);
  const changes = protocols.map((p) => p.change_7d).filter((c): c is number => typeof c === 'number' && Number.isFinite(c)).sort((a, b) => a - b);
  const marketGrowth = changes.length > 0 ? medianOf(changes) : 0;
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const flatMedian = ratios.length > 0 ? medianOf(ratios) : 0.17;
  const beta = olsFit(comps, [logTvl]);
  const loo = looTest(comps, [logTvl]);
  const looFlat = looFlatTest(comps);
  const timeMedian = timeSplitTest(comps, [logTvl]);
  const timeFlat = timeSplitFlatTest(comps);
  const q25 = quantileOf(loo.residuals, 0.25);
  const q75 = quantileOf(loo.residuals, 0.75);
  const loFactor = 10 ** q25;
  const hiFactor = 10 ** q75;
  let inside = 0;
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const b = olsFit(rest, [logTvl]);
    const pred = 10 ** (b[0]! + b[1]! * Math.log10(comps[i]!.tvl_usd));
    const actual = comps[i]!.mcap_usd!;
    if (actual >= pred * loFactor && actual <= pred * hiFactor) inside++;
  }
  const ageF = (p: SnapshotProtocol): number => ageFeat(p, asOf);
  const growthLoo = looTest(comps, [logTvl, growthFeat]);
  const growthTime = timeSplitTest(comps, [logTvl, growthFeat]);
  const chainsLoo = looTest(comps, [logTvl, chainsFeat]);
  const chainsTime = timeSplitTest(comps, [logTvl, chainsFeat]);
  const ageLoo = looTest(comps, [logTvl, ageF]);
  const ageTime = timeSplitTest(comps, [logTvl, ageF]);
  const catLoo = looCategoryTest(comps);
  const catTime = timeSplitCategoryTest(comps);
  const terms: TermTest[] = [
    {
      term: 'size curve (log TVL)',
      loo_median: round2(loo.median),
      time_median: round2(timeMedian),
      kept: true,
      note: 'the fit itself: beats the flat multiple on both tests',
    },
    {
      term: '7-day growth inside the fit',
      loo_median: round2(growthLoo.median),
      time_median: round2(growthTime),
      kept: false,
      note: 'loses leave-one-out, wins the time split: kept out of the fit, used as a labelled carry instead',
    },
    {
      term: 'chain count',
      loo_median: round2(chainsLoo.median),
      time_median: round2(chainsTime),
      kept: false,
      note: 'loses leave-one-out; more chains do not price a token better',
    },
    {
      term: 'age inside the fit',
      loo_median: round2(ageLoo.median),
      time_median: round2(ageTime),
      kept: false,
      note: 'loses leave-one-out; age belongs in the launch odds, not in the value',
    },
    {
      term: 'category premium',
      loo_median: round2(catLoo),
      time_median: round2(catTime),
      kept: false,
      note: 'loses leave-one-out: a category median does not travel to a new token',
    },
  ];
  return {
    comps: comps.length,
    intercept: round4(beta[0]!),
    slope: round4(beta[1]!),
    flat_median: round4(flatMedian),
    market_growth: round2(marketGrowth),
    loo_median: round2(loo.median),
    loo_p75: round2(loo.p75),
    loo_flat_median: round2(looFlat.median),
    loo_flat_p75: round2(looFlat.p75),
    time_median: round2(timeMedian),
    time_flat_median: round2(timeFlat),
    range_lo_factor: round2(loFactor),
    range_hi_factor: round2(hiFactor),
    range_hold: round2(inside / comps.length),
    terms,
  };
}

/** The negative log-likelihood of the survival model on the dated protocols. */
function survivalNll(dated: { age: number; hasToken: boolean }[], pi: number, lambda: number): number {
  let s = 0;
  for (const d of dated) {
    const f = pi * (1 - Math.exp(-lambda * d.age));
    const clamped = Math.min(Math.max(f, 1e-9), 1 - 1e-9);
    s += d.hasToken ? Math.log(clamped) : Math.log(1 - clamped);
  }
  return -s;
}

/** The survival fit (pi, lambda) by grid search on the dated protocols. */
function fitSurvival(dated: { age: number; hasToken: boolean }[]): { pi: number; lambda: number } {
  const lambdas = [0.0001, 0.0002, 0.0003, 0.0005, 0.0008, 0.001, 0.0015, 0.002, 0.003, 0.005, 0.008];
  let bestPi = 0.4;
  let bestLambda = 0.0008;
  let bestNll = Number.POSITIVE_INFINITY;
  for (let pi100 = 5; pi100 <= 79; pi100++) {
    const pi = pi100 / 100;
    for (const lambda of lambdas) {
      const nll = survivalNll(dated, pi, lambda);
      if (nll < bestNll) {
        bestNll = nll;
        bestPi = pi;
        bestLambda = lambda;
      }
    }
  }
  return { pi: bestPi, lambda: bestLambda };
}

/** P(ever launches | no token at age t) under the survival model. */
function survivalOdds(age: number, pi: number, lambda: number): number {
  const e = Math.exp(-lambda * age);
  return (pi * e) / (1 - pi * (1 - e));
}

/** P(no token by age t) under the survival model. */
function survivalNoToken(age: number, pi: number, lambda: number): number {
  return 1 - pi * (1 - Math.exp(-lambda * age));
}

/**
 * Whether a protocol stands alone: it passes the watchlist's exclusion rule
 * whether or not it already records a token. The odds are fitted on the
 * dated protocols that stand alone, the population the board ranks: bridges,
 * exchanges and staking products are left out because their value accrues
 * to a token that already trades, so they would drag the launch rate down
 * for protocols that could launch one of their own.
 */
export function isStandalone(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The survival-model launch odds, fitted on the dated standalone protocols, with its calibration. */
export function fitOdds(protocols: SnapshotProtocol[], asOf: string): OddsFit {
  const dated = protocols
    .filter((p) => p.listed_at !== null && isStandalone(p))
    .map((p) => ({ age: Math.max(1, ageDays(asOf, p.listed_at)!), hasToken: p.mcap_usd !== null }));
  const { pi, lambda } = fitSurvival(dated);
  const halfLife = Math.log(2) / lambda;
  const bucketEdges: [number, number][] = [[0, 30], [30, 90], [90, 180], [180, 365], [365, 730], [730, 1460], [1460, 100000]];
  const buckets: OddsBucket[] = bucketEdges.map(([lo, hi]) => {
    const inBucket = dated.filter((d) => d.age >= lo && d.age < hi);
    const actual = inBucket.length > 0 ? inBucket.filter((d) => !d.hasToken).length / inBucket.length : 0;
    const predicted = inBucket.length > 0 ? inBucket.reduce((s, d) => s + survivalNoToken(d.age, pi, lambda), 0) / inBucket.length : 0;
    return { lo_days: lo, hi_days: hi, n: inBucket.length, actual_no_token: round2(actual), predicted_no_token: round2(predicted) };
  });
  // Time-split calibration: the curve fitted on protocols listed before
  // 2024-07-15, checked against the newer cohort's buckets. The old-cohort
  // curve overstates the newer cohort's no-token share; the dashboard says
  // so, because the odds are a rough guide, not a precise probability.
  const cut = '2024-07-15';
  const old = protocols
    .filter((p) => p.listed_at !== null && p.listed_at < cut && isStandalone(p))
    .map((p) => ({ age: Math.max(1, ageDays(asOf, p.listed_at)!), hasToken: p.mcap_usd !== null }));
  const recent = protocols
    .filter((p) => p.listed_at !== null && p.listed_at >= cut && isStandalone(p))
    .map((p) => ({ age: Math.max(1, ageDays(asOf, p.listed_at)!), hasToken: p.mcap_usd !== null }));
  const oldFit = old.length > 0 ? fitSurvival(old) : { pi, lambda };
  const timeSplit: OddsBucket[] = [[0, 180], [180, 365], [365, 730], [730, 100000]].map(([lo, hi]) => {
    const inBucket = recent.filter((d) => d.age >= lo && d.age < hi);
    const actual = inBucket.length > 0 ? inBucket.filter((d) => !d.hasToken).length / inBucket.length : 0;
    const predicted = inBucket.length > 0 ? inBucket.reduce((s, d) => s + survivalNoToken(d.age, oldFit.pi, oldFit.lambda), 0) / inBucket.length : 0;
    return { lo_days: lo, hi_days: hi, n: inBucket.length, actual_no_token: round2(actual), predicted_no_token: round2(predicted) };
  });
  return {
    dated: dated.length,
    pi: round2(pi),
    lambda_per_day: lambda,
    half_life_days: Math.round(halfLife),
    buckets,
    time_split: timeSplit,
  };
}

/** The launch odds of a protocol of `age` days under a fitted curve; unknown age takes pi. */
export function launchOddsFor(age: number | null, odds: OddsFit): number {
  if (age === null) return odds.pi;
  return Math.min(0.99, Math.max(0.01, survivalOdds(age, odds.pi, odds.lambda_per_day)));
}

/** The growth carry: a projection of one more week like this one, relative to the market. */
export function growthCarryFor(change7d: number | null, marketGrowth: number, model: ModelConstants): number {
  const g = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(change7d, 0)));
  return Math.min(model.carry_cap, Math.max(model.carry_floor, 1 + (g - marketGrowth) / 100));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s((v|V)\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped, staked or restaked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The watchlist leaves these categories out, because their value accrues to a token that already trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The exchange names a product name must not begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and a genuine
 * candidate for a token of its own. This is the watchlist's own exclusion
 * rule, applied to the early radar as well: a bridge, a liquid staking or
 * restaking product, a wrapped or staked product, a versioned pool, or an
 * exchange product is not a token that does not exist yet.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** Which set-aside bucket a protocol falls in, for the coverage accounting. */
export function coverageBucket(p: SnapshotProtocol): 'ranked' | 'already_token' | 'bridge' | 'staking' | 'exchange' | 'versioned' | 'wrapped' {
  if (isRankable(p)) return 'ranked';
  if (p.symbol !== null) return 'already_token';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'bridge';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'staking';
  if (p.category === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped';
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return 'exchange';
  return 'already_token';
}

/** The coverage accounting: every protocol in exactly one bucket. */
export function coverageOf(protocols: SnapshotProtocol[]): Coverage {
  const c: Coverage = { ranked: 0, already_token: 0, bridge: 0, staking: 0, exchange: 0, versioned: 0, wrapped: 0, total: protocols.length };
  for (const p of protocols) c[coverageBucket(p)]++;
  return c;
}

/** The cheapest chain to farm on: Ethereum costs $5 a transaction, any other chain $0.50. */
export function farmChainFor(p: SnapshotProtocol, model: ModelConstants): { chain: string; gas: number } {
  const chain = p.chains.find((c) => c !== 'Ethereum') ?? p.chains[0] ?? 'its main chain';
  const gas = chain === 'Ethereum' ? model.gas_ethereum_usd : model.gas_cheap_usd;
  return { chain, gas };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The farm verdict and its arithmetic at one deposit, drop share and T-bill yield. */
export function verdictFor(
  ifLaunched: number,
  odds: number,
  tvlUsd: number,
  holdDays: number,
  gas: number,
  model: ModelConstants,
  deposit: number = model.deposit_usd,
  dropShare: number = model.drop_share,
  tbill: number = model.tbill_yield,
): {
  slice: number;
  expected: number;
  fees: number;
  tbillCost: number;
  net: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  breakEvenOdds: number | null;
  minDeposit: number | null;
} {
  const slice = dropShare * ifLaunched * (deposit / Math.max(1, tvlUsd));
  const expected = slice * odds;
  const fortnights = Math.ceil(holdDays / 14);
  const fees = (4 + fortnights) * gas;
  const tbillCost = tbill * deposit * (holdDays / 365);
  const net = expected - fees - tbillCost;
  const verdict = net >= model.farm_threshold_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  const breakEvenOdds = slice > 0 ? Math.min(1, Math.max(0, (fees + tbillCost) / slice)) : null;
  const perDollar = (dropShare * ifLaunched * odds) / Math.max(1, tvlUsd) - (tbill * holdDays) / 365;
  const minDeposit = perDollar > 0 ? Math.ceil(fees / perDollar) : null;
  return { slice, expected, fees, tbillCost, net, verdict, breakEvenOdds, minDeposit };
}

/** A per cent as the farm plan writes it: a sign, two decimals, a per-cent sign. */
export function pctText(n: number): string {
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${deposit.toLocaleString('en-US')} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${deposit.toLocaleString('en-US')} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('canonical bridge')) return `Bridge $${deposit.toLocaleString('en-US')} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${deposit.toLocaleString('en-US')} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad')) return `Deposit $${deposit.toLocaleString('en-US')} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${deposit.toLocaleString('en-US')} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${deposit.toLocaleString('en-US')} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${deposit.toLocaleString('en-US')} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${deposit.toLocaleString('en-US')} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${deposit.toLocaleString('en-US')} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Pay one real invoice of $${deposit.toLocaleString('en-US')} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance')) return `Lock $${deposit.toLocaleString('en-US')} of voting power through ${name} and vote on one live proposal.`;
  if (c.includes('chain') || c.includes('rollup')) return `Use ${name}'s app on ${chain} with $${deposit.toLocaleString('en-US')} and keep the position open.`;
  return `Deposit $${deposit.toLocaleString('en-US')} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The fortnightly qualifying action, fitted to the category: one paid action per fortnight. */
function fortnightlyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Each fortnight make one qualifying action, such as a supply, a borrow or a repayment.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Each fortnight make one qualifying action, such as a swap, an add of liquidity or a harvest.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad')) return 'Each fortnight make one qualifying action, such as one small trade or a funding adjustment.';
  if (c.includes('bridge')) return 'Each fortnight make one qualifying action, such as a bridge, a swap or a claim.';
  if (c.includes('prediction')) return 'Each fortnight make one qualifying action, such as one market position or a settlement.';
  if (c.includes('governance')) return 'Each fortnight make one qualifying action, such as a vote or a delegation change.';
  return 'Each fortnight make one qualifying action, such as a deposit, a borrow, a swap or a vote.';
}

/** The hold step, fitted to the protocol's own momentum: add while it grows, stay small while it shrinks. */
function holdStep(p: SnapshotProtocol, age: number | null, growthPct: number, deposit: number): FarmStep {
  const hold = holdDaysFor(age);
  const floor = Math.max(1, Math.round((p.tvl_usd * 3) / 4 / 1000) * 1000);
  if (growthPct >= RISING_PCT) {
    return {
      text: `Hold the position for at least ${hold} days and add to it while it is growing - ${p.name} rose ${pctText(growthPct)} in 7 days. Check the TVL weekly, free, and leave early if it falls below $${floor.toLocaleString('en-US')}.`,
      cost: `the $${deposit.toLocaleString('en-US')} stays in the position`,
      time: `${hold} days`,
    };
  }
  if (growthPct < 0) {
    return {
      text: `Hold the position for at least ${hold} days; ${p.name} fell ${pctText(growthPct)} in 7 days, so keep the position small and do not add. Check the TVL weekly, free, and leave early if it falls below $${floor.toLocaleString('en-US')}.`,
      cost: `the $${deposit.toLocaleString('en-US')} stays in the position`,
      time: `${hold} days`,
    };
  }
  return {
    text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Check the TVL weekly, free, and leave early if it falls below $${floor.toLocaleString('en-US')}.`,
    cost: `the $${deposit.toLocaleString('en-US')} stays in the position`,
    time: `${hold} days`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, seven-day growth, cheapest chain) and the
 * deposit the reader farms with, never from a hand-written list of names. The page generates the same
 * plan from the same inputs, so the board and the page agree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, growthPct: number, model: ModelConstants, deposit: number = model.deposit_usd): FarmStep[] {
  const { chain, gas } = farmChainFor(p, model);
  const gasText = `$${gas.toFixed(2)}`;
  const fortnights = Math.ceil(holdDaysFor(age) / 14);
  return [
    {
      text: `Use a fresh wallet on ${chain} that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${gasText} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, deposit, chain),
      cost: `$${deposit.toLocaleString('en-US')} of capital and about $${(2 * gas).toFixed(2)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${fortnightlyFor(p)} ${fortnights} paid ${fortnights === 1 ? 'action' : 'actions'} over the hold.`,
      cost: `about ${gasText} of gas each fortnight`,
      time: '10 minutes a fortnight',
    },
    holdStep(p, age, growthPct, deposit),
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: `${gasText} of gas to claim`,
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  fit?: SizeFit,
  odds?: OddsFit,
): { board: BoardRow[]; fit: SizeFit; odds: OddsFit; coverage: Coverage } {
  const sizeFit = fit ?? fitSizeCurve(snapshot.protocols, snapshot.as_of);
  const oddsFit = odds ?? fitOdds(snapshot.protocols, snapshot.as_of);
  const coverage = coverageOf(snapshot.protocols);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every standalone pre-token protocol the watchlist does
  // not name, by TVL — including the twenty above the floor the watchlist
  // leaves out. The watchlist is the floor, never the ceiling, and a
  // protocol above it is no worse a subject. Never a replacement for a
  // watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const ifLaunchedRaw = 10 ** (sizeFit.intercept + sizeFit.slope * Math.log10(Math.max(1, p.tvl_usd)));
    const carry = growthCarryFor(p.change_7d, sizeFit.market_growth, model);
    const ifLaunched = Math.max(1, Math.round(ifLaunchedRaw * carry));
    const oddsValue = launchOddsFor(age, oddsFit);
    const implied = Math.max(1, Math.round(ifLaunched * oddsValue));
    const rangeLo = Math.max(1, Math.round(implied * sizeFit.range_lo_factor));
    const rangeHi = Math.max(1, Math.round(implied * sizeFit.range_hi_factor));
    const hold = holdDaysFor(age);
    const { chain, gas } = farmChainFor(p, model);
    const v = verdictFor(ifLaunched, oddsValue, p.tvl_usd, hold, gas, model);
    const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
    return { p, age, ifLaunched, carry, oddsValue, implied, rangeLo, rangeHi, hold, chain, gas, v, growthPct };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    if_launched_usd: s.ifLaunched,
    launch_odds: round4(s.oddsValue),
    range_lo_usd: s.rangeLo,
    range_hi_usd: s.rangeHi,
    growth_carry: round4(s.carry),
    hold_days: s.hold,
    farm_chain: s.chain,
    gas_usd: s.gas,
    fees_usd: round2(s.v.fees),
    tbill_usd: round2(s.v.tbillCost),
    slice_usd: round2(s.v.slice),
    net_usd: round2(s.v.net),
    verdict: s.v.verdict,
    break_even_odds: s.v.breakEvenOdds === null ? null : round4(s.v.breakEvenOdds),
    min_deposit_usd: s.v.minDeposit,
    model: {
      fit_intercept: sizeFit.intercept,
      fit_slope: sizeFit.slope,
      market_growth: sizeFit.market_growth,
      growth_pct: round4(s.growthPct),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.growthPct, model).map(stepText),
  }));
  return { board, fit: sizeFit, odds: oddsFit, coverage };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    if_launched_usd: row.if_launched_usd,
    launch_odds: row.launch_odds,
    range_lo_usd: row.range_lo_usd,
    range_hi_usd: row.range_hi_usd,
    growth_carry: row.growth_carry,
    hold_days: row.hold_days,
    farm_chain: row.farm_chain,
    gas_usd: row.gas_usd,
    fees_usd: row.fees_usd,
    tbill_usd: row.tbill_usd,
    slice_usd: row.slice_usd,
    net_usd: row.net_usd,
    verdict: row.verdict,
    break_even_odds: row.break_even_odds,
    min_deposit_usd: row.min_deposit_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, fit, odds, coverage } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdicts: VerdictCounts = {
    farm: board.filter((r) => r.verdict === 'FARM').length,
    marginal: board.filter((r) => r.verdict === 'MARGINAL').length,
    skip: board.filter((r) => r.verdict === 'SKIP').length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    validation: { fit, odds, coverage, verdicts },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: snapshot.protocols
      .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
      .map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
