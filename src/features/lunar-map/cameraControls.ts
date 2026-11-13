/**
 * Camera settings and zoom maths for the Moon map. No Cesium import, so it runs in unit tests;
 * MoonGlobe passes Cesium's enums in.
 *
 * Why our own wheel zoom: Cesium's default wheel zoom moves only ~10% per mouse notch, a touchpad
 * two-finger scroll (many tiny wheel events) barely moves at all, and a touchpad pinch, which
 * Chrome and Brave deliver as ctrl+wheel, is not a zoom input at all. Here every wheel event,
 * with or without ctrl, changes the height by a fixed percentage of the current height, so zoom
 * feels the same far out and close in, and it glides to that height instead of stepping.
 */

/** Mean lunar radius (DATA_SOURCES SRC-012; Cesium's Ellipsoid.MOON uses the same 1737.4 km). */
export const MOON_RADIUS_M = 1_737_400;

/** Closest approach: 500 m above the surface, well past the imagery's ~83 m/px level 8. */
export const MIN_HEIGHT_M = 500;
/**
 * A hard ceiling only. The real furthest zoom is the whole-Moon view (wholeMoonHeight), which
 * depends on the visible map area; this just keeps the camera well inside the star sphere.
 */
export const MAX_HEIGHT_M = MOON_RADIUS_M * 20;

/** Cesium's default field of view (60°), applied to the longer side of the map. */
const DEFAULT_FOV = Math.PI / 3;

/** The whole-Moon view: the disc fills this share of the visible area's height… */
export const WHOLE_MOON_FILL = 0.55;
/** …but never more than this share of its width, so there is clear space at the sides too. */
export const WHOLE_MOON_MAX_WIDTH_FILL = 0.75;

/** How much of the map's edges the chrome covers, in CSS pixels. */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * What the app may ask of the map's camera from outside it (the guided demo): the existing
 * whole-Moon action, and taking and putting back the current view. A view is opaque to callers.
 */
export interface MapController {
  showWholeMoon: () => void;
  /** The tilted view over the south pole (southPoleView). */
  showSouthPole: () => void;
  saveView: () => unknown;
  restoreView: (view: unknown) => void;
}

/**
 * The south-pole view: the area from the pole out to 80° S (where the polar sites are) fills the
 * visible map, seen from the near side and tilted, so the polar relief reads. The current view
 * stays the default; this one is a button and a demo step.
 */
export const SOUTH_POLE_VIEW = {
  /** The circle that must fit: from the pole out to this latitude. */
  edgeLatDeg: -80,
  /** How far below the horizontal the view meets the pole (90 would be straight down). */
  tiltDeg: 50,
  /** The share of the visible width and height the circle may fill. */
  fill: 0.9,
} as const;

/** A camera placement: where it is (radians, metres above the sphere) and where it looks. */
export interface CameraPose {
  lon: number;
  lat: number;
  height: number;
  /** Radians clockwise from local north. */
  heading: number;
  /** Radians; negative looks down. */
  pitch: number;
}

/**
 * Where the camera goes for the south-pole view so that the pole sits in the middle of the visible
 * area and the 80° S circle fits inside it, in perspective (the ground taken as flat around the
 * pole). Seen from distance d along a view tilted t below the horizontal, a point s metres from the
 * pole towards the camera lands f·s·sin t ÷ (d − s·cos t) below the middle, and one w metres to
 * the side f·w ÷ (d − s·cos t) across. The near edge (s = r) decides up and down; across, the
 * widest point of the circle needs d ≥ r·√(cos²t + K²), K = f ÷ the half-width allowed. The camera
 * then stands back from the pole along the view: towards the near side (longitude 0) and up. Its
 * own pitch is steeper than the tilt by the curvature between it and the pole.
 */
