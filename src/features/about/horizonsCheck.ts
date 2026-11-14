/**
 * The results of `npm run horizons:check` (src/data/horizonsCheck.json, docs/HORIZONS_CHECK.md;
 * docs/LANDER_RULES.md, "Checked against JPL Horizons"), read and checked for the About page.
 * Null when the file is missing or not in the shape this code reads. Pure.
 */

export interface EngineCheck {
  readonly site: string;
  readonly body: 'sun' | 'earth';
  readonly samples: number;
  readonly maxDiffDeg: number;
  readonly meanDiffDeg: number;
  readonly pass: boolean;
}

export interface FlagCheck {
  readonly file: string;
  readonly site: string;
  readonly target: string;
  readonly rows: number;
  readonly agree: number;
  readonly disagree: number;
  readonly nearHorizon: number;
  readonly pass: boolean;
}

export interface ElevationCheck {
  readonly file: string;
  readonly site: string;
  readonly rows: number;
  readonly maxDiffDeg: number;
  readonly pass: boolean;
}

export interface HorizonsCheck {
  readonly generatedUtc: string;
  readonly limitDeg: number;
  readonly nearHorizonDeg: number;
  readonly engineDays: string;
  readonly allPass: boolean;
  readonly engine: readonly EngineCheck[];
  readonly flags: readonly FlagCheck[];
  readonly elevations: readonly ElevationCheck[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === 'string';

/** Each entry read by `read`, or null when any of them is not readable. */
function list<T>(value: unknown, read: (entry: Record<string, unknown>) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const entry of value) {
    const item = isRecord(entry) ? read(entry) : null;
    if (item === null) return null;
    out.push(item);
  }
  return out;
}

export function readHorizonsCheck(raw: unknown): HorizonsCheck | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const { generatedUtc, limitDeg, nearHorizonDeg, engineDays, allPass } = raw;
  if (!isText(generatedUtc) || !isNumber(limitDeg) || !isNumber(nearHorizonDeg)) return null;
  if (!isText(engineDays) || typeof allPass !== 'boolean') return null;
  const engine = list<EngineCheck>(raw.engine, (e) =>
    isText(e.site) &&
    (e.body === 'sun' || e.body === 'earth') &&
    isNumber(e.samples) &&
    isNumber(e.maxDiffDeg) &&
    isNumber(e.meanDiffDeg) &&
    typeof e.pass === 'boolean'
      ? {
          site: e.site,
          body: e.body,
          samples: e.samples,
          maxDiffDeg: e.maxDiffDeg,
          meanDiffDeg: e.meanDiffDeg,
          pass: e.pass,
        }
      : null,
  );
  const flags = list<FlagCheck>(raw.flags, (e) =>
    isText(e.file) &&
    isText(e.site) &&
    isText(e.target) &&
    isNumber(e.rows) &&
    isNumber(e.agree) &&
    isNumber(e.disagree) &&
    isNumber(e.nearHorizon) &&
    typeof e.pass === 'boolean'
      ? {
          file: e.file,
          site: e.site,
          target: e.target,
          rows: e.rows,
          agree: e.agree,
          disagree: e.disagree,
          nearHorizon: e.nearHorizon,
          pass: e.pass,
        }
      : null,
  );
  const elevations = list<ElevationCheck>(raw.elevations, (e) =>
    isText(e.file) &&
    isText(e.site) &&
    isNumber(e.rows) &&
    isNumber(e.maxDiffDeg) &&
    typeof e.pass === 'boolean'
      ? { file: e.file, site: e.site, rows: e.rows, maxDiffDeg: e.maxDiffDeg, pass: e.pass }
      : null,
  );
  if (!engine || !flags || !elevations) return null;
  return {
    generatedUtc,
    limitDeg,
    nearHorizonDeg,
    engineDays,
    allPass,
    engine,
    flags,
    elevations,
  };
}

const found = import.meta.glob<unknown>('../../data/horizonsCheck.json', {
  eager: true,
  import: 'default',
});

/** The generated check, or null when there is none yet. */
export const HORIZONS_CHECK: HorizonsCheck | null = readHorizonsCheck(Object.values(found)[0]);
