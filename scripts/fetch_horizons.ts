/**
 * Fetches the Sun's and the Earth's position over every site in data/sites.json from the JPL
 * Horizons API, with the observer ON THE MOON at the site, and saves them for the app
 * (docs/LANDER_RULES.md, "Sun and Earth positions: JPL Horizons"; docs/DATA_SOURCES.md SRC-055).
 *
 *   npm run horizons:fetch              (reuses replies cached in data/horizons-api/)
 *   npm run horizons:fetch -- --refresh (asks Horizons again)
 *
 * One request per site, body and month, a short pause between requests. Every reply must say
 * "Center body name: Moon (301)", the requested target and the requested site, and its rows must
 * fill the month every 10 minutes with no gap; otherwise the script stops and writes nothing.
 * Output: public/data/horizons/<site>.bin (see src/services/horizonsData.ts for the layout) and
 * src/data/horizons/index.json. Run on a team laptop only; the browser never calls Horizons.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeHorizons } from '../src/services/horizonsData';
import { HORIZONS_API, horizonsParams, horizonsTime } from '../src/services/horizonsQuery';
import { parseSites, type Site } from '../src/services/sites';
import { parseCsvAzElRow, parseHorizonsHeader, tableRows } from './lib/horizonsText';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'horizons-api');
const OUT_BIN = join(ROOT, 'public', 'data', 'horizons');
const OUT_INDEX = join(ROOT, 'src', 'data', 'horizons', 'index.json');

/** 2026-11-01 00:00 UTC to 2027-12-31 23:50 UTC, every 10 minutes. */
const START_MS = Date.UTC(2026, 10, 1);
const END_MS = Date.UTC(2028, 0, 1);
const STEP_MS = 10 * 60_000;
const PAUSE_MS = 1500;