export function southPoleView(
  focalPx: number,
  mapWidth: number,
  mapHeight: number,
  insets: ViewInsets,
): CameraPose {
  const areaWidth = Math.max(1, mapWidth - insets.left - insets.right);
  const areaHeight = Math.max(1, mapHeight - insets.top - insets.bottom);
  const radiusM = MOON_RADIUS_M * (((90 + SOUTH_POLE_VIEW.edgeLatDeg) * Math.PI) / 180);
  const tilt = (SOUTH_POLE_VIEW.tiltDeg * Math.PI) / 180;
  const kHeight = focalPx / ((SOUTH_POLE_VIEW.fill * areaHeight) / 2);
  const kWidth = focalPx / ((SOUTH_POLE_VIEW.fill * areaWidth) / 2);
  const byHeight = radiusM * (Math.cos(tilt) + kHeight * Math.sin(tilt));
  const byWidth = radiusM * Math.hypot(Math.cos(tilt), kWidth);
  const distance = Math.max(byWidth, byHeight);
  // Moon-centred coordinates: the pole is (0, 0, -R); longitude 0 is the +x side.
  const x = distance * Math.cos(tilt);
  const z = -MOON_RADIUS_M - distance * Math.sin(tilt);
  const r = Math.hypot(x, z);
  // The view (pole minus camera) is (-cos t, 0, sin t); the camera's up is (x, 0, z) / r.
  const sinPitch = (-x * Math.cos(tilt) + z * Math.sin(tilt)) / r;
  return {
    lon: 0,
    lat: Math.atan2(z, x),
    height: r - MOON_RADIUS_M,
    heading: Math.PI,
    pitch: Math.asin(clamp(sinPitch, -1, 1)),
  };
}

/**
 * The map's focal length in CSS pixels: Cesium's 60° across the longer side of the map. The
 * canvas can be larger than the map (it is shifted under the sidebars), so the field of view is
 * set from this rather than from the canvas, and the Moon keeps its size when the canvas grows.
 */
export function focalLengthPx(mapWidth: number, mapHeight: number): number {
  return Math.max(mapWidth, mapHeight, 1) / 2 / Math.tan(DEFAULT_FOV / 2);
}

/**
 * Cesium's `fov` for a canvas of this size at that focal length. Cesium reads `fov` across the
 * width when the canvas is wider than tall, otherwise across the height.
 */
export function canvasFov(canvasWidth: number, canvasHeight: number, focalPx: number): number {
  return 2 * Math.atan(Math.max(canvasWidth, canvasHeight, 1) / 2 / focalPx);
}

/**
 * The camera height at which the whole Moon fits the visible area (the map minus the insets) with
 * clear space on every side. A sphere seen from distance d spans asin(R / d) either side of
 * centre, which projects to focal × tan of that angle.
 */
export function wholeMoonHeight(
  focalPx: number,
  mapWidth: number,
  mapHeight: number,
  insets: ViewInsets,
): number {
  const areaWidth = Math.max(1, mapWidth - insets.left - insets.right);
  const areaHeight = Math.max(1, mapHeight - insets.top - insets.bottom);
  const radiusPx =
    Math.min(WHOLE_MOON_FILL * areaHeight, WHOLE_MOON_MAX_WIDTH_FILL * areaWidth) / 2;
  const halfAngle = Math.atan(radiusPx / focalPx);
  return clamp(MOON_RADIUS_M / Math.sin(halfAngle) - MOON_RADIUS_M, MIN_HEIGHT_M, MAX_HEIGHT_M);
}

/**
 * Where the canvas must move so its centre (where the straight-down camera looks) sits in the
 * middle of the visible area.
 */
export function viewShift(insets: ViewInsets): { x: number; y: number } {
  return { x: (insets.left - insets.right) / 2, y: (insets.top - insets.bottom) / 2 };
}

/** At the whole-Moon view (within 2%), so a layout change re-fits rather than keeping a zoom. */
export function isWholeView(height: number, wholeHeight: number): boolean {
  return height >= wholeHeight * 0.98;
}

/** Below this share of a hop's ground distance, a flight stays level instead of rising. */
const FLIGHT_RISE_PER_METRE = 0.4;

/**
 * The top of a flight to a site. Short hops stay level, so a neighbour never bumps. A long hop
 * from close in (a site far off screen, or on the far side) rises with the distance, so the way
 * there stays readable, but never beyond the whole-Moon view.
 */
