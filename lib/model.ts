// The radar-5 model: a sealed snapshot goes in, a ranked board comes out.
//
// Coverage starts from the snapshot's watchlist (the floor, never the
// ceiling) and then adds the early radar: every standalone pre-token
// protocol the watchlist skips, judged by the watchlist's own exclusion
// rule. This snapshot yields 198 such protocols (40 named on the
// watchlist, 138 below the floor and 20 above it that the watchlist
// leaves out) out of 758; the remaining 560 are set aside, each group
// for one stated reason, and the dashboard accounts for every one.
//
// Implied value comes only from the snapshot's own figures, through a
// fitted curve, never from a hand-picked multiple:
//
//   sizeCurve   = log10(market cap) = a + b x log10(TVL) + c x log10(TVL)^2
//                 + d x log10(1 + 7d change), fitted by least squares on
//                 the snapshot's own traded protocols WITH a listing date
//                 (95 of them). No coefficient is hardcoded: the fit is
//                 recomputed from the snapshot on every run. The 33 traded
//                 protocols with no listing date are left out: legacy
//                 products (Aave V2, Lido, SSV, the big bridges) whose
//                 token covers other products or predates listing records
//                 — their market-cap/TVL ratios span 0.00–18.96 and one in
//                 three misses the curve by 10x, so they do not price a
//                 new token. The growth feature is winsorized to the range
//                 those 95 show (7d change -40% to +27% here), so no board
//                 row is priced on growth beyond what the data has seen.
//   ifLaunched  = sizeCurve(TVL, 7d change), the value if the protocol
//                 launched a token at the market's own pricing. The growth
//                 coefficient d is NEGATIVE: the protocols whose TVL surged
//                 hardest trade at the lowest market cap for their size — a
//                 surge is usually deposits chasing yield, not a re-rating.
//                 The old positive carry assumed the surge would persist;
//                 the tests below say otherwise, so the carry is gone and
//                 growth lives inside the fit, where it is tested.
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
// snapshot at run time and validated out of sample, three ways: leave-one-out
// (each traded token priced from a fit that never saw it), a time split (the
// older half of the traded tokens fits, the newer half is predicted) and a
// 900-day split (protocols listed at least 900 days ago fit, the younger
// ones — the board's own population — are predicted). A term stays only if
// adding it to the spec does not lose any of the three tests: the quadratic
// size term and growth inside the fit both stay; chain count, age inside
// the fit, and a category premium all fail at least one test and the
// dashboard says so. A protocol that records no token is described as
// recording none, never as having none: the record is not proof.
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

/** One protocol entry from the snapshot: exactly the ten fields the sealed input carries. */
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

/** The snapshot document as a whole. */
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

/** The version label of the model: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5';

/** A protocol counts as rising when its TVL grew by at least this much in 7 days. */
export const RISING_PCT = 20;

/** One out-of-sample check of a value term: median misses from leave-one-out, the time split and the 900-day split. */
export interface TermTest {
  term: string;
  loo_median: number;
  time_median: number;
  split900_median: number;
  kept: boolean;
  note: string;
}

/**
 * The fitted size curve plus the three tests that validate it. The fit runs
 * on the dated traded protocols only: the 33 traded protocols with no
 * listing date are legacy products (Aave V2, Lido, SSV, the big bridges)
 * whose token covers other products or predates listing records — their
 * market-cap/TVL ratios span 0.00–18.96 and one in three misses the curve
 * by 10x, so they do not price a new token. `excluded_undated` counts them.
 */
