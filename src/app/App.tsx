import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Breadcrumb } from '../components/Breadcrumb';
import { FloatingPanel } from '../components/FloatingPanel';
import { MenuRail, type RailItem } from '../components/MenuRail';
import { PresentExit } from '../components/PresentExit';
import { TopBar } from '../components/TopBar';
import { rankSites, type CompareEntry, type DemoMission } from '../data/demoData';
import { terrainProfileFor } from '../data/terrainPatches';
import { AboutPanel, type AboutTab } from '../features/about/AboutPanel';
import { CompareFull } from '../features/compare/CompareFull';
import { ComparePanel } from '../features/compare/ComparePanel';
import { CoordinateSearch } from '../features/lunar-map/CoordinateSearch';
import { DataCredits } from '../features/lunar-map/DataCredits';
import { MapErrorBoundary } from '../features/lunar-map/MapErrorBoundary';
import type { FlyRequest } from '../features/lunar-map/MoonGlobe';
import type { ImageryStatus } from '../features/lunar-map/mapLabels';
import { DateRangePicker } from '../features/missions/DateRangePicker';
import { dateRangeError, toTimeRange, type DateRange } from '../features/missions/dateRange';
import {
  missionFromDraft,
  validateDraft,
  type MissionDraft,
} from '../features/missions/customMissions';
import type { MapController } from '../features/lunar-map/cameraControls';
import { DetailsPanel, type DetailsSection } from '../features/lunar-map/DetailsPanel';
import { useGoodWindows, windowDates, type GoodWindow } from '../features/lunar-map/goodWindows';
import { ResultsCard } from '../features/lunar-map/ResultsCard';
import { yearFacts } from '../features/lunar-map/yearFactValues';
import { LayerPanel } from '../features/lunar-map/LayerPanel';
import { layerDisplays, previewsOnly, unshadedBelowZ } from '../features/lunar-map/mapLayerState';
import { useLayerReadings } from '../features/lunar-map/useLayerReadings';
import { useMapLayerSettings } from '../features/lunar-map/useMapLayerSettings';
import { useVisibilityLayer } from '../features/lunar-map/useVisibilityLayer';
import { readingSource } from '../features/lunar-map/visibilityLayer';
import { positionsOf } from '../features/lunar-map/horizonsPositions';
import { useHorizonsSeries } from '../features/lunar-map/useHorizonsSeries';
import { followRange, useRangeWindows } from '../features/time/barRange';
import { TimeBar } from '../features/time/TimeBar';
import { TimeProvider } from '../features/time/TimeProvider';
import { useTime } from '../features/time/timeContext';
import { PowerLabDialog, PowerLabPanel } from '../features/powerlab/PowerLabPanel';
import { LocationStep } from '../features/wizard/LocationStep';
import { DEFAULT_MISSION_NAME, MissionStep } from '../features/wizard/MissionStep';
import { Wizard } from '../features/wizard/Wizard';
import {
  STARTING_DRAFT,
  WIZARD_STEPS,
  canOpen,
  defaultDates,
  type WizardInputs,
} from '../features/wizard/wizardSteps';
import { joinClassNames } from '../utils/classNames';
import { hourlySky, sampledSpan, siteSky, type SiteSky } from '../utils/skyVisibility';
import { rangeWords, type TimeRange, type TimeWindowMs } from '../utils/time';
import { readShareHash, shareHash, type ShareState } from '../utils/shareLink';
import type { LatLon } from '../utils/lunarSky';
import { checkPoint, pointLabel } from '../data/pointCheck';
import { parseCoordinateQuery } from '../utils/selenographic';
import {
  HORIZONS_COVERAGE,
  positionsSource,
  siteSamples,
  type HorizonsSeries,
} from '../services/horizonsData';
import { MAP_LAYERS, layerFileUrl, type MapLayer } from '../services/mapLayers';
import { viewInHorizonsUrl } from '../services/horizonsQuery';
import { SITES } from '../services/sites';
import type { PositionSamples } from '../utils/riseSet';
import { loadUiPrefs, saveUiPrefs } from '../utils/uiPrefs';
import { APP_NAME, BRAND_NAME, DOCUMENT_TITLE, NON_ENDORSEMENT } from './appInfo';
import { VISIBILITY_VERIFIED } from './featureFlags';
import { useStableCallback } from './useStableCallback';
import { useViewInsets } from './useViewInsets';
import styles from './App.module.css';

// CesiumJS is large, so the map loads as its own chunk; the panels render straight away. It is
// memoised: opening or closing a panel never re-renders the globe (its props stay the same).
const MoonGlobe = lazy(() =>
  import('../features/lunar-map/MoonGlobe').then((module) => ({
    default: memo(module.MoonGlobe),
  })),
);

/** Below this width the left panel covers most of the map: it starts closed there. */
const NARROW_QUERY = '(max-width: 899px)';

/** What the one floating left panel shows: the four-step plan, or Compare. */
type LeftPanel = 'plan' | 'compare' | 'power';

/** The timeline's id: the skip button's target. */
const TIMELINE_ID = 'timeline';

/** The "press H" hint shows once, for this long. */
const KEY_HINT_MS = 6_000;
/** On entering presentation mode, "Esc to exit" shows for this long. */
const EXIT_HINT_MS = 3_500;
/** The compare panel holds at most this many sites. */
const COMPARE_MAX = 4;
/** Presentation mode's slide and fade (App.module.css --duration-present), plus a frame. */
const PRESENT_MOVE_MS = 300;
/** The wizard's mission: the user's own, one at a time. */
const WIZARD_MISSION_ID = 'custom-wizard';
/** How many of the user's own locations Compare offers (the most recent first). */
const RECENT_POINTS_MAX = 4;
/** A point's id in Compare (two decimals, as the share link keeps it). */
function pointId(point: LatLon): string {
  return `point:${point.lat.toFixed(2)},${point.lon.toFixed(2)}`;
}
/**
 * A past landing whose coordinates match typed ones (within 0.001°, about 30 m): it is used as that
 * site, with its JPL Horizons files (docs/LANDER_RULES.md, "Sun and Earth positions").
 */
