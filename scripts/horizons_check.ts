/**
 * Checks the app's Sun and Earth positions against JPL Horizons (docs/LANDER_RULES.md, "Checked
 * against JPL Horizons"). Writes docs/HORIZONS_CHECK.md and src/data/horizonsCheck.json (the About
 * page's table).   npm run horizons:check
 *
 * (a) Our engine (smooth-sphere horizon, no terrain) against the API files (public/data/horizons/)
 *     for im1 and im2 over three days, every 10 minutes: the largest and the mean elevation
 *     difference per body; fails above 0.2°. The Earth's parallax from the site is up to about
 *     0.26°, so an Earth failure with a Sun pass means the engine measured from the Moon's centre.
 * (b) Ayah's web-app exports (data/horizons-manual/): each row's '*' (daylight) and 'i' (Earth
 *     up) flag must agree with the API data at the same time.
 * (c) The exports that have "Azi (a-app) Elev" columns: their elevations must match the API data
 *     within 0.2°.
 * A file whose header does not say "Center body name: Moon (301)" is skipped and reported.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  decodeHorizons,
  horizonsAzEl,
  readHorizonsIndex,
  type HorizonsSeries,
  type SkyBody,
} from '../src/services/horizonsData';
import { parseSites, type Site } from '../src/services/sites';
import {
  azimuthElevationOf,
  EARTH_RADIUS_KM,
  lunarSky,
  SUN_RADIUS_KM,
  surfacePoint,
  type LatLon,
  type Vec3,
} from '../src/utils/lunarSky';
import { parseHorizonsHeader, parseManualRows } from './lib/horizonsText';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_DEG = 0.2;
/**
 * The flags describe the disc's upper limb, the API data its centre. Converting one into the other
 * needs the disc's angular radius, which no agreed equation gives (MISSING EQUATION), so rows with
 * the centre this close to the horizon are listed, not judged. A team assumption.
 */
const NEAR_HORIZON_DEG = 1;

/**
 * The body's angular radius seen from the site at `t`, degrees: asin(R / distance), the distance
 * from our engine (the Horizons files hold no distance). Rule: LANDER_RULES "Is it up".
 */
function angularRadiusAt(body: 'sun' | 'earth', site: LatLon, t: number): number {
  const sky = lunarSky(new Date(t));
  const target: Vec3 = body === 'sun' ? sky.sun : sky.earth;
  const at = surfacePoint(site);
  const distance = Math.hypot(target[0] - at[0], target[1] - at[1], target[2] - at[2]);
  const radius = body === 'sun' ? SUN_RADIUS_KM : EARTH_RADIUS_KM;
  return (Math.asin(radius / distance) * 180) / Math.PI;
}
const ENGINE_DAYS = { start: Date.UTC(2026, 10, 13), days: 3 };
const ENGINE_SITES = ['im1', 'im2'];
const MATCH_SITE_DEG = 0.05;

const fmt = (value: number, digits = 3) => value.toFixed(digits);
const day = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

function loadSeries(sites: readonly Site[]): Map<string, HorizonsSeries> {
  const index = readHorizonsIndex(
    JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'horizons', 'index.json'), 'utf8')),
  );
  if (!index) throw new Error('src/data/horizons/index.json is missing or unreadable');
  const found = new Map<string, HorizonsSeries>();
  for (const entry of index.sites) {
    const site = sites.find((candidate) => candidate.id === entry.id);
    if (!site || site.lat !== entry.lat || site.lon !== entry.lonEast) {
      throw new Error(`${entry.id}: Horizons file does not match data/sites.json; re-fetch`);
    }
    const buffer = readFileSync(join(ROOT, 'public', 'data', 'horizons', entry.file));
    const series = decodeHorizons(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      {
        siteId: entry.id,
        startMs: index.startMs,
        stepMs: index.stepMinutes * 60_000,
        count: index.count,
      },
    );
    if (!series) throw new Error(`${entry.file}: wrong size`);
    found.set(entry.id, series);
  }
  return found;
}

interface EngineRow {
  site: string;
  body: SkyBody;
  samples: number;
  maxDiffDeg: number;
  meanDiffDeg: number;
  maxAzDiffDeg: number;
  pass: boolean;
}