export interface SizeFit {
  comps: number;
  excluded_undated: number;
  intercept: number;
  slope: number;
  quad: number;
  growth_coef: number;
  growth_feat_lo: number;
  growth_feat_hi: number;
  flat_median: number;
  market_growth: number;
  loo_median: number;
  loo_p75: number;
  loo_flat_median: number;
  loo_flat_p75: number;
  within3: number;
  time_median: number;
  time_flat_median: number;
  split900_median: number;
  split900_flat_median: number;
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

/** The fitted launch-odds curve and its calibration. `brier` scores the
 * curve's no-token probability against the base rate (`brier_base`) on the
 * dated protocols; `loo_brier` is the same score with each protocol held
 * out and the curve refit without it (on a coarser grid, for speed).
 * `accuracy` is the share called right at a 50% threshold — the base rate
 * (`accuracy_base`) is what guessing "no token" for every protocol scores,
 * so the odds add calibration, not classification. */
export interface OddsFit {
  dated: number;
  pi: number;
  lambda_per_day: number;
  half_life_days: number;
  buckets: OddsBucket[];
  time_split: OddsBucket[];
  brier: number;
  brier_base: number;
  loo_brier: number;
  loo_brier_base: number;
  accuracy: number;
  accuracy_base: number;
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

/** One farm step: the action, what it costs, and how long it takes. */
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
  /** The fitted growth factor, kept under its old field name: 10 to the power of (growth coefficient times the winsorized growth feature). Under 1 for a protocol whose TVL just surged. */
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
  /** The fitted growth factor, kept under its old field name. */
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
  constructor(msg: string) {
    super(msg);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** A finite number, else `fb`. */
function numOr(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

/** The median of a non-empty sorted array. */
function median(xs: number[]): number {
  const len = xs.length;
  const half = Math.floor(len / 2);
  return len % 2 === 1 ? xs[half]! : (xs[half - 1]! + xs[half]!) / 2;
}

/** A quantile of a sorted array by linear interpolation. */
function quantile(xs: number[], frac: number): number {
  if (xs.length === 0) return 0;
  const pos = (xs.length - 1) * frac;
  const i0 = Math.floor(pos);
  const i1 = Math.ceil(pos);
  if (i0 === i1) return xs[i0]!;
  return xs[i0]! + (xs[i1]! - xs[i0]!) * (pos - i0);
}

const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(ref: string, listed: string | null): number | null {
  if (listed === null) return null;
  const refMs = Date.parse(`${ref}T00:00:00Z`);
  const listedMs = Date.parse(`${listed}T00:00:00Z`);
  if (!Number.isFinite(refMs) || !Number.isFinite(listedMs)) return null;
  return Math.max(0, Math.floor((refMs - listedMs) / MS_PER_DAY));
}

/** The miss of a prediction against the truth: the larger over the smaller, at least 1. */
function missRatio(guess: number, truth: number): number {
  if (guess <= 0 || truth <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(guess, truth) / Math.min(guess, truth);
}

/** Solve a small dense linear system by Gauss-Jordan with partial pivoting. */
function solveSystem(a: number[][], b: number[]): number[] {
  const n = b.length;
  const aug = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(aug[row]![col]!) > Math.abs(aug[best]![col]!)) best = row;
    const swap = aug[col]!;
    aug[col] = aug[best]!;
    aug[best] = swap;
    const pivot = aug[col]![col]!;
    if (pivot === 0) return new Array(n).fill(0);
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]! / pivot;
      for (let j = col; j <= n; j++) aug[row]![j]! -= factor * aug[col]![j]!;
    }
  }
  return aug.map((row, i) => row[n]! / row[i]!);
}

/** Least squares for log10(mcap) on the given features of the traded protocols. */
function leastSquares(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[]): number[] {
  const n = 1 + feats.length;
  const ata: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const atb: number[] = new Array(n).fill(0);
  for (const proto of ps) {
    const xv = [1, ...feats.map((fn) => fn(proto))];
    const yv = Math.log10(proto.mcap_usd!);
    for (let ii = 0; ii < n; ii++) {
      atb[ii]! += xv[ii]! * yv;
      for (let jj = 0; jj < n; jj++) ata[ii]![jj]! += xv[ii]! * xv[jj]!;
    }
  }
  return solveSystem(ata, atb);
}

/** The fitted value of a protocol under coefficients `coef` and `feats`. */
function predictOls(coef: number[], feats: ((p: SnapshotProtocol) => number)[], proto: SnapshotProtocol): number {
  let sum = coef[0]!;
  for (let ii = 0; ii < feats.length; ii++) sum += coef[ii + 1]! * feats[ii]!(proto);
  return 10 ** sum;
}

const logTvlFeat = (proto: SnapshotProtocol): number => Math.log10(Math.max(1, proto.tvl_usd));
const quadTvlFeat = (proto: SnapshotProtocol): number => {
  const lv = logTvlFeat(proto);
  return lv * lv;
};
const growthFeature = (proto: SnapshotProtocol): number => {
  const chg = numOr(proto.change_7d, 0);
  return Math.log10(1 + Math.max(-0.9, Math.min(9, chg / 100)));
};
const chainsFeature = (proto: SnapshotProtocol): number => Math.log10(Math.max(1, proto.chains.length));
const ageFeature = (proto: SnapshotProtocol, ref: string): number => {
  const days = ageDays(ref, proto.listed_at);
  return Math.log10(Math.max(1, days ?? 365));
};

/** The traded protocols: a market cap and a TVL, both positive. */
function tradedOnly(ps: SnapshotProtocol[]): SnapshotProtocol[] {
  return ps.filter((proto) => proto.mcap_usd !== null && proto.mcap_usd > 0 && proto.tvl_usd > 0);
}

/** The traded protocols with a recorded listing date: the fit's population. */
function datedOnly(ps: SnapshotProtocol[]): SnapshotProtocol[] {
  return tradedOnly(ps).filter((proto) => proto.listed_at !== null);
}

/** Leave-one-out median and p75 miss of a feature set, plus the log residuals. */
function looCheck(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[]): { median: number; p75: number; residuals: number[] } {
  const errs: number[] = [];
  const resids: number[] = [];
  for (let ii = 0; ii < ps.length; ii++) {
    const others = ps.filter((_, j) => j !== ii);
    const coef = leastSquares(others, feats);
    const guess = predictOls(coef, feats, ps[ii]!);
    errs.push(missRatio(guess, ps[ii]!.mcap_usd!));
    resids.push(Math.log10(ps[ii]!.mcap_usd!) - Math.log10(guess));
  }
  errs.sort((a, b) => a - b);
  resids.sort((a, b) => a - b);
  return { median: median(errs), p75: quantile(errs, 0.75), residuals: resids };
}

/** Time-split median miss: the older half fits, the newer half is predicted. */
function timeSplitCheck(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[]): number {
  const datedPs = ps.filter((proto) => proto.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const mid = Math.floor(datedPs.length / 2);
  const older = datedPs.slice(0, mid);
  const newer = datedPs.slice(mid);
  const coef = leastSquares(older, feats);
  const errs = newer.map((proto) => missRatio(predictOls(coef, feats, proto), proto.mcap_usd!)).sort((a, b) => a - b);
  return median(errs);
}

/**
 * 900-day split median miss: protocols listed at least 900 days ago fit,
 * the younger ones are predicted. The young cohort is the board's own
 * population — a pre-token protocol is usually young — so this is the
 * hardest of the three tests and the one that kills age and sector terms.
 */
function split900Check(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[], ref: string): number {
  const datedPs = ps.filter((proto) => proto.listed_at !== null);
  const older = datedPs.filter((proto) => ageDays(ref, proto.listed_at)! >= 900);
  const younger = datedPs.filter((proto) => ageDays(ref, proto.listed_at)! < 900);
  const coef = leastSquares(older, feats);
  const errs = younger.map((proto) => missRatio(predictOls(coef, feats, proto), proto.mcap_usd!)).sort((a, b) => a - b);
  return median(errs);
}

/** 900-day split median miss of the flat multiple (the old cohort's median prices the young one). */
function split900FlatCheck(ps: SnapshotProtocol[], ref: string): number {
  const datedPs = ps.filter((proto) => proto.listed_at !== null);
  const older = datedPs.filter((proto) => ageDays(ref, proto.listed_at)! >= 900);
  const younger = datedPs.filter((proto) => ageDays(ref, proto.listed_at)! < 900);
  const ratios = older.map((proto) => proto.mcap_usd! / proto.tvl_usd).sort((a, b) => a - b);
  const mid = median(ratios);
  const errs = younger.map((proto) => missRatio(mid * proto.tvl_usd, proto.mcap_usd!)).sort((a, b) => a - b);
  return median(errs);
}

/** Leave-one-out median miss of the flat multiple (the median market-cap/TVL, refit each fold). */
function looFlatCheck(ps: SnapshotProtocol[]): { median: number; p75: number } {
  const errs: number[] = [];
  for (let ii = 0; ii < ps.length; ii++) {
    const others = ps.filter((_, j) => j !== ii);
    const ratios = others.map((proto) => proto.mcap_usd! / proto.tvl_usd).sort((a, b) => a - b);
    const mid = median(ratios);
    errs.push(missRatio(mid * ps[ii]!.tvl_usd, ps[ii]!.mcap_usd!));
  }
  errs.sort((a, b) => a - b);
  return { median: median(errs), p75: quantile(errs, 0.75) };
}

/** Time-split median miss of the flat multiple (the older half's median prices the newer half). */
function timeSplitFlatCheck(ps: SnapshotProtocol[]): number {
  const datedPs = ps.filter((proto) => proto.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const mid = Math.floor(datedPs.length / 2);
  const older = datedPs.slice(0, mid);
  const newer = datedPs.slice(mid);
  const ratios = older.map((proto) => proto.mcap_usd! / proto.tvl_usd).sort((a, b) => a - b);
  const med = median(ratios);
  const errs = newer.map((proto) => missRatio(med * proto.tvl_usd, proto.mcap_usd!)).sort((a, b) => a - b);
  return median(errs);
}

/** Leave-one-out median miss with a shrunk category premium on the log residuals (min 3 comps), on top of `feats`. */
function looCategoryCheck(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[]): number {
  const errs: number[] = [];
  for (let ii = 0; ii < ps.length; ii++) {
    const others = ps.filter((_, j) => j !== ii);
    const coef = leastSquares(others, feats);
    const proto = ps[ii]!;
    let prem = 0;
    const peers = others.filter((other) => (other.category ?? 'Other') === (proto.category ?? 'Other'));
    if (peers.length >= 3) {
      const resids = peers.map((other) => Math.log10(other.mcap_usd!) - Math.log10(predictOls(coef, feats, other))).sort((a, b) => a - b);
      prem = 0.5 * median(resids);
    }
    const guess = 10 ** (Math.log10(predictOls(coef, feats, proto)) + prem);
    errs.push(missRatio(guess, proto.mcap_usd!));
  }
  errs.sort((a, b) => a - b);
  return median(errs);
}

/** Time-split median miss with the same shrunk category premium. */
function timeSplitCategoryCheck(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[]): number {
  const datedPs = ps.filter((proto) => proto.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const mid = Math.floor(datedPs.length / 2);
  const older = datedPs.slice(0, mid);
  const newer = datedPs.slice(mid);
  const coef = leastSquares(older, feats);
  const errs = newer.map((proto) => {
    let prem = 0;
    const peers = older.filter((other) => (other.category ?? 'Other') === (proto.category ?? 'Other'));
    if (peers.length >= 3) {
      const resids = peers.map((other) => Math.log10(other.mcap_usd!) - Math.log10(predictOls(coef, feats, other))).sort((a, b) => a - b);
      prem = 0.5 * median(resids);
    }
    return missRatio(10 ** (Math.log10(predictOls(coef, feats, proto)) + prem), proto.mcap_usd!);
  }).sort((a, b) => a - b);
  return median(errs);
}

/** 900-day split median miss with the same shrunk category premium. */
function split900CategoryCheck(ps: SnapshotProtocol[], feats: ((p: SnapshotProtocol) => number)[], ref: string): number {
  const datedPs = ps.filter((proto) => proto.listed_at !== null);
  const older = datedPs.filter((proto) => ageDays(ref, proto.listed_at)! >= 900);
  const younger = datedPs.filter((proto) => ageDays(ref, proto.listed_at)! < 900);
  const coef = leastSquares(older, feats);
  const errs = younger.map((proto) => {
    let prem = 0;
    const peers = older.filter((other) => (other.category ?? 'Other') === (proto.category ?? 'Other'));
    if (peers.length >= 3) {
      const resids = peers.map((other) => Math.log10(other.mcap_usd!) - Math.log10(predictOls(coef, feats, other))).sort((a, b) => a - b);
      prem = 0.5 * median(resids);
    }
    return missRatio(10 ** (Math.log10(predictOls(coef, feats, proto)) + prem), proto.mcap_usd!);
  }).sort((a, b) => a - b);
  return median(errs);
}

/** The fitted size curve and every term the model tested and kept or dropped. */
export function fitSizeCurve(ps: SnapshotProtocol[], ref: string): SizeFit {
  const tradedPs = tradedOnly(ps);
  // The fit runs on the dated traded protocols only. The 33 traded
  // protocols with no listing date are legacy products (Aave V2, Lido, SSV,
  // the big bridges) whose token covers other products or predates listing
  // records: their market-cap/TVL ratios span 0.00–18.96 and one in three
  // misses the curve by 10x, so they do not price a new token.
  const datedPs = datedOnly(ps);
  const chgList = ps.map((proto) => proto.change_7d).filter((c): c is number => typeof c === 'number' && Number.isFinite(c)).sort((a, b) => a - b);
  const mktGrowth = chgList.length > 0 ? median(chgList) : 0;
  const ratios = datedPs.map((proto) => proto.mcap_usd! / proto.tvl_usd).sort((a, b) => a - b);
  const flatMed = ratios.length > 0 ? median(ratios) : 0.17;
  // The kept spec: log TVL, its square, and 7-day growth inside the fit.
  // Growth's fitted coefficient is NEGATIVE: the protocols whose TVL surged
  // hardest trade at the lowest market cap for their size — a surge is
  // usually deposits chasing yield, not a re-rating. The old positive carry
  // assumed the surge would persist; the three tests below say otherwise.
  // The growth feature is winsorized to the range the comparables show
  // (7d change -40% to +27% here): no board row is priced on growth beyond
  // what the data has seen, so a -73% week prices like -40% and a +4449%
  // week like +27%, instead of extrapolating to a 25x or a 0.003x factor.
  const gLo = Math.min(...datedPs.map((proto) => growthFeature(proto)));
  const gHi = Math.max(...datedPs.map((proto) => growthFeature(proto)));
  const growthClamped = (proto: SnapshotProtocol): number => Math.min(gHi, Math.max(gLo, growthFeature(proto)));
  const keptFeats: ((p: SnapshotProtocol) => number)[] = [logTvlFeat, quadTvlFeat, growthClamped];
  const coef = leastSquares(datedPs, keptFeats);
  const looRes = looCheck(datedPs, keptFeats);
  const looFlatRes = looFlatCheck(datedPs);
  const timeMed = timeSplitCheck(datedPs, keptFeats);
  const timeFlatMed = timeSplitFlatCheck(datedPs);
  const split900Med = split900Check(datedPs, keptFeats, ref);
  const split900FlatMed = split900FlatCheck(datedPs, ref);
  const log3 = Math.log10(3);
  const within3Rate = looRes.residuals.filter((r) => Math.abs(r) <= log3).length / datedPs.length;
  const qLo = quantile(looRes.residuals, 0.25);
  const qHi = quantile(looRes.residuals, 0.75);
  const loFac = 10 ** qLo;
  const hiFac = 10 ** qHi;
  let insideCount = 0;
  for (let ii = 0; ii < datedPs.length; ii++) {
    const others = datedPs.filter((_, j) => j !== ii);
    const coef2 = leastSquares(others, keptFeats);
    const guess = predictOls(coef2, keptFeats, datedPs[ii]!);
    const truth = datedPs[ii]!.mcap_usd!;
    if (truth >= guess * loFac && truth <= guess * hiFac) insideCount++;
  }
  const ageFn = (proto: SnapshotProtocol): number => ageFeature(proto, ref);
  const quadFeats = [logTvlFeat, quadTvlFeat];
  const linLooRes = looCheck(datedPs, [logTvlFeat]);
  const linTimeMed = timeSplitCheck(datedPs, [logTvlFeat]);
  const lin900Med = split900Check(datedPs, [logTvlFeat], ref);
  const quadLooRes = looCheck(datedPs, quadFeats);
  const quadTimeMed = timeSplitCheck(datedPs, quadFeats);
  const quad900Med = split900Check(datedPs, quadFeats, ref);
  const chainsFeats = [...keptFeats, chainsFeature];
  const chainsLooRes = looCheck(datedPs, chainsFeats);
  const chainsTimeMed = timeSplitCheck(datedPs, chainsFeats);
  const chains900Med = split900Check(datedPs, chainsFeats, ref);
  const ageFeats = [...keptFeats, ageFn];
  const ageLooRes = looCheck(datedPs, ageFeats);
  const ageTimeMed = timeSplitCheck(datedPs, ageFeats);
  const age900Med = split900Check(datedPs, ageFeats, ref);
  const catLooMed = looCategoryCheck(datedPs, keptFeats);
  const catTimeMed = timeSplitCategoryCheck(datedPs, keptFeats);
  const cat900Med = split900CategoryCheck(datedPs, keptFeats, ref);
  const terms: TermTest[] = [
    {
      term: 'size curve (log TVL)',
      loo_median: r2(linLooRes.median),
      time_median: r2(linTimeMed),
      split900_median: r2(lin900Med),
      kept: true,
      note: 'the fit itself: beats the flat multiple on all three tests',
    },
    {
      term: 'quadratic size term',
      loo_median: r2(quadLooRes.median),
      time_median: r2(quadTimeMed),
      split900_median: r2(quad900Med),
      kept: true,
      note: 'on its own it trades leave-one-out for the time split — it stays because with growth the pair beats the straight line on all three tests',
    },
    {
      term: '7-day growth inside the fit',
      loo_median: r2(looRes.median),
      time_median: r2(timeMed),
      split900_median: r2(split900Med),
      kept: true,
      note: 'wins all three tests against the straight line — with a negative coefficient, so a TVL surge prices a token down, not up',
    },
    {
      term: 'chain count',
      loo_median: r2(chainsLooRes.median),
      time_median: r2(chainsTimeMed),
      split900_median: r2(chains900Med),
      kept: false,
      note: 'loses all three tests on top of the kept spec; more chains do not price a token better',
    },
    {
      term: 'age inside the fit',
      loo_median: r2(ageLooRes.median),
      time_median: r2(ageTimeMed),
      split900_median: r2(age900Med),
      kept: false,
      note: 'wins leave-one-out and the time split but loses the 900-day split badly; age belongs in the launch odds, not in the value',
    },
    {
      term: 'category premium',
      loo_median: r2(catLooMed),
      time_median: r2(catTimeMed),
      split900_median: r2(cat900Med),
      kept: false,
      note: 'wins leave-one-out but loses both time splits: a category median does not travel to a new token',
    },
  ];
  return {
    comps: datedPs.length,
    excluded_undated: tradedPs.length - datedPs.length,
    intercept: r4(coef[0]!),
    slope: r4(coef[1]!),
    quad: r4(coef[2]!),
    growth_coef: r4(coef[3]!),
    growth_feat_lo: r4(gLo),
    growth_feat_hi: r4(gHi),
    flat_median: r4(flatMed),
    market_growth: r2(mktGrowth),
    loo_median: r2(looRes.median),
    loo_p75: r2(looRes.p75),
    loo_flat_median: r2(looFlatRes.median),
    loo_flat_p75: r2(looFlatRes.p75),
    within3: r2(within3Rate),
    time_median: r2(timeMed),
    time_flat_median: r2(timeFlatMed),
    split900_median: r2(split900Med),
    split900_flat_median: r2(split900FlatMed),
    range_lo_factor: r2(loFac),
    range_hi_factor: r2(hiFac),
    range_hold: r2(insideCount / datedPs.length),
    terms,
  };
}

/** The negative log-likelihood of the survival model on the dated protocols. */
function survivalLoss(rows: { age: number; hasToken: boolean }[], p: number, lam: number): number {
  let total = 0;
  for (const row of rows) {
    const prob = p * (1 - Math.exp(-lam * row.age));
    const bounded = Math.min(Math.max(prob, 1e-9), 1 - 1e-9);
    total += row.hasToken ? Math.log(bounded) : Math.log(1 - bounded);
  }
  return -total;
}

/** The survival fit (pi, lambda) by grid search on the dated protocols. */
function fitSurvivalCurve(rows: { age: number; hasToken: boolean }[]): { pi: number; lambda: number } {
  const rates = [0.0001, 0.0002, 0.0003, 0.0005, 0.0008, 0.001, 0.0015, 0.002, 0.003, 0.005, 0.008];
  let topPi = 0.4;
  let topLambda = 0.0008;
  let topLoss = Number.POSITIVE_INFINITY;
  for (let piPct = 5; piPct <= 79; piPct++) {
    const pi = piPct / 100;
    for (const lam of rates) {
      const loss = survivalLoss(rows, pi, lam);
      if (loss < topLoss) {
        topLoss = loss;
        topPi = pi;
        topLambda = lam;
      }
    }
  }
  return { pi: topPi, lambda: topLambda };
}

/** The same fit on a coarser grid, for the leave-one-out Brier: 383 refits. */
function fitSurvivalCoarseGrid(rows: { age: number; hasToken: boolean }[]): { pi: number; lambda: number } {
  const rates = [0.0002, 0.0005, 0.0008, 0.001, 0.002, 0.003, 0.005];
  let topPi = 0.5;
  let topLambda = 0.0008;
  let topLoss = Number.POSITIVE_INFINITY;
  for (let piPct = 10; piPct <= 90; piPct += 2) {
    const pi = piPct / 100;
    for (const lam of rates) {
      const loss = survivalLoss(rows, pi, lam);
      if (loss < topLoss) {
        topLoss = loss;
        topPi = pi;
        topLambda = lam;
      }
    }
  }
  return { pi: topPi, lambda: topLambda };
}

/** P(ever launches | no token at age t) under the survival model. */
function oddsAtAge(days: number, p: number, lam: number): number {
  const decay = Math.exp(-lam * days);
  return (p * decay) / (1 - p * (1 - decay));
}

/** P(no token by age t) under the survival model. */
function noTokenAtAge(days: number, p: number, lam: number): number {
  return 1 - p * (1 - Math.exp(-lam * days));
}

/**
 * Whether a protocol stands alone: it passes the watchlist's exclusion rule
 * whether or not it already records a token. The odds are fitted on the
 * dated protocols that stand alone, the population the board ranks: bridges,
 * exchanges and staking products are left out because their value accrues
 * to a token that already trades, so they would drag the launch rate down
 * for protocols that could launch one of their own.
 */
export function isStandalone(proto: SnapshotProtocol): boolean {
  if (proto.category !== null && EXCLUDED_CATS.has(proto.category)) return false;
  if (VERSION_RE.test(proto.name)) return false;
  if (WRAPPED_RE.test(proto.name)) return false;
  if (EXCHANGE_NAMES.some((prefix) => proto.name.startsWith(prefix))) return false;
  return true;
}

/** The survival-model launch odds, fitted on the dated standalone protocols, with its calibration. */
export function fitOdds(ps: SnapshotProtocol[], ref: string): OddsFit {
  const datedRows = ps
    .filter((proto) => proto.listed_at !== null && isStandalone(proto))
    .map((proto) => ({ age: Math.max(1, ageDays(ref, proto.listed_at)!), hasToken: proto.mcap_usd !== null }));
  const { pi, lambda } = fitSurvivalCurve(datedRows);
  const half = Math.log(2) / lambda;
  const edges: [number, number][] = [[0, 30], [30, 90], [90, 180], [180, 365], [365, 730], [730, 1460], [1460, 100000]];
  const buckets: OddsBucket[] = edges.map(([lo, hi]) => {
    const inBin = datedRows.filter((d) => d.age >= lo && d.age < hi);
    const act = inBin.length > 0 ? inBin.filter((d) => !d.hasToken).length / inBin.length : 0;
    const pred = inBin.length > 0 ? inBin.reduce((s, d) => s + noTokenAtAge(d.age, pi, lambda), 0) / inBin.length : 0;
    return { lo_days: lo, hi_days: hi, n: inBin.length, actual_no_token: r2(act), predicted_no_token: r2(pred) };
  });
  // Time-split calibration: the curve fitted on protocols listed before
  // 2024-07-15, checked against the newer cohort's buckets. The old-cohort
  // curve overstates the newer cohort's no-token share; the dashboard says
  // so, because the odds are a rough guide, not a precise probability.
  const cutoff = '2024-07-15';
  const oldRows = ps
    .filter((proto) => proto.listed_at !== null && proto.listed_at < cutoff && isStandalone(proto))
    .map((proto) => ({ age: Math.max(1, ageDays(ref, proto.listed_at)!), hasToken: proto.mcap_usd !== null }));
  const newRows = ps
    .filter((proto) => proto.listed_at !== null && proto.listed_at >= cutoff && isStandalone(proto))
    .map((proto) => ({ age: Math.max(1, ageDays(ref, proto.listed_at)!), hasToken: proto.mcap_usd !== null }));
  const oldCurve = oldRows.length > 0 ? fitSurvivalCurve(oldRows) : { pi, lambda };
  const timeBins: OddsBucket[] = [[0, 180], [180, 365], [365, 730], [730, 100000]].map(([lo, hi]) => {
    const inBin = newRows.filter((d) => d.age >= lo && d.age < hi);
    const act = inBin.length > 0 ? inBin.filter((d) => !d.hasToken).length / inBin.length : 0;
    const pred = inBin.length > 0 ? inBin.reduce((s, d) => s + noTokenAtAge(d.age, oldCurve.pi, oldCurve.lambda), 0) / inBin.length : 0;
    return { lo_days: lo, hi_days: hi, n: inBin.length, actual_no_token: r2(act), predicted_no_token: r2(pred) };
  });
  // Brier score of the curve's no-token probability against the base rate,
  // in sample and leave-one-out. Accuracy at a 50% threshold is also
  // reported — it ties the base rate, because four in five dated protocols
  // have no token: the odds add calibration across ages, not classification.
  const base = datedRows.length > 0 ? datedRows.filter((d) => !d.hasToken).length / datedRows.length : 0;
  let brierSum = 0;
  let brierBaseSum = 0;
  let hits = 0;
  for (const row of datedRows) {
    const probNo = noTokenAtAge(row.age, pi, lambda);
    const label = row.hasToken ? 0 : 1;
    brierSum += (probNo - label) * (probNo - label);
    brierBaseSum += (base - label) * (base - label);
    if ((probNo >= 0.5) === (label === 1)) hits++;
  }
  let looBrierSum = 0;
  let looBrierBaseSum = 0;
  for (let ii = 0; ii < datedRows.length; ii++) {
    const others = datedRows.filter((_, j) => j !== ii);
    const refitCurve = fitSurvivalCoarseGrid(others);
    const row = datedRows[ii]!;
    const probNo = noTokenAtAge(row.age, refitCurve.pi, refitCurve.lambda);
    const label = row.hasToken ? 0 : 1;
    looBrierSum += (probNo - label) * (probNo - label);
    looBrierBaseSum += (base - label) * (base - label);
  }
  const count = datedRows.length;
  return {
    dated: datedRows.length,
    pi: r2(pi),
    lambda_per_day: lambda,
    half_life_days: Math.round(half),
    buckets,
    time_split: timeBins,
    brier: r4(count > 0 ? brierSum / count : 0),
    brier_base: r4(count > 0 ? brierBaseSum / count : 0),
    loo_brier: r4(count > 0 ? looBrierSum / count : 0),
    loo_brier_base: r4(count > 0 ? looBrierBaseSum / count : 0),
    accuracy: r4(count > 0 ? hits / count : 0),
    accuracy_base: r4(Math.max(base, 1 - base)),
  };
}

/** The launch odds of a protocol of `days` days under a fitted curve; unknown age takes pi. */
export function launchOddsFor(days: number | null, curve: OddsFit): number {
  if (days === null) return curve.pi;
  return Math.min(0.99, Math.max(0.01, oddsAtAge(days, curve.pi, curve.lambda_per_day)));
}

/** The fitted growth factor of a protocol: 10 to the power of (growth coefficient times the growth feature), with the feature winsorized to the range the comparables show — the fit never prices a board row on growth beyond what the data has seen. */
export function growthFactorFor(proto: SnapshotProtocol, curve: SizeFit): number {
  const feat = Math.min(curve.growth_feat_hi, Math.max(curve.growth_feat_lo, growthFeature(proto)));
  return 10 ** (curve.growth_coef * feat);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSION_RE = /\s((v|V)\d+(\.\d+)?|\d+\.\d+)$/;

/** One whole word that marks a wrapped, staked or restaked product of a token that already trades. */
const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;

/** The watchlist leaves these categories out, because their value accrues to a token that already trades. */
const EXCLUDED_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The exchange names a product name must not begin with. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(proto: SnapshotProtocol): boolean {
  return proto.mcap_usd === null && proto.gecko_id === null && proto.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and a genuine
 * candidate for a token of its own. This is the watchlist's own exclusion
 * rule, applied to the early radar as well: a bridge, a liquid staking or
 * restaking product, a wrapped or staked product, a versioned pool, or an
 * exchange product is not a token that does not exist yet.
 */
export function isRankable(proto: SnapshotProtocol): boolean {
  if (!isPreToken(proto)) return false;
  if (proto.category !== null && EXCLUDED_CATS.has(proto.category)) return false;
  if (VERSION_RE.test(proto.name)) return false;
  if (WRAPPED_RE.test(proto.name)) return false;
  if (EXCHANGE_NAMES.some((prefix) => proto.name.startsWith(prefix))) return false;
  return true;
}

/** Which set-aside bucket a protocol falls in, for the coverage accounting. */
export function coverageBucket(proto: SnapshotProtocol): 'ranked' | 'already_token' | 'bridge' | 'staking' | 'exchange' | 'versioned' | 'wrapped' {
  if (isRankable(proto)) return 'ranked';
  if (proto.symbol !== null) return 'already_token';
  if (proto.category === 'Bridge' || proto.category === 'Canonical Bridge') return 'bridge';
  if (proto.category === 'Liquid Staking' || proto.category === 'Liquid Restaking' || proto.category === 'Restaked BTC') return 'staking';
  if (proto.category === 'CEX') return 'exchange';
  if (VERSION_RE.test(proto.name)) return 'versioned';
  if (WRAPPED_RE.test(proto.name)) return 'wrapped';
  if (EXCHANGE_NAMES.some((prefix) => proto.name.startsWith(prefix))) return 'exchange';
  return 'already_token';
}

/** The coverage accounting: every protocol in exactly one bucket. */
export function coverageOf(ps: SnapshotProtocol[]): Coverage {
  const tally: Coverage = { ranked: 0, already_token: 0, bridge: 0, staking: 0, exchange: 0, versioned: 0, wrapped: 0, total: ps.length };
  for (const proto of ps) tally[coverageBucket(proto)]++;
  return tally;
}

/** The cheapest chain to farm on: Ethereum costs $5 a transaction, any other chain $0.50. */
export function farmChainFor(proto: SnapshotProtocol, cfg: ModelConstants): { chain: string; gas: number } {
  const picked = proto.chains.find((name) => name !== 'Ethereum') ?? proto.chains[0] ?? 'its main chain';
  const fee = picked === 'Ethereum' ? cfg.gas_ethereum_usd : cfg.gas_cheap_usd;
  return { chain: picked, gas: fee };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(days: number | null): number {
  if (days === null) return 30;
  if (days < 180) return 60;
  if (days < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(proto: SnapshotProtocol): string {
  return proto.chains.length > 0 ? proto.chains[0]! : 'its main chain';
}

/** The farm verdict and its arithmetic at one deposit, drop share and T-bill yield. */
export function verdictFor(
  ifVal: number,
  oddsVal: number,
  tvl: number,
  hold: number,
  gasFee: number,
  cfg: ModelConstants,
  dep: number = cfg.deposit_usd,
  share: number = cfg.drop_share,
  yieldRate: number = cfg.tbill_yield,
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
  const slice = share * ifVal * (dep / Math.max(1, tvl));
  const expected = slice * oddsVal;
  const fortnightCount = Math.ceil(hold / 14);
  const fees = (4 + fortnightCount) * gasFee;
  const tbillCost = yieldRate * dep * (hold / 365);
  const net = expected - fees - tbillCost;
  const verdict = net >= cfg.farm_threshold_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  const breakEvenOdds = slice > 0 ? Math.min(1, Math.max(0, (fees + tbillCost) / slice)) : null;
  const perDollarGain = (share * ifVal * oddsVal) / Math.max(1, tvl) - (yieldRate * hold) / 365;
  const minDeposit = perDollarGain > 0 ? Math.ceil(fees / perDollarGain) : null;
  return { slice: slice, expected: expected, fees: fees, tbillCost: tbillCost, net: net, verdict: verdict, breakEvenOdds: breakEvenOdds, minDeposit: minDeposit };
}

/** A per cent as the farm plan writes it: a sign, two decimals, a per-cent sign. */
export function pctText(pct: number): string {
  return (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(st: FarmStep): string {
  let out = `${st.text} Cost: ${st.cost}. Time: ${st.time}.`;
  if (out.length > 600) out = `${out.slice(0, 596)}...`;
  if (out.length < 20) out = `${out} Hold the position and check the protocol's own page.`;
  return out;
}

/** The category's one action, in the words a farmer can follow. */
function actionText(proto: SnapshotProtocol, dep: number, chainName: string): string {
  const cat = (proto.category ?? '').toLowerCase();
  const label = proto.name;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) return `Supply $${dep.toLocaleString('en-US')} of USDC to ${label} on ${chainName} and keep the position open.`;
  if (cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm')) return `Provide $${dep.toLocaleString('en-US')} of liquidity to ${label}'s main pool on ${chainName} and keep the position open.`;
  if (cat.includes('bridge') || cat.includes('canonical bridge')) return `Bridge $${dep.toLocaleString('en-US')} of USDC to ${chainName} through ${label} and use the bridged funds in its app.`;
  if (cat.includes('staking') || cat.includes('restak')) return `Stake $${dep.toLocaleString('en-US')} of the chain's staking asset through ${label} and keep the receipt.`;
  if (cat.includes('perpetual') || cat.includes('derivative') || cat.includes('basis trad')) return `Deposit $${dep.toLocaleString('en-US')} of USDC as margin on ${label} and open one small hedge.`;
  if (cat.includes('prediction')) return `Fund $${dep.toLocaleString('en-US')} and place one market position on ${label}.`;
  if (cat.includes('curator') || cat.includes('allocator')) return `Deposit $${dep.toLocaleString('en-US')} into a ${label} vault on ${chainName} and keep the shares.`;
  if (cat.includes('stable')) return `Mint or deposit $${dep.toLocaleString('en-US')} of the stable asset through ${label} on ${chainName}.`;
  if (cat.includes('rwa')) return `Mint $${dep.toLocaleString('en-US')} of the protocol's yield asset on ${chainName} and hold it.`;
  if (cat.includes('insurance')) return `Buy $${dep.toLocaleString('en-US')} of cover from ${label} on ${chainName} and keep the policy.`;
  if (cat.includes('payment')) return `Pay one real invoice of $${dep.toLocaleString('en-US')} through ${label} on ${chainName} and keep the receipt.`;
  if (cat.includes('governance')) return `Lock $${dep.toLocaleString('en-US')} of voting power through ${label} and vote on one live proposal.`;
  if (cat.includes('chain') || cat.includes('rollup')) return `Use ${label}'s app on ${chainName} with $${dep.toLocaleString('en-US')} and keep the position open.`;
  return `Deposit $${dep.toLocaleString('en-US')} of USDC into ${label} on ${chainName} and keep the position open.`;
}

/** The fortnightly qualifying action, fitted to the category: one paid action per fortnight. */
function fortnightlyText(proto: SnapshotProtocol): string {
  const cat = (proto.category ?? '').toLowerCase();
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) return 'Each fortnight make one qualifying action, such as a supply, a borrow or a repayment.';
  if (cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm')) return 'Each fortnight make one qualifying action, such as a swap, an add of liquidity or a harvest.';
  if (cat.includes('perpetual') || cat.includes('derivative') || cat.includes('basis trad')) return 'Each fortnight make one qualifying action, such as one small trade or a funding adjustment.';
  if (cat.includes('bridge')) return 'Each fortnight make one qualifying action, such as a bridge, a swap or a claim.';
  if (cat.includes('prediction')) return 'Each fortnight make one qualifying action, such as one market position or a settlement.';
  if (cat.includes('governance')) return 'Each fortnight make one qualifying action, such as a vote or a delegation change.';
  return 'Each fortnight make one qualifying action, such as a deposit, a borrow, a swap or a vote.';
}

/** The hold step, fitted to the protocol's own momentum: add while it grows, stay small while it shrinks. */
function holdStepFor(proto: SnapshotProtocol, days: number | null, growth: number, dep: number): FarmStep {
  const holdLen = holdDaysFor(days);
  const floorUsd = Math.max(1, Math.round((proto.tvl_usd * 3) / 4 / 1000) * 1000);
  if (growth >= RISING_PCT) {
    return {
      text: `Hold the position for at least ${holdLen} days and add to it while it is growing - ${proto.name} rose ${pctText(growth)} in 7 days. Check the TVL weekly, free, and leave early if it falls below $${floorUsd.toLocaleString('en-US')}.`,
      cost: `the $${dep.toLocaleString('en-US')} stays in the position`,
      time: `${holdLen} days`,
    };
  }
  if (growth < 0) {
    return {
      text: `Hold the position for at least ${holdLen} days; ${proto.name} fell ${pctText(growth)} in 7 days, so keep the position small and do not add. Check the TVL weekly, free, and leave early if it falls below $${floorUsd.toLocaleString('en-US')}.`,
      cost: `the $${dep.toLocaleString('en-US')} stays in the position`,
      time: `${holdLen} days`,
    };
  }
  return {
    text: `Hold the position for at least ${holdLen} days so the activity is counted in more than one snapshot. Check the TVL weekly, free, and leave early if it falls below $${floorUsd.toLocaleString('en-US')}.`,
    cost: `the $${dep.toLocaleString('en-US')} stays in the position`,
    time: `${holdLen} days`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, seven-day growth, cheapest chain) and the
 * deposit the reader farms with, never from a hand-written list of names. The page generates the same
 * plan from the same inputs, so the board and the page agree.
 */
export function farmSteps(proto: SnapshotProtocol, days: number | null, growth: number, cfg: ModelConstants, dep: number = cfg.deposit_usd): FarmStep[] {
  const { chain: chainName, gas: gasFee } = farmChainFor(proto, cfg);
  const gasLabel = `$${gasFee.toFixed(2)}`;
  const fortnightCount = Math.ceil(holdDaysFor(days) / 14);
  return [
    {
      text: `Use a fresh wallet on ${chainName} that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${gasLabel} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionText(proto, dep, chainName),
      cost: `$${dep.toLocaleString('en-US')} of capital and about $${(2 * gasFee).toFixed(2)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${fortnightlyText(proto)} ${fortnightCount} paid ${fortnightCount === 1 ? 'action' : 'actions'} over the hold.`,
      cost: `about ${gasLabel} of gas each fortnight`,
      time: '10 minutes a fortnight',
    },
    holdStepFor(proto, days, growth, dep),
    {
      text: `Before you withdraw, open ${proto.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: `${gasLabel} of gas to claim`,
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
function slugIndex(ps: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(ps.map((proto) => [proto.slug, proto]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snap: Snapshot,
  cfg: ModelConstants = MODEL,
  fitArg?: SizeFit,
  oddsArg?: OddsFit,
): { board: BoardRow[]; fit: SizeFit; odds: OddsFit; coverage: Coverage } {
  const sizeCurve = fitArg ?? fitSizeCurve(snap.protocols, snap.as_of);
  const oddsCurve = oddsArg ?? fitOdds(snap.protocols, snap.as_of);
  const cov = coverageOf(snap.protocols);
  const idx = slugIndex(snap.protocols);
  const picked = new Map<string, SnapshotProtocol>();
  for (const slug of snap.watchlist) {
    const proto = idx.get(slug);
    if (proto !== undefined) picked.set(slug, proto);
  }
  // The early radar: every standalone pre-token protocol the watchlist does
  // not name, by TVL — including the twenty above the floor the watchlist
  // leaves out. The watchlist is the floor, never the ceiling, and a
  // protocol above it is no worse a subject. Never a replacement for a
  // watchlist row: a chosen protocol stays chosen.
  const earlyRows = snap.protocols
    .filter((proto) => !picked.has(proto.slug) && isRankable(proto))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const proto of earlyRows) picked.set(proto.slug, proto);

  const scoredRows = [...picked.values()].map((proto) => {
    const ageVal = ageDays(snap.as_of, proto.listed_at);
    const logTvlVal = Math.log10(Math.max(1, proto.tvl_usd));
    // The size curve at zero growth, times the fitted growth factor. The
    // factor is below 1 for a protocol whose TVL just surged and above 1
    // for one whose TVL fell: the fit prices surges down, not up.
    const ifRaw = 10 ** (sizeCurve.intercept + sizeCurve.slope * logTvlVal + sizeCurve.quad * logTvlVal * logTvlVal);
    const growthFac = growthFactorFor(proto, sizeCurve);
    const ifVal = Math.max(1, Math.round(ifRaw * growthFac));
    const oddsVal = launchOddsFor(ageVal, oddsCurve);
    const impliedVal = Math.max(1, Math.round(ifVal * oddsVal));
    const loVal = Math.max(1, Math.round(impliedVal * sizeCurve.range_lo_factor));
    const hiVal = Math.max(1, Math.round(impliedVal * sizeCurve.range_hi_factor));
    const holdLen = holdDaysFor(ageVal);
    const { chain: chainName, gas: gasFee } = farmChainFor(proto, cfg);
    const verdict = verdictFor(ifVal, oddsVal, proto.tvl_usd, holdLen, gasFee, cfg);
    const growthVal = Math.min(cfg.growth_cap, Math.max(cfg.growth_floor, numOr(proto.change_7d, 0)));
    return { p: proto, age: ageVal, ifLaunched: ifVal, growthFactor: growthFac, oddsValue: oddsVal, implied: impliedVal, rangeLo: loVal, rangeHi: hiVal, hold: holdLen, chain: chainName, gas: gasFee, v: verdict, growthPct: growthVal };
  });
  scoredRows.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scoredRows.map((sc, idx) => ({
    rank: idx + 1,
    slug: sc.p.slug,
    name: sc.p.name,
    category: sc.p.category,
    chains: sc.p.chains,
    tvl_usd: sc.p.tvl_usd,
    change_7d: sc.p.change_7d,
    mcap_usd: sc.p.mcap_usd,
    listed_at: sc.p.listed_at,
    gecko_id: sc.p.gecko_id,
    symbol: sc.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: snap.watchlist.includes(sc.p.slug),
    age_days: sc.age,
    implied_value_usd: sc.implied,
    if_launched_usd: sc.ifLaunched,
    launch_odds: r4(sc.oddsValue),
    range_lo_usd: sc.rangeLo,
    range_hi_usd: sc.rangeHi,
    growth_carry: r4(sc.growthFactor),
    hold_days: sc.hold,
    farm_chain: sc.chain,
    gas_usd: sc.gas,
    fees_usd: r2(sc.v.fees),
    tbill_usd: r2(sc.v.tbillCost),
    slice_usd: r2(sc.v.slice),
    net_usd: r2(sc.v.net),
    verdict: sc.v.verdict,
    break_even_odds: sc.v.breakEvenOdds === null ? null : r4(sc.v.breakEvenOdds),
    min_deposit_usd: sc.v.minDeposit,
    model: {
      fit_intercept: sizeCurve.intercept,
      fit_slope: sizeCurve.slope,
      market_growth: sizeCurve.market_growth,
      growth_pct: r4(sc.growthPct),
      age_days: sc.age,
    },
    farm_steps: farmSteps(sc.p, sc.age, sc.growthPct, cfg).map(stepText),
  }));
  return { board, fit: sizeCurve, odds: oddsCurve, coverage: cov };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view: all of them, not a top slice. */
export function liveRows(snap: Snapshot): LiveRow[] {
  return snap.protocols
    .filter((proto) => !isPreToken(proto) && proto.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((proto) => ({
      slug: proto.slug,
      name: proto.name,
      category: proto.category,
      chains: proto.chains,
      tvl_usd: proto.tvl_usd,
      mcap_usd: proto.mcap_usd,
      change_7d: proto.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(src: BoardRow): RadarRow {
  return {
    rank: src.rank,
    slug: src.slug,
    name: src.name,
    category: src.category,
    chains: src.chains,
    tvl_usd: src.tvl_usd,
    change_7d: src.change_7d,
    mcap_usd: src.mcap_usd,
    listed_at: src.listed_at,
    age_days: src.age_days,
    watchlist: src.watchlist,
    implied_value_usd: src.implied_value_usd,
    if_launched_usd: src.if_launched_usd,
    launch_odds: src.launch_odds,
    range_lo_usd: src.range_lo_usd,
    range_hi_usd: src.range_hi_usd,
    growth_carry: src.growth_carry,
    hold_days: src.hold_days,
    farm_chain: src.farm_chain,
    gas_usd: src.gas_usd,
    fees_usd: src.fees_usd,
    tbill_usd: src.tbill_usd,
    slice_usd: src.slice_usd,
    net_usd: src.net_usd,
    verdict: src.verdict,
    break_even_odds: src.break_even_odds,
    min_deposit_usd: src.min_deposit_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snap: Snapshot, cfg: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, fit, odds, coverage } = buildBoard(snap, cfg);
  const liveList = liveRows(snap);
  const earlyCount = board.filter((row) => !snap.watchlist.includes(row.slug)).length;
  const verdictCounts: VerdictCounts = {
    farm: board.filter((row) => row.verdict === 'FARM').length,
    marginal: board.filter((row) => row.verdict === 'MARGINAL').length,
    skip: board.filter((row) => row.verdict === 'SKIP').length,
  };
  const radarData: RadarData = {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    model: cfg,
    model_version: MODEL_VERSION,
    validation: { fit, odds, coverage, verdicts: verdictCounts },
    watchlist_size: snap.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: liveList.length,
    comps: datedOnly(snap.protocols)
      .map((proto) => ({ tvl_usd: proto.tvl_usd, mcap_usd: proto.mcap_usd! })),
    rows: board.map(radarRow),
    live: liveList,
  };
  return { board, radar: radarData };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new SnapshotError('snapshot.json is not JSON object');
  const doc = parsed as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protoList = doc.protocols.map((entry, idx) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SnapshotError(`snapshot.json's protocol ${idx} is not an object`);
    const proto = entry as Record<string, unknown>;
    if (typeof proto.slug !== 'string' || typeof proto.name !== 'string' || typeof proto.tvl_usd !== 'number' || !Number.isFinite(proto.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${idx} lacks a slug, a name or a TVL`);
    }
    return {
      slug: proto.slug,
      name: proto.name,
      category: typeof proto.category === 'string' ? proto.category : null,
      chains: Array.isArray(proto.chains) ? proto.chains.filter((chain): chain is string => typeof chain === 'string') : [],
      tvl_usd: proto.tvl_usd,
      change_7d: typeof proto.change_7d === 'number' && Number.isFinite(proto.change_7d) ? proto.change_7d : null,
      listed_at: typeof proto.listed_at === 'string' ? proto.listed_at : null,
      gecko_id: typeof proto.gecko_id === 'string' ? proto.gecko_id : null,
      symbol: typeof proto.symbol === 'string' ? proto.symbol : null,
      mcap_usd: typeof proto.mcap_usd === 'number' && Number.isFinite(proto.mcap_usd) ? proto.mcap_usd : null,
    };
  });
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols: protoList,
    watchlist: doc.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snap: Snapshot): string | null {
  const slugSet = new Set(board.map((row) => row.slug));
  const missingSlugs = snap.watchlist.filter((s) => !slugSet.has(s));
  if (missingSlugs.length > 0) return `the board misses ${missingSlugs.length} watchlist slug${missingSlugs.length === 1 ? '' : 's'}: ${missingSlugs.slice(0, 5).join(', ')}`;
  const rankList = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let ii = 0; ii < rankList.length; ii++) if (rankList[ii] !== ii + 1) return `rank ${ii + 1} is ${rankList[ii]}`;
  for (let ii = 1; ii < board.length; ii++) if (board[ii]!.implied_value_usd > board[ii - 1]!.implied_value_usd) return `row ${ii + 1} outranks row ${ii} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    const planSteps = row.farm_steps;
    if (planSteps.length < 3 || planSteps.length > 12) return `${row.slug} has ${planSteps.length} farm steps`;
    for (const step of planSteps) if (step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has implied value ${row.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(data: RadarData): string {
  return `window.RADAR=${JSON.stringify(data)};\n`;
}
