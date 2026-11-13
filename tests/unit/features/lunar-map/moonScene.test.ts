import { describe, expect, it } from 'vitest';
import {
  GRID_LATITUDES,
  GRID_LONGITUDES,
  SELECTED_FULL_FROM,
  meridianDegrees,
  parallelDegrees,
  BEACON_SCALE,
  BEACON_SIZE_PX,
  beaconScale,
  beaconScaleAt,
  beaconSvgDataUri,
  horizonAlpha,
  steppedHeight,
} from '../../../../src/features/lunar-map/moonScene';

const STYLE = { fill: '#5fd49a', ink: '#061022' };

describe('graticule', () => {
  it('draws parallels every 30° between the poles and meridians every 30° around', () => {
    expect(GRID_LATITUDES).toEqual([-60, -30, 0, 30, 60]);
    expect(GRID_LONGITUDES).toEqual([-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]);
  });

  it('samples a parallel from −180° to 180° at a constant latitude', () => {
    const flat = parallelDegrees(30, 90);
    expect(flat).toEqual([-180, 30, -90, 30, 0, 30, 90, 30, 180, 30]);
  });

  it('samples a meridian from pole to pole at a constant longitude', () => {
    const flat = meridianDegrees(45, 90);
    expect(flat).toEqual([45, -90, 45, 0, 45, 90]);
  });
});

describe('beacons', () => {
  it('encodes a flat round beacon in the score colour with the rank number inside', () => {
    const uri = beaconSvgDataUri(STYLE, 3);
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(uri.split(',')[1] ?? '');
    expect(svg).toContain('fill="#5fd49a"');
    expect(svg).not.toContain('<path');
    expect(svg).toMatch(/<text[^>]*>3<\/text>/);
  });

  it('draws unsuitable sites as a small dot without a number', () => {
    const svg = decodeURIComponent(beaconSvgDataUri(STYLE, null).split(',')[1] ?? '');
    expect(svg).not.toContain('<text');
    expect(svg).toContain('r="4.5"');
  });

  it('grows the selected beacon, and the hovered one a little more', () => {
    expect(beaconScale(false, false)).toBe(1);
    expect(beaconScale(true, false)).toBeGreaterThan(1);
    expect(beaconScale(true, true)).toBeGreaterThan(beaconScale(true, false));
  });

  it('shrinks with distance but never below a 32px click target', () => {
    expect(beaconScaleAt(0)).toBe(BEACON_SCALE.near);
    expect(beaconScaleAt(1e9)).toBe(BEACON_SCALE.far);
    expect(beaconScaleAt(3_000_000)).toBeLessThan(beaconScaleAt(300_000));
    expect(BEACON_SIZE_PX * BEACON_SCALE.far).toBeGreaterThanOrEqual(32);
  });
});

describe('horizonAlpha', () => {
  const R = 1_737_400;
  it('is 1 straight below the camera and 0 on the far side', () => {
    expect(horizonAlpha([R, 0, 0], [3 * R, 0, 0])).toBe(1);
    expect(horizonAlpha([-R, 0, 0], [3 * R, 0, 0])).toBe(0);
  });

  it('fades out as the point nears the rim', () => {
    const camera = [3 * R, 0, 0] as const;
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return horizonAlpha([R * Math.cos(a), R * Math.sin(a), 0], camera);
    };
    expect(at(40)).toBe(1);
    expect(at(66)).toBeGreaterThan(0);
    expect(at(66)).toBeLessThan(1);
    expect(at(71)).toBe(0); // the rim seen from 3R is at about 70.5°
  });

  it('keeps the selected site fully drawn much closer to the rim', () => {
    const camera = [3 * R, 0, 0] as const;
    const at = (deg: number, fullFrom?: number) => {
      const a = (deg * Math.PI) / 180;
      return horizonAlpha([R * Math.cos(a), R * Math.sin(a), 0], camera, fullFrom);
    };
    expect(at(66)).toBeLessThan(1);
    expect(at(66, SELECTED_FULL_FROM)).toBe(1);
    expect(at(67, SELECTED_FULL_FROM)).toBe(1);
    expect(at(71, SELECTED_FULL_FROM)).toBe(0);
  });
});

describe('steppedHeight', () => {
  it('halves or doubles the height within the camera limits', () => {
    expect(steppedHeight(10_000, 0.5, 500, 1_000_000)).toBe(5_000);
    expect(steppedHeight(800, 0.5, 500, 1_000_000)).toBe(500);
    expect(steppedHeight(900_000, 2, 500, 1_000_000)).toBe(1_000_000);
  });
});