function engineCheck(site: Site, series: HorizonsSeries): EngineRow[] {
  const step = 10 * 60_000;
  const end = ENGINE_DAYS.start + ENGINE_DAYS.days * 86_400_000;
  return (['sun', 'earth'] as const).map((body) => {
    let max = 0;
    let sum = 0;
    let maxAz = 0;
    let samples = 0;
    for (let t = ENGINE_DAYS.start; t <= end; t += step) {
      const api = horizonsAzEl(series, body, t);
      if (!api) throw new Error(`${site.id}: no API sample at ${day(t)}`);
      const sky = lunarSky(new Date(t));
      const ours = azimuthElevationOf(body === 'sun' ? sky.sun : sky.earth, site);
      const diff = Math.abs(ours.elevation - api.elevation);
      max = Math.max(max, diff);
      sum += diff;
      maxAz = Math.max(maxAz, Math.abs(((ours.azimuth - api.azimuth + 540) % 360) - 180));
      samples += 1;
    }
    return {
      site: site.id,
      body,
      samples,
      maxDiffDeg: max,
      meanDiffDeg: sum / samples,
      maxAzDiffDeg: maxAz,
      pass: max <= LIMIT_DEG,
    };
  });
}

interface FlagRow {
  file: string;
  site: string;
  target: string;
  rows: number;
  agree: number;
  disagree: { time: string; flag: string; says: boolean; centreDeg: number; limbDeg: number }[];
  /** Rows with the centre within NEAR_HORIZON_DEG of the horizon: judged too, listed to show them. */
  nearHorizon: { time: string; flag: string; says: boolean; centreDeg: number; limbDeg: number }[];
  pass: boolean;
}

interface ElevationRow {
  file: string;
  site: string;
  rows: number;
  maxDiffDeg: number;
  meanDiffDeg: number;
  pass: boolean;
}

function nearestSite(sites: readonly Site[], lonEast: number, lat: number): Site | null {
  let best: Site | null = null;
  let bestDiff = Infinity;
  for (const site of sites) {
    const diff = Math.max(Math.abs(site.lat - lat), Math.abs(site.lon - lonEast));
    if (diff < bestDiff) {
      best = site;
      bestDiff = diff;
    }
  }
  return bestDiff <= MATCH_SITE_DEG ? best : null;
}

