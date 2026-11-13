import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Breadcrumb } from '../components/Breadcrumb';
import { FloatingPanel } from '../components/FloatingPanel';
import { MenuRail, type RailItem } from '../components/MenuRail';
import { MissionPicker } from '../components/MissionPicker';
import { PanelView } from '../components/PanelView';
import { PresentExit } from '../components/PresentExit';
import { TopBar } from '../components/TopBar';
import {
  DEFAULT_DEMO_MISSION,
  DEMO_MISSIONS,
  bestSite,
  rankSites,
  type DemoMission,
  type SiteOrder,
} from '../data/demoData';
import { terrainProfileFor } from '../data/terrainPatches';
import { AboutPanel, type AboutTab } from '../features/about/AboutPanel';
import { ComparePanel } from '../features/compare/ComparePanel';
import { LessonsView } from '../features/lessons/LessonsView';
import { DataCredits } from '../features/lunar-map/DataCredits';
import { MapErrorBoundary } from '../features/lunar-map/MapErrorBoundary';
import type { FlyRequest } from '../features/lunar-map/MoonGlobe';
import type { ImageryStatus } from '../features/lunar-map/mapLabels';
import { DateRangePicker } from '../features/missions/DateRangePicker';
import {
  dateRangeError,
  dateRangeText,
  toTimeRange,
  type DateRange,
} from '../features/missions/dateRange';
import { MissionForm, type MissionPrefill } from '../features/missions/MissionForm';
import { SlipAssistant } from '../features/missions/SlipAssistant';
import type { SlipPlan } from '../features/missions/slipPlan';
import { slipSummary } from '../features/missions/slipSummary';
import {
  loadCustomMissions,
  missionFromDraft,
  newCustomId,
  saveCustomMissions,
  uniqueName,
  type MissionDraft,
} from '../features/missions/customMissions';
import type { MapController } from '../features/lunar-map/cameraControls';
import { PlaceReport } from '../features/lunar-map/PlaceReport';
import { PlanSidebar } from '../features/lunar-map/PlanSidebar';
import { SiteFacts } from '../features/lunar-map/SiteFacts';
import { YearFacts } from '../features/lunar-map/YearFacts';
import { yearFacts } from '../features/lunar-map/yearFactValues';
import { LayerPanel } from '../features/lunar-map/LayerPanel';
import { layerDisplays, previewsOnly, unshadedBelowZ } from '../features/lunar-map/mapLayerState';
import { useLayerReading } from '../features/lunar-map/useLayerReading';
import { useMapLayerSettings } from '../features/lunar-map/useMapLayerSettings';
import { useVisibilityLayer } from '../features/lunar-map/useVisibilityLayer';
import { readingSource } from '../features/lunar-map/visibilityLayer';
import { ENGINE_LABEL, positionsLabel, positionsOf } from '../features/lunar-map/horizonsPositions';
import { useHorizonsSeries } from '../features/lunar-map/useHorizonsSeries';
import { StatusStrip } from '../features/time/StatusStrip';
import { TimeBar } from '../features/time/TimeBar';
import { TimeProvider } from '../features/time/TimeProvider';
import { useTime, type PlaySpeedId } from '../features/time/timeContext';
import { Tour } from '../features/tour/Tour';
import { DEMO_STEPS, type DemoAction } from '../features/tour/demoSteps';
import { TOUR_STEPS } from '../features/tour/tourSteps';
import { joinClassNames } from '../utils/classNames';
import { hourlySky, sampledSpan, siteSky, type SiteSky } from '../utils/skyVisibility';
import { rangeWords, type TimeRange, type TimeWindowMs } from '../utils/time';
import { readShareHash, shareHash, type ShareState } from '../utils/shareLink';
import type { LatLon } from '../utils/lunarSky';
import { checkPoint, pointLabel } from '../data/pointCheck';
import { siteHourlySky, type HorizonsSeries } from '../services/horizonsData';
import { MAP_LAYERS, layerFileUrl, type MapLayer } from '../services/mapLayers';
import { viewInHorizonsUrl } from '../services/horizonsQuery';
import { SITES } from '../services/sites';
import type { PositionSamples } from '../utils/riseSet';
import { loadUiPrefs, saveUiPrefs } from '../utils/uiPrefs';
import { APP_NAME, BRAND_NAME, DOCUMENT_TITLE, NON_ENDORSEMENT } from './appInfo';
import { SLIP_ASSISTANT_ENABLED } from './featureFlags';
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

/**
 * What the one floating left panel shows. Opening one closes the other; Compare and the mission
 * form go back to the panel they were opened from.
 */
type LeftPanel = 'sites' | 'site' | 'point' | 'mission' | 'addMission' | 'lessons' | 'compare';

/** The timeline's id: the skip button's target. */
const TIMELINE_ID = 'timeline';

/** The rail item each view belongs to (its active marker). */
const RAIL_ITEM: Record<LeftPanel, RailItem> = {
  sites: 'sites',
  site: 'sites',
  point: 'sites',
  mission: 'mission',
  addMission: 'mission',
  lessons: 'lessons',
  compare: 'compare',
};
/** The "press H" hint shows once, for this long. */
const KEY_HINT_MS = 6_000;
/** On entering presentation mode, "Esc to exit" shows for this long. */
const EXIT_HINT_MS = 3_500;
/** The spot the demo's "Anywhere on the Moon" step picks (made up, far from every landing site). */
const DEMO_ANYWHERE_POINT: LatLon = { lat: -45, lon: -70 };
/** The demo's south-polar site (step 7), IM-2 Athena (84.8° S): the Sun skims the horizon there. */
const DEMO_POLAR_SITE_ID = 'im2';
/** Under reduced motion the demo moves the time by this much instead of playing it. */
const DEMO_TIME_STEP_MS = 3 * 24 * 60 * 60 * 1000;

/** Everything the demo changes, as it was before it started. */
interface DemoSnapshot {
  missionId: string;
  time: number;
  live: boolean;
  playing: boolean;
  speed: PlaySpeedId;
  selectedSiteId: string | null;
  pickedPoint: LatLon | null;
  compareIds: readonly string[];
  leftPanel: LeftPanel | null;
  panelView: LeftPanel;
  timeBarFolded: boolean;
  /** The Sites list's order: the demo shows it best first. */
  order: SiteOrder;
  /** The map camera's view (opaque), when the map had loaded. */
  cameraView: unknown;
  /** The dates picked in the Mission view: the demo runs on the time bar's 29.5 days. */
  dateRange: DateRange | null;
}