export function flightPeakHeight(
  startHeight: number,
  endHeight: number,
  groundDistanceM: number,
  wholeHeight: number,
): number {
  const rise = Math.min(wholeHeight, groundDistanceM * FLIGHT_RISE_PER_METRE);
  return Math.max(startHeight, endHeight, rise);
}

/** Ground distance between two points on the Moon (great circle on the mean sphere). */
export function groundDistanceM(a: LonLat, b: LonLat): number {
  const va = toVector(a);
  const vb = toVector(b);
  const dot = clamp(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], -1, 1);
  return Math.acos(dot) * MOON_RADIUS_M;
}

/**
 * The ground point `distanceM` from `from` along `azimuth` (radians, clockwise from north), on the
 * Moon's sphere. Used to aim a flight a little to one side, so a site lands beside a panel.
 */
export function offsetLonLat(from: LonLat, distanceM: number, azimuth: number): LonLat {
  const angle = distanceM / MOON_RADIUS_M;
  const lat = Math.asin(
    clamp(
      Math.sin(from.lat) * Math.cos(angle) +
        Math.cos(from.lat) * Math.sin(angle) * Math.cos(azimuth),
      -1,
      1,
    ),
  );
  const lon =
    from.lon +
    Math.atan2(
      Math.sin(azimuth) * Math.sin(angle) * Math.cos(from.lat),
      Math.cos(angle) - Math.sin(from.lat) * Math.sin(lat),
    );
  return { lon, lat };
}

/** One 100 px mouse-wheel notch brings the camera to 65% of its height (35% closer). */
const NOTCH_PX = 100;
const NOTCH_FACTOR = 0.65;
const WHEEL_RATE = Math.log(NOTCH_FACTOR) / -NOTCH_PX;
/** Pinch deltas are small, so they count for more: about one zoom level (2×) per 100 px, which
 * roughly tracks the fingers. */
const PINCH_RATE = Math.LN2 / NOTCH_PX;
/** A single event never moves more than this, so a fast flick on a free-spinning wheel stays sane. */
const MAX_EVENT_FACTOR = 4;

/** Time constant of the glide: ~63% of the remaining way every 90 ms, settled in ~0.4 s. */
export const GLIDE_TIME_CONSTANT_MS = 90;

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** A wheel event's vertical delta in pixels, whatever unit the browser reported it in. */
export function wheelDeltaPx(deltaY: number, deltaMode: number): number {
  if (deltaMode === DOM_DELTA_LINE) return deltaY * 40;
  if (deltaMode === DOM_DELTA_PAGE) return deltaY * 800;
  return deltaY;
}

/**
 * The height a wheel event asks for. Positive delta (scroll down / pinch in) zooms out. The change
 * is a percentage of the current height, so it is the same at every height.
 */
export function wheelTargetHeight(
  height: number,
  deltaPx: number,
  isPinch: boolean,
  min = MIN_HEIGHT_M,
  max = MAX_HEIGHT_M,
): number {
  const rate = isPinch ? PINCH_RATE : WHEEL_RATE;
  const factor = Math.min(
    MAX_EVENT_FACTOR,
    Math.max(1 / MAX_EVENT_FACTOR, Math.exp(deltaPx * rate)),
  );
  return clamp(height * factor, min, max);
}

/**
 * One frame of the glide: moves the height towards the target in log space (so a 2× change takes
 * as long near the surface as far out) and returns the new height. Snaps when within 0.1%.
 */
export function glideHeight(
  height: number,
  target: number,
  dtMs: number,
  timeConstantMs = GLIDE_TIME_CONSTANT_MS,
): number {
  const remaining = Math.log(target / height);
  if (Math.abs(remaining) < 0.001) return target;
  const step = 1 - Math.exp(-Math.max(0, dtMs) / timeConstantMs);
  return height * Math.exp(remaining * step);
}

export interface LonLat {
  /** Radians. */
  lon: number;
  /** Radians. */
  lat: number;
}