const BODIES = [
  { key: 'sun', target: 'Sun (10)' },
  { key: 'earth', target: 'Earth (399)' },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** The month starts from START_MS up to END_MS (each request covers [start, next start)). */
function months(): { start: number; end: number; label: string }[] {
  const list: { start: number; end: number; label: string }[] = [];
  for (let start = START_MS; start < END_MS;) {
    const d = new Date(start);
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    list.push({ start, end, label: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` });
    start = end;
  }
  return list;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'starreaction-data-script' } });
      const body = (await response.json()) as { result?: unknown; error?: unknown };
      if (!response.ok || typeof body.result !== 'string') {
        throw new Error(`HTTP ${response.status}: ${String(body.error ?? 'no result')}`);
      }
      return body.result;
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`  retry ${attempt} after: ${String(error)}`);
      await sleep(5000 * attempt);
    }
  }
}

/** Checks one reply and returns its rows; throws with the reason when anything is off. */
function readReply(text: string, site: Site, target: string, start: number, end: number) {
  const header = parseHorizonsHeader(text);
  const where = `${site.id} ${target} ${horizonsTime(start)}`;
  if (header.center !== 'Moon (301)') {
    throw new Error(`${where}: header says center "${header.center}", not "Moon (301)"`);
  }
  if (header.target !== target) throw new Error(`${where}: target is "${header.target}"`);
  const geo = header.centerGeodetic;
  if (!geo || Math.abs(geo.lonEast - site.lon) > 1e-6 || Math.abs(geo.lat - site.lat) > 1e-6) {
    throw new Error(`${where}: site echoed as ${JSON.stringify(geo)}`);
  }
  if (header.stepSize !== '10 minutes') throw new Error(`${where}: step "${header.stepSize}"`);
  // The app's data are airless apparent positions with UT times; don't rely on API defaults.
  if (!/^Atmos refraction: NO \(AIRLESS\)/m.test(text)) throw new Error(`${where}: not airless`);
  if (!/^Start time\s*:.*\sUT\s*$/m.test(text)) throw new Error(`${where}: times are not UT`);
  const rows = tableRows(text).map((line) => {
    const row = parseCsvAzElRow(line);
    if (!row) throw new Error(`${where}: unreadable row "${line}"`);
    return row;
  });
  const expected = (end - start) / STEP_MS;
  if (rows.length !== expected) throw new Error(`${where}: ${rows.length} rows, not ${expected}`);
  rows.forEach((row, i) => {
    if (row.t !== start + i * STEP_MS) throw new Error(`${where}: row ${i} at ${row.t}, gap`);
  });
  return rows;
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const sites = parseSites(JSON.parse(readFileSync(join(ROOT, 'data', 'sites.json'), 'utf8')));
  const count = (END_MS - START_MS) / STEP_MS;
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT_BIN, { recursive: true });
  mkdirSync(dirname(OUT_INDEX), { recursive: true });
  let requests = 0;
  const files: {
    id: string;
    file: string;
    lat: number;
    lonEast: number;
    bytes: number;
    fetchedUtc: string;
  }[] = [];
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const encoded: { file: string; bytes: Uint8Array }[] = [];

  for (const site of sites) {
    // When this site's replies were actually fetched (the newest cached reply), not when the
    // files are written: a run that reuses the cache must not look like a new download.
    let fetchedMs = 0;
    const values: Record<string, { az: number[]; el: number[] }> = {};
    for (const body of BODIES) {
      const az: number[] = [];
      const el: number[] = [];
      for (const month of months()) {
        const cached = join(CACHE, `${site.id}-${body.key}-${month.label}.txt`);
        const params = horizonsParams({
          body: body.key,
          site,
          start: month.start,
          stop: month.end - STEP_MS,
          step: '10 m',
          format: 'json',
          csv: true,
        });
        let text: string;
        if (!refresh && existsSync(cached)) {
          text = readFileSync(cached, 'utf8');
        } else {
          if (requests > 0) await sleep(PAUSE_MS);
          requests += 1;
          console.log(`fetch ${site.id} ${body.key} ${month.label}`);
          text = await fetchText(`${HORIZONS_API}?${new URLSearchParams(params).toString()}`);
          writeFileSync(cached, text);
        }
        fetchedMs = Math.max(fetchedMs, statSync(cached).mtimeMs);
        for (const row of readReply(text, site, body.target, month.start, month.end)) {
          az.push(row.azimuth);
          el.push(row.elevation);
        }
      }
      values[body.key] = { az, el };
    }
    const sun = values.sun;
    const earth = values.earth;
    if (!sun || !earth || sun.az.length !== count || earth.az.length !== count) {
      throw new Error(`${site.id}: expected ${count} samples per body`);
    }
    const bytes = encodeHorizons({
      sunAz: sun.az,
      sunEl: sun.el,
      earthAz: earth.az,
      earthEl: earth.el,
    });
    const file = `${site.id}.bin`;
    encoded.push({ file, bytes });
    files.push({
      id: site.id,
      file,
      lat: site.lat,
      lonEast: site.lon,
      bytes: bytes.byteLength,
      fetchedUtc: iso(fetchedMs),
    });
  }

  // Everything checked: only now write the outputs.
  for (const { file, bytes } of encoded) writeFileSync(join(OUT_BIN, file), bytes);
  const index = {
    version: 1,
    sourceId: 'SRC-055',
    fetchedUtc:
      files
        .map((entry) => entry.fetchedUtc)
        .sort()
        .at(-1) ?? iso(Date.now()),
    startUtc: new Date(START_MS).toISOString().replace('.000Z', 'Z'),
    stepMinutes: STEP_MS / 60_000,
    count,
    values:
      'Airless apparent azimuth (clockwise from north) and elevation of the body centre, seen from the site on the 1737.4 km reference sphere (Horizons QUANTITIES 4), in hundredths of a degree',
    layout:
      'planar, little-endian: Sun azimuth uint16, Sun elevation int16, Earth azimuth uint16, Earth elevation int16',
    altitude: '0 km altitude = reference height, not measured terrain',
    sites: files,
  };
  writeFileSync(OUT_INDEX, `${JSON.stringify(index, null, 2)}\n`);
  const total = files.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(
    `${requests} requests; ${files.length} sites × ${count} samples; ${files.map((f) => `${f.file} ${f.bytes} B`).join(', ')}; total ${total} B (${(total / 1024 / 1024).toFixed(2)} MB)`,
  );
}

await main();
