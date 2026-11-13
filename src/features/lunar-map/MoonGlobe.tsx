import './cesiumBase';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  ArcType,
  BillboardCollection,
  CallbackProperty,
  CameraEventType,
  ColorMaterialProperty,
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Math as CesiumMath,
  Color,
  ConstantProperty,
  DirectionalLight,
  EasingFunction,
  Ellipsoid,
  EllipsoidGeometry,
  EllipsoidTerrainProvider,
  Entity,
  GeographicTilingScheme,
  GeometryInstance,
  ImageryLayer,
  Ion,
  JulianDate,
  Material,
  MaterialAppearance,
  Matrix3,
  Matrix4,
  NearFarScalar,
  PerspectiveFrustum,
  PointPrimitiveCollection,
  Primitive,
  Rectangle,
  SceneTransforms,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  TextureMagnificationFilter,
  TextureMinificationFilter,
  VerticalOrigin,
  WebMapTileServiceImageryProvider,
} from 'cesium';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { formatDays, type RankedSite } from '../../data/demoData';
import {
  MIN_HEIGHT_M,
  MOON_RADIUS_M,
  NO_INSETS,
  applyCameraSettings,
  canvasFov,
  flightPeakHeight,
  focalLengthPx,
  glideHeight,
  groundDistanceM,
  isWheelZoom,
  isWholeView,
  offsetLonLat,
  southPoleView,
  viewShift,
  wheelDeltaPx,
  wheelTargetHeight,
  wholeMoonHeight,
  zoomCentre,
  type LonLat,
  type MapController,
  type ViewInsets,
} from './cameraControls';
import { PREVIEW_FAILURE_THRESHOLD, PREVIEW_IMAGERY, type ImageryStatus } from './mapLabels';
import { MapControls } from './MapControls';
import { SHADE_EVERYWHERE, type LayerDisplay, type LayerImageSpec } from './mapLayerState';
import {
  controllerLayers,
  createVisibilityController,
  type VisibilityHandle,
} from './visibilityController';
import {
  VISIBILITY_MANIFEST_URL,
  applyVisibilityDisplay,
  createFrameRequester,
  raiseOverlayToTop,
  type VisibilityDisplay,
  type VisibilityRuntime,
} from './visibilityLayer';
import {
  AMBIENT,
  COLOUR_FADE_MS,
  EARTH_IMAGE,
  EARTH_RADIUS_M,
  GRID_ALPHA,
  MOON_IMAGES,
  MOON_RELIEF_SHADER,
  RIM_DARKENING,
  SKY_FULL_ABOVE_M,
  SKY_GONE_BELOW_M,
  TREK_FADE_START_M,
  TREK_FULL_M,
  fadeByHeight,
  formatAltitude,
  makeStars,
  metresPerPixel,
  zoomPercent,
} from './moonLook';
import { ZoomReadout, type ReadoutValues } from './ZoomReadout';
import {
  BEACON_SCALE,
  BEACON_SIZE_PX,
  GRID_LATITUDES,
  GRID_LONGITUDES,
  SELECTED_FULL_FROM,
  beaconScale,
  beaconScaleAt,
  beaconSvgDataUri,
  cssToken,
  horizonAlpha,
  meridianDegrees,
  parallelDegrees,
  prefersReducedMotion,
  steppedHeight,
  type BeaconStyle,
} from './moonScene';
import { joinClassNames } from '../../utils/classNames';
import { earthAxes, lunarSky } from '../../utils/lunarSky';
import styles from './MoonGlobe.module.css';

// The whole app is about the Moon, so every Cesium default (degrees → positions) uses the lunar
// ellipsoid rather than Earth's.
Ellipsoid.default = Ellipsoid.MOON;
// No Cesium ion: clear the bundled default token so nothing can reach ion services by accident.
Ion.defaultAccessToken = '';

const SITE_ENTITY_PREFIX = 'site:';
const NO_LAYERS: readonly LayerDisplay[] = [];
const NO_IDS: readonly string[] = [];
const NO_VISIBILITY: VisibilityDisplay = {
  load: false,
  frame: null,
  sun: { visible: false, opacity: 0 },
  earth: { visible: false, opacity: 0 },
};
const MARKER_HEIGHT_M = 200;
/** Grid lines: lifted above the surface and cut finely enough that a segment sags < 1 m. */
const GRID_HEIGHT_M = 20;
const GRID_GRANULARITY = CesiumMath.toRadians(0.1);
/** Fly-to: gentle and fixed-length; heading is kept and the path never climbs (no spin, no bump). */
const FLY_SECONDS = 1.2;
/** Beacon hover, selection and appear transitions. */
const BEACON_ANIM_MS = 140;
const NADIR = -CesiumMath.PI_OVER_TWO;
/** Leaving the tilted view, the camera stays this close to the pole at most (89.99°, ~300 m). */
const MAX_LAT_RAD = CesiumMath.toRadians(89.99);
/**
 * Stars sit on a sphere around the Moon. The camera is inside it, so Cesium's near plane drops to
 * 0.1 m; beyond 10⁸ m the depth range exceeds one frustum's 10⁹ ratio and every frame is drawn
 * twice. At this distance the stars shift by at most ~6° as the camera circles the Moon.
 */
const STAR_DISTANCE_M = 9e7;
/** The Sun's glow and the Earth sit this far from the camera, inside the star sphere. */
const SKY_DISTANCE_M = 5e7;
const SUN_GLOW_PX = 112;
/** Opening ease-in: from a little further out to the whole-Moon view. Decorative. */
const INTRO_SECONDS = 1.5;
const INTRO_START_FACTOR = 1.35;
/** The canvas keeps its extra margin until the sidebars have finished sliding. */
const STAGE_SHRINK_MS = 400;
/** Idle drift: after this long untouched while zoomed out, spin very slowly. Decorative. */
const DRIFT_IDLE_MS = 5_000;
const DRIFT_MIN_HEIGHT_M = MOON_RADIUS_M * 1.5;
const DRIFT_RADIANS_PER_SECOND = CesiumMath.toRadians(0.6);
const READOUT_INTERVAL_MS = 100;
/** Median frame gap while moving above which the map trades sharpness for frame rate (~50 fps). */
const SLOW_FRAME_MS = 20;
/** Radians of tilt allowed before the camera is turned back to straight down. */
const NADIR_TOLERANCE = 1e-4;

/**
 * A request to fly to a site, or to a typed point. `seq` changes on every user choice, even of
 * the same place.
 */
export interface FlyRequest {
  siteId?: string;
  point?: { lat: number; lon: number };
  seq: number;
}

/** A beacon's animated state: its scale and how far it has faded in after a change. */
interface BeaconAnim {
  scale: number;
  appear: number;
}

interface GlideState {
  target: number;
  anchor: LonLat | null;
  frameId: number;
  last: number;
}

interface MoonGlobeProps {
  rankedSites: readonly RankedSite[];
  selectedSiteId: string | null;
  /** A site highlighted from outside the map (a hovered list row); its beacon grows. */
  hoveredSiteId: string | null;
  /** Reports the beacon under the pointer (or null), so the list can highlight its row. */
  onHoverSite: (siteId: string | null) => void;
  flyRequest: FlyRequest | null;
  onSelectSite: (siteId: string) => void;
  /** A point checked anywhere on the Moon (degrees): marked with a pin and a tag. */
  pickedPoint?: { lat: number; lon: number } | null;
  /** A click on bare ground (no beacon under it), in degrees. Without it, ground clicks do nothing. */
  onPickPoint?: (point: { lat: number; lon: number }) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  /**
   * The map layers (elevation, slope) to draw, lowest first, each with its images and opacity. A
   * layer loads nothing until it is first visible; it never changes with the time.
   */
  mapLayers?: readonly LayerDisplay[];
  /** Opens or closes the map layers panel (the icon column's button). */
  onToggleLayers?: () => void;
  layersOpen?: boolean;
  /**
   * The ground point under the pointer (degrees), about ten times a second, or null off the Moon:
   * the layers' readout. Without it, nothing is picked for it.
   */
  onHoverGround?: (point: { lat: number; lon: number } | null) => void;
  /**
   * Where the Sun-and-relief shading stops (unshadedBelowZ in mapLayerState): south of the layers'
   * coverage while one is visible, so they keep their true colours whatever the time.
   */
  layerShadeCutZ?: number;
  /** Some of a layer's images could not be loaded (the panel says so). */
  onLayerImagesFailed?: (layerId: string) => void;
  /**
   * The visibility prototype layer (Sun and Earth, one frame per 10 minutes): loads nothing until
   * `load`; the frame is the app's time snapped to a supplied one, or null (nothing requested).
   */
  visibility?: VisibilityDisplay;
  /** What the visibility layer did: manifest loaded or not, frame applied, loading, failure. */
  onVisibilityState?: (patch: Partial<VisibilityRuntime>) => void;
  imageryStatus: ImageryStatus;
  onImageryStatusChange: (status: ImageryStatus) => void;
  /** How much of each map edge the chrome covers (sidebars, status strip, time bar), in px. */
  viewInsets: ViewInsets | null;
  /** The app's shared time (UTC ms): it sets the real Sun light and where the Sun and Earth are. */
  time: number;
  /** Presentation mode: the zoom buttons and readout step aside, leaving the Moon. */
  controlsHidden?: boolean;
  /** Sites in the compare set: their beacons carry a small badge. */
  comparedSiteIds?: readonly string[];
  /** Filled in once the scene is up: whole Moon, save and restore the view (the guided demo). */
  controllerRef?: RefObject<MapController | null>;
  /** True while the camera is moving (a flight or glide), false once it settles. */
  onMovingChange?: (moving: boolean) => void;
  /**
   * Whether the Moon may turn slowly on its own when left untouched (off during the guided demo,
   * which waits for the camera to settle before each next step).
   */
  idleDrift?: boolean;
  /** Presentation mode, from the map's own button column. */
  onPresent?: () => void;
  /**
   * How many px of the map's left edge an open panel covers, read when a flight starts: a site
   * flown to close up lands in the middle of what is left, not under the panel.
   */
  getCoveredLeft?: () => number;
  /** How the beacons' hover text names the mission: "this DEMO mission", or "this mission". */
  missionWords?: string;
}