/** The compare panel holds at most this many sites. */
const COMPARE_MAX = 4;
/** Presentation mode's slide and fade (App.module.css --duration-present), plus a frame. */
const PRESENT_MOVE_MS = 300;

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

const NO_SERIES: ReadonlyMap<string, HorizonsSeries> = new Map();

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
        siteHourlySky(series.get(site.id) ?? null, site, span).samples,
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

/** The best site for a mission now: the first selection (before any Horizons file has loaded). */
function topSiteId(range: TimeRange, mission: DemoMission): string | null {
  const sky = skyBySite(range, mission, NO_SERIES);
  return bestSite(rankSites(SITES, mission, sky, range))?.site.id ?? null;
}

/** 00:00 UTC on a "YYYY-MM-DD" date. */
function dayStartUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** The app: one shared clock around the workspace. */
export function App() {
  // A shared link (#mission=…&site=… or &at=…&t=…) opens the same view, at its exact time.
  const [shared] = useState(() =>
    readShareHash(typeof window === 'undefined' ? '' : window.location.hash, {
      missionIds: DEMO_MISSIONS.map((entry) => entry.id),
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
 * The Moon fills the window. Over it float the top row (logo and breadcrumb), the menu rail, one
 * left panel at a time (Sites, a site or point, Mission, Lessons, Compare, the mission form), the
 * map's icon column on the right, the status line and the timeline. The sites are real landings
 * (src/services/sites.ts) and the Sun and Earth are real; the missions are demo data
 * (src/data/demoData.ts), labelled DEMO wherever their needs are shown.
 */
function Workspace({ shared }: { shared: Partial<ShareState> }) {
  const {
    time,
    range,
    editorOpen,
    mode: timeMode,
    playing,
    speed,
    goLive,
    setTime,
    setPlaying,
    setSpeed,
  } = useTime();
  const [missionId, setMissionId] = useState(shared.missionId ?? DEFAULT_DEMO_MISSION.id);
  // How the Sites list is ordered: the longest usable window first, by default.
  const [order, setOrder] = useState<SiteOrder>('window');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    () =>
      shared.siteId ??
      (shared.point
        ? null
        : topSiteId(
            range,
            DEMO_MISSIONS.find((entry) => entry.id === shared.missionId) ?? DEFAULT_DEMO_MISSION,
          )),
  );
  // A point picked anywhere on the Moon (instead of a site): its card, pin and windows.
  const [pickedPoint, setPickedPoint] = useState<LatLon | null>(() => shared.point ?? null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  // The map layers (elevation, slope; docs/LANDER_RULES.md "Map layers"): switches, opacities,
  // the layer readings come from, and the images the globe draws. Fixed in time.
  const mapLayerList = MAP_LAYERS?.layers ?? NO_MAP_LAYERS;
  const layerSettings = useMapLayerSettings(mapLayerList);
  // Narrow or low-memory devices keep the 512 px previews only (about 300 MB decoded otherwise).
  const [layerPreviewOnly] = useState(() =>
    typeof window === 'undefined'
      ? false
      : previewsOnly(
          window.innerWidth,
          (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
        ),
  );
  const mapLayerDisplays = useMemo(
    () => layerDisplays(mapLayerList, layerSettings.settings, layerFileUrl, layerPreviewOnly),
    [mapLayerList, layerSettings.settings, layerPreviewOnly],
  );
  // The visibility prototype (docs/LANDER_RULES.md, "Visibility prototype layer"): Sun and Earth,
  // one supplied frame per 10 minutes, snapped from the app's time. Display only.
  const visibility = useVisibilityLayer(time);
  const visibilityShown = visibility.display.sun.visible || visibility.display.earth.visible;
  // The globe's Sun-and-relief shading stops south of the layers' coverage while one is visible.
  const layerShadeCutZ = unshadedBelowZ(
    [...mapLayerDisplays, { visible: visibilityShown }],
    MAP_LAYERS?.coverMaxLatDeg ?? -80,
  );
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
  const [layersOpen, setLayersOpen] = useState(false);
  // The map layers' panel opens from the map's icon column.
  const toggleLayersPanel = useStableCallback(() => setLayersOpen((open) => !open));
  // The readout: the active layer's value under the pointer (desktop) or at the tapped spot.
  const [hoverGround, setHoverGround] = useState<LatLon | null>(null);
  const anyLayerVisible = layerSettings.anyVisible || visibility.shown.length > 0;
  // With every layer off, no hover point is kept (and no value tile is read).
  if (!anyLayerVisible && hoverGround !== null) setHoverGround(null);
  const readingFrom = readingSource(layerSettings.activeId, visibility.shown, visibility.prefer);
  const activeLayer =
    readingFrom?.kind === 'map'
      ? (mapLayerList.find((layer) => layer.id === readingFrom.id) ?? null)
      : null;
  // A tap (the picked point) gives the reading on touch screens, where there is no hover.
  const readingPoint = hoverGround ?? (anyLayerVisible ? pickedPoint : null);
  const layerReading = useLayerReading(activeLayer, readingPoint);
  const visibilityTarget = readingFrom?.kind === 'visibility' ? readingFrom.target : null;
  const visibilityReadout = visibilityTarget
    ? visibility.readAt(visibilityTarget, readingPoint)
    : null;
  const [imageryStatus, setImageryStatus] = useState<ImageryStatus>('loading');
  const [prefs] = useState(loadUiPrefs);
  // The left panel: which view it shows (Sites by default, or a shared site's card), and whether
  // it is out or slid away (remembered; closed on narrow screens at first).
  const [panelView, setPanelView] = useState<LeftPanel>(() =>
    shared.siteId ? 'site' : shared.point ? 'point' : 'sites',
  );
  const [panelOpen, setPanelOpenState] = useState(
    () =>
      shared.siteId !== undefined ||
      shared.point !== undefined ||
      (!isNarrow() && prefs.panelClosed !== true),
  );
  const leftPanel: LeftPanel | null = panelOpen ? panelView : null;
  // For the app's own moves (the demo, a choice of site): shows a view, or slides the panel away,
  // without saving anything as the user's choice.
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
  // What the last Share did ("Link copied"), shown under the site card's actions for a while.
  const [shareNote, setShareNote] = useState<string | null>(null);
  // A new number focuses the mission picker (the breadcrumb's mission).
  const [focusMission, setFocusMission] = useState(0);
  const missionSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (focusMission > 0) missionSelectRef.current?.focus();
  }, [focusMission]);
  // A new number opens Other dates on the card (the guided demo).
  const [otherDatesReveal, setOtherDatesReveal] = useState(0);
  const panelReturnRef = useRef<LeftPanel | null>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [timeBarFolded, setTimeBarFolded] = useState(prefs.timeBarCollapsed === true);
  const [about, setAbout] = useState<{ open: boolean; tab: AboutTab }>({
    open: false,
    tab: 'about',
  });
  const aboutOpenerRef = useRef<HTMLElement | null>(null);
  const [tour, setTour] = useState<{
    open: boolean;
    step: number;
    mode: 'tour' | 'demo';
  }>({
    // A shared link opens on what was shared: the tour waits (About → Take the tour).
    open:
      prefs.tourDone !== true &&
      shared.missionId === undefined &&
      shared.siteId === undefined &&
      shared.point === undefined &&
      shared.time === undefined,
    step: 0,
    mode: 'tour',
  });
  // What the demo found when it started, put back when it is skipped or done.
  const demoSavedRef = useRef<DemoSnapshot | null>(null);
  // Pause on the caption bar also holds the playback. Each start is a new run, so the caption
  // bar starts unpaused.
  const [guidedPaused, setGuidedPaused] = useState(false);
  const [guidedRun, setGuidedRun] = useState(0);
  // The map's camera, for the demo (whole Moon, back to the saved view), and whether it is moving.
  const mapControllerRef = useRef<MapController | null>(null);
  const [mapMoving, setMapMoving] = useState(false);
  // The slot the demo's caption bar goes in.
  const [captionHost, setCaptionHost] = useState<HTMLDivElement | null>(null);
  const [keyHint, setKeyHint] = useState(false);
  // Presentation mode hides the chrome (top row, status strip, map controls, the left panel)
  // without touching what the panel shows, so leaving it puts everything back as it was.
  const [presenting, setPresenting] = useState(false);
  const [exitHint, setExitHint] = useState(false);
  // True while presentation mode fades in or out.
  const [presentMoving, setPresentMoving] = useState(false);
  // Sites picked for comparing (in pick order). Closing the compare panel keeps the picks.
  const [compareIds, setCompareIds] = useState<readonly string[]>([]);
  const compareOpen = leftPanel === 'compare';
  // The user's own missions: saved presets (from storage) and ones used without saving (this
  // visit only), listed after the demo missions.
  const [savedMissions, setSavedMissions] = useState<readonly DemoMission[]>(loadCustomMissions);
  const [sessionMissions, setSessionMissions] = useState<readonly DemoMission[]>([]);
  const missionFormOpen = leftPanel === 'addMission';
  // What the "launch slipped" assistant put in the mission form (Edit, "Add its details"). It
  // lasts while the form is open; any other way in opens the form as usual.
  const [missionPrefill, setMissionPrefill] = useState<MissionPrefill | null>(null);
  const prefillSeqRef = useRef(0);
  // Cleared when another view is chosen, not when the panel only slides away and back.
  if (panelView !== 'addMission' && missionPrefill !== null) setMissionPrefill(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const mapRef = useRef<HTMLElement>(null);
  const viewAreaRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const noTopRef = useRef<HTMLDivElement>(null);
  // The Moon is framed below whichever top layer is showing: the status strip, or in
  // presentation mode the small site label. Neither moves (they only fade), so it is exact.
  const viewInsets = useViewInsets(mapRef, viewAreaRef, presenting ? labelRef : noTopRef);
  const comparePanelId = useId();
  const leftPanelId = useId();

  const allMissions = useMemo(
    () => [...DEMO_MISSIONS, ...savedMissions, ...sessionMissions],
    [savedMissions, sessionMissions],
  );
  const mission = allMissions.find((entry) => entry.id === missionId) ?? DEFAULT_DEMO_MISSION;
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
  // The Timeline's per-site positions and terrain (stable, so its bars are worked out once).
  const seriesFor = useCallback((siteId: string) => horizons.get(siteId) ?? null, [horizons]);
  const terrainFor = useCallback((siteId: string) => terrainProfileFor(siteId), []);
  const yearFactsFor = useCallback(
    (siteId: string) => yearFactsBySite.get(siteId) ?? [],
    [yearFactsBySite],
  );
  // The dates picked in the Mission view; without them the checks use the time bar's 29.5 days.
  const [dateRange, setDateRangeState] = useState<DateRange | null>(() =>
    shared.dates && dateRangeError(shared.dates) === null ? shared.dates : null,
  );
  const pickedRange = useMemo(() => (dateRange ? toTimeRange(dateRange) : null), [dateRange]);
  const checkRange = pickedRange ?? range;
  // Computed when the range (a day at a time), the mission or the sites change; not per tick. It
  // is deferred, so during playback the clock and the light never wait for the checks.
  const skyRange = useDeferredValue(checkRange);
  const sky = useMemo(() => skyBySite(skyRange, mission, horizons), [skyRange, mission, horizons]);
  const rankedSites = useMemo(
    () => rankSites(SITES, mission, sky, skyRange, order),
    [mission, sky, skyRange, order],
  );
  const selectedSite = rankedSites.find((entry) => entry.site.id === selectedSiteId) ?? null;
  // The assistant's fixed sentence after Apply, from the same checks as the Sites list.
  const slipResults = useMemo(
    () => ({
      text: slipSummary(rankedSites, mission, skyRange),
      updating: skyRange !== checkRange,
    }),
    [rankedSites, mission, skyRange, checkRange],
  );
  const pointCheck = useMemo(
    () =>
      pickedPoint
        ? checkPoint(pickedPoint, mission, hourlySky(sampledSpan(skyRange)), skyRange)
        : null,
    [pickedPoint, mission, skyRange],
  );
  // The best site is the longest usable window, whatever order the list is in.
  const best = bestSite(rankedSites);
  // The time bar shows the windows of the picked point or the selected site; with neither, the
  // best site's, and says so.
  const timelineWindows: readonly TimeWindowMs[] = pointCheck
    ? pointCheck.assessment.sky.windows
    : ((selectedSite ?? best)?.assessment.sky.windows ?? NO_WINDOWS);
  // The compare columns, from the same checks as everything else.
  const compareEntries = compareIds.flatMap((id) => {
    const entry = rankedSites.find((item) => item.site.id === id);
    return entry ? [entry] : [];
  });
  const compareShown = compareOpen && !presenting;

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

  // One view at a time. Compare and the mission form open from another view and go back to it.
  const openPanel = (next: LeftPanel) => {
    const sub = (panel: LeftPanel | null) => panel === 'compare' || panel === 'addMission';
    if (sub(next) && !sub(leftPanel)) panelReturnRef.current = leftPanel;
    setLeftPanel(next);
  };
  // Escape and the form's Close: a sub-view goes back to where it was opened; any other view
  // slides the panel away.
  const closePanel = () => {
    if (leftPanel === 'compare' || leftPanel === 'addMission') {
      setLeftPanel(panelReturnRef.current ?? 'sites');
      panelReturnRef.current = null;
      return;
    }
    setPanelOpen(false);
  };
  // The rail: a view item opens its view, or slides the panel away when it is already showing.
  const railActive = leftPanel ? RAIL_ITEM[leftPanel] : null;
  const selectRail = (item: RailItem, opener: HTMLElement) => {
    if (item === 'demo') {
      startDemo();
      return;
    }
    if (item === 'about') {
      openAbout('about', opener);
      return;
    }
    // Sites from a site's or a point's card goes back to the list (the card counts as Sites).
    if (railActive === item && !(item === 'sites' && leftPanel !== 'sites')) {
      setPanelOpen(false);
      return;
    }
    if (item === 'compare') openPanel('compare');
    else setLeftPanel(item);
    setPanelOpen(true);
  };
  // The breadcrumb follows the rail: Moon for Sites (and the other top-level views), the mission
  // for the Mission view, the site or point for its card.
  const crumbLevel =
    leftPanel === 'site' || leftPanel === 'point'
      ? 'site'
      : leftPanel === 'mission' || leftPanel === 'addMission'
        ? 'mission'
        : 'moon';
  // "Moon": no site, the ranked Sites.
  const showSites = () => {
    setSelectedSiteId(null);
    setPickedPoint(null);
    setLeftPanel('sites');
    setPanelOpen(true);
  };
  // The mission: the Mission view, its picker focused.
  const showMissionPicker = () => {
    setLeftPanel('mission');
    setPanelOpen(true);
    setFocusMission((seq) => seq + 1);
  };
  // A new view in the panel: when the focus was left behind (on a view now hidden, or nowhere),
  // it moves to the new view's heading, so keyboard and screen-reader users land where they are.
  const shownViewRef = useRef({ view: panelView, open: panelOpen });
  useEffect(() => {
    const before = shownViewRef.current;
    shownViewRef.current = { view: panelView, open: panelOpen };
    // Only on a real change of view (not on load, where the skip link comes first).
    if (!panelOpen || (before.view === panelView && before.open === panelOpen)) return;
    const active = document.activeElement;
    const lost =
      !active ||
      active === document.body ||
      (active instanceof HTMLElement && active.closest('[hidden]') !== null);
    if (!lost) return;
    const view = leftPanelRef.current?.querySelector<HTMLElement>(
      `[data-panel-view="${panelView}"]`,
    );
    const heading = view?.querySelector<HTMLElement>('h2, h3');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }, [panelView, panelOpen]);
  // How much of the map the open panel covers, read when a flight starts (so a site lands
  // beside it). Its layout box, not its slide: a panel sliding in counts as there.
  const coveredLeft = useCallback(() => {
    const panel = leftPanelRef.current;
    return panel?.dataset.open === 'true' ? panel.offsetLeft + panel.offsetWidth : 0;
  }, []);

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
  const overlayOpen = about.open || tour.open || editorOpen;
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
      // Escape closes the top panel.
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

  // The H hint shows once, after the tour (if any) is done; not again after a later tour or demo.
  const keyHintShownRef = useRef(prefs.keyHintSeen === true);
  useEffect(() => {
    if (tour.open || keyHintShownRef.current) return undefined;
    // Counted as seen when it shows (an effect set up and torn down at once never shows it).
    const show = window.setTimeout(() => {
      keyHintShownRef.current = true;
      saveUiPrefs({ keyHintSeen: true });
      setKeyHint(true);
    }, 600);
    const hide = window.setTimeout(() => setKeyHint(false), 600 + KEY_HINT_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
      setKeyHint(false);
    };
  }, [tour.open]);

  // Each tour step opens the view it points at.
  const tourSteps = tour.mode === 'tour' ? TOUR_STEPS : DEMO_STEPS;
  // (The demo opens its views itself, and not on narrow screens.)
  const tourPanel = tour.open && tour.mode === 'tour' ? tourSteps[tour.step]?.panel : undefined;
  const [tourPanelShown, setTourPanelShown] = useState<string | null | undefined>(undefined);
  // The view before the tour, put back when it ends (not when it hands over to the demo).
  const [tourBefore, setTourBefore] = useState<{ view: LeftPanel; open: boolean } | null>(null);
  if (tourPanel !== tourPanelShown) {
    if (tourPanelShown === undefined && tourPanel !== undefined) {
      setTourBefore({ view: panelView, open: panelOpen });
    }
    setTourPanelShown(tourPanel);
    if (tourPanel === 'site' && !selectedSite) {
      // The card step with no site selected: the picked point's card, or the best site's.
      if (pickedPoint) {
        setLeftPanel('point');
      } else {
        if (best) setSelectedSiteId(best.site.id);
        setLeftPanel('site');
      }
    } else if (tourPanel) {
      setLeftPanel(tourPanel);
    }
  }
  if (tourBefore && !(tour.open && tour.mode === 'tour')) {
    setTourBefore(null);
    if (!tour.open) {
      setPanelView(tourBefore.view);
      setPanelOpenState(tourBefore.open);
    }
  }

  const closeTour = () => {
    setTour({ open: false, step: 0, mode: 'tour' });
    saveUiPrefs({ tourDone: true });
  };

  const openAbout = (tab: AboutTab, opener: HTMLElement) => {
    aboutOpenerRef.current = opener;
    setAbout({ open: true, tab });
  };
  const closeAbout = () => {
    setAbout((current) => ({ ...current, open: false }));
    aboutOpenerRef.current?.focus();
  };
  const takeTour = () => {
    setAbout((current) => ({ ...current, open: false }));
    setTour({ open: true, step: 0, mode: 'tour' });
  };

  // Picked dates move the app's time to their start, so the time bar shows the range's first days.
  const setDateRange = (next: DateRange | null) => {
    setDateRangeState(next);
    if (next) setTime(next.startMs);
  };

  // Like a map app: choosing a site opens its card in the left panel.
  const selectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setPickedPoint(null);
    setFlyRequest((previous) => ({ siteId, seq: (previous?.seq ?? 0) + 1 }));
    setLeftPanel('site');
  };
  // A click on bare ground: that spot's card, in place of any selected site. No flight: the user
  // is already looking at it.
  const pickPoint = (point: LatLon) => {
    // A tap gives the layers' reading at the spot, not where a one-finger pan last moved.
    setHoverGround(null);
    setPickedPoint(point);
    setSelectedSiteId(null);
    setLeftPanel('point');
  };
  // Typed coordinates: like a click there, and the camera flies to it.
  const goToPoint = (point: LatLon) => {
    pickPoint(point);
    setFlyRequest((previous) => ({ point, seq: (previous?.seq ?? 0) + 1 }));
  };
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
  const openCompare = () => openPanel('compare');
  const closeCompare = () => {
    const panel = document.getElementById(comparePanelId);
    const hadFocus = panel?.contains(document.activeElement) ?? false;
    closePanel();
    // Focus goes back to the Compare button rather than into a hidden panel.
    if (hadFocus) {
      document
        .querySelector<HTMLElement>(`[aria-controls="${CSS.escape(comparePanelId)}"]`)
        ?.focus();
    }
  };
  useEffect(() => {
    closePanelRef.current = compareOpen ? closeCompare : closePanel;
  });
  // "Add your own mission": use a new mission now (this visit), save it as a preset, or manage
  // presets.
  const takenNames = (exceptId?: string) =>
    allMissions.filter((entry) => entry.id !== exceptId).map((entry) => entry.name);
  const storeMissions = (next: readonly DemoMission[]) => {
    setSavedMissions(next);
    setStorageFailed(!saveCustomMissions(next));
  };
  // The form's date (optional, UTC) moves the time bar too: the by-hand way to handle a slip.
  const applyMission = (draft: MissionDraft, when: number | null) => {
    const made = missionFromDraft(draft, newCustomId(), uniqueName(draft.name, takenNames()));
    setSessionMissions((current) => [...current, made]);
    setMissionId(made.id);
    if (when !== null) setTime(when);
    closePanel();
  };
  const saveMission = (draft: MissionDraft, when: number | null) => {
    const made = missionFromDraft(draft, newCustomId(), uniqueName(draft.name, takenNames()));
    storeMissions([...savedMissions, made]);
    setMissionId(made.id);
    if (when !== null) setTime(when);
    closePanel();
  };
  const openMissionForm = () => {
    setMissionPrefill(null);
    openPanel('addMission');
  };
  // "See it in the tool" (Lessons): that site at its landing date, with the time bar's range
  // (picked dates cleared) around it, so the range covers the landing.
  const seeLanding = (siteId: string) => {
    const site = SITES.find((entry) => entry.id === siteId);
    if (!site) return;
    setDateRangeState(null);
    setTime(dayStartUtc(site.landingDateUtc));
    selectSite(siteId);
  };
  // "Go there" on the assistant's answer: that mission, the site's card and the window's start.
  const goToAnswer = (answerMissionId: string, siteId: string, ms: number) => {
    setMissionId(answerMissionId);
    setTime(ms);
    selectSite(siteId);
  };
  // "Launch slipped?": Apply uses what was read (a changed need makes a new mission for this
  // visit; the demo missions are never edited) and stays in the Mission view for the result.
  const applySlip = (plan: SlipPlan) => {
    if (plan.mission.kind === 'unknown' || !plan.canApply) return;
    if (plan.changed) {
      const made = missionFromDraft(
        plan.draft,
        newCustomId(),
        uniqueName(plan.draft.name, takenNames()),
      );
      setSessionMissions((current) => [...current, made]);
      setMissionId(made.id);
    } else {
      setMissionId(plan.mission.mission.id);
    }
    if (plan.time) setTime(plan.time.to);
    if (plan.range) setDateRange(plan.range.range);
  };
  // Edit, or "Add its details" for a mission not in the list: the form, filled in.
  const editSlip = (plan: SlipPlan) => {
    prefillSeqRef.current += 1;
    setMissionPrefill({
      seq: prefillSeqRef.current,
      draft: plan.draft,
      baseId: plan.mission.kind === 'unknown' ? null : plan.mission.mission.id,
      time: plan.time?.to ?? null,
      note:
        plan.mission.kind === 'unknown'
          ? `${plan.mission.name} isn’t in our list yet, add its details.`
          : 'Filled in from your text. Check the values, then use them.',
    });
    openPanel('addMission');
  };
  const renameMission = (id: string, name: string) =>
    storeMissions(
      savedMissions.map((entry) =>
        entry.id === id ? { ...entry, name: uniqueName(name, takenNames(id)) } : entry,
      ),
    );
  const deleteMission = (id: string) => {
    storeMissions(savedMissions.filter((entry) => entry.id !== id));
    if (missionId === id) setMissionId(DEFAULT_DEMO_MISSION.id);
  };

  // "Watch demo": the steps drive the app through the setters above. It notes what it found
  // first, and puts it back when skipped or done; a click in the app ends it where it is.
  const runDemoAction = (action: DemoAction | undefined) => {
    const reduced = matches('(prefers-reduced-motion: reduce)', false);
    const suitable = rankedSites.filter((entry) => entry.rank !== null);
    // On narrow screens the panel would cover the map and the caption: the demo leaves it as it
    // is there, and the captions carry the story.
    const roomy = !isNarrow();
    switch (action) {
      case 'wholeMoon':
        setLeftPanel(null);
        mapControllerRef.current?.showWholeMoon();
        return;
      case 'missionA':
        setMissionId(DEFAULT_DEMO_MISSION.id);
        if (roomy) setLeftPanel('mission');
        return;
      case 'ranked':
        if (roomy) setLeftPanel('sites');
        return;
      case 'bestSite': {
        // Like choosing it in the list, but nothing is saved as the user's panel choice.
        const first = bestSite(rankedSites);
        if (first) showComparedSite(first.site.id);
        if (roomy) setLeftPanel('site');
        return;
      }
      case 'playTime':
        setTimeBarFolded(false);
        // Reduced motion: one step forward in time, the same at any playback speed.
        if (reduced) {
          setTime(time + DEMO_TIME_STEP_MS);
        } else {
          setSpeed('6h');
          setPlaying(true);
        }
        return;
      case 'otherDates':
        setPlaying(false);
        setOtherDatesReveal((seq) => seq + 1);
        if (roomy) setLeftPanel('site');
        return;
      case 'polarSite':
        // Select the polar site without the usual fly-to-site (it would replace this view), and
        // show the tilted south-pole view, where it lies.
        setSelectedSiteId(DEMO_POLAR_SITE_ID);
        setPickedPoint(null);
        mapControllerRef.current?.showSouthPole();
        if (roomy) setLeftPanel('site');
        return;
      case 'anywhere':
        // A spot away from every landing site, so the answer is plainly the sky's, not a site's. Back
        // to the whole Moon first: after the tilted south-pole step the spot would be off-screen.
        mapControllerRef.current?.showWholeMoon();
        setPickedPoint(DEMO_ANYWHERE_POINT);
        setSelectedSiteId(null);
        if (roomy) setLeftPanel('point');
        return;
      case 'compare':
        // The two longest windows, whatever order the list is in.
        setCompareIds(
          [...suitable]
            .sort(
              (a, b) =>
                b.assessment.usableDays - a.assessment.usableDays ||
                a.site.name.localeCompare(b.site.name),
            )
            .slice(0, 2)
            .map((entry) => entry.site.id),
        );
        setLeftPanel('compare');
        return;
      default:
        return;
    }
  };
  const startDemo = () => {
    // A second start (from About while one runs) keeps the first snapshot: the real "before".
    demoSavedRef.current ??= {
      missionId,
      time,
      live: timeMode === 'live',
      playing,
      speed,
      selectedSiteId,
      pickedPoint,
      compareIds,
      leftPanel,
      panelView,
      timeBarFolded,
      order,
      cameraView: mapControllerRef.current?.saveView(),
      dateRange,
    };
    setDateRangeState(null);
    // Started from the first-run tour: the tour counts as seen.
    if (tour.open && tour.mode === 'tour') saveUiPrefs({ tourDone: true });
    // The demo's captions speak of the list best first.
    setOrder('window');
    setAbout((current) => ({ ...current, open: false }));
    setGuidedPaused(false);
    setGuidedRun((run) => run + 1);
    setTour({ open: true, step: 0, mode: 'demo' });
    runDemoAction(DEMO_STEPS[0]?.action);
  };
  const demoStep = (step: number) => {
    const target = Math.max(0, Math.min(DEMO_STEPS.length - 1, step));
    if (target === tour.step || tour.mode === 'tour') return;
    // Playback belongs to one step; the next step starts it again if it needs it.
    setPlaying(false);
    setTour({ open: true, step: target, mode: tour.mode });
    runDemoAction(DEMO_STEPS[target]?.action);
    // Paused, a new step shows but its playback waits for Play.
    if (guidedPaused) setPlaying(false);
  };
  // Pause and Play on the caption bar hold and carry on the step's playback too.
  const pauseGuided = (paused: boolean) => {
    setGuidedPaused(paused);
    if (paused) {
      setPlaying(false);
    } else if (
      DEMO_STEPS[tour.step]?.action === 'playTime' &&
      !matches('(prefers-reduced-motion: reduce)', false)
    ) {
      setPlaying(true);
    }
  };
  const endDemo = (restore: boolean) => {
    setTour({ open: false, step: 0, mode: 'tour' });
    setGuidedPaused(false);
    const saved = demoSavedRef.current;
    demoSavedRef.current = null;
    if (!restore || !saved) return;
    // Only through setters that write nothing to storage: the demo leaves no trace.
    setMissionId(saved.missionId);
    setSelectedSiteId(saved.selectedSiteId);
    setPickedPoint(saved.pickedPoint);
    setCompareIds(saved.compareIds);
    setPanelView(saved.panelView);
    setPanelOpenState(saved.leftPanel !== null);
    setTimeBarFolded(saved.timeBarFolded);
    setOrder(saved.order);
    setDateRangeState(saved.dateRange);
    setSpeed(saved.speed);
    if (saved.live) goLive();
    else setTime(saved.time);
    setPlaying(saved.playing);
    if (saved.cameraView !== undefined) mapControllerRef.current?.restoreView(saved.cameraView);
  };
  // Done: everything back as it was, then the invitation stays open: the mission form.
  const finishDemo = () => {
    const before = demoSavedRef.current?.leftPanel ?? null;
    endDemo(true);
    // Close on the form goes back to that view, unless it was a sub-view itself (the form or
    // Compare), which would leave Close with nowhere to go.
    panelReturnRef.current = before === 'addMission' || before === 'compare' ? null : before;
    setLeftPanel('addMission');
  };
  const watchDemoFromTour = () => {
    closeTour();
    startDemo();
  };

  // Share: the mission, the site or point and the exact time in the link's hash. A custom
  // mission is not shared (it lives in this browser): the link carries the default and says so.
  const shareView = async () => {
    const custom = mission.custom === true;
    const hash = shareHash({
      missionId: custom ? DEFAULT_DEMO_MISSION.id : mission.id,
      dates: dateRange,
      siteId: selectedSiteId,
      point: pickedPoint,
      time,
    });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    const customNote = custom
      ? ` Your own missions are not shared: the link opens with ${DEFAULT_DEMO_MISSION.name}.`
      : '';
    // A phone or tablet gets the share sheet. A laptop copies the link and says so: desktop
    // browsers also offer a share sheet, which would hide where the link went.
    if (matches('(pointer: coarse)', false) && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: DOCUMENT_TITLE, url });
        setShareNote(customNote ? customNote.trim() : null);
      } catch {
        // Cancelled from the share sheet: nothing to say.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote(`Link copied.${customNote}`);
    } catch {
      setShareNote(`Copy this link: ${url}${customNote}`);
    }
  };
  useEffect(() => {
    if (!shareNote) return undefined;
    const timer = window.setTimeout(() => setShareNote(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [shareNote]);

  // A column header shows its site on the map without reopening Site details over the panel.
  const showComparedSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setPickedPoint(null);
    setFlyRequest((previous) => ({ siteId, seq: (previous?.seq ?? 0) + 1 }));
  };

  const foldTimeBar = (folded: boolean) => {
    setTimeBarFolded(folded);
    saveUiPrefs({ timeBarCollapsed: folded });
  };

  return (
    <div
      className={joinClassNames(
        styles.shell,
        leftPanel !== null && !presenting && (compareOpen ? styles.panelWide : styles.panelOpen),
        timeBarFolded && styles.timeBarFolded,
        presenting && styles.presenting,
        presentMoving && styles.presentMoving,
        compareShown && compareEntries.length >= 3 && styles.compareWide,
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
              missionName={mission.name}
              siteName={selectedSite?.site.name ?? (pickedPoint ? pointLabel(pickedPoint) : null)}
              current={crumbLevel}
              onMoon={showSites}
              onMission={showMissionPicker}
              onSite={() => {
                setLeftPanel(pickedPoint && !selectedSite ? 'point' : 'site');
                setPanelOpen(true);
              }}
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
          />
        </div>
        <FloatingPanel
          id={leftPanelId}
          open={leftPanel !== null}
          onToggle={() => setPanelOpen(!panelOpen)}
          wide={panelView === 'compare'}
          hidden={presenting}
          panelRef={leftPanelRef}
        >
          {/* Views stay put while the panel slides away, so it never empties mid-slide. */}
          <div className={styles.view} hidden={panelView !== 'sites'} data-panel-view="sites">
            <PlanSidebar
              mission={mission}
              rankedSites={rankedSites}
              range={skyRange}
              selectedSiteId={selectedSiteId}
              onSelectSite={selectSite}
              hoveredSiteId={hoveredSiteId}
              onHoverSite={setHoveredSiteId}
              order={order}
              onOrderChange={setOrder}
              onGoToPoint={goToPoint}
              comparedIds={compareIds}
              compareMax={COMPARE_MAX}
              onToggleCompare={toggleCompare}
              compareOpen={compareShown}
              onToggleComparePanel={() => (compareOpen ? closeCompare() : openCompare())}
              comparePanelId={comparePanelId}
              rangeText={dateRange ? dateRangeText(dateRange) : null}
            />
          </div>
          <div className={styles.view} hidden={panelView !== 'site'} data-panel-view="site">
            {selectedSite ? (
              <PlaceReport
                heading="Site details"
                kind="site"
                name={selectedSite.site.name}
                meta={
                  selectedSite.site.region
                    ? `Landing site · ${selectedSite.site.region}`
                    : 'Landing site'
                }
                facts={
                  <>
                    <YearFacts facts={yearFactsFor(selectedSite.site.id)} />
                    <SiteFacts site={selectedSite.site} />
                  </>
                }
                landerId={selectedSite.site.landerId}
                rank={selectedSite.rank}
                place={selectedSite.site}
                assessment={selectedSite.assessment}
                mission={mission}
                time={time}
                range={skyRange}
                terrain={terrainProfileFor(selectedSite.site.id)}
                series={horizons.get(selectedSite.site.id) ?? null}
                positionsLabel={positionsLabel(
                  horizons.get(selectedSite.site.id) ?? null,
                  skyRange,
                )}
                horizonsLinks={{
                  sun: viewInHorizonsUrl('sun', selectedSite.site, skyRange),
                  earth: viewInHorizonsUrl('earth', selectedSite.site, skyRange),
                }}
                onSetTime={setTime}
                revealOtherDates={otherDatesReveal}
                compare={{
                  picked: compareIds.includes(selectedSite.site.id),
                  full: compareIds.length >= COMPARE_MAX,
                  onToggle: () => toggleCompare(selectedSite.site.id),
                }}
                share={{ onShare: () => void shareView(), note: shareNote }}
                onBack={() => setLeftPanel('sites')}
              />
            ) : null}
          </div>
          <div className={styles.view} hidden={panelView !== 'point'} data-panel-view="point">
            {pointCheck ? (
              <PlaceReport
                heading="Anywhere on the Moon"
                kind="point"
                name={pointLabel(pointCheck.point)}
                meta={
                  pointCheck.nearest ? (
                    <>
                      Nearest landing site:{' '}
                      <button
                        type="button"
                        className={styles.inlineLink}
                        onClick={() => {
                          const nearest = pointCheck.nearest;
                          if (nearest) selectSite(nearest.site.id);
                        }}
                      >
                        {pointCheck.nearest.site.name}
                      </button>
                      , {pointCheck.nearest.distanceKm.toLocaleString('en-US')} km away
                    </>
                  ) : (
                    'Your point'
                  )
                }
                place={pointCheck.point}
                assessment={pointCheck.assessment}
                mission={mission}
                time={time}
                range={skyRange}
                terrain={null}
                positionsLabel={ENGINE_LABEL}
                onSetTime={setTime}
                revealOtherDates={otherDatesReveal}
                share={{ onShare: () => void shareView(), note: shareNote }}
                onBack={() => setLeftPanel('sites')}
              />
            ) : null}
          </div>
          <div className={styles.view} hidden={panelView !== 'mission'} data-panel-view="mission">
            <PanelView title="Mission">
              <MissionPicker
                missions={allMissions}
                mission={mission}
                onMissionChange={setMissionId}
                onAddMission={openMissionForm}
                missionFormOpen={missionFormOpen}
                selectRef={missionSelectRef}
              />
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              {SLIP_ASSISTANT_ENABLED ? (
                <SlipAssistant
                  missions={allMissions}
                  mission={mission}
                  time={time}
                  range={checkRange}
                  rangeName={dateRange ? 'the dates you picked' : undefined}
                  series={horizons}
                  sites={SITES}
                  onGoToSite={goToAnswer}
                  onApply={applySlip}
                  onEdit={editSlip}
                  onOpenForm={openMissionForm}
                  results={slipResults}
                />
              ) : null}
            </PanelView>
          </div>
          <div className={styles.view} hidden={panelView !== 'lessons'} data-panel-view="lessons">
            <LessonsView onSeeInTool={seeLanding} />
          </div>
          <div className={styles.view} hidden={panelView !== 'compare'} data-panel-view="compare">
            <ComparePanel
              id={comparePanelId}
              entries={compareEntries}
              mission={mission}
              time={time}
              range={skyRange}
              compareMax={COMPARE_MAX}
              onRemove={toggleCompare}
              onClear={() => setCompareIds([])}
              onClose={closeCompare}
              onSelectSite={showComparedSite}
              positionsFor={positionsFor}
              yearFactsFor={yearFactsFor}
              timeline={{
                seriesFor,
                terrainFor,
                range: checkRange,
                picked: dateRange !== null,
                onMove: setDateRange,
              }}
            />
          </div>
          <div
            className={styles.view}
            hidden={panelView !== 'addMission'}
            data-panel-view="addMission"
          >
            <MissionForm
              // The form's own view, slid away or not: sliding the panel keeps what is typed.
              open={panelView === 'addMission'}
              presets={allMissions}
              saved={savedMissions}
              storageFailed={storageFailed}
              prefill={missionPrefill}
              onUse={applyMission}
              onSave={saveMission}
              onRename={renameMission}
              onDelete={deleteMission}
              onClose={closePanel}
            />
          </div>
        </FloatingPanel>

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
                onToggleLayers={mapLayerList.length > 0 ? toggleLayersPanel : undefined}
                layersOpen={layersOpen}
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
                onMovingChange={setMapMoving}
                idleDrift={!(tour.open && tour.mode === 'demo')}
                onPresent={presentFromMap}
                getCoveredLeft={coveredLeft}
                missionWords={mission.custom ? 'this mission' : 'this DEMO mission'}
              />
            </Suspense>
          </MapErrorBoundary>

          {layersOpen && !presenting ? (
            <div className={styles.layersLayer}>
              <LayerPanel
                layers={mapLayerList}
                settings={layerSettings.settings}
                onToggle={toggleMapLayer}
                onOpacity={layerSettings.setOpacity}
                activeId={activeLayer?.id ?? null}
                onActive={(layerId) => {
                  visibility.setPrefer(null);
                  layerSettings.setActive(layerId);
                }}
                reading={layerReading}
                onClose={() => setLayersOpen(false)}
                sourceId={MAP_LAYERS?.sourceId ?? ''}
                previewOnly={layerPreviewOnly}
                failedIds={layerFailures}
                visibility={{
                  settings: visibility.settings,
                  runtime: visibility.runtime,
                  frame: visibility.frame,
                  onToggle: visibility.toggle,
                  onToggleTarget: visibility.toggleTarget,
                  onOpacity: visibility.setOpacity,
                  activeTarget: visibilityTarget,
                  onActiveTarget: visibility.setPrefer,
                  readout: visibilityReadout,
                }}
              />
            </div>
          ) : null}

          {/* The demo's caption bar: in the map's free middle, above the time bar. */}
          <div ref={setCaptionHost} className={styles.middleCaption} />

          {/* Where the map frames the whole Moon: between the sidebars, above the time bar. */}
          <div ref={viewAreaRef} className={styles.viewArea} aria-hidden="true" />

          {/* Presentation mode: the selected site, small, near the top where the bar was. */}
          <div
            ref={labelRef}
            className={joinClassNames(styles.middleTop, styles.labelLayer)}
            aria-hidden={!presenting || undefined}
            data-testid="present-label-layer"
          >
            {selectedSite ? (
              <p className={styles.presentLabel} data-testid="present-label">
                <span className={styles.presentName}>{selectedSite.site.name}</span>
                <span className={styles.presentScore}>
                  {selectedSite.assessment.suitable
                    ? `Power and comms OK ${rangeWords(skyRange).now}`
                    : `Not suitable for this mission ${rangeWords(skyRange).now}`}
                </span>
                {/* The verdict is for the mission's needs: a demo mission's are made up. */}
                {mission.custom ? null : <span className={styles.presentDemo}>DEMO mission</span>}
              </p>
            ) : pointCheck && pickedPoint ? (
              <p className={styles.presentLabel} data-testid="present-label">
                <span className={styles.presentName}>Your point {pointLabel(pickedPoint)}</span>
                <span className={styles.presentScore}>
                  {pointCheck.assessment.suitable
                    ? `Power and comms OK ${rangeWords(skyRange).now}`
                    : `Not suitable for this mission ${rangeWords(skyRange).now}`}
                </span>
                {/* The verdict is for the mission's needs: a demo mission's are made up. */}
                {mission.custom ? null : <span className={styles.presentDemo}>DEMO mission</span>}
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
            {/* The status line: centred on the screen just above the time bar; the left panel
                never moves it. */}
            <div
              className={styles.stripLayer}
              inert={presenting}
              aria-hidden={presenting || undefined}
            >
              <StatusStrip
                missionName={mission.name}
                site={
                  selectedSite?.site ??
                  (pickedPoint ? { name: 'Your point', ...pickedPoint } : null)
                }
                positions={selectedSite ? positionsFor(selectedSite.site.id) : null}
              />
            </div>
            <TimeBar
              windows={timelineWindows}
              windowsFor={
                pickedPoint
                  ? `Your point ${pointLabel(pickedPoint)}`
                  : selectedSite
                    ? selectedSite.site.name
                    : best
                      ? `Best site: ${best.site.name}`
                      : null
              }
              folded={timeBarFolded}
              onFoldedChange={foldTimeBar}
              id={TIMELINE_ID}
            />
          </div>
        </main>
      </div>

      {about.open ? (
        <AboutPanel
          tab={about.tab}
          onTabChange={(tab) => setAbout({ open: true, tab })}
          onClose={closeAbout}
          onTakeTour={takeTour}
          onWatchDemo={startDemo}
          onLessons={() => {
            setAbout((current) => ({ ...current, open: false }));
            setLeftPanel('lessons');
          }}
          credits={<DataCredits imageryStatus={imageryStatus} />}
          nonEndorsement={NON_ENDORSEMENT}
          appName={APP_NAME}
          slipAssistant={SLIP_ASSISTANT_ENABLED}
        />
      ) : null}

      {tour.open ? (
        tour.mode !== 'tour' ? (
          <Tour
            key={guidedRun}
            mode="demo"
            steps={DEMO_STEPS}
            step={tour.step}
            onStepChange={demoStep}
            onClose={() => endDemo(true)}
            onDone={finishDemo}
            onInterrupt={() => endDemo(false)}
            onPauseChange={pauseGuided}
            // The next step waits for the camera to settle and the checks to catch up.
            ready={!mapMoving && skyRange === checkRange}
            captionHost={captionHost}
            label="Demo"
            tag="DEMO"
          />
        ) : (
          <Tour
            steps={TOUR_STEPS}
            step={tour.step}
            onStepChange={(step) => setTour({ open: true, step, mode: 'tour' })}
            onClose={closeTour}
            onWatchDemo={watchDemoFromTour}
          />
        )
      ) : null}
    </div>
  );
}
