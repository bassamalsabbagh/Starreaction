/**
 * Does nearby terrain block the Sun at a site? Pure geometry on a height grid; no React, no Cesium.
 *
 * A TerrainPatch is a small square grid of heights centred on the site (north up, east right). From
 * it the horizon profile is built once per site: for each azimuth, the highest angle at which
 * terrain rises above the site, along the ray out to the patch edge, with the Moon's curvature
 * subtracted. Checking a moment is then a lookup: the Sun is blocked when it is lower than the
 * terrain horizon in its direction.
 *
 * Limits (docs/KNOWN_ISSUES.md KI-014, docs/LANDER_RULES.md): only terrain inside the patch is
 * known, so a result is valid out to `radiusM` and no further; features smaller than the grid
 * spacing are not seen; the Sun's centre is used, not its 0.53° disc; no light bounced from terrain.
 */
import { MOON_RADIUS_KM } from './lunarSky';

const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
const DEG = Math.PI / 180;

export interface TerrainPatch {
  /** Row-major heights in metres, row 0 the northern edge, `size` × `size` values. */
  heights: ArrayLike<number>;
  size: number;
  /** Distance between neighbouring heights, metres. */
  spacingM: number;
  /** Where the data comes from, e.g. "LOLA DEM 20 m" (a docs/DATA_SOURCES.md entry). */
  source: string;
}

export interface HorizonProfile {
  /** Terrain horizon elevation in degrees for each whole azimuth 0–359 (clockwise from north). */
  elevations: Float32Array;
  /**
   * Per whole azimuth 0–359: 1 when that direction's ray reached the edge of the elevation data
   * before its full distance (terrain beyond it is not counted), else 0. Absent when not known.
   */
  edgeCut?: Uint8Array;
  /** How far from the site the terrain is known, metres. */
  radiusM: number;
  spacingM: number;
  source: string;
}

/**
 * A horizon as the offline generator writes it (scripts/data/horizon_profile.py): `elevations`
 * and the optional `edgeCut` as plain number arrays or typed arrays. The app turns it into a
 * HorizonProfile (src/data/terrainPatches.ts).
 */
export interface GeneratedHorizon {
  elevations: ArrayLike<number>;
  edgeCut?: ArrayLike<number>;
  radiusM: number;
  spacingM: number;
  source: string;
}

/** A run of neighbouring whole azimuths, clockwise from `start`, `length` degrees long. */
export interface AzimuthRun {
  start: number;
  length: number;
}

/**
 * The directions whose horizon was cut off at the edge of the elevation data, as runs of
 * neighbouring azimuths (a run may cross north: 350° for 20° covers 350–9°). Empty without
 * `edgeCut`.
 */
export function edgeCutRuns(profile: Pick<HorizonProfile, 'edgeCut'>): AzimuthRun[] {
  const cut = profile.edgeCut;
  if (!cut) return [];
  const isCut = (azimuth: number) => (cut[((azimuth % 360) + 360) % 360] ?? 0) !== 0;
  // Start the scan just after a direction that is not cut, so no run is split across north.
  const clear = Array.from({ length: 360 }, (_, azimuth) => azimuth).find((a) => !isCut(a));
  if (clear === undefined) return [{ start: 0, length: 360 }];
  const runs: AzimuthRun[] = [];
  for (let step = 1; step <= 360; step += 1) {
    const azimuth = (clear + step) % 360;
    if (!isCut(azimuth)) continue;
    const last = runs[runs.length - 1];
    if (last && (last.start + last.length) % 360 === azimuth) last.length += 1;
    else runs.push({ start: azimuth, length: 1 });
  }
  return runs.sort((a, b) => a.start - b.start);
}

export type TerrainIllumination =
  | { status: 'no-data' }
  | { status: 'sun-below-horizon' }
  | { status: 'blocked'; horizonDeg: number; profile: HorizonProfile }
  | { status: 'lit'; horizonDeg: number; profile: HorizonProfile };

/** Bilinear height between the four nearest grid values; x east, y south, in grid cells. */
function heightAt(patch: TerrainPatch, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (col: number, row: number) => patch.heights[row * patch.size + col] ?? 0;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** The terrain horizon around the patch's centre, one value per degree of azimuth. */
export function horizonProfile(patch: TerrainPatch): HorizonProfile {
  const centre = (patch.size - 1) / 2;
  const radiusCells = Math.floor(centre) - 1;
  const base = heightAt(patch, centre, centre);
  const elevations = new Float32Array(360);
  for (let azimuth = 0; azimuth < 360; azimuth += 1) {
    const east = Math.sin(azimuth * DEG);
    const north = Math.cos(azimuth * DEG);
    let highest = -90;
    for (let step = 1; step <= radiusCells; step += 1) {
      const distance = step * patch.spacingM;
      const rise =
        heightAt(patch, centre + east * step, centre - north * step) -
        base -
        (distance * distance) / (2 * MOON_RADIUS_M);
      highest = Math.max(highest, Math.atan2(rise, distance) / DEG);
    }
    elevations[azimuth] = highest;
  }
  return {
    elevations,
    radiusM: radiusCells * patch.spacingM,
    spacingM: patch.spacingM,
    source: patch.source,
  };
}

/** The terrain horizon in a direction (linear between whole degrees). */
export function horizonAt(profile: HorizonProfile, azimuth: number): number {
  const a = ((azimuth % 360) + 360) % 360;
  const low = Math.floor(a);
  const fraction = a - low;
  return (
    (profile.elevations[low % 360] ?? 0) * (1 - fraction) +
    (profile.elevations[(low + 1) % 360] ?? 0) * fraction
  );
}

/**
 * The Sun at a moment against the terrain horizon. With no profile the answer is "no-data", never
 * "lit": missing terrain must not read as unshadowed terrain.
 */
export function terrainIllumination(
  profile: HorizonProfile | null,
  sun: { azimuth: number; elevation: number },
): TerrainIllumination {
  if (!profile) return { status: 'no-data' };
  if (sun.elevation < 0) return { status: 'sun-below-horizon' };
  const horizonDeg = horizonAt(profile, sun.azimuth);
  return sun.elevation > horizonDeg
    ? { status: 'lit', horizonDeg, profile }
    : { status: 'blocked', horizonDeg, profile };
}
