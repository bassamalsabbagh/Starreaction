import { describe, expect, it } from 'vitest';
import {
  MAX_HEIGHT_M,
  MIN_HEIGHT_M,
  MOON_RADIUS_M,
  NO_INSETS,
  WHOLE_MOON_FILL,
  anchorWeight,
  applyCameraSettings,
  canvasFov,
  flightPeakHeight,
  focalLengthPx,
  glideHeight,
  groundDistanceM,
  isWheelZoom,
  isWholeView,
  slerpLonLat,
  viewShift,
  wheelDeltaPx,
  wheelTargetHeight,
  wholeMoonHeight,
  zoomCentre,
  type CameraControllerLike,
  type CameraPose,
  SOUTH_POLE_VIEW,
  offsetLonLat,
  southPoleView,
} from '../../../../src/features/lunar-map/cameraControls';

describe('southPoleView', () => {
  const W = 1280;
  const H = 720;
  const focal = focalLengthPx(W, H);
  const insets = { top: 60, right: 60, bottom: 160, left: 480 };

  /** The camera's position and its line of sight, in Moon-centred metres, from a pose. */
  function sight(pose: CameraPose) {
    const r = MOON_RADIUS_M + pose.height;
    const at = [
      r * Math.cos(pose.lat) * Math.cos(pose.lon),
      r * Math.cos(pose.lat) * Math.sin(pose.lon),
      r * Math.sin(pose.lat),
    ] as const;
    const up = [at[0] / r, at[1] / r, at[2] / r] as const;
    const east = [-Math.sin(pose.lon), Math.cos(pose.lon), 0] as const;
    const north = [
      up[1] * east[2] - up[2] * east[1],
      up[2] * east[0] - up[0] * east[2],
      up[0] * east[1] - up[1] * east[0],
    ] as const;
    const h = Math.cos(pose.pitch);
    const v = Math.sin(pose.pitch);
    const dir = [0, 1, 2].map(
      (i) =>
        h * (Math.cos(pose.heading) * (north[i] ?? 0) + Math.sin(pose.heading) * (east[i] ?? 0)) +
        v * (up[i] ?? 0),
    );
    return { at, dir };
  }

  it('looks straight at the pole, from the near side, tilted down', () => {
    const pose = southPoleView(focal, W, H, insets);
    const { at, dir } = sight(pose);
    // The direction from the camera to the pole (0, 0, -R) is the line of sight.
    const toPole = [-at[0], -at[1], -MOON_RADIUS_M - at[2]];
    const length = Math.hypot(...toPole);
    const cosine = toPole.reduce((sum, c, i) => sum + c * (dir[i] ?? 0), 0) / length;
    expect(cosine).toBeCloseTo(1, 9);
    expect(pose.lon).toBe(0);
    expect(pose.heading).toBeCloseTo(Math.PI, 12);
    // Looking down more steeply than the tilt (the curvature between camera and pole adds to it).
    expect(pose.pitch).toBeLessThan((-SOUTH_POLE_VIEW.tiltDeg * Math.PI) / 180);
    expect(pose.pitch).toBeGreaterThan(-Math.PI / 2);
  });

  it('fits the 80° S circle inside the visible area in perspective, filling it one way', () => {
    for (const [w, h, sides] of [
      [W, H, insets],
      [1920, 1080, NO_INSETS],
    ] as const) {
      const f = focalLengthPx(w, h);
      const pose = southPoleView(f, w, h, sides);
      const { at } = sight(pose);
      const distance = Math.hypot(at[0], at[1], at[2] + MOON_RADIUS_M);
      const radius = (MOON_RADIUS_M * (90 + SOUTH_POLE_VIEW.edgeLatDeg) * Math.PI) / 180;
      const tilt = (SOUTH_POLE_VIEW.tiltDeg * Math.PI) / 180;
      // Every point of the circle, projected in perspective (ground flat around the pole).
      let across = 0;
      let upDown = 0;
      for (let i = 0; i <= 720; i++) {
        const angle = (i / 720) * 2 * Math.PI;
        const s = radius * Math.cos(angle); // towards the camera
        const side = radius * Math.sin(angle);
        const depth = distance - s * Math.cos(tilt);
        across = Math.max(across, Math.abs((f * side) / depth));
        upDown = Math.max(upDown, Math.abs((f * s * Math.sin(tilt)) / depth));
      }
      const halfW = (SOUTH_POLE_VIEW.fill * (w - sides.left - sides.right)) / 2;
      const halfH = (SOUTH_POLE_VIEW.fill * (h - sides.top - sides.bottom)) / 2;
      expect(across).toBeLessThanOrEqual(halfW + 1e-6);
      expect(upDown).toBeLessThanOrEqual(halfH + 1e-6);
      // One of the two fills its share: the circle is as big as it can be.
      expect(Math.max(across / halfW, upDown / halfH)).toBeCloseTo(1, 4);
    }
  });

  it('comes closer when more of the map is free, and stays far above the surface', () => {
    const covered = southPoleView(focal, W, H, insets);
    const open = southPoleView(focal, W, H, NO_INSETS);
    expect(open.height).toBeLessThan(covered.height);
    expect(open.height).toBeGreaterThan(100_000);
    expect(covered.height).toBeLessThan(MAX_HEIGHT_M);
  });
});