function siteAt(point: LatLon): string | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.001;
  const lon = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;
  return (
    SITES.find((site) => near(site.lat, point.lat) && near(lon(site.lon), lon(point.lon)))?.id ??
    null
  );
}
/** "-87.70, -19.40": a point as the box shows it, two decimals, south and west negative. */
function coordsText(point: LatLon): string {
  return `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`;
}
/** The point a box's text holds, or null when it cannot be read. */
function readCoords(text: string): LatLon | null {
  const result = parseCoordinateQuery(text);
  return result.ok ? { lat: result.value.lat, lon: result.value.lon } : null;
}
/** The Results step's index. */
const RESULTS_STEP = WIZARD_STEPS.length - 1;

function matches(query: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
  return window.matchMedia(query).matches;
}

function isNarrow(): boolean {
  return matches(NARROW_QUERY, false);
}

/** Inputs that take typed text; a slider, checkbox or button keeps the shortcuts working. */
const NON_TEXT_INPUTS = new Set([
  'range',
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'color',
]);

/** True while the user is typing, so single-letter shortcuts stay out of the way. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target.isContentEditable || ['SELECT', 'TEXTAREA'].includes(target.tagName);
}

/**
 * Every site's real Sun and Earth shares, hours and windows for a mission over a range: from a
 * site's JPL Horizons series where it covers the hour, from the engine elsewhere (docs/
 * LANDER_RULES.md, "Sun and Earth positions: JPL Horizons"). Engine samples are cached across
 * ranges (skyVisibility), so a range that slid by a day only computes the new day.
 */
function skyBySite(
  range: TimeRange,
  mission: DemoMission,
  series: ReadonlyMap<string, HorizonsSeries>,
): ReadonlyMap<string, SiteSky> {
  const span = sampledSpan(range);
  return new Map(
    SITES.map((site) => [
      site.id,
      siteSky(
        siteSamples(series.get(site.id) ?? null, site, span).samples,
        site,
        mission,
        range,
        terrainProfileFor(site.id),
      ),
    ]),
  );
}

const NO_WINDOWS: readonly TimeWindowMs[] = [];
const NO_MAP_LAYERS: readonly MapLayer[] = [];

/** The wizard's form from a shared mission, or the starting values. */
function initialDraft(shared: Partial<ShareState>): MissionDraft {
  const mission = shared.mission;
  if (!mission) return STARTING_DRAFT;
  return {
    name: mission.name,
    values: {
      minSunElevationDeg: String(mission.minSunElevationDeg),
      minEarthElevationDeg: String(mission.minEarthElevationDeg),
      daysNeeded: String(mission.daysNeeded),
    },
    hasRelay: mission.hasRelay,
  };
}

