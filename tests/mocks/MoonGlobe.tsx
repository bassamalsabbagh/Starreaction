// jsdom has no WebGL, so CesiumJS cannot run in unit tests (KNOWN_ISSUES KI-003). This stand-in
// keeps MoonGlobe's props contract testable: beacons become buttons, grid lines become markers, the
// real MapControls render, and two buttons drive the imagery status. The real globe needs manual
// browser verification.
import { useEffect, useState, type RefObject } from 'react';
import type { RankedSite } from '../../src/data/demoData';
import { MapControls } from '../../src/features/lunar-map/MapControls';
import type { MapController, ViewInsets } from '../../src/features/lunar-map/cameraControls';
import type { LayerDisplay } from '../../src/features/lunar-map/mapLayerState';
import type { ImageryStatus } from '../../src/features/lunar-map/mapLabels';
import type { FlyRequest } from '../../src/features/lunar-map/MoonGlobe';

interface MoonGlobeProps {
  rankedSites: readonly RankedSite[];
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
  mapLayers?: readonly LayerDisplay[];
  onToggleLayers?: () => void;
  layersOpen?: boolean;
  onHoverGround?: (point: { lat: number; lon: number } | null) => void;
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
  mapLayers = [],
  onToggleLayers,
  layersOpen = false,
  onHoverGround,
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
      data-layers={
        mapLayers
          .filter((layer) => layer.visible)
          .map((layer) => `${layer.id}:${layer.opacity}`)
          .join(' ') || 'none'
      }
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
          onToggleLayers={onToggleLayers}
          layersOpen={layersOpen}
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
      {/* A click on bare ground, at a fixed made-up spot away from every landing site. */}
      <button type="button" onClick={() => onPickPoint?.({ lat: 20.25, lon: 40.5 })}>
        simulate ground click
      </button>
      {/* The pointer over IM-1's site, for the map layers' readout (as the real globe reports). */}
      <button type="button" onClick={() => onHoverGround?.({ lat: -80.13, lon: 1.44 })}>
        simulate hover over IM-1
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