const EVENTS = { RIGHT_DRAG: 1, PINCH: 4, WHEEL: 3 };

function freshController(): CameraControllerLike {
  return {
    enableZoom: false,
    enableTilt: true,
    enableLook: true,
    minimumZoomDistance: 1,
    maximumZoomDistance: Infinity,
    zoomEventTypes: [EVENTS.RIGHT_DRAG, EVENTS.WHEEL, EVENTS.PINCH],
    inertiaSpin: 0,
    inertiaTranslate: 0,
    inertiaZoom: 0,
  };
}

describe('camera settings', () => {
  it('keeps zoom on, holds the camera straight down, and sets the limits in metres', () => {
    const controller = freshController();
    applyCameraSettings(controller, EVENTS);
    expect(controller.enableZoom).toBe(true);
    expect(controller.enableTilt).toBe(false);
    expect(controller.enableLook).toBe(false);
    expect(controller.minimumZoomDistance).toBe(500);
    // A hard ceiling; MoonGlobe lowers it to the whole-Moon view once it knows the layout.
    expect(controller.maximumZoomDistance).toBe(MAX_HEIGHT_M);
  });

  it('keeps pan, spin and zoom inertia on in every motion setting (navigation, not decoration)', () => {
    const controller = freshController();
    applyCameraSettings(controller, EVENTS);
    expect(controller.inertiaSpin).toBeGreaterThan(0);
    expect(controller.inertiaTranslate).toBeGreaterThan(0);
    expect(controller.inertiaZoom).toBeGreaterThan(0);
  });

  it('uses the mean lunar radius', () => {
    expect(MOON_RADIUS_M).toBe(1_737_400);
  });

  it('leaves the wheel to our zoom, so Cesium does not zoom twice', () => {
    const controller = freshController();
    applyCameraSettings(controller, EVENTS);
    expect(controller.zoomEventTypes).toEqual([EVENTS.RIGHT_DRAG, EVENTS.PINCH]);
  });

  it('treats plain wheel, touchpad scroll and ctrl+wheel (touchpad pinch) as zoom', () => {
    expect(isWheelZoom({ ctrlKey: false, deltaY: 100 })).toEqual({ zoom: true, pinch: false });
    expect(isWheelZoom({ ctrlKey: false, deltaY: 3 })).toEqual({ zoom: true, pinch: false });
    expect(isWheelZoom({ ctrlKey: true, deltaY: -4 })).toEqual({ zoom: true, pinch: true });
    expect(isWheelZoom({ ctrlKey: false, deltaY: 0 }).zoom).toBe(false);
  });
});