interface HoverTip {
  text: string;
  x: number;
  y: number;
}

function hoverText(
  { site, assessment, rank }: RankedSite,
  compared = false,
  missionWords = 'this mission',
): string {
  const tag = compared ? ' · In compare' : '';
  if (rank === null) {
    const reason = assessment.failTitles[0];
    return `${site.name} · Not suitable for ${missionWords}${reason ? `: ${reason}` : ''}${tag}`;
  }
  return `#${rank} ${site.name} · window ${formatDays(assessment.usableDays)}${tag}`;
}

/**
 * The lunar map, on CesiumJS with the Moon ellipsoid (Ellipsoid.MOON) and no Cesium ion.
 *
 * - One continuous zoom, Google Earth-style: zoomed out, the whole Moon floats in space; zoomed in,
 *   the surface fills the screen. Tilt and free-look are off and the camera is held straight down,
 *   so the close view reads as a flat map. There are no mode switches.
 * - The furthest zoom is the whole-Moon view: the disc fits the visible area (between the open
 *   sidebars, under the status strip, above the time bar) with space all round. The canvas is
 *   shifted so its centre is that area's centre, and it moves with the sidebars as they slide.
 * - Wheel, touchpad scroll and touchpad pinch zoom towards the cursor with a short glide
 *   (cameraControls.ts). Choosing a site flies the camera there. Both are navigation, so they stay
 *   smooth under prefers-reduced-motion; only decorative motion (pin hover growth) switches off.
 * - The surface is NASA's CGI Moon Kit (public domain, in public/moon): a 1K preview at once, the
 *   8K colour map faded in over it, and LOLA relief shading lit by one temporary side light.
 *   Moon Trek tiles (a preview, NOT adopted; KI-010) fade in only for close-ups, where they are
 *   sharper; if they fail, the close-up simply stays on the 8K map.
 * - A faint star field; a short ease-in on load and a slow idle drift, both decorative and off
 *   under reduced motion; no atmosphere.
 */
