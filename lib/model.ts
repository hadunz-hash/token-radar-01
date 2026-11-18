// Token Radar's model (radar-3): one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a
// ceiling) and adds the early radar: pre-token protocols below the floor, by
// TVL, the rows this radar exists to find. The early radar applies the
// watchlist's own exclusion rule to what it adds: a bridge, a liquid
// staking or restaking product, a wrapped or staked product of a token that
// already trades, a versioned pool, or an exchange product is not a token
// that does not exist yet, so it is never ranked as one. Live-token
// protocols are kept apart and shown with the market's own values, never
// mixed into the ranking.
//
// Implied value follows only from the snapshot's own figures, through one
// function that scores every protocol the same way:
//
//   base multiple = the market-cap/TVL multiple the market itself pays,
//                   read off the snapshot's live-token protocols: each
//                   category's median, shrunk toward the global median
//                   (weight 5) and clamped to [0.05, 0.50]. A category
//                   with fewer than 3 live tokens falls back to the global
//                   median. No category value is hardcoded. (Market cap,
//                   not FDV: the snapshot carries no FDV, and the model
//                   never claims one.)
//   size factor   = (100M / tvl) ^ 0.15, clamped to [0.70, 1.30]: the market
//                   pays richer multiples for earlier, smaller protocols,
//                   and a mega-protocol's upside is already partly priced.
//                   The multiple the board prints is base x size factor.
//   growth        = clamp(change_7d, -70, 500) per cent
//   growthMult    = clamp(1 + growth / 100, 0.30, 5.00): a protocol that
//                   multiplied its TVL several times over in a week is the
//                   radar's whole point, and one that shrank is cut. The
//                   old model's 0.5 weight and 120 cap flattened this
//                   signal until the board was a TVL table (rank correlation
//                   0.95); the growth factor is what lets a rising protocol
//                   outrank a shrinking giant.
//   maturity      = 0.75 + min(age_days, 1095) / 1095 x 0.25   (age unknown: 365)
//   implied       = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// Age is the time since DefiLlama first listed the protocol: the best record
// of how long it has run with no token. A protocol that records no token is
// described as recording none, never as having none: the record is not proof.

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
  growth_mult_floor: number;
  growth_mult_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrink_weight: number;
  multiple_floor: number;
  multiple_cap: number;
  min_live_for_category: number;
  size_ref_usd: number;
  size_exponent: number;
  size_factor_floor: number;
  size_factor_cap: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -70,
  growth_cap: 500,
  growth_mult_floor: 0.3,
  growth_mult_cap: 5.0,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_weight: 5,
  multiple_floor: 0.05,
  multiple_cap: 0.5,
  min_live_for_category: 3,
  size_ref_usd: 100_000_000,
  size_exponent: 0.15,
  size_factor_floor: 0.7,
  size_factor_cap: 1.3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A protocol counts as rising when its TVL grew at least this much in 7 days. */
export const RISING_PCT = 20;

/** One calibrated multiple: the category, its live-token count, and the multiple the board used. */
export interface CategoryMultiple {
  category: string;
  live_count: number;
  median: number;
  multiple: number;
}

/** The calibration the model computed from the snapshot's live tokens. */
export interface Calibration {
  global_median: number;
  live_count: number;
  by_category: CategoryMultiple[];
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
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    base_multiple: number;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
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
  implied_value_usd: number;
  multiple: number;
  base_multiple: number;
  size_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
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

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The market-cap/TVL multiples the market pays, read off the snapshot's
 * live-token protocols. Each category's median is shrunk toward the global
 * median with weight `shrink_weight`, then clamped: a thin category cannot
 * drag the multiple to an extreme, and no category's value is written by
 * hand. The multiple here is the category's base; the size factor is
 * applied per protocol, in impliedValue.
 */
export function calibrate(protocols: SnapshotProtocol[], model: ModelConstants): Calibration {
  const live = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const all = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const global = all.length > 0 ? medianOf(all) : 0.17;
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const by_category: CategoryMultiple[] = [...byCat.entries()]
    .map(([category, ratios]) => {
      const sorted = ratios.sort((a, b) => a - b);
      const med = medianOf(sorted);
      const n = sorted.length;
      const shrunk = n >= model.min_live_for_category
        ? (n * med + model.shrink_weight * global) / (n + model.shrink_weight)
        : global;
      const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
      return { category, live_count: n, median: round4(med), multiple: round4(multiple) };
    })
    .sort((a, b) => b.live_count - a.live_count || (a.category < b.category ? -1 : 1));
  return { global_median: round4(global), live_count: live.length, by_category };
}

/** The category's base multiple under a calibration, else the global median. */
export function baseMultipleFor(category: string | null, calibration: Calibration, model: ModelConstants): number {
  const key = category ?? 'Other';
  const found = calibration.by_category.find((c) => c.category === key);
  if (found !== undefined) return found.multiple;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.global_median));
}