describe('wheel zoom', () => {
  it('converts line and page deltas to pixels', () => {
    expect(wheelDeltaPx(3, 0)).toBe(3);
    expect(wheelDeltaPx(3, 1)).toBe(120);
    expect(wheelDeltaPx(1, 2)).toBe(800);
  });

  it('moves 35% closer per mouse notch', () => {
    expect(wheelTargetHeight(1_000_000, -100, false)).toBeCloseTo(650_000, 0);
  });

  it('changes the height by the same percentage far out and close in', () => {
    const far = wheelTargetHeight(5_000_000, -100, false) / 5_000_000;
    const near = wheelTargetHeight(5_000, -100, false) / 5_000;
    expect(far).toBeCloseTo(near, 10);
  });

  it('gives a touchpad scroll of many small events the same total as one notch', () => {
    let height = 1_000_000;
    for (let i = 0; i < 25; i++) height = wheelTargetHeight(height, -4, false);
    expect(height).toBeCloseTo(wheelTargetHeight(1_000_000, -100, false), 0);
  });

  it('returns to the start after zooming in then out by the same amount', () => {
    const inThenOut = wheelTargetHeight(wheelTargetHeight(200_000, -100, false), 100, false);
    expect(inThenOut).toBeCloseTo(200_000, 6);
  });

  it('makes pinch deltas count for more, since pinch events are small', () => {
    expect(wheelTargetHeight(100_000, -10, true)).toBeLessThan(
      wheelTargetHeight(100_000, -10, false),
    );
  });

  it('stays inside the limits and caps a single huge flick', () => {
    expect(wheelTargetHeight(600, -10_000, false)).toBe(MIN_HEIGHT_M);
    expect(wheelTargetHeight(MAX_HEIGHT_M, 10_000, false)).toBe(MAX_HEIGHT_M);
    expect(wheelTargetHeight(1_000_000, -10_000, false)).toBe(250_000);
  });
});

describe('glide', () => {
  it('eases towards the target and settles on it', () => {
    let height = 1_000_000;
    const target = 500_000;
    const first = glideHeight(height, target, 16);
    expect(first).toBeLessThan(height);
    expect(first).toBeGreaterThan(target);
    for (let frame = 0; frame < 60; frame++) height = glideHeight(height, target, 16);
    expect(height).toBe(target);
  });

  it('takes as long for a 2× change near the surface as far out', () => {
    const far = glideHeight(2_000_000, 1_000_000, 16) / 2_000_000;
    const near = glideHeight(2_000, 1_000, 16) / 2_000;
    expect(far).toBeCloseTo(near, 10);
  });
});

describe('zoom towards the cursor', () => {
  const deg = Math.PI / 180;

  it('interpolates along the great circle', () => {
    const a = { lon: 0, lat: 0 };
    const b = { lon: 90 * deg, lat: 0 };
    expect(slerpLonLat(a, b, 0).lon).toBeCloseTo(0, 12);
    expect(slerpLonLat(a, b, 1).lon).toBeCloseTo(90 * deg, 12);
    expect(slerpLonLat(a, b, 0.5).lon).toBeCloseTo(45 * deg, 12);
    expect(slerpLonLat(a, b, 0.5).lat).toBeCloseTo(0, 12);
  });

  it('moves the centre towards the cursor by the share of height lost', () => {
    const centre = { lon: 0, lat: 0 };
    const cursor = { lon: 10 * deg, lat: 0 };
    // Halving the height keeps the cursor's point fixed by halving its offset from the centre.
    expect(zoomCentre(centre, cursor, 1000, 500).lon).toBeCloseTo(5 * deg, 12);
    // Zooming out moves the centre away from the cursor.
    expect(zoomCentre(centre, cursor, 500, 1000).lon).toBeCloseTo(-10 * deg, 12);
  });

  it('stops following the cursor at globe scale, so a fast zoom-out cannot spin the Moon', () => {
    expect(anchorWeight(100_000)).toBe(1);
    expect(anchorWeight(MOON_RADIUS_M)).toBe(0);
    expect(anchorWeight(MOON_RADIUS_M * 0.6)).toBeGreaterThan(0);
    expect(anchorWeight(MOON_RADIUS_M * 0.6)).toBeLessThan(1);
    const centre = { lon: 0, lat: 0 };
    const cursor = { lon: 40 * deg, lat: 0 };
    expect(zoomCentre(centre, cursor, MOON_RADIUS_M * 1.2, MOON_RADIUS_M * 2.4).lon).toBe(0);
  });
});

