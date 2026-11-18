// A dossier for a dashboard directory, in the makefun/dossier/v1 shape.
//
// buildDossier(dir, caps) reads dir/dashboard/ and dir/screenshots/ and
// returns one canonical JSON document as bytes:
//
//   schema  "makefun/dossier/v1"
//   cover   0, the first screenshot in name order
//   images  every PNG/JPEG in screenshots/, each with its sha256 and base64
//   text    a "## Dashboard" inventory, then "## Source": every source
//           file's contents in a fenced block, cut to caps.text_max_bytes
//
// The caps only ever refuse, except text_max_bytes, which shapes the text:
// whole files go in first, then the first file that does not fit goes in
// up to its last complete line that fits, and a final line says what was
// left out. The scorer rebuilds the dossier from the same directory with
// its own copy of this logic and requires the bytes to match, so every
// choice below is pinned by the bytes it produces, not by taste.
//
// Node 22, standard library only, erasable TypeScript: it runs as-is
// under `node main.ts` with no build step and no install.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';

/** The schema string every dossier carries. */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** The largest dossier, in bytes: 4 MiB. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** The most screenshots a dossier carries. */
export const DOSSIER_MAX_IMAGES = 8;
/** A file name a dossier accepts: a letter, digit or _ first, then letters, digits and . _ -, 1 to 128 long, no directory part. */
export const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
/** Extensions whose contents the dossier's text prints: source, never images. */
export const TEXT_FILE = /\.(?:html|css|js|json|mjs|svg|md|txt)$/;

/** The caps buildDossier is held to. text_max_bytes shapes the text; the rest only refuse. */
export interface DossierCaps {
  text_max_bytes: number;
  screenshots?: { max: number; max_bytes: number };
  dashboard?: { max_files: number; max_bytes: number };
}

/** The reason buildDossier wrote no dossier: a cap, a screenshot, the dashboard, or the size. */
export class DossierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DossierError';
  }
}

// ---------------------------------------------------------------- small pieces

/** The sha256 of some bytes, as lowercase hex. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Order two strings by UTF-16 code unit, the way the dossier orders names. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A string's length in UTF-8 bytes. */
function utf8Length(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Whether these bytes start with this magic prefix. */
function startsWithMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

const PNG_PREFIX = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_PREFIX = [0xff, 0xd8, 0xff];

/**
 * A regular file's bytes, read whole, when it is at most `limit` long.
 * It never follows a link and never reads more than `limit` bytes; a link,
 * a directory, a missing file, or a file past the limit is a DossierError
 * that names `label`.
 */
function readAtMost(path: string, limit: number, label: string): Uint8Array {
  let size: number;
  try {
    const info = lstatSync(path);
    if (!info.isFile()) throw new DossierError(`buildDossier: ${label} is not a regular file`);
    size = info.size;
  } catch (err) {
    if (err instanceof DossierError) throw err;
    throw new DossierError(`buildDossier: ${label} cannot be read`);
  }
  if (size > limit) {
    throw new DossierError(`buildDossier: ${label} is ${size} bytes, over the ${limit} a dossier reads`);
  }
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new DossierError(`buildDossier: ${label} is not a regular file`);
  }
  try {
    const now = fstatSync(fd).size;
    if (now > limit) {
      throw new DossierError(`buildDossier: ${label} is ${now} bytes, over the ${limit} a dossier reads`);
    }
    const buf = Buffer.alloc(now);
    let at = 0;
    while (at < buf.length) {
      const n = readSync(fd, buf, at, buf.length - at, at);
      if (n === 0) break;
      at += n;
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, at);
  } finally {
    closeSync(fd);
  }
}

/** How many lines a text holds: 0 when empty, else its newlines plus one for a last line without one. */
function countLines(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let n = 0;
  for (const b of bytes) if (b === 0x0a) n++;
  return bytes[bytes.length - 1] === 0x0a ? n : n + 1;
}

