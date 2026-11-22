# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hadunz-hash/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hadunz-hash/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for token launches: it prices pre-token DeFi protocols by an implied value fitted on the snapshot's own live-token market caps, and costs out a farm plan for each one — shown on a dark, sortable, filterable dashboard with a detail view per protocol.

This is an entry for make.fun's `token-radar-01`: take a sealed snapshot of every protocol DefiLlama tracks, pick out the ones that record no token, rank them by what their launch would be worth, and ship a web dashboard with the board, a detail view for each protocol and the steps to farm it.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, stdlib only) loads `/input/snapshot.json`, prices every pre-token protocol with the model in `lib/model.ts`, writes the ranked board to `/output/board.json` and the dashboard's data beside it as `data.js`, copies `dashboard/` and `screenshots/` into `/output`, and writes `/output/dossier.json` through the vendored make.fun library.

## How it works

The implied value comes only from the snapshot's own numbers, through a fitted curve:

```
log10(mcap) = a + b·log10(TVL) + c·log10(TVL)² + d·log10(1 + 7d change)
implied     = round( 10^log10(mcap) × launchOdds )
```

The coefficients are fitted by least squares on the snapshot's own dated traded protocols — nothing is hand-picked. The 7-day growth term is winsorized to the range the comparables show, so no row is priced on growth the data has never seen. Launch odds come from a survival fit on dated standalone protocols: a share π ever launches, and launchers arrive with a constant hazard. Age is the time since the protocol was first listed, the best record of how long it has run with no token. No protocol name is ever special-cased: one function scores every row.

The board ranks all 40 watchlist protocols and adds the pre-token protocols the watchlist leaves out, by TVL. Live-token protocols are set aside with their market caps shown, and their FDV/TVL ratios are the comparables the curve is fitted on. Each row carries a six-step farm plan derived from the protocol's own record (category, chains, TVL, age), with a cost and a time for every step.

## Files

- `main.ts` — the runner (stdlib only, deterministic, offline)
- `lib/model.ts` — the model: the fitted curve, the odds, the ranking, the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library (vendored as-is)
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js` (no network)
- `screenshots/` — the board, a protocol's detail view and a filtered view
- `LICENSE` — MIT

---

<sub>Entered on [make.fun](https://make.fun/?ref=cevmqmkq&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
