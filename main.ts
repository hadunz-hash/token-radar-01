// Token Radar's runner (Node 22, stdlib only; it runs the radar-5 model).
//
// It loads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), prices every pre-token protocol through the model in
// lib/model.ts, and writes the ranked board to /output/board.json plus the
// dashboard's data next to it as data.js. It also copies this repo's
// dashboard/ and screenshots/ into /output, and finally writes
// /output/dossier.json — the summary the judge reads — using the vendored
// make.fun library.
//
// The dashboard is a static page with no framework and no network:
// dashboard/index.html, dashboard/app.css and dashboard/app.js consume the
// data.js this runner writes. The gate's shape must hold: board.json carries
// every watchlist slug, ranks 1..N, implied values that never climb with
// rank, and exactly 6 farm steps per row; the scorer rebuilds the dossier
// byte for byte, so this runner writes precisely what buildDossier writes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit-new/token-radar-01-kit/input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The runner's own limits: the text cap shapes the bytes, the rest refuse. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** A PNG's or JPEG's pixel size, read from its header — null when neither. */
function imageSize(path: string): { width: number; height: number } | null {
  const bytes = readFileSync(path);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) return null;
      const tag = bytes[pos + 1]!;
      const segLen = bytes.readUInt16BE(pos + 2);
      if (tag >= 0xc0 && tag <= 0xcf && tag !== 0xc4 && tag !== 0xc8 && tag !== 0xcc) {
        return { height: bytes.readUInt16BE(pos + 5), width: bytes.readUInt16BE(pos + 7) };
      }
      pos += 2 + segLen;
    }
  }
  return null;
}

/** Pull --name <value> out of the arguments, falling back when it is absent. */
function flagValue(name: string, fallback: string): string {
  const idx = process.argv.indexOf('--' + name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const equalsForm = process.argv.find((a) => a.startsWith('--' + name + '='));
  return equalsForm === undefined ? fallback : equalsForm.slice(name.length + 3);
}

const inputSpec = flagValue('input', '/input');
const snapshotFile = inputSpec.endsWith('.json') ? inputSpec : join(inputSpec, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  process.stderr.write('token radar: no snapshot at ' + snapshotFile + ': pass --input <snapshot.json|directory> or mount the sealed /input\n');
  process.exit(2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board: ranked, radar: radarData } = buildRadar(snap);
const problem = boardIssue(ranked, snap);
if (problem !== null) {
  process.stderr.write('token radar: the model wrote a board the gate refuses: ' + problem + '\n');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows: ranked }) + '\n');
writeFileSync(join(outDir, 'data.js'), dataScript(radarData));

/** Copy one directory's regular files into `dst`, skipping names that start with a dot. */
function copyDirFiles(src: string, dst: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dst, { recursive: true });
  const done: string[] = [];
  for (const file of readdirSync(src)) {
    if (file.startsWith('.')) continue;
    const full = join(src, file);
    if (!statSync(full).isFile()) continue;
    copyFileSync(full, join(dst, file));
    done.push(file);
  }
  return done;
}

copyDirFiles(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = copyDirFiles(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  process.stderr.write('token radar: screenshots/ holds ' + shotNames.length + ' image' + (shotNames.length === 1 ? '' : 's') + ': hand in 3, the board, a detail view and a filtered view\n');
  process.exit(1);
}
for (const file of shotNames) {
  if (!SHOT_NAME.test(file)) {
    process.stderr.write('token radar: screenshots/' + file + ': a name is letters, digits and . _ -, 1 to 128 characters\n');
    process.exit(1);
  }
  // The gate refuses a screenshot past 512 KiB, or one whose long side runs
  // past 1440 px or whose short side falls under 800 px: refuse it here,
  // with the reason, rather than handing the scorer a board it must reject.
  const shotFile = join(outDir, 'screenshots', file);
  const size = imageSize(shotFile);
  if (size === null) {
    process.stderr.write('token radar: screenshots/' + file + ': not a whole PNG or JPEG\n');
    process.exit(1);
  }
  const nBytes = statSync(shotFile).size;
  if (nBytes > SHOT_LIMITS.max_bytes) {
    process.stderr.write('token radar: screenshots/' + file + ' is ' + nBytes + ' bytes, over the ' + SHOT_LIMITS.max_bytes + ' the gate allows\n');
    process.exit(1);
  }
  if (Math.max(size.width, size.height) > 1440 || Math.min(size.width, size.height) < 800) {
    process.stderr.write('token radar: screenshots/' + file + ' is ' + size.width + 'x' + size.height + ': the long side must be at most 1440 and the short side at least 800\n');
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossierFile = join(outDir, 'dossier.json');
writeFileSync(dossierFile, buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_CAP, screenshots: SHOT_LIMITS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
// The gate refuses a dossier past 1.5 MiB: refuse it here, with the size, rather than handing the scorer a board it must reject.
const dossierSize = statSync(dossierFile).size;
if (dossierSize > 1_572_864) {
  process.stderr.write('token radar: dossier.json is ' + dossierSize + ' bytes, over the 1.5 MiB the gate allows\n');
  process.exit(1);
}

process.stdout.write(
  'token radar: ' + snap.protocols.length + ' protocols, ' + snap.watchlist.length + ' on the watchlist, ' + ranked.length + ' rows scored (' + radarData.early_size + ' early, ' + radarData.live_size + ' live set aside)\n' +
  'token radar: top row ' + ranked[0]!.name + ' at $' + ranked[0]!.implied_value_usd.toLocaleString('en-US') + ', ' + ranked.filter((row) => (row.change_7d ?? 0) >= 20).length + ' rows rising 20% or more in 7 days\n' +
  'token radar: verdicts FARM ' + radarData.validation.verdicts.farm + ' / MARGINAL ' + radarData.validation.verdicts.marginal + ' / SKIP ' + radarData.validation.verdicts.skip + ' at $' + radarData.model.deposit_usd.toLocaleString('en-US') + '; size curve LOO miss x' + radarData.validation.fit.loo_median.toFixed(2) + ' (flat x' + radarData.validation.fit.loo_flat_median.toFixed(2) + '), time split x' + radarData.validation.fit.time_median.toFixed(2) + ', 900-day split x' + radarData.validation.fit.split900_median.toFixed(2) + ', ' + Math.round(radarData.validation.fit.within3 * 100) + '% within 3x; launch odds pi ' + radarData.validation.odds.pi.toFixed(2) + ' half-life ' + radarData.validation.odds.half_life_days + ' days, LOO Brier ' + radarData.validation.odds.loo_brier.toFixed(3) + ' vs base ' + radarData.validation.odds.loo_brier_base.toFixed(3) + '\n' +
  'token radar: wrote ' + join(outDir, 'board.json') + ', ' + join(outDir, 'data.js') + ', ' + join(outDir, 'dashboard') + ', ' + join(outDir, 'screenshots') + ' (' + shotNames.length + ' images) and ' + join(outDir, 'dossier.json') + '\n',
);