/** A Markdown fence one backtick longer than the longest backtick run in `body`, three at least. */
function fenceForText(body: string): string {
  let longest = 0;
  const runs = body.match(/`+/g) ?? [];
  for (const run of runs) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The language a fence opens with for a file: its extension, with mjs shown as js. */
function fenceLanguage(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1);
  return ext === 'mjs' ? 'js' : ext;
}

/**
 * JSON with every object's keys in code-unit order and no whitespace, so a
 * value has exactly one spelling. Takes null, booleans, finite numbers,
 * strings, arrays and plain objects; anything else is a TypeError.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('canonicalJson: only plain objects and arrays');
    }
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort(compareText)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`canonicalJson: a ${typeof value} has no JSON form`);
}

// ---------------------------------------------------------------- the dashboard walk

/** One file of the dashboard tree: its path relative to the dashboard directory, and its size. */
interface DashboardEntry {
  path: string;
  size: number;
}

/**
 * Every regular file under `root`, in path order, with its size. A
 * dot-directory, a name the dossier refuses, or an entry that is neither a
 * file nor a directory is a DossierError; when `caps` is given, so are too
 * many files or too many bytes in all. Links are never followed and never
 * taken for files.
 */
function collectDashboard(
  root: string,
  caps: { max_files: number; max_bytes: number } | null,
): DashboardEntry[] {
  let rootInfo;
  try {
    rootInfo = lstatSync(root);
  } catch {
    throw new DossierError('buildDossier: no dashboard/ directory: the page and its source are what the judge reads');
  }
  if (!rootInfo.isDirectory()) {
    throw new DossierError('buildDossier: dashboard is not a directory');
  }
  const found: DashboardEntry[] = [];
  const walk = (rel: string): void => {
    const dir = rel === '' ? root : join(root, rel);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) {
          throw new DossierError(`buildDossier: dashboard/${p} is a dot-directory`);
        }
        walk(p);
      } else if (entry.isFile()) {
        if (!PLAIN_NAME.test(entry.name)) {
          throw new DossierError(
            `buildDossier: dashboard/${p}: a file's name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`,
          );
        }
        found.push({ path: p, size: lstatSync(join(root, p)).size });
      } else {
        throw new DossierError(`buildDossier: dashboard/${p} is neither a file nor a directory`);
      }
    }
  };
  walk('');
  found.sort((a, b) => compareText(a.path, b.path));
  if (caps !== null) {
    if (found.length > caps.max_files) {
      throw new DossierError(`buildDossier: dashboard/ holds more than the ${caps.max_files} files it may`);
    }
    const bytes = found.reduce((n, f) => n + f.size, 0);
    if (bytes > caps.max_bytes) {
      throw new DossierError(`buildDossier: dashboard/'s files come to more than the ${caps.max_bytes} bytes they may`);
    }
  }
  return found;
}

// ---------------------------------------------------------------- the dossier

/** One dashboard file as the dossier's text shows it. */
interface SourceSection {
  heading: string;
  /** The fenced block, or null when the file is empty. */
  block: string | null;
  /** The file's decoded text, '' when empty; the cut helper splits it by line. */
  text: string;
  /** The fence that opens the block. */
  fence: string;
  /** The language the fence opens with. */
  lang: string;
  /** The file's line count. */
  lines: number;
  /** The file's bytes. */
  raw: Uint8Array;
  /** The file's byte length. */
  fileBytes: number;
  /** The heading's bytes plus the block's bytes. */
  size: number;
}

/**
 * The dossier of a dashboard directory, as canonical JSON bytes: the
 * screenshots in dir/screenshots/ are its images, the first the cover; its
 * text is the "## Dashboard" inventory and the "## Source" sections, capped
 * at caps.text_max_bytes with the cut rule in the header. Throws
 * DossierError on caps it cannot keep and on a dashboard or screenshots
 * directory it refuses.
 */