export function MoonGlobe({
  rankedSites,
  selectedSiteId,
  hoveredSiteId,
  onHoverSite,
  flyRequest,
  onSelectSite,
  pickedPoint = null,
  onPickPoint,
  showGrid,
  onShowGridChange,
  mapLayers = NO_LAYERS,
  onToggleLayers,
  layersOpen = false,
  onHoverGround,
  layerShadeCutZ = SHADE_EVERYWHERE,
  onLayerImagesFailed,
  visibility = NO_VISIBILITY,
  onVisibilityState,
  imageryStatus,
  onImageryStatusChange,
  viewInsets,
  time,
  controlsHidden = false,
  comparedSiteIds = NO_IDS,
  controllerRef,
  onMovingChange,
  onPresent,
  getCoveredLeft,
  idleDrift = true,
  missionWords = 'this mission',
}: MoonGlobeProps) {
  const coveredLeftRef = useRef(getCoveredLeft);
  useEffect(() => {
    coveredLeftRef.current = getCoveredLeft;
  });
  const onMovingRef = useRef(onMovingChange);
  useEffect(() => {
    onMovingRef.current = onMovingChange;
  });
  /** Stops the idle drift at once. Set up with the scene. */
  const stopDriftRef = useRef<() => void>(() => undefined);
  const idleDriftRef = useRef(idleDrift);
  useEffect(() => {
    idleDriftRef.current = idleDrift;
    if (!idleDrift) stopDriftRef.current();
  }, [idleDrift]);
  // The camera actions, set up with the scene; handed to the app through controllerRef, which
  // forwards to whatever scene is current.
  const cameraApiRef = useRef<MapController | null>(null);
  useEffect(() => {
    if (!controllerRef) return undefined;
    controllerRef.current = {
      showWholeMoon: () => cameraApiRef.current?.showWholeMoon(),
      showSouthPole: () => cameraApiRef.current?.showSouthPole(),
      saveView: () => cameraApiRef.current?.saveView(),
      restoreView: (view) => cameraApiRef.current?.restoreView(view),
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const insetsRef = useRef(viewInsets);
  /** The current whole-Moon height: the furthest zoom and the reset target. */
  const wholeHeightRef = useRef(MOON_RADIUS_M * 3);
  /** Re-measures the whole-Moon view after a layout change. Set up with the scene. */
  const refitRef = useRef<() => void>(() => undefined);
  /** Flies back to the whole-Moon view. Set up with the scene. */
  const flyWholeRef = useRef<() => void>(() => undefined);
  /** The tilted south-pole view (southPoleView), and leaving it. Set up with the scene. */
  const flySouthPoleRef = useRef<() => void>(() => undefined);
  const leaveTiltRef = useRef<() => void>(() => undefined);
  /** Points the Sun light, the Sun's glow and the Earth for a time. Set up with the scene. */
  const timeRef = useRef(time);
  const applyTimeRef = useRef<(ms: number) => void>(() => undefined);
  const creditRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const onSelectRef = useRef(onSelectSite);
  const onPickRef = useRef(onPickPoint);
  const pickedRef = useRef(pickedPoint);
  const statusRef = useRef(imageryStatus);
  const onStatusRef = useRef(onImageryStatusChange);
  const sitesRef = useRef(rankedSites);
  /** Starts a glide to a height, anchored on a ground point (or the centre when null). */
  const glideToRef = useRef<(height: number, anchor: LonLat | null) => void>(() => undefined);
  const glideRef = useRef<GlideState>({ target: 0, anchor: null, frameId: 0, last: 0 });
  const onHoverRef = useRef(onHoverSite);
  const onHoverGroundRef = useRef(onHoverGround);
  const onLayerFailedRef = useRef(onLayerImagesFailed);
  /** The map layers' imagery, by layer id, and the latest description of them. */
  const layerImageryRef = useRef(
    new Map<string, { preview: ImageryLayer[]; full: ImageryLayer[]; failed: boolean }>(),
  );
  const mapLayersRef = useRef(mapLayers);
  /** The visibility layer: its latest description, its controller once made, and its teardown. */
  const visibilityRef = useRef(visibility);
  const onVisibilityStateRef = useRef(onVisibilityState);
  const visibilityHandleRef = useRef<VisibilityHandle | null>(null);
  const visibilityStartedRef = useRef(false);
  const disposeVisibilityRef = useRef<() => void>(() => undefined);
  /** Each beacon's animated scale and fade-in. */
  const beaconAnimRef = useRef(new Map<string, BeaconAnim>());
  /** The beacon under the pointer, and the one highlighted from the list. */
  const hoveredRef = useRef<string | null>(null);
  const externalHoverRef = useRef(hoveredSiteId);
  const selectedRef = useRef(selectedSiteId);
  /** Animates every beacon towards its target scale and full opacity. Set up with the scene. */
  const animateBeaconsRef = useRef<() => void>(() => undefined);
  /** The pulsing ring and name tag over the selected beacon, positioned on every render. */
  const selectionRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLDivElement>(null);
  /** Marks a user action: stops the idle drift and the intro. Set up with the scene. */
  const interactRef = useRef<() => void>(() => undefined);
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
  const [readout, setReadout] = useState<ReadoutValues | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelectSite;
    onPickRef.current = onPickPoint;
    statusRef.current = imageryStatus;
    onStatusRef.current = onImageryStatusChange;
    onHoverRef.current = onHoverSite;
    onHoverGroundRef.current = onHoverGround;
    onLayerFailedRef.current = onLayerImagesFailed;
    onVisibilityStateRef.current = onVisibilityState;
    sitesRef.current = rankedSites;
  });

  // Create the scene once.
  useEffect(() => {
    const container = containerRef.current;
    const frame = frameRef.current;
    if (!container || !frame) return undefined;

    const widget = new CesiumWidget(container, {
      ellipsoid: Ellipsoid.MOON,
      terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: Ellipsoid.MOON }),
      baseLayer: false,
      skyBox: false,
      skyAtmosphere: false,
      scene3DOnly: true,
      // Cesium's credit bar (and its ion logo) goes into a hidden box; our own "Data sources"
      // link carries the imagery credit.
      creditContainer: creditRef.current ?? undefined,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      // A smooth limb from FXAA rather than MSAA: on an integrated GPU (Intel UHD 630, measured)
      // 4× MSAA alone cost ~9 ms a frame. Up to 2 device pixels per CSS pixel, unless that is
      // too slow (see watchFrames).
      msaaSamples: 1,
      useBrowserRecommendedResolution: false,
    });
    widgetRef.current = widget;
    const { scene, camera } = widget;
    const deviceRatio = window.devicePixelRatio || 1;
    widget.resolutionScale = Math.min(2, deviceRatio) / deviceRatio;
    const reducedMotion = prefersReducedMotion();

    scene.backgroundColor = Color.fromCssColorString(cssToken('--color-space', '#020409'));
    scene.globe.baseColor = Color.fromCssColorString(
      cssToken('--color-placeholder-surface', '#5b6474'),
    );
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    scene.fog.enabled = false;
    scene.postProcessStages.fxaa.enabled = true;
    // Keep more tiles in memory and fetch the neighbours of visible ones, so panning back and forth
    // close up shows imagery at once instead of reloading it.
    scene.globe.tileCacheSize = 1000;
    scene.globe.preloadSiblings = true;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;

    applyCameraSettings(scene.screenSpaceCameraController, CameraEventType);

    // The scale comes from the map, not the canvas: the canvas can be larger than the map (see the
    // stage below), and the Moon must not change size when it grows. Applied before every render.
    let focal = focalLengthPx(frame.clientWidth, frame.clientHeight);
    const applyFov = () => {
      const frustum = camera.frustum;
      if (!(frustum instanceof PerspectiveFrustum)) return;
      const fov = canvasFov(scene.canvas.clientWidth, scene.canvas.clientHeight, focal);
      if (Math.abs((frustum.fov ?? 0) - fov) > 1e-9) frustum.fov = fov;
    };
    const measureWhole = () =>
      wholeMoonHeight(focal, frame.clientWidth, frame.clientHeight, insetsRef.current ?? NO_INSETS);
    const setWholeHeight = (height: number) => {
      wholeHeightRef.current = height;
      scene.screenSpaceCameraController.maximumZoomDistance = height;
    };
    setWholeHeight(measureWhole());
    applyFov();
    const removeFov = scene.preRender.addEventListener(applyFov);

    // Surface: the 1K preview straight away, then the 8K map faded in over it, so the globe is never
    // blank. Both are single power-of-two images, so Cesium mipmaps them with anisotropic filtering.
    const moonImage = (url: string) =>
      SingleTileImageryProvider.fromUrl(url, { ellipsoid: Ellipsoid.MOON });
    const previewLayer = ImageryLayer.fromProviderAsync(moonImage(MOON_IMAGES.colourPreview));
    scene.imageryLayers.add(previewLayer);
    const colourLayer = ImageryLayer.fromProviderAsync(moonImage(MOON_IMAGES.colour), {
      alpha: reducedMotion ? 1 : 0,
    });
    scene.imageryLayers.add(colourLayer);
    // Sharpness costs fill rate. If moving the map runs below ~50 fps (median of 60 frames in a row
    // of motion), drop once to one pixel per CSS pixel: on an Intel UHD 630 at 120% scaling that
    // took close-ups from 30 to 60 fps. Watched only after the 8K map is in, as its upload stalls.
    let lastFrame = 0;
    const frameGaps: number[] = [];
    let removeFrameWatch: () => void = () => undefined;
    const watchFrames = () => {
      const now = performance.now();
      const gap = now - lastFrame;
      lastFrame = now;
      if (gap > 100) return;
      frameGaps.push(gap);
      if (frameGaps.length < 60) return;
      removeFrameWatch();
      frameGaps.sort((a, b) => a - b);
      if ((frameGaps[30] ?? 0) > SLOW_FRAME_MS) widget.resolutionScale = 1 / deviceRatio;
    };
    // Once the 8K map covers it, the preview only costs a texture read per pixel, so it goes.
    const hidePreview = () => {
      previewLayer.show = false;
      scene.requestRender();
      if (deviceRatio > 1) removeFrameWatch = scene.postRender.addEventListener(watchFrames);
    };
    let colourFadeId = 0;
    const removeColourReady = colourLayer.readyEvent.addEventListener(() => {
      if (reducedMotion) {
        hidePreview();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / COLOUR_FADE_MS);
        colourLayer.alpha = t;
        scene.requestRender();
        if (t < 1) colourFadeId = requestAnimationFrame(step);
        else hidePreview();
      };
      colourFadeId = requestAnimationFrame(step);
    });

    // Relief and light: the globe material darkens the imagery by the LOLA-derived shading.
    scene.globe.material = new Material({
      fabric: {
        type: 'MoonRelief',
        uniforms: {
          normalNear: MOON_IMAGES.normal,
          normalFar: MOON_IMAGES.normalLow,
          ambient: AMBIENT,
          rimDarkening: RIM_DARKENING,
          unshadedBelowZ: SHADE_EVERYWHERE,
        },
        source: MOON_RELIEF_SHADER,
      },
      translucent: false,
    });

    // Close-ups: Moon Trek tiles (preview, not adopted), sharper than the 8K map below ~600 km.
    let tileErrors = 0;
    let imageryFailed = false;
    const provider = new WebMapTileServiceImageryProvider({
      url: PREVIEW_IMAGERY.wmtsTemplate,
      layer: PREVIEW_IMAGERY.layer,
      style: PREVIEW_IMAGERY.style,
      tileMatrixSetID: PREVIEW_IMAGERY.tileMatrixSetID,
      format: PREVIEW_IMAGERY.format,
      tilingScheme: new GeographicTilingScheme({ ellipsoid: Ellipsoid.MOON }),
      maximumLevel: PREVIEW_IMAGERY.maximumLevel,
    });
    const trekLayer = new ImageryLayer(provider, { alpha: 0, show: false });
    scene.imageryLayers.add(trekLayer);

    const removeErrorListener = provider.errorEvent.addEventListener(() => {
      tileErrors += 1;
      if (!imageryFailed && tileErrors >= PREVIEW_FAILURE_THRESHOLD) {
        imageryFailed = true;
        scene.imageryLayers.remove(trekLayer);
        onStatusRef.current('failed');
        scene.requestRender();
      }
    });
    const removeProgressListener = scene.globe.tileLoadProgressEvent.addEventListener(
      (queued: number) => {
        if (queued === 0 && !imageryFailed && statusRef.current === 'loading') {
          onStatusRef.current('loaded');
        }
      },
    );
    const removeTrekFade = scene.preRender.addEventListener(() => {
      if (imageryFailed) return;
      const alpha = fadeByHeight(
        camera.positionCartographic.height,
        TREK_FADE_START_M,
        TREK_FULL_M,
      );
      trekLayer.alpha = alpha;
      trekLayer.show = alpha > 0.001;
    });

    // A faint, fine star field that turns with the view.
    const stars = scene.primitives.add(new PointPrimitiveCollection());
    for (const star of makeStars()) {
      stars.add({
        position: new Cartesian3(
          star.x * STAR_DISTANCE_M,
          star.y * STAR_DISTANCE_M,
          star.z * STAR_DISTANCE_M,
        ),
        pixelSize: star.size,
        color: Color.WHITE.withAlpha(star.brightness),
      });
    }

    // The real Sun: one directional light for the app time (Cesium's own Earth-based sun, moon,
    // sky box and atmosphere are all off). The relief shader reads it as czm_lightDirectionWC.
    const light = new DirectionalLight({ direction: new Cartesian3(-1, 0, 0) });
    scene.light = light;

    // The Sun's glow and the Earth, in their real directions from wherever the camera is. Both
    // sit a fixed distance from the camera, inside the star sphere (the real distances would add
    // a second render pass), sized so they look as big as the real thing; the Moon hides them
    // when it is in the way. Decoration for the space view: they fade out as you zoom in.
    const skyDirection = { sun: new Cartesian3(1, 0, 0), earth: new Cartesian3(1, 0, 0) };
    const earthCentre = new Cartesian3();
    const earthTurn = new Matrix3();
    const sky = scene.primitives.add(new BillboardCollection());
    const sunGlow = sky.add({
      image: sunGlowImage(cssToken('--color-sun-glow', '#fff1d6')),
      width: SUN_GLOW_PX,
      height: SUN_GLOW_PX,
      position: new Cartesian3(),
      show: false,
    });
    const earthMaterial = Material.fromType('Image', { image: EARTH_IMAGE, color: Color.WHITE });
    const earth = scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new EllipsoidGeometry({
            radii: new Cartesian3(1, 1, 1),
            stackPartitions: 32,
            slicePartitions: 48,
            vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
          }),
        }),
        // Opaque, lit by the Sun light like the Moon, so its phase is real. It fades to black
        // (not to transparent), which avoids a translucency pass over the whole screen.
        appearance: new MaterialAppearance({
          material: earthMaterial,
          materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
        show: false,
      }),
    );
    const fromCamera = new Cartesian3();
    const placed = new Cartesian3();
    const scaledTurn = new Matrix3();
    const removeSkyFollow = scene.preRender.addEventListener(() => {
      const shown =
        1 - fadeByHeight(camera.positionCartographic.height, SKY_FULL_ABOVE_M, SKY_GONE_BELOW_M);
      const camPosition = camera.positionWC;
      sunGlow.show = shown > 0.01;
      earth.show = shown > 0.01;
      if (!sunGlow.show) return;
      sunGlow.color = Color.WHITE.withAlpha(shown);
      sunGlow.position = Cartesian3.add(
        camPosition,
        Cartesian3.multiplyByScalar(skyDirection.sun, SKY_DISTANCE_M, placed),
        placed,
      );
      Cartesian3.subtract(earthCentre, camPosition, fromCamera);
      const distance = Cartesian3.magnitude(fromCamera);
      Cartesian3.normalize(fromCamera, fromCamera);
      const at = Cartesian3.add(
        camPosition,
        Cartesian3.multiplyByScalar(fromCamera, SKY_DISTANCE_M, new Cartesian3()),
        new Cartesian3(),
      );
      Matrix3.multiplyByScalar(earthTurn, (EARTH_RADIUS_M * SKY_DISTANCE_M) / distance, scaledTurn);
      earth.modelMatrix = Matrix4.fromRotationTranslation(scaledTurn, at, earth.modelMatrix);
      earthMaterial.uniforms.color = new Color(shown, shown, shown, 1);
    });

    // Points everything at the Sun and Earth for a time: on load and whenever the time changes.
    const applyTime = (ms: number) => {
      const date = new Date(ms);
      const where = lunarSky(date);
      const toSun = Cartesian3.normalize(
        new Cartesian3(where.sun[0], where.sun[1], where.sun[2]),
        skyDirection.sun,
      );
      light.direction = Cartesian3.negate(toSun, new Cartesian3());
      Cartesian3.fromElements(
        where.earth[0] * 1000,
        where.earth[1] * 1000,
        where.earth[2] * 1000,
        earthCentre,
      );
      const axes = earthAxes(date);
      Matrix3.fromColumnMajorArray([...axes.x, ...axes.y, ...axes.z], earthTurn);
      scene.requestRender();
    };
    applyTime(timeRef.current);
    applyTimeRef.current = applyTime;

    // The south-pole view is the one tilted view. While it is up the straight-down lock below
    // rests: clicks pick in the tilted view and drags turn it. A zoom, a flight, Whole Moon or the
    // demo's restore leaves it first (leaveTilt): straight down over the spot in the middle of the
    // view, keeping the screen's up direction, so the rest of the map never has to handle a tilt.
    let tiltedView = false;
    const leaveTilt = () => {
      if (!tiltedView) return;
      tiltedView = false;
      const middle = new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
      const ground = camera.pickEllipsoid(middle, Ellipsoid.MOON);
      const spot = ground
        ? Ellipsoid.MOON.cartesianToCartographic(ground)
        : camera.positionCartographic;
      // Just off the exact pole, where "north" (and so a heading) has no meaning.
      const latitude = Math.max(-MAX_LAT_RAD, Math.min(MAX_LAT_RAD, spot.latitude));
      const destination = Cartesian3.fromRadians(
        spot.longitude,
        latitude,
        camera.positionCartographic.height,
      );
      const direction = Cartesian3.negate(
        Cartesian3.normalize(destination, new Cartesian3()),
        new Cartesian3(),
      );
      // The old up direction, made level with the ground: the map keeps its turn on screen.
      const levelled = (vector: Cartesian3) =>
        Cartesian3.subtract(
          vector,
          Cartesian3.multiplyByScalar(
            direction,
            Cartesian3.dot(vector, direction),
            new Cartesian3(),
          ),
          new Cartesian3(),
        );
      let up = levelled(camera.up);
      if (Cartesian3.magnitude(up) < 1e-6) up = levelled(camera.direction);
      camera.cancelFlight();
      camera.setView({
        destination,
        orientation: { direction, up: Cartesian3.normalize(up, up) },
      });
    };
    leaveTiltRef.current = leaveTilt;

    // Zooming towards the cursor can leave a slight tilt; turn it back to straight down every
    // frame, so the close view always reads as a flat map. The correction is tiny per frame, so it
    // never shows as a jump.
    const removeNadirLock = scene.preRender.addEventListener(() => {
      if (tiltedView) return;
      if (
        Math.abs(camera.pitch - NADIR) > NADIR_TOLERANCE ||
        Math.abs(camera.roll) > NADIR_TOLERANCE
      ) {
        camera.setView({ orientation: { heading: camera.heading, pitch: NADIR, roll: 0 } });
      }
    });

    // Opening: ease in to the whole-Moon view (decorative; under reduced motion, start in place).
    let introRunning = !reducedMotion;
    const whole = wholeHeightRef.current;
    camera.setView({
      destination: Cartesian3.fromDegrees(0, 0, reducedMotion ? whole : whole * INTRO_START_FACTOR),
      orientation: { heading: 0, pitch: NADIR, roll: 0 },
    });
    if (introRunning) {
      camera.flyTo({
        destination: Cartesian3.fromDegrees(0, 0, whole),
        orientation: { heading: 0, pitch: NADIR, roll: 0 },
        duration: INTRO_SECONDS,
        easingFunction: EasingFunction.CUBIC_OUT,
        complete: () => {
          introRunning = false;
        },
        cancel: () => {
          introRunning = false;
        },
      });
    }

    // Idle drift: untouched for 5 s while zoomed out, the Moon turns very slowly; any touch stops it.
    let lastTouch = performance.now();
    let driftId = 0;
    let driftLast = 0;
    const stopDrift = () => {
      cancelAnimationFrame(driftId);
      driftId = 0;
      driftLast = 0;
    };
    const drift = (now: number) => {
      if (camera.positionCartographic.height < DRIFT_MIN_HEIGHT_M) {
        stopDrift();
        return;
      }
      const dt = driftLast === 0 ? 16 : Math.min(now - driftLast, 100);
      driftLast = now;
      camera.rotate(Cartesian3.UNIT_Z, -DRIFT_RADIANS_PER_SECOND * (dt / 1000));
      scene.requestRender();
      driftId = requestAnimationFrame(drift);
    };
    stopDriftRef.current = stopDrift;
    const idleCheck = window.setInterval(() => {
      if (reducedMotion || !idleDriftRef.current || driftId !== 0 || introRunning) return;
      if (performance.now() - lastTouch < DRIFT_IDLE_MS) return;
      if (camera.positionCartographic.height < DRIFT_MIN_HEIGHT_M) return;
      // The drift is not a move anything waits for: Cesium never reports the camera settled while
      // it turns, so say "settled" now and let moveStart ignore it.
      onMovingRef.current?.(false);
      driftId = requestAnimationFrame(drift);
    }, 250);
    const interact = () => {
      lastTouch = performance.now();
      stopDrift();
      if (introRunning) camera.cancelFlight();
    };
    interactRef.current = interact;
    frame.addEventListener('pointerdown', interact);
    frame.addEventListener('keydown', interact);

    // Readout: about 10 updates a second; React only re-renders when the text changes.
    const readoutTimer = window.setInterval(() => {
      const height = camera.positionCartographic.height;
      const frustum = camera.frustum as { fov?: number };
      const mpp = metresPerPixel(
        height,
        frustum.fov ?? CesiumMath.PI_OVER_THREE,
        scene.canvas.clientWidth,
        scene.canvas.clientHeight,
      );
      // Across the visible map: the frame less what the sidebars and panels cover.
      const insets = insetsRef.current ?? NO_INSETS;
      const visibleWidth = Math.max(0, frame.clientWidth - insets.left - insets.right);
      const next: ReadoutValues = {
        altitude: formatAltitude(height),
        zoom: `${zoomPercent(height, wholeHeightRef.current)}%`,
        distance: formatAltitude(mpp * visibleWidth),
      };
      setReadout((previous) =>
        previous &&
        previous.altitude === next.altitude &&
        previous.zoom === next.zoom &&
        previous.distance === next.distance
          ? previous
          : next,
      );
    }, READOUT_INTERVAL_MS);

    // Wheel zoom with a glide. One loop runs while a glide is under way; each new wheel event
    // just moves its target, so the glide follows the input without stepping.
    const glide = glideRef.current;
    const glideFrame = (now: number) => {
      const dt = glide.last === 0 ? 16 : now - glide.last;
      glide.last = now;
      const here = camera.positionCartographic;
      const next = glideHeight(here.height, glide.target, dt);
      const centre = glide.anchor
        ? zoomCentre({ lon: here.longitude, lat: here.latitude }, glide.anchor, here.height, next)
        : { lon: here.longitude, lat: here.latitude };
      camera.setView({
        destination: Cartesian3.fromRadians(centre.lon, centre.lat, next),
        orientation: { heading: camera.heading, pitch: NADIR, roll: 0 },
      });
      scene.requestRender();
      if (next === glide.target) {
        glide.frameId = 0;
        glide.last = 0;
      } else {
        glide.frameId = requestAnimationFrame(glideFrame);
      }
    };
    const glideTo = (height: number, anchor: LonLat | null) => {
      leaveTilt();
      camera.cancelFlight();
      glide.target = Math.min(wholeHeightRef.current, Math.max(MIN_HEIGHT_M, height));
      glide.anchor = anchor;
      if (glide.frameId === 0) glide.frameId = requestAnimationFrame(glideFrame);
    };
    glideToRef.current = glideTo;

    // "Whole Moon": back to the opening view (near side, north up) in a 1.2 s flight. Navigation,
    // so it runs the same under reduced motion.
    let flyingWhole = false;
    const flyWhole = () => {
      leaveTilt();
      stopGlide(glide);
      const target = wholeHeightRef.current;
      camera.flyTo({
        destination: Cartesian3.fromDegrees(0, 0, target),
        orientation: { heading: 0, pitch: NADIR, roll: 0 },
        duration: FLY_SECONDS,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
        maximumHeight: Math.max(camera.positionCartographic.height, target),
        complete: () => {
          flyingWhole = false;
        },
        cancel: () => {
          flyingWhole = false;
        },
      });
      // After flyTo, which cancels (and so clears) any flight already under way.
      flyingWhole = true;
    };
    flyWholeRef.current = flyWhole;

    // "South pole": the tilted view over the pole (cameraControls southPoleView), fitted to the
    // visible area. Navigation, so it runs the same under reduced motion.
    const flySouthPole = () => {
      stopGlide(glide);
      const insets = insetsRef.current ?? NO_INSETS;
      const pose = southPoleView(
        focalLengthPx(frame.clientWidth, frame.clientHeight),
        frame.clientWidth,
        frame.clientHeight,
        insets,
      );
      camera.flyTo({
        destination: Cartesian3.fromRadians(pose.lon, pose.lat, pose.height),
        orientation: { heading: pose.heading, pitch: pose.pitch, roll: 0 },
        duration: FLY_SECONDS,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      });
      // After flyTo, which cancels (and so clears) any flight already under way.
      tiltedView = true;
    };
    flySouthPoleRef.current = flySouthPole;

    // For the guided demo: the same whole-Moon flight as the button, and the view to come back to.
    {
      cameraApiRef.current = {
        showWholeMoon: () => {
          interactRef.current();
          flyWhole();
        },
        showSouthPole: () => {
          interactRef.current();
          flySouthPole();
        },
        saveView: (): SavedView => ({
          destination: Cartesian3.clone(camera.positionWC),
          heading: camera.heading,
          pitch: camera.pitch,
          roll: camera.roll,
        }),
        restoreView: (view: unknown) => {
          if (!isSavedView(view)) return;
          interactRef.current();
          leaveTilt();
          stopGlide(glide);
          camera.flyTo({
            destination: view.destination,
            orientation: { heading: view.heading, pitch: view.pitch, roll: view.roll },
            duration: FLY_SECONDS,
            easingFunction: EasingFunction.QUADRATIC_IN_OUT,
          });
        },
      };
    }
    // Moving or settled, for anything that should wait for the camera (the demo's step timer).
    const removeMoveStart = camera.moveStart.addEventListener(() => {
      if (driftId === 0) onMovingRef.current?.(true);
    });
    const removeMoveEnd = camera.moveEnd.addEventListener(() => onMovingRef.current?.(false));

    // A sidebar, the time bar or the window changed the visible area. At the whole-Moon view
    // (or on the way there), glide to the new fit; zoomed in, keep the zoom, unless the new
    // furthest zoom is closer than the camera.
    const refit = () => {
      const before = wholeHeightRef.current;
      focal = focalLengthPx(frame.clientWidth, frame.clientHeight);
      const next = measureWhole();
      if (Math.abs(next - before) < 1) return;
      setWholeHeight(next);
      const height = camera.positionCartographic.height;
      if (flyingWhole) flyWhole();
      else if (isWholeView(height, before) || height > next) glideTo(next, null);
      scene.requestRender();
    };
    refitRef.current = refit;
    const frameSize = new ResizeObserver(refit);
    frameSize.observe(frame);

    const groundAt = (clientX: number, clientY: number): LonLat | null => {
      const rect = scene.canvas.getBoundingClientRect();
      const point = camera.pickEllipsoid(
        new Cartesian2(clientX - rect.left, clientY - rect.top),
        Ellipsoid.MOON,
      );
      if (!point) return null;
      const ground = Ellipsoid.MOON.cartesianToCartographic(point);
      return { lon: ground.longitude, lat: ground.latitude };
    };

    // On the whole map frame (canvas and the controls over it), so ctrl+wheel never zooms the
    // browser page here. Non-passive, or preventDefault would be ignored.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      interact();
      const { zoom, pinch } = isWheelZoom(event);
      if (!zoom) return;
      const from = glide.frameId === 0 ? camera.positionCartographic.height : glide.target;
      glideTo(
        wheelTargetHeight(
          from,
          wheelDeltaPx(event.deltaY, event.deltaMode),
          pinch,
          MIN_HEIGHT_M,
          wholeHeightRef.current,
        ),
        groundAt(event.clientX, event.clientY),
      );
    };
    frame.addEventListener('wheel', onWheel, { passive: false });

    const siteIdAt = (position: Cartesian2): string | null => {
      const picked: unknown = scene.pick(position);
      const entity =
        picked && typeof picked === 'object' && 'id' in picked ? (picked.id as unknown) : null;
      if (entity instanceof Entity && entity.id.startsWith(SITE_ENTITY_PREFIX)) {
        return entity.id.slice(SITE_ENTITY_PREFIX.length);
      }
      return null;
    };

    // A click on a beacon chooses its site; a click on bare ground asks about that spot. Cesium
    // only reports a click when the pointer did not drag, so turning the Moon never picks one.
    widget.screenSpaceEventHandler.setInputAction((event: { position: Cartesian2 }) => {
      const siteId = siteIdAt(event.position);
      if (siteId) {
        onSelectRef.current(siteId);
        return;
      }
      const pick = onPickRef.current;
      const ground = pick ? camera.pickEllipsoid(event.position, Ellipsoid.MOON) : undefined;
      if (!pick || !ground) return;
      const spot = Ellipsoid.MOON.cartesianToCartographic(ground);
      pick({ lat: CesiumMath.toDegrees(spot.latitude), lon: CesiumMath.toDegrees(spot.longitude) });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Pin hover. Each pick draws the scene again, so pick at most once a frame, and not at all
    // while a button is held: a drag is moving the map, not pointing at pins.
    let pointerHeld = false;
    let hoverPoint: Cartesian2 | null = null;
    let pickFrameId = 0;
    let lastGroundAt = 0;
    let groundTimer = 0;
    let touchInput = false;
    // The map layers' readout: the ground point under the pointer, about ten times a second (the
    // last move is always sent, after the pause).
    const reportGround = () => {
      groundTimer = 0;
      const report = onHoverGroundRef.current;
      if (!report || touchInput) return;
      lastGroundAt = performance.now();
      const ground =
        hoverPoint && !pointerHeld ? camera.pickEllipsoid(hoverPoint, Ellipsoid.MOON) : undefined;
      if (!ground) {
        report(null);
        return;
      }
      const spot = Ellipsoid.MOON.cartesianToCartographic(ground);
      report({
        lat: CesiumMath.toDegrees(spot.latitude),
        lon: CesiumMath.toDegrees(spot.longitude),
      });
    };
    const requestGround = () => {
      if (!onHoverGroundRef.current || groundTimer !== 0) return;
      const wait = Math.max(0, 100 - (performance.now() - lastGroundAt));
      groundTimer = window.setTimeout(reportGround, wait);
    };
    const updateHover = () => {
      pickFrameId = 0;
      const siteId = hoverPoint && !pointerHeld ? siteIdAt(hoverPoint) : null;
      const entity = siteId ? widget.entities.getById(`${SITE_ENTITY_PREFIX}${siteId}`) : undefined;
      // Over the ground the cursor says a click means something; over space it is plain.
      const overGround =
        !entity && hoverPoint && onPickRef.current
          ? camera.pickEllipsoid(hoverPoint, Ellipsoid.MOON) !== undefined
          : false;
      container.style.cursor = entity ? 'pointer' : overGround ? 'crosshair' : '';
      setHoverTip(
        entity && hoverPoint ? { text: entity.name ?? '', x: hoverPoint.x, y: hoverPoint.y } : null,
      );
      const hovered = entity ? siteId : null;
      if (hovered !== hoveredRef.current) {
        hoveredRef.current = hovered;
        onHoverRef.current(hovered);
        animateBeacons();
      }
    };
    const requestHover = () => {
      if (pickFrameId === 0) pickFrameId = requestAnimationFrame(updateHover);
    };
    widget.screenSpaceEventHandler.setInputAction((event: { endPosition: Cartesian2 }) => {
      hoverPoint = Cartesian2.clone(event.endPosition, hoverPoint ?? undefined);
      requestHover();
      requestGround();
    }, ScreenSpaceEventType.MOUSE_MOVE);
    // While the Moon is dragged, nothing decorative moves: the frame is marked, and CSS stops the
    // selection pulse until the pointer lets go.
    const holdPointer = (event: PointerEvent) => {
      touchInput = event.pointerType === 'touch';
      pointerHeld = true;
      if (frameRef.current) frameRef.current.dataset.dragging = 'true';
      requestHover();
    };
    const releasePointer = () => {
      pointerHeld = false;
      if (frameRef.current) delete frameRef.current.dataset.dragging;
      requestHover();
    };
    container.addEventListener('pointerdown', holdPointer);
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);

    // Beacons ease to their scale (selected, hovered) and fade in after a lander change, over
    // 140ms. Decorative, so under reduced motion they take their final state at once.
    let beaconFrameId = 0;
    function animateBeacons() {
      const targets = new Map<string, BeaconAnim>();
      const hovered = hoveredRef.current ?? externalHoverRef.current;
      for (const entry of sitesRef.current) {
        const id = entry.site.id;
        targets.set(id, {
          scale: beaconScale(id === selectedRef.current, id === hovered),
          appear: 1,
        });
      }
      cancelAnimationFrame(beaconFrameId);
      if (prefersReducedMotion()) {
        for (const [id, target] of targets) beaconAnimRef.current.set(id, { ...target });
        scene.requestRender();
        return;
      }
      const start = performance.now();
      const from = new Map(beaconAnimRef.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / BEACON_ANIM_MS);
        const eased = 1 - (1 - t) ** 3;
        for (const [id, target] of targets) {
          const begin = from.get(id) ?? { scale: target.scale, appear: 0 };
          beaconAnimRef.current.set(id, {
            scale: begin.scale + (target.scale - begin.scale) * eased,
            appear: begin.appear + (target.appear - begin.appear) * eased,
          });
        }
        scene.requestRender();
        if (t < 1) beaconFrameId = requestAnimationFrame(step);
      };
      beaconFrameId = requestAnimationFrame(step);
    }
    animateBeaconsRef.current = animateBeacons;

    // The selected beacon's ring and name tag are HTML over the canvas: the pulse is a CSS
    // animation, so it never makes the globe redraw. They follow the beacon after every render,
    // match its size, and fade with it at the rim.
    const ringPoint = new Cartesian2();
    const removeSelectionFollow = scene.postRender.addEventListener(() => {
      const overlay = selectionRef.current;
      if (!overlay) return;
      const entry = sitesRef.current.find((candidate) => candidate.site.id === selectedRef.current);
      const position = entry
        ? Cartesian3.fromDegrees(entry.site.lon, entry.site.lat, MARKER_HEIGHT_M)
        : undefined;
      const alpha = position ? beaconAlpha(position, camera.positionWC, true) : 0;
      const onScreen =
        position && alpha > 0.01
          ? SceneTransforms.worldToWindowCoordinates(scene, position, ringPoint)
          : undefined;
      if (!position || !onScreen) {
        overlay.style.visibility = 'hidden';
        return;
      }
      const size =
        BEACON_SIZE_PX *
        beaconScaleAt(Cartesian3.distance(camera.positionWC, position)) *
        beaconScale(true, false);
      overlay.style.visibility = 'visible';
      overlay.style.opacity = String(alpha);
      overlay.style.transform = `translate(${onScreen.x}px, ${onScreen.y}px)`;
      overlay.style.setProperty('--beacon-size', `${size}px`);
    });
    // The picked point's pin: HTML over the canvas, like the selection ring, and kept at full
    // strength near the rim the same way.
    const pointScreen = new Cartesian2();
    const removePointFollow = scene.postRender.addEventListener(() => {
      const pin = pointRef.current;
      if (!pin) return;
      const picked = pickedRef.current;
      const position = picked
        ? Cartesian3.fromDegrees(picked.lon, picked.lat, MARKER_HEIGHT_M)
        : undefined;
      const onScreen =
        position && beaconAlpha(position, camera.positionWC, true) > 0.01
          ? SceneTransforms.worldToWindowCoordinates(scene, position, pointScreen)
          : undefined;
      if (!onScreen) {
        pin.style.visibility = 'hidden';
        return;
      }
      pin.style.visibility = 'visible';
      pin.style.transform = `translate(${onScreen.x}px, ${onScreen.y}px)`;
    });

    return () => {
      frameSize.disconnect();
      removeFov();
      removeSkyFollow();
      cancelAnimationFrame(glide.frameId);
      cancelAnimationFrame(beaconFrameId);
      removeSelectionFollow();
      removePointFollow();
      cancelAnimationFrame(colourFadeId);
      cancelAnimationFrame(pickFrameId);
      window.clearTimeout(groundTimer);
      removeFrameWatch();
      container.removeEventListener('pointerdown', holdPointer);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      stopDrift();
      window.clearInterval(idleCheck);
      window.clearInterval(readoutTimer);
      removeMoveStart();
      removeMoveEnd();
      cameraApiRef.current = null;
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('pointerdown', interact);
      frame.removeEventListener('keydown', interact);
      removeColourReady();
      removeErrorListener();
      removeProgressListener();
      removeTrekFade();
      removeNadirLock();
      // The visibility controller removes its own imagery layers, so it goes before the widget.
      disposeVisibilityRef.current();
      disposeVisibilityRef.current = () => undefined;
      visibilityStartedRef.current = false;
      widget.destroy();
      widgetRef.current = null;
    };
  }, []);

  // Graticule: parallels follow latitude (rhumb lines), meridians run pole to pole. One faint
  // colour at every height, so it shows from the whole-Moon view down to the closest zoom. The
  // lines are cut every 0.1° and lifted a little, so their straight segments never dip under the
  // surface close up.
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || !showGrid) return undefined;
    const material = new ColorMaterialProperty(
      Color.fromCssColorString(cssToken('--color-marker', '#d8d5ce')).withAlpha(GRID_ALPHA),
    );
    const line = (degrees: number[], arcType: ArcType) =>
      widget.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(withHeight(degrees, GRID_HEIGHT_M)),
          width: 1,
          material,
          arcType,
          granularity: GRID_GRANULARITY,
        },
      });
    const lines = [
      ...GRID_LATITUDES.map((lat) => line(parallelDegrees(lat), ArcType.RHUMB)),
      ...GRID_LONGITUDES.map((lon) => line(meridianDegrees(lon), ArcType.GEODESIC)),
    ];
    widget.scene.requestRender();
    return () => {
      if (widget.isDestroyed()) return;
      for (const line of lines) widget.entities.remove(line);
      widget.scene.requestRender();
    };
  }, [showGrid]);

  // Site beacons: suitable in green with the rank inside, not suitable as a small red dot (the
  // Sites list's verdict for the dates checked; the Timeline's bracket moves them live).
  // One entity per site for the map's life: a mission change swaps its image and name, and a
  // changed beacon fades back in.
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    const ink = cssToken('--color-pin-text', '#061022');
    const suitableFill = cssToken('--color-pin-pass', '#5fd49a');
    const anims = beaconAnimRef.current;
    const { camera } = widget;
    const badge = cssToken('--color-accent', '#ffb347');
    for (const entry of rankedSites) {
      const { site } = entry;
      const compared = comparedSiteIds.includes(site.id);
      const style: BeaconStyle = {
        compareBadge: compared ? badge : undefined,
        fill: entry.rank === null ? cssToken('--color-pin-fail', '#ff7b72') : suitableFill,
        ink,
      };
      const image = beaconSvgDataUri(style, entry.rank);
      const id = `${SITE_ENTITY_PREFIX}${site.id}`;
      const existing = widget.entities.getById(id);
      if (existing) {
        if (
          updateBeacon(
            existing,
            image,
            hoverText(entry, compared, missionWords),
            widget.clock.currentTime,
          )
        ) {
          const anim = anims.get(site.id);
          if (anim) anim.appear = 0;
        }
        continue;
      }
      const position = Cartesian3.fromDegrees(site.lon, site.lat, MARKER_HEIGHT_M);
      widget.entities.add({
        id,
        name: hoverText(entry, compared, missionWords),
        position,
        billboard: {
          image,
          width: BEACON_SIZE_PX,
          height: BEACON_SIZE_PX,
          scale: new CallbackProperty(() => anims.get(site.id)?.scale ?? 1, false),
          scaleByDistance: new NearFarScalar(
            BEACON_SCALE.nearM,
            BEACON_SCALE.near,
            BEACON_SCALE.farM,
            BEACON_SCALE.far,
          ),
          // Depth-tested against the globe like any surface feature (no disableDepthTestDistance),
          // and faded out towards the rim so a beacon never pops at the horizon. The selected one
          // stays fully drawn almost to the rim, so it always reads as selected.
          color: new CallbackProperty(
            () =>
              Color.WHITE.withAlpha(
                beaconAlpha(position, camera.positionWC, selectedRef.current === site.id) *
                  (anims.get(site.id)?.appear ?? 1),
              ),
            false,
          ),
          show: new CallbackProperty(
            () => beaconAlpha(position, camera.positionWC, selectedRef.current === site.id) > 0.01,
            false,
          ),
          verticalOrigin: VerticalOrigin.CENTER,
        },
      });
    }
    animateBeaconsRef.current();
  }, [rankedSites, comparedSiteIds, missionWords]);

  useEffect(() => {
    pickedRef.current = pickedPoint;
    widgetRef.current?.scene.requestRender();
  }, [pickedPoint]);

  // Selection and list hover change only the beacons' targets. The selected one is drawn in front
  // of its neighbours; keep that nudge far smaller than the 300 m between the lowest camera and the
  // beacons, or the beacon moves behind the camera.
  useEffect(() => {
    selectedRef.current = selectedSiteId;
    externalHoverRef.current = hoveredSiteId;
    const widget = widgetRef.current;
    if (!widget) return;
    for (const entity of widget.entities.values) {
      if (!entity.billboard) continue;
      const selected = entity.id === `${SITE_ENTITY_PREFIX}${selectedSiteId ?? ''}`;
      setBeaconEyeOffset(entity, selected ? -20 : 0);
    }
    animateBeaconsRef.current();
  }, [selectedSiteId, hoveredSiteId]);

  // Every user choice of a site (list or pin, even the one already selected) flies the camera
  // there at the current height: zoomed out, the Moon turns to face it (far side included);
  // zoomed in, a long hop rises a little on the way (flightPeakHeight). The automatic #1 on load
  // sends no request. A request made before the map loaded is flown as soon as it exists, because
  // this effect runs after scene creation.
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || !flyRequest) return;
    const entry = sitesRef.current.find((candidate) => candidate.site.id === flyRequest.siteId);
    const place = flyRequest.point ?? entry?.site;
    if (!place) return;
    interactRef.current();
    leaveTiltRef.current();
    stopGlide(glideRef.current);
    const here = widget.camera.positionCartographic;
    // Close up, aim beside an open left panel: the site lands in the middle of the uncovered map.
    // Zoomed out the Moon stays centred (the panel never covers the middle of the disc).
    const aim = (height: number) => {
      const frame = frameRef.current;
      const covered = coveredLeftRef.current?.() ?? 0;
      const site = { lon: place.lon, lat: place.lat };
      if (!frame || covered <= 0 || covered > frame.clientWidth * 0.6) return site;
      if (height > wholeHeightRef.current * 0.5) return site;
      const metresPerPx = height / focalLengthPx(frame.clientWidth, frame.clientHeight);
      const moved = offsetLonLat(
        { lon: CesiumMath.toRadians(site.lon), lat: CesiumMath.toRadians(site.lat) },
        (covered / 2) * metresPerPx,
        widget.camera.heading - CesiumMath.PI_OVER_TWO,
      );
      return { lon: CesiumMath.toDegrees(moved.lon), lat: CesiumMath.toDegrees(moved.lat) };
    };
    const distance = groundDistanceM(
      { lon: here.longitude, lat: here.latitude },
      { lon: CesiumMath.toRadians(place.lon), lat: CesiumMath.toRadians(place.lat) },
    );
    const target = aim(here.height);
    flyOver(
      widget,
      target.lon,
      target.lat,
      here.height,
      flightPeakHeight(here.height, here.height, distance, wholeHeightRef.current),
    );
  }, [flyRequest]);

  // The map layers (docs/LANDER_RULES.md, "Map layers: elevation and slope"): for each visible
  // layer, its preview quarters first, then the full quarters and the 40 m patches, which replace the
  // previews once all have loaded. Nothing loads until a layer is first switched on; switching it
  // off hides its images. The first layer in the list is drawn lowest (elevation under slope), all
  // above the basemap. The images never change with the time.
  useEffect(() => {
    mapLayersRef.current = mapLayers;
    const widget = widgetRef.current;
    if (!widget) return;
    const layers = widget.imageryLayers;
    const states = layerImageryRef.current;
    const apply = () => {
      for (const display of mapLayersRef.current) {
        const state = states.get(display.id);
        if (!state) continue;
        for (const imagery of [...state.preview, ...state.full]) {
          imagery.show = display.visible;
          imagery.alpha = display.opacity;
          if (layers.contains(imagery)) layers.raiseToTop(imagery);
        }
      }
      // The visibility overlay stays above elevation and slope.
      raiseVisibility(widget, visibilityHandleRef.current);
      widget.scene.requestRender();
    };
    // Each image as its own imagery layer, drawn pixel for pixel (no blending of the team's
    // colours). Images that fail are left out; the rest are kept.
    const load = async (images: readonly LayerImageSpec[]) => {
      const results = await Promise.allSettled(
        images.map(async (image) => {
          const provider = await SingleTileImageryProvider.fromUrl(image.url, {
            rectangle: Rectangle.fromDegrees(image.west, image.south, image.east, image.north),
            ellipsoid: Ellipsoid.MOON,
          });
          return new ImageryLayer(provider, {
            magnificationFilter: TextureMagnificationFilter.NEAREST,
            minificationFilter: TextureMinificationFilter.NEAREST,
          });
        }),
      );
      const loaded = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      return { loaded, failed: loaded.length < images.length };
    };
    for (const display of mapLayers) {
      const existing = states.get(display.id);
      if (!display.visible) {
        // A layer whose images partly failed is cleared when switched off, so switching it on
        // again loads it afresh.
        if (existing?.failed) {
          for (const imagery of [...existing.preview, ...existing.full]) {
            layers.remove(imagery, true);
          }
          states.delete(display.id);
        }
        continue;
      }
      if (existing) continue;
      const state = {
        preview: [] as ImageryLayer[],
        full: [] as ImageryLayer[],
        failed: false,
      };
      states.set(display.id, state);
      void (async () => {
        const preview = await load(display.preview);
        if (widget.isDestroyed()) return;
        for (const imagery of preview.loaded) layers.add(imagery);
        state.preview = preview.loaded;
        apply();
        // A narrow or low-memory device keeps the previews only.
        const full = display.full.length > 0 ? await load(display.full) : null;
        if (widget.isDestroyed()) return;
        if (full) {
          for (const imagery of full.loaded) layers.add(imagery);
          state.full = full.loaded;
          // The previews go once every full image is in; otherwise they fill the gaps.
          if (!full.failed) {
            for (const imagery of state.preview) layers.remove(imagery, true);
            state.preview = [];
          }
        }
        const failed = preview.failed || (full?.failed ?? false);
        state.failed = failed;
        const stillOn = mapLayersRef.current.some(
          (entry) => entry.id === display.id && entry.visible,
        );
        if (failed && !stillOn) {
          // Switched off while loading: clear it now, so switching it on again retries.
          for (const imagery of [...state.preview, ...state.full]) layers.remove(imagery, true);
          state.preview = [];
          state.full = [];
        }
        if (state.preview.length === 0 && state.full.length === 0) {
          // Nothing loaded: forget the layer, so switching it on again tries again.
          states.delete(display.id);
        }
        if (failed) onLayerFailedRef.current?.(display.id);
        apply();
      })();
    }
    apply();
  }, [mapLayers]);

  // The visibility prototype (docs/LANDER_RULES.md, "Visibility prototype layer"): one controller,
  // made the first time the layer is switched on; then the switches, opacities and the frame for
  // the app's time go to it. A manifest that cannot be read leaves the layer unavailable and the
  // globe as it was. Its imagery and numbers change together, when the controller has both.
  useEffect(() => {
    visibilityRef.current = visibility;
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) return;
    const handle = visibilityHandleRef.current;
    if (handle) {
      applyVisibilityDisplay(handle.controller, handle.requester, visibility);
      return;
    }
    if (!visibility.load || visibilityStartedRef.current) return;
    visibilityStartedRef.current = true;
    const report = (patch: Partial<VisibilityRuntime>) => onVisibilityStateRef.current?.(patch);
    report({ status: 'loading' });
    // A frame's new layers go on top of whatever is there; the order is put back each time.
    createVisibilityController(widget, VISIBILITY_MANIFEST_URL, (timeUTC) => {
      raiseVisibility(widget, visibilityHandleRef.current);
      widget.scene.requestRender();
      report({ appliedTime: timeUTC });
    }).then(
      (controller) => {
        // The globe went while the manifest loaded: the controller has no layers yet to remove.
        if (widget.isDestroyed()) return;
        const requester = createFrameRequester(
          (stamp) => controller.setTime(stamp),
          ({ loading, failed }) => report({ loading, failed }),
        );
        const next: VisibilityHandle = { controller, requester };
        visibilityHandleRef.current = next;
        disposeVisibilityRef.current = () => {
          requester.stop();
          controller.dispose();
          visibilityHandleRef.current = null;
        };
        report({
          status: 'ready',
          sample: (target, lon, lat) => controller.sample(target, lon, lat),
        });
        applyVisibilityDisplay(controller, requester, visibilityRef.current);
      },
      () => {
        if (!widget.isDestroyed()) report({ status: 'unavailable' });
      },
    );
  }, [visibility]);

  // Where the Sun-and-relief shading stops: south of the layers' coverage while one is visible.
  useEffect(() => {
    const widget = widgetRef.current;
    const material = widget?.scene.globe.material;
    if (!widget || !material) return;
    material.uniforms.unshadedBelowZ = layerShadeCutZ;
    widget.scene.requestRender();
  }, [layerShadeCutZ]);

  // The shared time moved (live tick, playback, an edit): re-point the Sun light and the sky.
  useEffect(() => {
    timeRef.current = time;
    applyTimeRef.current(time);
  }, [time]);

  // The visible area changed (a sidebar, the time bar or the status strip): re-fit the whole Moon.
  useEffect(() => {
    insetsRef.current = viewInsets;
    refitRef.current();
  }, [viewInsets]);

  // The stage: the canvas and what is pinned to it, shifted so the straight-down camera's centre
  // is the visible area's centre. The left and right halves of the shift ride on separate
  // properties, so each moves at its own sidebar's pace. The canvas is larger than the map by
  // the shift on every side, so no edge ever shows; while a slide runs it keeps the larger of
  // the old and new margins, then shrinks.
  const insets = viewInsets ?? NO_INSETS;
  const shift = viewShift(insets);
  const needX = Math.ceil(Math.abs(shift.x));
  const needY = Math.ceil(Math.abs(shift.y));
  const [margin, setMargin] = useState({ x: needX, y: needY });
  if (needX > margin.x || needY > margin.y) {
    setMargin({ x: Math.max(needX, margin.x), y: Math.max(needY, margin.y) });
  }
  useEffect(() => {
    if (needX === margin.x && needY === margin.y) return undefined;
    const id = window.setTimeout(() => setMargin({ x: needX, y: needY }), STAGE_SHRINK_MS);
    return () => window.clearTimeout(id);
  }, [needX, needY, margin.x, margin.y]);
  // A canvas resize clears it, so resize and draw before the browser paints: no blank or
  // stretched frame. The Moon keeps its size and place (the margin is even on both sides).
  useLayoutEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) return;
    widget.resize();
    widget.render();
  }, [margin.x, margin.y]);
  const stageStyle: CSSProperties = {
    inset: `${-margin.y}px ${-margin.x}px`,
    translate: `${insets.left / 2}px ${shift.y}px`,
    transform: `translateX(${-insets.right / 2}px)`,
  };

  const selectedEntry = rankedSites.find((entry) => entry.site.id === selectedSiteId);

  const zoomBy = (factor: number) => {
    const height = widgetRef.current?.camera.positionCartographic.height;
    if (height === undefined) return;
    // Quick repeated clicks compound from the pending target, like repeated wheel notches.
    interactRef.current();
    const glide = glideRef.current;
    const from = glide.frameId === 0 ? height : glide.target;
    glideToRef.current(steppedHeight(from, factor, MIN_HEIGHT_M, wholeHeightRef.current), null);
  };

  const showWholeMoon = () => {
    interactRef.current();
    flyWholeRef.current();
  };

  const showSouthPole = () => {
    interactRef.current();
    flySouthPoleRef.current();
  };

  return (
    <div ref={frameRef} className={styles.frame}>
      <div className={styles.stage} style={stageStyle}>
        <div ref={containerRef} className={styles.globe} />

        <div ref={selectionRef} className={styles.selection} aria-hidden="true">
          <span className={styles.ring} />
          <span className={styles.tag}>{selectedEntry?.site.name}</span>
        </div>

        <div ref={pointRef} className={styles.point} aria-hidden="true">
          <span className={styles.pointMark} />
          <span className={styles.tag}>Your point</span>
        </div>

        {hoverTip ? (
          <div
            className={styles.hoverTip}
            style={{ left: hoverTip.x, top: hoverTip.y }}
            aria-hidden="true"
          >
            {hoverTip.text}
          </div>
        ) : null}
      </div>

      <div
        className={joinClassNames(styles.corner, controlsHidden && styles.cornerHidden)}
        inert={controlsHidden}
        aria-hidden={controlsHidden || undefined}
      >
        <MapControls
          className={styles.controls}
          onZoomIn={() => zoomBy(0.5)}
          onZoomOut={() => zoomBy(2)}
          onWholeMoon={showWholeMoon}
          onSouthPole={showSouthPole}
          showGrid={showGrid}
          onShowGridChange={onShowGridChange}
          onToggleLayers={onToggleLayers}
          layersOpen={layersOpen}
          onPresent={onPresent}
        />
      </div>

      {/* The zoom readout: bottom right, just above the timeline, clear of the icon column. */}
      <div
        className={joinClassNames(styles.readoutCorner, controlsHidden && styles.cornerHidden)}
        aria-hidden={controlsHidden || undefined}
      >
        {readout ? <ZoomReadout values={readout} /> : null}
      </div>

      <div ref={creditRef} className={styles.cesiumCredits} aria-hidden="true" />
    </div>
  );
}