/** The app: one shared clock around the workspace. */
export function App() {
  // A shared link (#name=…&site=… or &at=…&t=…) opens the same view, at its exact time.
  const [shared] = useState(() =>
    readShareHash(typeof window === 'undefined' ? '' : window.location.hash, {
      siteIds: SITES.map((site) => site.id),
    }),
  );
  useEffect(() => {
    // Read once, the link has done its job: the address goes back to plain, so a later reload
    // opens the app as usual (live), not the shared moment again.
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    // Another link pasted into this tab changes only the hash: open it.
    const onHashChange = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return (
    <TimeProvider initialTime={shared.time}>
      <Workspace shared={shared} />
    </TimeProvider>
  );
}

/**
 * The Moon fills the window. Over it float the top row (logo and breadcrumb), the menu rail, the
 * left panel (the four-step plan: Location, Mission, Dates, Results; or Compare), the map's icon
 * column on the right and, on the Results step, the status line and the timeline. The sites are
 * real landings (src/services/sites.ts), the Sun and Earth are real, and the mission's needs are
 * the user's own.
 */
function Workspace({ shared }: { shared: Partial<ShareState> }) {
  const { time, range, editorOpen, setTime } = useTime();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(() => shared.siteId ?? null);
  // A point picked anywhere on the Moon (instead of a site): its card, pin and windows.
  const [pickedPoint, setPickedPoint] = useState<LatLon | null>(() =>
    shared.siteId ? null : (shared.point ?? null),
  );
  // The Location step's coordinate box: filled by a map click or a chip, typed into, read for Next.
  const [coordText, setCoordText] = useState(() => {
    const site = SITES.find((entry) => entry.id === shared.siteId);
    const point = site ?? (shared.siteId ? null : (shared.point ?? null));
    return point ? coordsText(point) : '';
  });
  const typedPoint = readCoords(coordText);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  // The mission as typed in the wizard (kept while stepping back and forth, and in a shared link).
  const [missionDraftTyped, setMissionDraft] = useState<MissionDraft>(() => initialDraft(shared));
  // An empty name is "My lander": the name never blocks Next.
  const missionDraft = useMemo(
    () => ({ ...missionDraftTyped, name: missionDraftTyped.name.trim() || DEFAULT_MISSION_NAME }),
    [missionDraftTyped],
  );
  const missionValid = Object.keys(validateDraft(missionDraft)).length === 0;
  const mission = useMemo(
    () =>
      missionFromDraft(
        missionValid ? missionDraft : STARTING_DRAFT,
        WIZARD_MISSION_ID,
        missionValid ? missionDraft.name.trim() : DEFAULT_MISSION_NAME,
      ),
    [missionDraft, missionValid],
  );
  // The night load (W) the night-survival block uses: the lab's starting value.
  // The Moon Power Lab pop-up ("Design your own battery →").
  const [powerDialogOpen, setPowerDialogOpen] = useState(false);
  // The dates to check: today and the next 14 days unless a link gave others.
  const [dateRange, setDateRangeState] = useState<DateRange | null>(() =>
    shared.dates && dateRangeError(shared.dates) === null ? shared.dates : defaultDates(Date.now()),
  );
  const datesValid = dateRange !== null && dateRangeError(dateRange) === null;
  const wizardInputs: WizardInputs = {
    // Next works as soon as the box holds a valid point.
    hasLocation: typedPoint !== null,
    missionValid,
    datesValid,
  };
  // A complete shared link opens on its results; anything else starts at Location.
  const [step, setStepState] = useState(() =>
    canOpen(RESULTS_STEP, {
      hasLocation: shared.siteId !== undefined || shared.point !== undefined,
      missionValid: shared.mission !== undefined && missionValid,
      datesValid,
    })
      ? RESULTS_STEP
      : 0,
  );
  const setStep = (next: number) => {
    if (!canOpen(next, wizardInputs)) return;
    // Leaving Location with a point typed but not sent with Go: it becomes the location now.
    if (step === 0 && next > 0 && typedPoint) {
      const here = selectedSite?.site ?? pickedPoint;
      if (!here || coordsText(here) !== coordsText(typedPoint)) goToPointRef.current(typedPoint);
    }
    setStepState(next);
  };
  const goToPointRef = useRef<(point: LatLon) => void>(() => undefined);
  // "More details": the second panel beside the wizard, and which of its sections is open.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSection, setDetailsSection] = useState<DetailsSection | null>(null);
  const detailsId = useId();

  // The map layers (elevation, slope; docs/LANDER_RULES.md "Map layers"): switches, opacities,
  // the layer readings come from, and the images the globe draws. Fixed in time.
  const mapLayerList = MAP_LAYERS?.layers ?? NO_MAP_LAYERS;
  const layerSettings = useMapLayerSettings(mapLayerList);
  // Phones keep the low-resolution (512 px) images; everything else draws the full ones.
  const [layerPreviewOnly] = useState(() =>
    typeof window === 'undefined' ? false : previewsOnly(window.innerWidth),
  );
  const mapLayerDisplays = useMemo(
    () => layerDisplays(mapLayerList, layerSettings.settings, layerFileUrl, layerPreviewOnly),
    [mapLayerList, layerSettings.settings, layerPreviewOnly],
  );
  // The visibility prototype (docs/LANDER_RULES.md, "Visibility prototype layer"): Sun and Earth,
  // one supplied frame per 10 minutes, snapped from the app's time. Display only.
  const visibility = useVisibilityLayer(time);
  // The globe's Sun-and-relief shading stops south of the elevation and slope layers' coverage
  // while one of them is visible (they are opaque colour maps). The visibility overlay never
  // touches it: its transparent pixels must leave the terrain exactly as it was, so with it on at
  // any opacity the globe underneath is shaded as with it off (docs/LANDER_RULES.md).
  const layerShadeCutZ = unshadedBelowZ(mapLayerDisplays, MAP_LAYERS?.coverMaxLatDeg ?? -80);
  // Layers some of whose images failed to load; switching one on again clears it (and retries).
  const [layerFailures, setLayerFailures] = useState<readonly string[]>([]);
  const toggleMapLayer = (layerId: string) => {
    setLayerFailures((ids) => ids.filter((id) => id !== layerId));
    // A map layer switched on takes the readings, as the most recently switched-on layer.
    if (!layerSettings.settings[layerId]?.visible) visibility.setPrefer(null);
    layerSettings.toggle(layerId);
  };
  const reportLayerFailure = useStableCallback((layerId: string) =>
    setLayerFailures((ids) => (ids.includes(layerId) ? ids : [...ids, layerId])),
  );
  // The time bar is closed (a small "Time" button) until opened, and opens by itself when step 4
  // shows. A shared link that opens on its results has it open.
  const [timeBarFolded, setTimeBarFolded] = useState(step !== RESULTS_STEP);
  const [layersOpen, setLayersOpen] = useState(false);
  const layersOpenRef = useRef(layersOpen);
  useEffect(() => {
    layersOpenRef.current = layersOpen;
  });
  // The map layers' panel opens from the map's icon column.
  // Only one floating thing is open at a time: opening Layers closes the time bar.
  const toggleLayersPanel = useStableCallback(() => {
    setLayersOpen((open) => !open);
    setTimeBarFolded(true);
  });
  // The readout: the active layer's value under the pointer (desktop) or at the tapped spot.
  const [hoverGround, setHoverGround] = useState<LatLon | null>(null);
  const anyLayerVisible = layerSettings.anyVisible || visibility.shown.length > 0;
  // With every layer off, no hover point is kept (and no value tile is read).
  if (!anyLayerVisible && hoverGround !== null) setHoverGround(null);
  const readingFrom = readingSource(layerSettings.activeId, visibility.shown, visibility.prefer);
  // A tap (the picked point) gives the reading on touch screens, where there is no hover.
  const readingPoint = hoverGround ?? (anyLayerVisible ? pickedPoint : null);
  const visibleMapLayers = useMemo(
    () => mapLayerList.filter((layer) => layerSettings.settings[layer.id]?.visible),
    [mapLayerList, layerSettings.settings],
  );
  const layerReadings = useLayerReadings(visibleMapLayers, readingPoint);
  const visibilityTarget = readingFrom?.kind === 'visibility' ? readingFrom.target : null;
  const visibilityReadout = visibilityTarget
    ? visibility.readAt(visibilityTarget, readingPoint)
    : null;
  // Development builds only (Vite strips this from production): a handle for browser checks to
  // set what the UI no longer offers (an overlay's opacity) and to read the hovered ground point.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const target = window as Window & { __starreactionTest?: unknown };
    target.__starreactionTest = {
      visibility: {
        settings: visibility.settings,
        display: visibility.display,
        show: visibility.show,
        toggle: visibility.toggle,
        setOpacity: visibility.setOpacity,
      },
      hoverGround,
      setTime,
    };
    return () => {
      delete target.__starreactionTest;
    };
  });
  const [imageryStatus, setImageryStatus] = useState<ImageryStatus>('loading');
  const [prefs] = useState(loadUiPrefs);
  // The left panel: which view it shows, and whether it is out or slid away (remembered; closed
  // on narrow screens at first, unless a link opened a place).
  const [panelView, setPanelView] = useState<LeftPanel>('plan');
  const [panelOpen, setPanelOpenState] = useState(
    () =>
      shared.siteId !== undefined ||
      shared.point !== undefined ||
      (!isNarrow() && prefs.panelClosed !== true),
  );
  const leftPanel: LeftPanel | null = panelOpen ? panelView : null;
  const setLeftPanel = (next: LeftPanel | null) => {
    if (next === null) {
      setPanelOpenState(false);
      return;
    }
    setPanelView(next);
    setPanelOpenState(true);
  };
  // The user's own open or close (rail, handle, Escape): remembered for the next visit.
  const setPanelOpen = (open: boolean) => {
    setPanelOpenState(open);
    saveUiPrefs({ panelClosed: !open });
  };
  // What the last Share did ("Link copied"), shown under the results for a while.
  const [shareNote, setShareNote] = useState<string | null>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [stepSeen, setStepSeen] = useState(step);
  if (step !== stepSeen) {
    setStepSeen(step);
    if (step === RESULTS_STEP) {
      setTimeBarFolded(false);
      setLayersOpen(false);
    }
  }
  const [about, setAbout] = useState<{ open: boolean; tab: AboutTab }>({
    open: false,
    tab: 'about',
  });
  const aboutOpenerRef = useRef<HTMLElement | null>(null);
  // The map's camera (Top and 3D live in the map's own controls).
  const mapControllerRef = useRef<MapController | null>(null);
  const [keyHint, setKeyHint] = useState(false);
  // Presentation mode hides the chrome (top row, status strip, map controls, the left panel)
  // without touching what the panel shows, so leaving it puts everything back as it was.
  const [presenting, setPresenting] = useState(false);
  const [exitHint, setExitHint] = useState(false);
  // True while presentation mode fades in or out.
  const [presentMoving, setPresentMoving] = useState(false);
  // Sites picked for comparing (in pick order). Closing the compare panel keeps the picks.
  const [compareIds, setCompareIds] = useState<readonly string[]>([]);
  // The points the user chose (typed or clicked), the most recent first, for Compare.
  const [recentPoints, setRecentPoints] = useState<readonly LatLon[]>(() =>
    shared.point ? [shared.point] : [],
  );
  const compareOpen = leftPanel === 'compare';
  const mapRef = useRef<HTMLElement>(null);
  const viewAreaRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const noTopRef = useRef<HTMLDivElement>(null);
  // The Moon is framed below whichever top layer is showing: the status strip, or in
  // presentation mode the small site label. Neither moves (they only fade), so it is exact.
  const viewInsets = useViewInsets(mapRef, viewAreaRef, presenting ? labelRef : noTopRef);
  const comparePanelId = useId();
  const leftPanelId = useId();

  // The fixed sites' JPL Horizons positions: empty until they load (the engine meanwhile).
  const { series: horizons, settled: horizonsSettled } = useHorizonsSeries();
  const positions = useMemo(
    () => new Map([...horizons].map(([id, series]) => [id, positionsOf(series)])),
    [horizons],
  );
  const positionsFor = useCallback(
    (siteId: string): PositionSamples | null => positions.get(siteId) ?? null,
    [positions],
  );
  // Light, water and Earth over the year per site (Earth from the Horizons series once loaded).
  const yearFactsBySite = useMemo(
    () =>
      new Map(
        SITES.map((site) => [
          site.id,
          yearFacts(
            site,
            horizons.get(site.id) ?? null,
            terrainProfileFor(site.id),
            horizonsSettled,
          ),
        ]),
      ),
    [horizons, horizonsSettled],
  );
  const yearFactsFor = useCallback(
    (siteId: string) => yearFactsBySite.get(siteId) ?? [],
    [yearFactsBySite],
  );
  const pickedRange = useMemo(
    () => (dateRange && datesValid ? toTimeRange(dateRange) : null),
    [dateRange, datesValid],
  );
  const checkRange = pickedRange ?? range;
  // Computed when the range, the mission or the sites change; not per tick. Not deferred: a
  // deferred range restarted on every playback tick (100 ms) or map hover and never caught up, so
  // Results kept the previous dates' numbers. The picked dates do not move with the playhead, so
  // this runs only when the dates or the mission change.
  const skyRange = checkRange;
  const sky = useMemo(() => skyBySite(skyRange, mission, horizons), [skyRange, mission, horizons]);
  const rankedSites = useMemo(
    () => rankSites(SITES, mission, sky, skyRange, 'window'),
    [mission, sky, skyRange],
  );
  const selectedSite = rankedSites.find((entry) => entry.site.id === selectedSiteId) ?? null;
  const pointCheck = useMemo(
    () =>
      pickedPoint
        ? checkPoint(pickedPoint, mission, hourlySky(sampledSpan(skyRange)), skyRange)
        : null,
    [pickedPoint, mission, skyRange],
  );
  const locationName = selectedSite
    ? selectedSite.site.name
    : pickedPoint
      ? pointLabel(pickedPoint)
      : null;
  // The time bar shows the windows of the chosen place.
  const timelineWindows: readonly TimeWindowMs[] = pointCheck
    ? pointCheck.assessment.sky.windows
    : (selectedSite?.assessment.sky.windows ?? NO_WINDOWS);
  // The compare columns, from the same checks as everything else: the longest usable window first.
  const compareEntries: CompareEntry[] = compareIds
    .flatMap((id): CompareEntry[] => {
      const entry = rankedSites.find((item) => item.site.id === id);
      if (entry) return [entry];
      const point = recentPoints.find((item) => pointId(item) === id);
      if (!point) return [];
      // The same checks a point gets in Results (docs/LANDER_RULES.md, "Anywhere on the Moon").
      const check = checkPoint(point, mission, hourlySky(sampledSpan(skyRange)), skyRange);
      return [
        {
          site: { id, name: pointLabel(point), lat: point.lat, lon: point.lon },
          assessment: check.assessment,
          rank: null,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.assessment.usableDays - a.assessment.usableDays || a.site.name.localeCompare(b.site.name),
    );
  const compareShown = compareOpen && !presenting;
  // "Full comparison": the table, in a panel to the right of Compare.
  const [compareFullOpen, setCompareFullOpen] = useState(false);
  const compareFullShown = compareFullOpen && compareShown && compareEntries.length >= 2;
  const compareFullId = useId();

  // Ctrl+wheel (touchpad pinch) anywhere over the map area never zooms the browser page. Over the
  // canvas and map controls the map zooms instead; over the other overlays it is ignored.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const stopPageZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    map.addEventListener('wheel', stopPageZoom, { passive: false });
    return () => map.removeEventListener('wheel', stopPageZoom);
  }, []);

  // Escape: Compare goes back to the plan; the plan slides the panel away.
  const closePanel = () => {
    if (leftPanel === 'compare' || leftPanel === 'power') {
      setLeftPanel('plan');
      return;
    }
    setPanelOpen(false);
  };
  // The rail: a view item opens its view, or slides the panel away when it is already showing.
  const railActive: RailItem | null = leftPanel;
  const selectRail = (item: RailItem, opener: HTMLElement) => {
    if (item === 'about') {
      openAbout('about', opener);
      return;
    }
    // Plan, Compare and Power Lab close both floating things.
    setLayersOpen(false);
    setTimeBarFolded(true);
    if (railActive === item) {
      setPanelOpen(false);
      return;
    }
    setLeftPanel(item);
    setPanelOpen(true);
  };
  const openStep = (next: number) => {
    setLeftPanel('plan');
    setPanelOpen(true);
    setStep(next);
  };
  // The map's visible area already starts beside the panel (the stage shifts with it), so a flight
  // needs no extra aim for the panel.
  const coveredLeft = useCallback(() => 0, []);

  // The present button, H (when not typing) and Escape all go through here.
  const setPresentation = (on: boolean) => {
    setPresenting(on);
    setPresentMoving(true);
    setExitHint(on);
    setKeyHint(false);
  };
  const presentingRef = useRef(presenting);
  useEffect(() => {
    presentingRef.current = presenting;
  });
  const overlayOpen = about.open || editorOpen || powerDialogOpen;
  const closePanelRef = useRef<() => void>(() => undefined);
  const leftPanelOpenRef = useRef(leftPanel !== null);
  useEffect(() => {
    leftPanelOpenRef.current = leftPanel !== null;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape always leaves presentation mode, wherever the focus is (an open dialog takes it
      // first and stops it).
      if (event.key === 'Escape' && presentingRef.current && !overlayOpen) {
        setPresentation(false);
        return;
      }
      if (overlayOpen || isTyping(event.target)) return;
      // Escape closes the Layers popup first, then the top panel.
      if (event.key === 'Escape' && layersOpenRef.current) {
        setLayersOpen(false);
        return;
      }
      if (event.key === 'Escape' && leftPanelOpenRef.current) {
        closePanelRef.current();
        return;
      }
      if (event.key.toLowerCase() !== 'h' || event.ctrlKey || event.metaKey || event.altKey) return;
      setPresentation(!presentingRef.current);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [overlayOpen]);

  useEffect(() => {
    if (!presentMoving) return undefined;
    const timer = window.setTimeout(() => setPresentMoving(false), PRESENT_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [presentMoving, presenting]);

  useEffect(() => {
    if (!exitHint) return undefined;
    const timer = window.setTimeout(() => setExitHint(false), EXIT_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [exitHint]);

  // The H hint shows once per browser.
  useEffect(() => {
    if (prefs.keyHintSeen === true) return undefined;
    // Counted as seen when it shows (an effect set up and torn down at once never shows it).
    const show = window.setTimeout(() => {
      saveUiPrefs({ keyHintSeen: true });
      setKeyHint(true);
    }, 600);
    const hide = window.setTimeout(() => setKeyHint(false), 600 + KEY_HINT_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
      setKeyHint(false);
    };
  }, [prefs.keyHintSeen]);

  const openAbout = (tab: AboutTab, opener: HTMLElement) => {
    aboutOpenerRef.current = opener;
    setAbout({ open: true, tab });
  };
  const closeAbout = () => {
    setAbout((current) => ({ ...current, open: false }));
    aboutOpenerRef.current?.focus();
  };

  // Picked dates move the app's time to their start, so the time bar shows the range's first days.
  const setDateRange = (next: DateRange | null) => {
    setDateRangeState(next);
    if (next && dateRangeError(next) === null) {
      setTime(next.startMs);
      // The time bar shows the dates just set, from the start date.
      setTimeBarFolded(false);
      setLayersOpen(false);
    }
  };
  // A recommended window's "Go": its dates become the step 3 dates, so Results, the time bar and
  // every check use exactly them.
  const goToWindow = (window: GoodWindow) => setDateRange(windowDates(window));

  // Choosing a past landing: the location, and the camera centres on it.
  const selectSite = (siteId: string) => {
    const site = SITES.find((entry) => entry.id === siteId);
    if (site) setCoordText(coordsText(site));
    setSelectedSiteId(siteId);
    setPickedPoint(null);
    setFlyRequest((previous) => ({ siteId, seq: (previous?.seq ?? 0) + 1 }));
  };
  // A click on bare ground: that spot is the location. No flight: the user is already looking at it.
  // Every point chosen is kept (the most recent first) so Compare can offer it.
  const rememberPoint = (point: LatLon) =>
    setRecentPoints((current) =>
      [point, ...current.filter((item) => pointId(item) !== pointId(point))].slice(
        0,
        RECENT_POINTS_MAX,
      ),
    );
  // With Compare open, a map click or typed coordinates add that spot to Compare instead.
  const addPointToCompare = (point: LatLon) => {
    // Typed coordinates of a past landing: that site, with its Horizons files.
    const site = siteAt(point);
    if (site) {
      setCompareIds((current) =>
        current.includes(site) || current.length >= COMPARE_MAX ? current : [...current, site],
      );
      return;
    }
    rememberPoint(point);
    const id = pointId(point);
    setCompareIds((current) =>
      current.includes(id) || current.length >= COMPARE_MAX ? current : [...current, id],
    );
  };
  const pickPoint = (point: LatLon) => {
    // A tap gives the layers' reading at the spot, not where a one-finger pan last moved.
    setHoverGround(null);
    if (compareOpen) {
      addPointToCompare(point);
      return;
    }
    rememberPoint(point);
    setCoordText(coordsText(point));
    setPickedPoint(point);
    setSelectedSiteId(null);
  };
  // Typed coordinates: like a click there, and the camera flies to it.
  const goToPoint = (point: LatLon) => {
    // Typed coordinates of a past landing: that site, with its Horizons files.
    const site = siteAt(point);
    if (site && !compareOpen) {
      selectSite(site);
      return;
    }
    pickPoint(point);
    setFlyRequest((previous) => ({ point, seq: (previous?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    goToPointRef.current = goToPoint;
  });
  // The map's handlers keep one identity, so the memoised globe does not re-render for them.
  const selectSiteFromMap = useStableCallback(selectSite);
  const pickPointFromMap = useStableCallback(pickPoint);
  const presentFromMap = useStableCallback(() => setPresentation(true));

  // Compare: pick or unpick a site (at most COMPARE_MAX), open and close the panel.
  const toggleCompare = (siteId: string) =>
    setCompareIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : current.length < COMPARE_MAX
          ? [...current, siteId]
          : current,
    );
  const closeCompare = () => {
    const panel = document.getElementById(comparePanelId);
    const hadFocus = panel?.contains(document.activeElement) ?? false;
    closePanel();
    if (hadFocus) leftPanelRef.current?.querySelector<HTMLElement>('h2')?.focus();
  };
  useEffect(() => {
    closePanelRef.current = compareOpen ? closeCompare : closePanel;
  });
  // "Compare with another location": the same mission and dates, this site already in.
  const compareWithAnother = () => {
    if (selectedSiteId && !compareIds.includes(selectedSiteId)) toggleCompare(selectedSiteId);
    if (pickedPoint) addPointToCompare(pickedPoint);
    setLeftPanel('compare');
  };

  // Share: the mission, the site or point and the exact time in the link's hash.
  const shareView = async () => {
    const hash = shareHash({
      mission: missionValid
        ? {
            name: mission.name,
            minSunElevationDeg: mission.minSunElevationDeg,
            minEarthElevationDeg: mission.minEarthElevationDeg,
            daysNeeded: mission.daysNeeded,
            hasRelay: mission.hasRelay,
          }
        : null,
      dates: dateRange,
      siteId: selectedSiteId,
      point: pickedPoint,
      time,
    });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    // A phone or tablet gets the share sheet. A laptop copies the link and says so: desktop
    // browsers also offer a share sheet, which would hide where the link went.
    if (matches('(pointer: coarse)', false) && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: DOCUMENT_TITLE, url });
      } catch {
        // Cancelled from the share sheet: nothing to say.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied.');
    } catch {
      setShareNote(`Copy this link: ${url}`);
    }
  };
  useEffect(() => {
    if (!shareNote) return undefined;
    const timer = window.setTimeout(() => setShareNote(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [shareNote]);

  // A column header shows its site on the map without leaving Compare.
  const showComparedSite = (siteId: string) => {
    const point = recentPoints.find((item) => pointId(item) === siteId);
    setFlyRequest((previous) =>
      point ? { point, seq: (previous?.seq ?? 0) + 1 } : { siteId, seq: (previous?.seq ?? 0) + 1 },
    );
  };

  // Opening the time bar closes Layers.
  const foldTimeBar = (folded: boolean) => {
    setTimeBarFolded(folded);
    if (!folded) setLayersOpen(false);
  };

  const place: LatLon | null = selectedSite?.site ?? pickedPoint;
  const placeSeries = selectedSite ? (horizons.get(selectedSite.site.id) ?? null) : null;
  const placePositions = selectedSiteId ? positionsFor(selectedSiteId) : null;
  const placeTerrain = selectedSite ? terrainProfileFor(selectedSite.site.id) : null;
  // "Other recommended dates": the good windows from the step 3 start, worked out on step 4 only.
  const windows = useGoodWindows(
    place,
    mission,
    dateRange?.startMs ?? time,
    placeSeries,
    placeTerrain,
    dateRange?.startMs ?? null,
    step === RESULTS_STEP && missionValid,
  );
  const placeAssessment = selectedSite?.assessment ?? pointCheck?.assessment ?? null;
  // The time bar follows the playhead: past the end (or before the start) of the shown range, the
  // range moves with the same width, inside the data; its shading is worked out for the new dates.
  const [followed, setFollowed] = useState<TimeRange | null>(null);
  const [followedFor, setFollowedFor] = useState<TimeRange | null>(pickedRange);
  if (followedFor !== pickedRange) {
    setFollowedFor(pickedRange);
    setFollowed(null);
  }
  const shownBase = pickedRange ? (followed ?? pickedRange) : null;
  const follow = shownBase ? followRange(shownBase, time, HORIZONS_COVERAGE) : null;
  if (follow && follow.range !== shownBase) setFollowed(follow.range);
  const barRange = follow?.range ?? null;
  const barMoved = barRange !== null && barRange !== pickedRange;
  const movedWindows = useRangeWindows(
    barMoved ? place : null,
    mission,
    barMoved ? barRange : null,
    placeSeries,
    placeTerrain,
  );
  // The year's rows with a value; rows still unavailable are left out until their data exists.
  const placeYearFacts = (selectedSite ? yearFactsFor(selectedSite.site.id) : []).filter(
    (fact) => fact.status !== 'Unavailable',
  );
  const showDetails = detailsOpen && step === RESULTS_STEP && leftPanel === 'plan' && !presenting;
  const openDetails = (section: DetailsSection | null) => {
    setDetailsSection(section);
    setDetailsOpen(true);
  };

  const blockedText =
    step === 1 && !missionValid
      ? 'Put the needs inside the ranges to go on.'
      : step === 2 && !datesValid
        ? 'Pick valid dates to go on.'
        : null;

  const results =
    place && placeAssessment ? (
      <ResultsCard
        name={selectedSite ? selectedSite.site.name : pointLabel(place)}
        meta={selectedSite ? 'Past landing' : 'Your point'}
        assessment={placeAssessment}
        mission={mission}
        dataSource={selectedSite ? positionsSource(placeSeries, skyRange) : 'engine'}
        windows={windows}
        onGo={goToWindow}
        onCompare={compareWithAnother}
        onMoreDetails={() => (detailsOpen ? setDetailsOpen(false) : openDetails(null))}
        detailsOpen={showDetails}
      />
    ) : null;

  const stepContent = [
    <LocationStep
      key="location"
      sites={SITES}
      coordText={coordText}
      onCoordText={setCoordText}
      point={typedPoint}
      selectedSiteId={selectedSiteId}
      onSelectSite={selectSite}
      onGoToPoint={goToPoint}
    />,
    <MissionStep key="mission" draft={missionDraftTyped} onChange={setMissionDraft} />,
    <DateRangePicker key="dates" value={dateRange} onChange={setDateRange} withActions={false} />,
    <div key="results">{results}</div>,
  ];

  return (
    <div
      className={joinClassNames(
        styles.shell,
        leftPanel !== null && !presenting && styles.panelOpen,
        timeBarFolded && styles.timeBarFolded,
        presenting && styles.presenting,
        presentMoving && styles.presentMoving,
      )}
    >
      {/* Keyboard: straight past the top row, rail and panel to the timeline. Shown on focus. */}
      <button
        type="button"
        className={styles.skip}
        onClick={() => document.getElementById(TIMELINE_ID)?.focus()}
      >
        Skip to the timeline
      </button>
      {/* The top row lies over the map, so hiding it never resizes the map. */}
      <div className={styles.topBar} inert={presenting} aria-hidden={presenting || undefined}>
        <TopBar
          brand={BRAND_NAME}
          product={APP_NAME}
          breadcrumb={
            <Breadcrumb
              locationName={locationName}
              missionName={missionValid ? mission.name : null}
              current={step >= 1 && missionValid ? 'mission' : locationName ? 'location' : 'moon'}
              onLocation={() => openStep(0)}
              onMission={() => openStep(1)}
            />
          }
        />
      </div>
      {presenting ? <PresentExit onExit={() => setPresentation(false)} /> : null}

      <div className={styles.workspace}>
        {/* Before the map in the DOM, so Tab follows the screen: top row, rail, panel, map. */}
        <div className={styles.railLayer} inert={presenting} aria-hidden={presenting || undefined}>
          <MenuRail
            active={railActive}
            onSelect={selectRail}
            panelId={leftPanelId}
            compareCount={compareIds.length}
            showLogo={leftPanel === null}
          />
        </div>
        <FloatingPanel
          id={leftPanelId}
          open={leftPanel !== null}
          onToggle={() => setPanelOpen(!panelOpen)}
          hidden={presenting}
          panelRef={leftPanelRef}
          brand={BRAND_NAME}
        >
          {/* Views stay put while the panel slides away, so it never empties mid-slide. */}
          <div className={styles.view} hidden={panelView !== 'plan'} data-panel-view="plan">
            <Wizard step={step} onStep={setStep} inputs={wizardInputs} blockedText={blockedText}>
              {stepContent[step]}
            </Wizard>
          </div>
          <div className={styles.view} hidden={panelView !== 'power'} data-panel-view="power">
            <PowerLabPanel />
          </div>
          <div className={styles.view} hidden={panelView !== 'compare'} data-panel-view="compare">
            <div className={styles.compareAdd}>
              <div className={styles.compareRow} role="group" aria-label="Past landings to compare">
                <span className={styles.compareAddLabel}>Past landings</span>
                {SITES.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    className={styles.compareChip}
                    aria-pressed={compareIds.includes(site.id)}
                    disabled={!compareIds.includes(site.id) && compareIds.length >= COMPARE_MAX}
                    onClick={() => toggleCompare(site.id)}
                  >
                    {site.name}
                  </button>
                ))}
              </div>
              <div
                className={styles.compareRow}
                role="group"
                aria-label="Your locations to compare"
              >
                <span className={styles.compareAddLabel}>Your locations</span>
                {recentPoints.length === 0 ? (
                  <span className={styles.stepNote}>
                    Click the map or type coordinates below to add one.
                  </span>
                ) : (
                  recentPoints.map((point) => {
                    const id = pointId(point);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={styles.compareChip}
                        aria-pressed={compareIds.includes(id)}
                        disabled={!compareIds.includes(id) && compareIds.length >= COMPARE_MAX}
                        onClick={() => toggleCompare(id)}
                      >
                        {pointLabel(point)}
                      </button>
                    );
                  })
                )}
              </div>
              <CoordinateSearch onGo={addPointToCompare} />
            </div>
            <ComparePanel
              id={comparePanelId}
              entries={compareEntries}
              mission={mission}
              compareMax={COMPARE_MAX}
              onRemove={toggleCompare}
              onClear={() => setCompareIds([])}
              onClose={closeCompare}
              onSelectSite={showComparedSite}
              onFull={() => setCompareFullOpen(!compareFullOpen)}
              fullOpen={compareFullShown}
            />
          </div>
        </FloatingPanel>

        {compareFullShown ? (
          <div className={styles.detailsLayer}>
            <CompareFull
              id={compareFullId}
              entries={compareEntries}
              mission={mission}
              range={skyRange}
              onClose={() => setCompareFullOpen(false)}
              onSelectSite={showComparedSite}
            />
          </div>
        ) : null}

        {showDetails && place && placeAssessment ? (
          <div className={styles.detailsLayer}>
            <DetailsPanel
              id={detailsId}
              place={place}
              why={selectedSite?.site.why ?? null}
              nearest={
                pointCheck?.nearest
                  ? `Nearest past landing: ${pointCheck.nearest.site.name}, ${pointCheck.nearest.distanceKm.toLocaleString('en-US')} km`
                  : null
              }
              assessment={placeAssessment}
              mission={mission}
              time={time}
              range={skyRange}
              terrain={placeTerrain}
              series={placeSeries}
              positions={placePositions}
              yearFacts={placeYearFacts}
              landerId={selectedSite?.site.landerId ?? null}
              onDesignBattery={() => setPowerDialogOpen(true)}
              horizonsLinks={
                selectedSite
                  ? {
                      sun: viewInHorizonsUrl('sun', selectedSite.site, skyRange),
                      earth: viewInHorizonsUrl('earth', selectedSite.site, skyRange),
                    }
                  : null
              }
              share={{ onShare: () => void shareView(), note: shareNote }}
              open={detailsSection}
              onOpen={setDetailsSection}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
        ) : null}

        <main ref={mapRef} className={styles.map} aria-label="Lunar map">
          {/* A map that cannot start (no WebGL, a failed load) leaves the rest of the app working. */}
          <MapErrorBoundary>
            <Suspense fallback={<p className={styles.mapLoading}>Loading the lunar map…</p>}>
              <MoonGlobe
                rankedSites={rankedSites}
                selectedSiteId={selectedSiteId}
                hoveredSiteId={hoveredSiteId}
                onHoverSite={setHoveredSiteId}
                flyRequest={flyRequest}
                onSelectSite={selectSiteFromMap}
                pickedPoint={pickedPoint}
                onPickPoint={pickPointFromMap}
                showGrid={showGrid}
                onShowGridChange={setShowGrid}
                mapLayers={mapLayerDisplays}
                onHoverGround={anyLayerVisible ? setHoverGround : undefined}
                layerShadeCutZ={layerShadeCutZ}
                onLayerImagesFailed={reportLayerFailure}
                visibility={visibility.display}
                onVisibilityState={visibility.report}
                imageryStatus={imageryStatus}
                onImageryStatusChange={setImageryStatus}
                viewInsets={viewInsets}
                time={time}
                controlsHidden={presenting}
                comparedSiteIds={compareIds}
                controllerRef={mapControllerRef}
                idleDrift={false}
                onPresent={presentFromMap}
                getCoveredLeft={coveredLeft}
                missionWords="this mission"
              />
            </Suspense>
          </MapErrorBoundary>

          {!presenting ? (
            <div className={styles.layersLayer}>
              {layersOpen && mapLayerList.length > 0 ? (
                <LayerPanel
                  layers={mapLayerList}
                  settings={layerSettings.settings}
                  onToggle={toggleMapLayer}
                  readings={layerReadings}
                  onClose={() => setLayersOpen(false)}
                  failedIds={layerFailures}
                  visibility={
                    VISIBILITY_VERIFIED
                      ? {
                          settings: visibility.settings,
                          runtime: visibility.runtime,
                          frame: visibility.frame,
                          onToggle: visibility.toggle,
                          onChoose: visibility.choose,
                          onShow: visibility.show,
                          onOpacity: visibility.setOpacity,
                          activeTarget: visibilityTarget,
                          readout: visibilityReadout,
                        }
                      : undefined
                  }
                />
              ) : null}
              <div className={styles.layersRow}>
                {mapLayerList.length > 0 ? (
                  <button
                    type="button"
                    className={styles.layersButton}
                    aria-expanded={layersOpen}
                    onClick={toggleLayersPanel}
                  >
                    <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
                      <path
                        d="M10 3l7 4-7 4-7-4zM3 11l7 4 7-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Layers
                  </button>
                ) : null}
                {timeBarFolded ? (
                  <button
                    type="button"
                    id={TIMELINE_ID}
                    className={styles.layersButton}
                    aria-label="Open the time bar"
                    aria-expanded={false}
                    onClick={() => foldTimeBar(false)}
                  >
                    <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
                      <circle
                        cx="10"
                        cy="10"
                        r="6.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M10 6.5V10l2.5 1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Time
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Where the map frames the whole Moon: between the sidebars, above the time bar. */}
          <div ref={viewAreaRef} className={styles.viewArea} aria-hidden="true" />

          {/* Presentation mode: the chosen place, small, near the top where the bar was. */}
          <div
            ref={labelRef}
            className={joinClassNames(styles.middleTop, styles.labelLayer)}
            aria-hidden={!presenting || undefined}
            data-testid="present-label-layer"
          >
            {selectedSite || pointCheck ? (
              <p className={styles.presentLabel} data-testid="present-label">
                <span className={styles.presentName}>
                  {selectedSite
                    ? selectedSite.site.name
                    : `Your point ${pickedPoint ? pointLabel(pickedPoint) : ''}`}
                </span>
                {missionValid ? (
                  <span className={styles.presentScore}>
                    {(selectedSite?.assessment ?? pointCheck?.assessment)?.suitable
                      ? `Power and comms OK ${rangeWords(skyRange).now}`
                      : `Not suitable for this mission ${rangeWords(skyRange).now}`}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className={styles.middleBottom}>
            {keyHint ? (
              <p className={styles.keyHint} role="status">
                Tip: press <kbd>H</kbd> for presentation mode
              </p>
            ) : null}
            {presenting && exitHint ? (
              <p className={styles.keyHint} role="status">
                <kbd>Esc</kbd> to exit
              </p>
            ) : null}
            <TimeBar
              windows={barMoved && movedWindows ? movedWindows : timelineWindows}
              site={selectedSite?.site ?? pickedPoint ?? null}
              positions={selectedSite ? positionsFor(selectedSite.site.id) : null}
              folded={timeBarFolded}
              onFoldedChange={foldTimeBar}
              id={TIMELINE_ID}
              rangeOverride={barRange}
              limitNote={follow?.note ?? null}
              away={barMoved}
              onBackToDates={() => {
                // Only the view returns; the dates and the Results never changed.
                setFollowed(null);
                if (dateRange) setTime(dateRange.startMs);
              }}
            />
          </div>
        </main>
      </div>

      {powerDialogOpen ? <PowerLabDialog onClose={() => setPowerDialogOpen(false)} /> : null}

      {about.open ? (
        <AboutPanel
          tab={about.tab}
          onTabChange={(tab) => setAbout({ open: true, tab })}
          onClose={closeAbout}
          credits={<DataCredits imageryStatus={imageryStatus} />}
          nonEndorsement={NON_ENDORSEMENT}
          appName={APP_NAME}
        />
      ) : null}
    </div>
  );
}
