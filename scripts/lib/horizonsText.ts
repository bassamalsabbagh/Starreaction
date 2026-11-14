/**
 * Reads JPL Horizons observer tables (docs/DATA_SOURCES.md SRC-055, SRC-056): the API's CSV output
 * (scripts/fetch_horizons.ts) and the plain-text exports saved from the Horizons web app
 * (data/horizons-manual/, scripts/horizons_check.ts). Pure text in, numbers out; no Node, no network.
 */

export interface HorizonsHeader {
  /** "Sun (10)", "Earth (399)", or null when the header has no target line. */
  readonly target: string | null;
  /** "Moon (301)" when the observer is on the Moon. */
  readonly center: string | null;
  /** The observer site as Horizons echoes it, or null. */
  readonly centerGeodetic: { lonEast: number; lat: number; altKm: number } | null;
  /** "10 minutes", "1440 minutes", … */
  readonly stepSize: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function headerValue(text: string, label: string): string | null {
  const line = text.split(/\r?\n/).find((row) => row.startsWith(label));
  if (!line) return null;
  const value = line.slice(line.indexOf(':') + 1);
  // "Sun (10)                        {source: DE441}": drop the trailing {…} note.
  return value.replace(/\{[^}]*\}\s*$/, '').trim();
}

export function parseHorizonsHeader(text: string): HorizonsHeader {
  const geodetic = headerValue(text, 'Center geodetic');
  let centerGeodetic: HorizonsHeader['centerGeodetic'] = null;
  if (geodetic) {
    const parts = geodetic.split(',').map((part) => Number(part.trim()));
    const [lonEast, lat, altKm] = parts;
    if (
      parts.length === 3 &&
      lonEast !== undefined &&
      lat !== undefined &&
      altKm !== undefined &&
      parts.every(Number.isFinite)
    ) {
      centerGeodetic = { lonEast, lat, altKm };
    }
  }
  return {
    target: headerValue(text, 'Target body name'),
    center: headerValue(text, 'Center body name'),
    centerGeodetic,
    stepSize: headerValue(text, 'Step-size'),
  };
}

/** The table rows: the lines between $$SOE and $$EOE (empty when the markers are missing). */
export function tableRows(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '$$SOE');
  const end = lines.findIndex((line) => line.trim() === '$$EOE');
  if (start < 0 || end < start) return [];
  return lines.slice(start + 1, end).filter((line) => line.trim() !== '');
}

/** "2026-Nov-13 00:00" (UT) as UTC milliseconds, or NaN when it is not that form. */
export function parseCalendarUt(text: string): number {
  const match = /^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return NaN;
  const [, year, month, day, hour, minute] = match;
  const monthIndex = MONTHS.indexOf(month ?? '');
  if (monthIndex < 0) return NaN;
  return Date.UTC(Number(year), monthIndex, Number(day), Number(hour), Number(minute));
}

export interface AzElRow {
  readonly t: number;
  /** '*' when Horizons marks daylight (the Sun's upper limb on or above the horizon), else ' '. */
  readonly daylight: boolean;
  /** 'i' when the interfering body's (the Earth's) upper limb is on or above the horizon. */
  readonly interferer: boolean;
  /** Airless apparent azimuth (clockwise from north) and elevation of the target's centre, degrees. */
  readonly azimuth: number;
  readonly elevation: number;
}

/** One API CSV row for QUANTITIES='4': " 2026-Nov-01 00:00,*,i, 283.252199,     3.761291,". */
export function parseCsvAzElRow(line: string): AzElRow | null {
  const cells = line.split(',').map((cell) => cell.trim());
  const [time, day, body, az, el] = cells;
  if (time === undefined || az === undefined || el === undefined) return null;
  const t = parseCalendarUt(time);
  const azimuth = Number(az);
  const elevation = Number(el);
  if (!Number.isFinite(t) || az === '' || el === '' || !Number.isFinite(azimuth)) return null;
  if (!Number.isFinite(elevation)) return null;
  return { t, daylight: day === '*', interferer: (body ?? '').includes('i'), azimuth, elevation };
}

export interface ManualRow {
  readonly t: number;
  readonly daylight: boolean;
  readonly interferer: boolean;
  /** The "Azi____(a-app)___Elev" columns when the export has them, else null. */
  readonly azEl: { azimuth: number; elevation: number } | null;
}

/** How many whitespace-separated values a column label stands for in a data row. */
function tokensFor(label: string): number {
  if (label.includes('R.A.')) return 6; // "hh mm ss.ff sdd mm ss.f": RA and DEC, three each
  if (label.startsWith('Azi') && label.endsWith('Elev')) return 2;
  return 1;
}

/**
 * Rows of a plain-text web-app export (not CSV): the date and time, then the two presence flags in
 * fixed columns 19 and 20 (`*` daylight, `i` Earth up), then the quantities. Azimuth and elevation
 * are read only when the header has the "Azi____(a-app)___Elev" column.
 */
export function parseManualRows(text: string): ManualRow[] {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.trimStart().startsWith('Date__(UT)__HR:MN'));
  let azIndex: number | null = null;
  if (header) {
    const labels = header.trim().split(/\s+/).slice(1);
    let index = 0;
    for (const label of labels) {
      if (label.startsWith('Azi') && label.endsWith('Elev')) {
        azIndex = index;
        break;
      }
      index += tokensFor(label);
    }
  }
  const rows: ManualRow[] = [];
  for (const line of tableRows(text)) {
    const t = parseCalendarUt(line.slice(0, 18));
    if (!Number.isFinite(t)) continue;
    const flags = line.slice(18, 21);
    const values = line.slice(21).trim().split(/\s+/);
    let azEl: ManualRow['azEl'] = null;
    if (azIndex !== null) {
      const azimuth = Number(values[azIndex]);
      const elevation = Number(values[azIndex + 1]);
      if (Number.isFinite(azimuth) && Number.isFinite(elevation)) azEl = { azimuth, elevation };
    }
    rows.push({ t, daylight: flags.includes('*'), interferer: flags.includes('i'), azEl });
  }
  return rows;
}