/** Point on the great circle from a to b, a fraction t of the way (0 = a, 1 = b). */
export function slerpLonLat(a: LonLat, b: LonLat, t: number): LonLat {
  const va = toVector(a);
  const vb = toVector(b);
  const dot = clamp(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], -1, 1);
  const angle = Math.acos(dot);
  if (angle < 1e-12) return { lon: a.lon, lat: a.lat };
  const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
  const wb = Math.sin(t * angle) / Math.sin(angle);
  const x = wa * va[0] + wb * vb[0];
  const y = wa * va[1] + wb * vb[1];
  const z = wa * va[2] + wb * vb[2];
  return { lon: Math.atan2(y, x), lat: Math.atan2(z, Math.hypot(x, y)) };
}

/** Below this height the cursor anchor works fully; it fades out by ANCHOR_FADE_END_M. */
export const ANCHOR_FADE_START_M = MOON_RADIUS_M * 0.25;
export const ANCHOR_FADE_END_M = MOON_RADIUS_M;

/**
 * How strongly zoom follows the cursor at this height: 1 near the surface, fading to 0 by one
 * Moon radius. The flat-map rule (offset scales with height) breaks at globe scale, where a fast
 * zoom-out would push the anchor past the horizon and spin the Moon.
 */
export function anchorWeight(height: number): number {
  return clamp((ANCHOR_FADE_END_M - height) / (ANCHOR_FADE_END_M - ANCHOR_FADE_START_M), 0, 1);
}

/**
 * Where the straight-down camera's centre goes when the height changes from `from` to `to`, so
 * the ground point under the cursor stays under the cursor (exact for a flat map, close enough on
 * the globe below a quarter Moon radius; weaker above that, see anchorWeight).
 */
export function zoomCentre(centre: LonLat, cursor: LonLat, from: number, to: number): LonLat {
  const weight = anchorWeight(Math.max(from, to));
  return slerpLonLat(centre, cursor, (1 - to / from) * weight);
}

/** The subset of Cesium's ScreenSpaceCameraController that we configure. The furthest zoom is
 * set again whenever the whole-Moon view changes. */
export interface CameraControllerLike {
  enableZoom: boolean;
  enableTilt: boolean;
  enableLook: boolean;
  minimumZoomDistance: number;
  maximumZoomDistance: number;
  zoomEventTypes: unknown;
  inertiaSpin: number;
  inertiaTranslate: number;
  inertiaZoom: number;
}

/**
 * How long a drag keeps coasting after release (0–1; Cesium's default is 0.9). A little longer
 * than the default, so turning the Moon with the mouse settles smoothly instead of stopping short.
 * Kept on in every motion setting (navigation, not decoration).
 */
export const CAMERA_INERTIA = { spin: 0.94, translate: 0.94, zoom: 0.8 } as const;

export interface CameraEventTypes {
  RIGHT_DRAG: number;
  PINCH: number;
}

/**
 * Applies the map's camera rules. Cesium keeps right-drag and touch-screen pinch zoom; mouse
 * wheel, touchpad scroll and touchpad pinch (ctrl+wheel) are handled by our wheel zoom instead,
 * so Cesium must not also react to the wheel. Inertia stays on, even under reduced motion: it is
 * navigation feedback, not decoration (DESIGN.md, Motion).
 */
export function applyCameraSettings(
  controller: CameraControllerLike,
  events: CameraEventTypes,
): void {
  controller.enableZoom = true;
  controller.enableTilt = false;
  controller.enableLook = false;
  controller.minimumZoomDistance = MIN_HEIGHT_M;
  controller.maximumZoomDistance = MAX_HEIGHT_M;
  controller.zoomEventTypes = [events.RIGHT_DRAG, events.PINCH];
  controller.inertiaSpin = CAMERA_INERTIA.spin;
  controller.inertiaTranslate = CAMERA_INERTIA.translate;
  controller.inertiaZoom = CAMERA_INERTIA.zoom;
}

/** The wheel inputs our zoom handles: plain wheel/scroll, and ctrl+wheel (touchpad pinch). */
export function isWheelZoom(event: { ctrlKey: boolean; deltaY: number }): {
  zoom: boolean;
  pinch: boolean;
} {
  return { zoom: event.deltaY !== 0, pinch: event.ctrlKey };
}

function toVector({ lon, lat }: LonLat): [number, number, number] {
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