/** The size factor for a TVL: richer multiples for earlier, smaller protocols. */
export function sizeFactorFor(tvlUsd: number, model: ModelConstants): number {
  if (!(tvlUsd > 0)) return 1;
  const raw = (model.size_ref_usd / tvlUsd) ** model.size_exponent;
  return Math.min(model.size_factor_cap, Math.max(model.size_factor_floor, raw));
}

/** The multiple one category gets under a calibration, else the global median. Kept for callers that score without a TVL. */
export function multipleFor(category: string | null, calibration: Calibration, model: ModelConstants): number {
  return baseMultipleFor(category, calibration, model);
}

/** The growth per cent this model scores, clamped to the range it trusts. */
export function growthPctFor(change7d: number | null, model: ModelConstants): number {
  const raw = finite(change7d, 0);
  return Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
}

/** The growth multiplier for a clamped growth per cent. */
export function growthMultFor(growthPct: number, model: ModelConstants): number {
  return Math.min(model.growth_mult_cap, Math.max(model.growth_mult_floor, 1 + growthPct / 100));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): { implied: number; multiple: number; baseMultiple: number; sizeFactor: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const baseMultiple = baseMultipleFor(protocol.category, calibration, model);
  const sizeFactor = sizeFactorFor(protocol.tvl_usd, model);
  // The multiple is rounded to four decimals here, and the rounded value is
  // the one the board stores and the page recomputes with: the two must
  // agree exactly, or the page's check would fail on rounding alone.
  const multiple = round4(baseMultiple * sizeFactor);
  const growthPct = growthPctFor(protocol.change_7d, model);
  const growthMult = growthMultFor(growthPct, model);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, multiple, baseMultiple, sizeFactor, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped, staked or restaked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking|restaked|restaking)\b/i;

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

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; calibration: Calibration } {
  const calibration = calibrate(snapshot.protocols, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen. Only genuine candidates: the watchlist's
  // exclusion rule keeps bridges, staking products and wrapped products out.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, multiple, baseMultiple, sizeFactor, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, implied, multiple, baseMultiple, sizeFactor, growthPct, growthMult, maturityMult, age };
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
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.multiple),
      base_multiple: round4(s.baseMultiple),
      size_factor: round4(s.sizeFactor),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.growthPct).map(stepText),
  }));
  return { board, calibration };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('canonical bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Pay one real invoice of $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance')) return `Lock $${capital} of voting power through ${name} and vote on one live proposal.`;
  if (c.includes('chain') || c.includes('rollup')) return `Use ${name}'s app on ${chain} with $${capital} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, fitted to the category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Make one qualifying action each week, such as a supply, a borrow or a repayment.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Make one qualifying action each week, such as a swap, an add of liquidity or a harvest.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad')) return 'Make one qualifying action each week, such as one small trade or a funding adjustment.';
  if (c.includes('bridge')) return 'Make one qualifying action each week, such as a bridge, a swap or a claim.';
  if (c.includes('prediction')) return 'Make one qualifying action each week, such as one market position or a settlement.';
  if (c.includes('governance')) return 'Make one qualifying action each week, such as a vote or a delegation change.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/** The hold step, fitted to the protocol's own momentum: add while it grows, stay small while it shrinks. */
function holdStep(p: SnapshotProtocol, age: number | null, growthPct: number): FarmStep {
  const hold = holdDaysFor(age);
  const capital = capitalFor(p);
  if (growthPct >= RISING_PCT) {
    return {
      text: `Hold the position for at least ${hold} days and add to it while it is growing - ${p.name} rose ${pctText(growthPct)} in 7 days.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    };
  }
  if (growthPct < 0) {
    return {
      text: `Hold the position for at least ${hold} days; ${p.name} fell ${pctText(growthPct)} in 7 days, so keep the position small and do not add.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    };
  }
  return {
    text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
    cost: `the $${capital} stays in the position`,
    time: `${hold} days`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, seven-day growth), never from a hand-written
 * list of names. The page generates the same plan from the same inputs, so the board and the page agree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, growthPct: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet on ${chain} that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    holdStep(p, age, growthPct),
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
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
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    base_multiple: row.model.base_multiple,
    size_factor: row.model.size_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
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
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
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