export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const max = caps.text_max_bytes;
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new DossierError(`buildDossier: caps.text_max_bytes must be a positive integer, not ${String(max)}`);
  }

  // The screenshot caps are the dossier's own unless the caller allows fewer.
  let shotLimit = DOSSIER_MAX_IMAGES;
  let shotLimitWhy = 'a dossier holds';
  let shotBytesLimit = DOSSIER_MAX_BYTES;
  let shotBytesWhy = 'a dossier holds';
  if (caps.screenshots !== undefined) {
    const s = caps.screenshots as { max?: unknown; max_bytes?: unknown } | null;
    if (typeof s !== 'object' || s === null) {
      throw new DossierError('buildDossier: caps.screenshots must be an object {max, max_bytes}');
    }
    for (const k of ['max', 'max_bytes'] as const) {
      const v = s[k];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
        throw new DossierError(`buildDossier: caps.screenshots.${k} must be a positive integer, not ${String(v)}`);
      }
    }
    if ((s.max as number) < shotLimit) {
      shotLimit = s.max as number;
      shotLimitWhy = 'caps.screenshots.max allows';
    }
    if ((s.max_bytes as number) < shotBytesLimit) {
      shotBytesLimit = s.max_bytes as number;
      shotBytesWhy = 'caps.screenshots.max_bytes allows';
    }
  }
  let dashboardCaps: { max_files: number; max_bytes: number } | null = null;
  if (caps.dashboard !== undefined) {
    const d = caps.dashboard as { max_files?: unknown; max_bytes?: unknown } | null;
    if (typeof d !== 'object' || d === null) {
      throw new DossierError('buildDossier: caps.dashboard must be an object {max_files, max_bytes}');
    }
    for (const k of ['max_files', 'max_bytes'] as const) {
      const v = d[k];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
        throw new DossierError(`buildDossier: caps.dashboard.${k} must be a positive integer, not ${String(v)}`);
      }
    }
    dashboardCaps = { max_files: d.max_files as number, max_bytes: d.max_bytes as number };
  }

  const files = collectDashboard(join(dir, 'dashboard'), dashboardCaps);

  // The screenshots, in name order; names starting with '.' are skipped.
  const shotsDir = join(dir, 'screenshots');
  let shotNames: string[];
  try {
    shotNames = readdirSync(shotsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort(compareText);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      throw new DossierError('buildDossier: no screenshots/ directory: the first screenshot is the cover');
    }
    throw new DossierError('buildDossier: screenshots/ cannot be read');
  }
  if (shotNames.length === 0) {
    throw new DossierError('buildDossier: screenshots/ holds no image: the first is the cover');
  }
  if (shotNames.length > shotLimit) {
    throw new DossierError(`buildDossier: screenshots/ holds ${shotNames.length} files, over the ${shotLimit} ${shotLimitWhy}`);
  }
  const images = shotNames.map((name) => {
    if (!PLAIN_NAME.test(name)) {
      throw new DossierError(
        `buildDossier: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`,
      );
    }
    const bytes = readAtMost(join(shotsDir, name), shotBytesLimit, `screenshots/${name}`);
    const mediaType = startsWithMagic(bytes, PNG_PREFIX)
      ? 'image/png'
      : startsWithMagic(bytes, JPEG_PREFIX)
        ? 'image/jpeg'
        : null;
    if (mediaType === null) {
      throw new DossierError(`buildDossier: screenshots/${name} is neither a PNG nor a JPEG`);
    }
    return { name, media_type: mediaType, sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
  });

  // The inventory block. The two empty lines at the end open the Source part.
  const head = [
    '## Dashboard',
    '',
    `Files: ${files.length} (${files.reduce((n, f) => n + f.size, 0)} bytes)`,
    ...files.map((f) => `- ${f.path} (${f.size} bytes)`),
    '',
    '## Source',
    '',
    '',
  ].join('\n');

  // The files whose contents the text shows; a binary file is only named above.
  const shown = files.filter((f) => TEXT_FILE.test(f.path));
  const sections: SourceSection[] = shown.map((f) => {
    const bytes = readAtMost(join(dir, 'dashboard', f.path), DOSSIER_MAX_BYTES, `dashboard/${f.path}`);
    const lines = countLines(bytes);
    const heading = `### ${f.path}\n\n${bytes.length} bytes, ${lines} line${lines === 1 ? '' : 's'}\n\n`;
    if (bytes.length === 0) {
      return { heading, block: null, text: '', fence: '', lang: '', lines, raw: bytes, fileBytes: 0, size: utf8Length(heading) };
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    const fence = fenceForText(text);
    const lang = fenceLanguage(f.path);
    const block = `${fence}${lang}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
    return {
      heading,
      block,
      text,
      fence,
      lang,
      lines,
      raw: bytes,
      fileBytes: bytes.length,
      size: utf8Length(heading) + utf8Length(block),
    };
  });

  // tailBytes[k]: the file bytes of the shown files after section k.
  const tailBytes = new Array<number>(sections.length + 1).fill(0);
  for (let k = sections.length - 1; k >= 0; k--) {
    tailBytes[k] = tailBytes[k + 1]! + (k + 1 < sections.length ? sections[k + 1]!.fileBytes : 0);
  }

  const cutLine = (count: number, bytes: number): string =>
    `[Cut at ${max} bytes: ${count} file${count === 1 ? '' : 's'} and ${bytes} bytes left out.]\n`;

  let out = head;
  let used = utf8Length(head);
  if (used + utf8Length(cutLine(0, 0)) > max) {
    throw new DossierError(`buildDossier: caps.text_max_bytes ${max} cannot hold even the Dashboard block and the cut line`);
  }
  let kept = 0;
  for (; kept < sections.length; kept++) {
    const section = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const tail = restCount === 0 ? 0 : utf8Length(cutLine(restCount, tailBytes[kept]!));
    if (used + section.size + tail > max) break;
    out += section.block === null ? section.heading : `${section.heading}${section.block}`;
    used += section.size;
  }
  if (kept < sections.length) {
    // The first file that does not fit whole: its head, up to its last
    // complete line that fits, then nothing more after it.
    const first = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const after = tailBytes[kept]!;
    const part =
      first.block === null
        ? null
        : cutSection(first.heading, first, max - used, (hidden) => cutLine(restCount, after + hidden));
    out += part ?? cutLine(restCount + 1, after + first.fileBytes);
  }
  if (utf8Length(out) > max) {
    throw new DossierError(`buildDossier: caps.text_max_bytes ${max} cannot hold even the Dashboard block and the cut line`);
  }

  const doc = { schema: DOSSIER_SCHEMA, cover: 0, text: out.replace(/\n+$/, '\n'), images };
  const bytes = Buffer.from(canonicalJson(doc), 'utf8');
  if (bytes.length > DOSSIER_MAX_BYTES) {
    throw new DossierError(`buildDossier: the dossier is ${bytes.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/**
 * A file's section cut inside its contents: its heading, its first k lines
 * in its fence (closed), a line naming how many of its lines are not shown,
 * then `tail(hidden)` (the cut line, given the bytes this file leaves out).
 * k is the most lines — at least one, fewer than all — whose whole fits in
 * `room` UTF-8 bytes; null when not one line fits. It cuts only after a
 * line's LF, which is never inside a UTF-8 sequence, so no character is
 * split, and a line's shown bytes are those of its text.
 */
function cutSection(
  heading: string,
  section: SourceSection,
  room: number,
  tail: (hidden: number) => string,
): string | null {
  const total = section.lines;
  const lines = section.text.split('\n');
  const open = `${section.fence}${section.lang}\n`;
  const close = `${section.fence}\n\n`;
  const note = (k: number): string => `[${total - k} of this file's ${total} lines not shown.]\n`;
  const fixed = utf8Length(heading) + utf8Length(open) + utf8Length(close);
  let best = 0;
  let shown = 0;
  let raw = 0;
  for (let k = 1; k < total; k++) {
    shown += utf8Length(lines[k - 1]!) + 1;
    raw = section.raw.indexOf(0x0a, raw) + 1;
    if (fixed + shown + utf8Length(note(k)) + utf8Length(tail(section.fileBytes - raw)) <= room) best = k;
  }
  if (best === 0) return null;
  let rawEnd = 0;
  for (let k = 0; k < best; k++) rawEnd = section.raw.indexOf(0x0a, rawEnd) + 1;
  const head = lines
    .slice(0, best)
    .map((l) => `${l}\n`)
    .join('');
  return `${heading}${open}${head}${close}${note(best)}${tail(section.fileBytes - rawEnd)}`;
}