describe('whole-Moon view', () => {
  // 1366 × 768 with both sidebars open: the map is 1366 × 724 under the top bar.
  const insets = { top: 56, right: 360, bottom: 104, left: 340 };
  const focal = focalLengthPx(1366, 724);

  /** The disc's on-screen diameter (px) from a height, by the same projection. */
  const discPx = (height: number) =>
    2 * focal * Math.tan(Math.asin(MOON_RADIUS_M / (MOON_RADIUS_M + height)));

  it("fills about 55% of the visible area's height, inside the 40-60% asked for", () => {
    const height = wholeMoonHeight(focal, 1366, 724, insets);
    const areaHeight = 724 - insets.top - insets.bottom;
    expect(discPx(height) / areaHeight).toBeCloseTo(WHOLE_MOON_FILL, 3);
    expect(discPx(height) / areaHeight).toBeGreaterThanOrEqual(0.4);
    expect(discPx(height) / areaHeight).toBeLessThanOrEqual(0.6);
  });

  it('leaves clear space at the sides of a narrow area', () => {
    const narrow = { top: 56, right: 600, bottom: 104, left: 600 };
    const height = wholeMoonHeight(focal, 1366, 724, narrow);
    expect(discPx(height)).toBeLessThanOrEqual(0.75 * (1366 - 1200) + 0.001);
  });

  it('moves further out for a smaller area, and stays inside the hard limits', () => {
    const both = wholeMoonHeight(focal, 1366, 724, insets);
    const none = wholeMoonHeight(focal, 1366, 724, NO_INSETS);
    expect(both).toBeGreaterThan(none);
    expect(wholeMoonHeight(focal, 50, 40, NO_INSETS)).toBeLessThanOrEqual(MAX_HEIGHT_M);
  });

  it('keeps the scale when the canvas grows past the map', () => {
    // 60° across the map's longer side; a canvas 100 px wider sees proportionally more.
    expect(canvasFov(1366, 724, focal)).toBeCloseTo(Math.PI / 3, 9);
    const wider = canvasFov(1466, 724, focal);
    expect(Math.tan(wider / 2) / Math.tan(Math.PI / 6)).toBeCloseTo(1466 / 1366, 9);
  });

  it("shifts the canvas centre to the visible area's centre", () => {
    expect(viewShift(insets)).toEqual({ x: -10, y: -24 });
    expect(viewShift(NO_INSETS)).toEqual({ x: 0, y: 0 });
  });

  it('counts as the whole-Moon view within 2%', () => {
    expect(isWholeView(1_000_000, 1_000_000)).toBe(true);
    expect(isWholeView(985_000, 1_000_000)).toBe(true);
    expect(isWholeView(900_000, 1_000_000)).toBe(false);
  });
});

describe('flights to a site', () => {
  const whole = 11_000_000;

  it('stay level for a short hop', () => {
    expect(flightPeakHeight(400_000, 400_000, 300_000, whole)).toBe(400_000);
  });

  it('rise for a long hop from close in, but never past the whole-Moon view', () => {
    expect(flightPeakHeight(400_000, 400_000, 2_300_000, whole)).toBeCloseTo(920_000, 0);
    expect(flightPeakHeight(400_000, 400_000, 1e9, whole)).toBe(whole);
  });

  it('only turn the Moon when zoomed far out', () => {
    expect(flightPeakHeight(whole, whole, Math.PI * MOON_RADIUS_M, whole)).toBe(whole);
  });

  it('measure ground distance along a great circle', () => {
    const half = groundDistanceM({ lon: 0, lat: 0 }, { lon: Math.PI, lat: 0 });
    expect(half).toBeCloseTo(Math.PI * MOON_RADIUS_M, 3);
    expect(groundDistanceM({ lon: 1, lat: 0.5 }, { lon: 1, lat: 0.5 })).toBe(0);
  });
});

describe('offsetLonLat', () => {
  const degree = (Math.PI / 180) * MOON_RADIUS_M;
  const rad = (deg: number) => (deg * Math.PI) / 180;

  it('moves north, east and back along a great circle on the Moon', () => {
    const north = offsetLonLat({ lon: 0, lat: 0 }, degree, 0);
    expect(north.lat).toBeCloseTo(rad(1), 9);
    expect(north.lon).toBeCloseTo(0, 9);
    const east = offsetLonLat({ lon: 0, lat: 0 }, degree, Math.PI / 2);
    expect(east.lon).toBeCloseTo(rad(1), 9);
    expect(east.lat).toBeCloseTo(0, 9);
    const back = offsetLonLat(east, degree, -Math.PI / 2);
    expect(back.lon).toBeCloseTo(0, 9);
  });

  it('keeps the distance it was given', () => {
    const from = { lon: rad(30), lat: rad(-40) };
    const to = offsetLonLat(from, 25_000, rad(250));
    expect(groundDistanceM(from, to)).toBeCloseTo(25_000, 3);
  });
});