async function main() {
  const sites = parseSites(JSON.parse(readFileSync(join(ROOT, 'data', 'sites.json'), 'utf8')));
  const series = loadSeries(sites);
  const seriesFor = (id: string) => {
    const found = series.get(id);
    if (!found) throw new Error(`no Horizons file for ${id}`);
    return found;
  };

  // (a)
  const engine = ENGINE_SITES.flatMap((id) => {
    const site = sites.find((candidate) => candidate.id === id);
    if (!site) throw new Error(`no site ${id}`);
    return engineCheck(site, seriesFor(id));
  });

  // (b) and (c)
  const manualDir = join(ROOT, 'data', 'horizons-manual');
  const files = readdirSync(manualDir)
    .filter((name) => name.endsWith('.txt'))
    .sort();
  const skipped: { file: string; reason: string }[] = [];
  const flags: FlagRow[] = [];
  const elevations: ElevationRow[] = [];
  for (const name of files) {
    const text = readFileSync(join(manualDir, name), 'utf8');
    const header = parseHorizonsHeader(text);
    if (header.center !== 'Moon (301)') {
      skipped.push({ file: name, reason: `header says center "${header.center ?? 'none'}"` });
      continue;
    }
    const geo = header.centerGeodetic;
    const site = geo && nearestSite(sites, geo.lonEast, geo.lat);
    if (!geo || !site) {
      skipped.push({ file: name, reason: `no site within ${MATCH_SITE_DEG}° of its header` });
      continue;
    }
    const s = seriesFor(site.id);
    const rows = parseManualRows(text);
    const flagRow: FlagRow = {
      file: name,
      site: site.id,
      target: header.target ?? '?',
      rows: 0,
      agree: 0,
      disagree: [],
      nearHorizon: [],
      pass: true,
    };
    let elevationMax = 0;
    let elevationSum = 0;
    let elevationRows = 0;
    for (const row of rows) {
      const sun = horizonsAzEl(s, 'sun', row.t);
      const earth = horizonsAzEl(s, 'earth', row.t);
      if (!sun || !earth) {
        skipped.push({ file: name, reason: `row ${day(row.t)} is outside the API data` });
        continue;
      }
      for (const [flag, says, centreDeg, body] of [
        ['*', row.daylight, sun.elevation, 'sun'],
        ['i', row.interferer, earth.elevation, 'earth'],
      ] as const) {
        flagRow.rows += 1;
        const entry = { time: day(row.t), flag, says, centreDeg };
        // Horizons' flag: the upper limb on or above the horizon (elevation + angular radius > 0).
        const limbDeg = centreDeg + angularRadiusAt(body, site, row.t);
        const judged = { ...entry, limbDeg };
        if (Math.abs(centreDeg) < NEAR_HORIZON_DEG) flagRow.nearHorizon.push(judged);
        if (says === limbDeg > 0) flagRow.agree += 1;
        else flagRow.disagree.push(judged);
      }
      if (row.azEl && header.target === 'Sun (10)') {
        const diff = Math.abs(row.azEl.elevation - sun.elevation);
        elevationMax = Math.max(elevationMax, diff);
        elevationSum += diff;
        elevationRows += 1;
      }
    }
    flagRow.pass = flagRow.disagree.length === 0;
    flags.push(flagRow);
    if (elevationRows > 0) {
      elevations.push({
        file: name,
        site: site.id,
        rows: elevationRows,
        maxDiffDeg: elevationMax,
        meanDiffDeg: elevationSum / elevationRows,
        pass: elevationMax <= LIMIT_DEG,
      });
    }
  }

  const sunPass = engine.filter((row) => row.body === 'sun').every((row) => row.pass);
  const earthPass = engine.filter((row) => row.body === 'earth').every((row) => row.pass);
  const diagnosis =
    sunPass && !earthPass
      ? 'Earth fails while the Sun passes: the engine is measuring from the Moon’s centre instead of the site. Fix the engine.'
      : null;
  const allPass =
    engine.every((row) => row.pass) &&
    flags.every((row) => row.pass) &&
    elevations.every((row) => row.pass);
  const generatedUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const json = {
    version: 1,
    generatedUtc,
    limitDeg: LIMIT_DEG,
    nearHorizonDeg: NEAR_HORIZON_DEG,
    engineDays: `${day(ENGINE_DAYS.start)} UTC + ${ENGINE_DAYS.days} days, every 10 minutes`,
    allPass,
    diagnosis,
    engine: engine.map((row) => ({
      ...row,
      maxDiffDeg: Number(row.maxDiffDeg.toFixed(4)),
      meanDiffDeg: Number(row.meanDiffDeg.toFixed(4)),
      maxAzDiffDeg: Number(row.maxAzDiffDeg.toFixed(4)),
    })),
    flags: flags.map((row) => ({
      file: row.file,
      site: row.site,
      target: row.target,
      rows: row.rows,
      agree: row.agree,
      disagree: row.disagree.length,
      nearHorizon: row.nearHorizon.length,
      pass: row.pass,
    })),
    elevations: elevations.map((row) => ({
      ...row,
      maxDiffDeg: Number(row.maxDiffDeg.toFixed(4)),
      meanDiffDeg: Number(row.meanDiffDeg.toFixed(4)),
    })),
    skipped,
  };
  writeFileSync(
    join(ROOT, 'src', 'data', 'horizonsCheck.json'),
    await format(JSON.stringify(json), { parser: 'json' }),
  );

  const yes = (pass: boolean) => (pass ? 'Pass' : '**FAIL**');
  const md: string[] = [
    '# Checked against JPL Horizons',
    '',
    `Generated by \`npm run horizons:check\` (scripts/horizons_check.ts) on ${generatedUtc}. Do not edit by hand. Rules: docs/LANDER_RULES.md, "Checked against JPL Horizons". Sources: docs/DATA_SOURCES.md SRC-055 (API files) and SRC-056 (manual exports).`,
    '',
    `**Overall: ${allPass ? 'all checks pass' : 'SOME CHECKS FAIL'}.**`,
    '',
    '## (a) Our engine against the API files',
    '',
    `Our engine (astronomy-engine, smooth-sphere horizon, no terrain) against the API files, ${json.engineDays}. Elevation differences; fails above ${LIMIT_DEG}°. Azimuth is shown for information only.`,
    '',
    '| Site | Body | Samples | Max elevation diff | Mean elevation diff | Max azimuth diff | Result |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...engine.map(
      (row) =>
        `| ${row.site} | ${row.body === 'sun' ? 'Sun' : 'Earth'} | ${row.samples} | ${fmt(row.maxDiffDeg)}° | ${fmt(row.meanDiffDeg)}° | ${fmt(row.maxAzDiffDeg)}° | ${yes(row.pass)} |`,
    ),
    '',
    diagnosis ??
      'The Earth passes as well as the Sun, so the engine measures from the site (the Earth’s parallax is included).',
    '',
    '## (b) Daylight and Earth flags in the manual exports',
    '',
    `Each row's \`*\` (daylight) and \`i\` (Earth above the horizon) flag against the API data at the same time. Horizons sets these flags from the disc's upper limb, while the API data is the centre; so every row is judged by the upper limb: centre elevation + angular radius (asin(R / distance), R_sun = 695,700 km, R_earth = 6,378.137 km, the distance from our engine) must be above 0° exactly when Horizons sets the flag (LANDER_RULES, "Is it up: the upper limb"). Rows with the centre within ${NEAR_HORIZON_DEG}° of the horizon are listed below as close calls; they are judged too.`,
    '',
    '| File | Site | Target | Flags compared | Agree | Disagree | Close calls (judged) | Result |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...flags.map(
      (row) =>
        `| ${row.file} | ${row.site} | ${row.target} | ${row.rows} | ${row.agree} | ${row.disagree.length} | ${row.nearHorizon.length} | ${yes(row.pass)} |`,
    ),
    '',
  ];
  const listed = flags.flatMap((row) => [
    ...row.disagree.map((entry) => ({ ...entry, file: row.file, kind: 'DISAGREES' })),
    ...row.nearHorizon
      .filter((entry) => !row.disagree.includes(entry))
      .map((entry) => ({ ...entry, file: row.file, kind: 'close call, agrees' })),
  ]);
  if (listed.length > 0) {
    md.push(
      '| File | Time (UTC) | Flag | Horizons says | Centre elevation | Upper limb | Kind |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...listed.map(
        (entry) =>
          `| ${entry.file} | ${entry.time} | \`${entry.flag}\` | ${entry.says ? 'up' : 'down'} | ${fmt(entry.centreDeg)}° | ${fmt(entry.limbDeg)}° | ${entry.kind} |`,
      ),
      '',
    );
  }
  md.push(
    '## (c) Elevation columns in the manual Sun exports',
    '',
    `The exports that have the "Azi (a-app) Elev" columns, against the API data at the same times; fails above ${LIMIT_DEG}°. The bg1 export uses rounded coordinates (61.81, 18.56: about 70 m from the site), which is negligible here.`,
    '',
    '| File | Site | Rows | Max elevation diff | Mean elevation diff | Result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...elevations.map(
      (row) =>
        `| ${row.file} | ${row.site} | ${row.rows} | ${fmt(row.maxDiffDeg)}° | ${fmt(row.meanDiffDeg)}° | ${yes(row.pass)} |`,
    ),
    '',
    '## Skipped',
    '',
    ...(skipped.length > 0
      ? skipped.map((entry) => `- ${entry.file}: ${entry.reason}`)
      : ['Nothing was skipped.']),
    '',
    `Expected but not provided: a Sun export for im1 (data/horizons-manual/ has ${files.length} files: ${files.map((name) => basename(name)).join(', ')}).`,
    '',
  );
  writeFileSync(
    join(ROOT, 'docs', 'HORIZONS_CHECK.md'),
    await format(md.join('\n'), { parser: 'markdown', proseWrap: 'always', printWidth: 100 }),
  );
  console.log(`${allPass ? 'PASS' : 'FAIL'}: docs/HORIZONS_CHECK.md, src/data/horizonsCheck.json`);
  for (const row of engine) {
    console.log(
      `(a) ${row.site} ${row.body}: max ${fmt(row.maxDiffDeg, 4)}° mean ${fmt(row.meanDiffDeg, 4)}° ${row.pass ? 'pass' : 'FAIL'}`,
    );
  }
  for (const row of flags) {
    console.log(
      `(b) ${row.file}: ${row.agree}/${row.rows} agree, ${row.disagree.length} disagree (${row.nearHorizon.length} close calls, judged)`,
    );
  }
  for (const row of elevations) {
    console.log(`(c) ${row.file}: max ${fmt(row.maxDiffDeg, 4)}° ${row.pass ? 'pass' : 'FAIL'}`);
  }
  if (skipped.length > 0) console.log(`skipped: ${JSON.stringify(skipped)}`);
  if (!allPass) process.exitCode = 1;
}

await main();