/**
 * The Sun's glow: a small bright core (about the real Sun's 0.5° across at the map's scale) in a
 * soft halo that falls off fast. Drawn once into a canvas.
 */
function sunGlowImage(colour: string): HTMLCanvasElement {
  const size = SUN_GLOW_PX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const half = size / 2;
  const glow = context.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, colour);
  glow.addColorStop(0.07, colour);
  glow.addColorStop(0.1, withAlpha(colour, 0.55));
  glow.addColorStop(0.3, withAlpha(colour, 0.14));
  glow.addColorStop(1, withAlpha(colour, 0));
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
  return canvas;
}

/** A CSS colour at an opacity, for canvas gradients. */
function withAlpha(colour: string, alpha: number): string {
  return Color.fromCssColorString(colour).withAlpha(alpha).toCssColorString();
}

/**
 * Layer order: basemap, then elevation and slope, then the visibility overlay on top
 * (docs/LANDER_RULES.md, "Visibility prototype layer", Display).
 */
function raiseVisibility(widget: CesiumWidget, handle: VisibilityHandle | null) {
  if (!handle || widget.isDestroyed()) return;
  raiseOverlayToTop(widget.imageryLayers, controllerLayers(handle.controller));
}

/** Swaps a beacon's image and hover text; true when the image changed (so it fades back in). */
function updateBeacon(entity: Entity, image: string, name: string, time: JulianDate): boolean {
  entity.name = name;
  if (!entity.billboard) return false;
  const before: unknown = entity.billboard.image?.getValue(time);
  if (before === image) return false;
  entity.billboard.image = new ConstantProperty(image);
  return true;
}

