# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hadunz-hash/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hadunz-hash/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: ranks pre-token DeFi protocols by an implied value calibrated on the snapshot's own live-token FDV/TVL, with a concrete farm plan for each — a dark, sortable, filterable dashboard with a detail view per protocol.

Entry for make.fun's `token-radar-01`: read a sealed snapshot of every protocol DefiLlama tracks, find the ones that record no token, rank them by what their launch would be worth, and hand in a web dashboard that shows the board, a detail view for each protocol and the steps to farm it.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, scores every pre-token protocol with the model in `lib/model.ts`, writes the ranked board to `/output/board.json`, writes the dashboard's data beside it as `data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json` with the vendored make.fun library.

## How it works

Implied value follows only from the snapshot's own figures:

```
implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

The multiple is not a constant: it is the FDV/TVL the market itself pays, read off the snapshot's live-token protocols. Each category's median is shrunk toward the global median (weight 10) and clamped to [0.05, 0.50]; a category with fewer than 5 live tokens uses the global median. Age is the time since the protocol was first listed, the best record of how long it has run with no token. No protocol name is ever special-cased: the same function scores every row.

The board covers all 40 watchlist protocols and adds 186 pre-token protocols below the $50M floor, by TVL. Live-token protocols are set aside with their market caps shown, and their FDV/TVL ratios calibrate the multiples. Each row carries a six-step farm plan derived from the protocol's own record (category, chains, TVL, age), with a cost and a time for every step.

## Files

- `main.ts` — the entry (stdlib only, deterministic, offline)
- `lib/model.ts` — the model: calibration, ranking, farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library (vendored as-is)
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js` (no network)
- `screenshots/` — the board, a protocol's detail view and a filtered view
- `LICENSE` — MIT

---

<sub>Entered on [make.fun](https://make.fun/?ref=cevmqmkq&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
