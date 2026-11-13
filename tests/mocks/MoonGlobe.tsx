// jsdom has no WebGL, so CesiumJS cannot run in unit tests (KNOWN_ISSUES KI-003). This stand-in
// keeps MoonGlobe's props contract testable: beacons become buttons, grid lines become markers, the
// real MapControls render, and two buttons drive the imagery status. The real globe needs manual
// browser verification.
import { useEffect, useState, type RefObject } from 'react';
import type { RankedDemoSite } from '../../src/data/demoData';
import { MapControls } from '../../src/features/lunar-map/MapControls';
import type { MapController, ViewInsets } from '../../src/features/lunar-map/cameraControls';
import type { ElevationLayer } from '../../src/utils/elevationGrid';
import type { ImageryStatus } from '../../src/features/lunar-map/mapLabels';
import type { FlyRequest } from '../../src/features/lunar-map/MoonGlobe';

interface MoonGlobeProps {
  rankedSites: readonly RankedDemoSite[];
  selectedSiteId: string | null;
  hoveredSiteId: string | null;
  onHoverSite: (siteId: string | null) => void;
  flyRequest: FlyRequest | null;
  onSelectSite: (siteId: string) => void;
  /** A point checked anywhere on the Moon, marked on the map. */
  pickedPoint?: { lat: number; lon: number } | null;
  /** A click on bare ground (no beacon). */
  onPickPoint?: (point: { lat: number; lon: number }) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  imageryStatus: ImageryStatus;
  onImageryStatusChange: (status: ImageryStatus) => void;
  viewInsets: ViewInsets | null;
  time: number;
  controllerRef?: RefObject<MapController | null>;
  controlsHidden?: boolean;
  onPresent?: () => void;
  elevationLayer?: { layer: ElevationLayer } | null;
  elevationAvailable?: boolean;
  onElevationLayerChange?: (layer: ElevationLayer | null) => void;
}

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
  onImageryStatusChange,
  controllerRef,
  controlsHidden = false,
  onPresent,
  elevationLayer = null,
  elevationAvailable = false,
  onElevationLayerChange,
}: MoonGlobeProps) {
  const noop = () => undefined;
  // The camera stand-in: counts whole-Moon calls and remembers the view it was asked to restore.
  const [wholeCount, setWholeCount] = useState(0);
  const [view, setView] = useState('start');
  useEffect(() => {
    if (!controllerRef) return undefined;
    controllerRef.current = {
      showWholeMoon: () => {
        setWholeCount((count) => count + 1);
        setView('whole');
      },
      showSouthPole: () => setView('south-pole'),
      saveView: () => view,
      restoreView: (saved) => setView(`restored:${String(saved)}`),
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, view]);
  return (
    <div
      data-testid="moon-globe"
      data-whole-count={wholeCount}
      data-camera-view={view}
      data-fly-site={flyRequest?.siteId ?? 'none'}
      data-fly-seq={flyRequest?.seq ?? 0}
      data-fly-point={
        flyRequest?.point ? `${flyRequest.point.lat},${flyRequest.point.lon}` : 'none'
      }
      data-picked={pickedPoint ? `${pickedPoint.lat},${pickedPoint.lon}` : 'none'}
    >
      {/* Presentation mode hides the column, as the real map does. */}
      {controlsHidden ? null : (
        <MapControls
          onZoomIn={noop}
          onZoomOut={noop}
          onWholeMoon={noop}
          onSouthPole={() => controllerRef?.current?.showSouthPole()}
          showGrid={showGrid}
          onShowGridChange={onShowGridChange}
          onPresent={onPresent}
          elevationLayer={elevationLayer?.layer ?? null}
          elevationAvailable={elevationAvailable}
          onElevationLayerChange={onElevationLayerChange}
        />
      )}
      {showGrid ? <span data-testid="graticule-line" /> : null}
      {rankedSites.map(({ site, rank }) => (
        <button
          key={site.id}
          type="button"
          data-testid="map-marker"
          data-rank={rank ?? 'none'}
          data-selected={site.id === selectedSiteId}
          data-hovered={site.id === hoveredSiteId}
          onClick={() => onSelectSite(site.id)}
          onMouseEnter={() => onHoverSite(site.id)}
          onMouseLeave={() => onHoverSite(null)}
        >
          {site.name}
        </button>
      ))}
      {/* A click on bare ground, at a fixed made-up spot away from every demo site. */}
      <button type="button" onClick={() => onPickPoint?.({ lat: 20.25, lon: 40.5 })}>
        simulate ground click
      </button>
      <button type="button" onClick={() => onImageryStatusChange('loaded')}>
        simulate tiles loaded
      </button>
      <button type="button" onClick={() => onImageryStatusChange('failed')}>
        simulate tiles failed
      </button>
    </div>
  );
}