function setBeaconEyeOffset(entity: Entity, z: number) {
  if (entity.billboard) entity.billboard.eyeOffset = new ConstantProperty(new Cartesian3(0, 0, z));
}

/**
 * How visible a beacon is from the camera: 0 on the far side, fading in from the rim. The selected
 * one fades over a far thinner band, so near the edge it is still at full strength.
 */
function beaconAlpha(position: Cartesian3, camera: Cartesian3, selected = false): number {
  return horizonAlpha(
    [position.x, position.y, position.z],
    [camera.x, camera.y, camera.z],
    selected ? SELECTED_FULL_FROM : undefined,
  );
}

/** [lon, lat, lon, lat, …] → [lon, lat, h, lon, lat, h, …]. */
function withHeight(flat: readonly number[], height: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push(flat[i] ?? 0, flat[i + 1] ?? 0, height);
  return out;
}

/** Stops a running zoom glide, so it cannot keep moving the camera after a flight takes over. */
function stopGlide(glide: GlideState) {
  cancelAnimationFrame(glide.frameId);
  glide.frameId = 0;
  glide.last = 0;
}

/**
 * A gentle, fixed-length flight straight down onto a point: ease-in-out and the current heading
 * kept (no spin). Cesium's `maximumHeight` is the top of the arc, so `peak` decides whether the
 * flight rises on the way. Navigation, so it runs the same under reduced motion.
 */
function flyOver(
  widget: CesiumWidget,
  lonDeg: number,
  latDeg: number,
  height: number,
  peak: number,
) {
  const { camera } = widget;
  camera.flyTo({
    destination: Cartesian3.fromDegrees(lonDeg, latDeg, height),
    orientation: { heading: camera.heading, pitch: NADIR, roll: 0 },
    duration: FLY_SECONDS,
    easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    maximumHeight: peak,
  });
}

/** A camera view as the demo saves it: where the camera was and which way it looked. */
interface SavedView {
  destination: Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
}

function isSavedView(view: unknown): view is SavedView {
  return (
    typeof view === 'object' &&
    view !== null &&
    'destination' in view &&
    view.destination instanceof Cartesian3 &&
    'heading' in view &&
    typeof view.heading === 'number'
  );
}
