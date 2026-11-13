import { loadVisibilityFrame, sampleVisibility } from './visibility-data.mjs';

// Uses the application's existing Cesium module; no new package or backend.
export class CesiumVisibilityController {
  constructor(Cesium, viewer, baseUrl, manifest, onApplied = () => {}) {
    this.C = Cesium; this.viewer = viewer; this.manifest = manifest;
    this.baseUrl = baseUrl; this.onApplied = onApplied;
    this.version = 0; this.current = null; this.abort = null; this.disposed = false;
    this.options = { sun: { show: true, alpha: 0.8 }, earth: { show: false, alpha: 0.8 } };
    this.layers = {};
    this.supportedTimes = [...new Set(manifest.frames.map(f => f.time_utc))].sort();
  }

  static async create(Cesium, viewer, manifestUrl, onApplied) {
    const url = new URL(manifestUrl, globalThis.location?.href ?? 'http://localhost/');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Visibility manifest failed: ${response.status}`);
    const manifest = await response.json();
    if (Math.abs(viewer.scene.globe.ellipsoid.maximumRadius - 1737400) > 1) {
      throw new Error('Visibility assets require the 1,737,400 m lunar sphere');
    }
    return new CesiumVisibilityController(Cesium, viewer, new URL('.', url).href, manifest, onApplied);
  }

  async setTime(timeUTC) {
    if (this.disposed) throw new Error('Visibility controller has been disposed');
    if (typeof timeUTC !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(timeUTC)) {
      throw new Error('Timestamp must include Z or an explicit timezone offset');
    }
    const parsed = new Date(timeUTC);
    if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid UTC timestamp');
    const stamp = parsed.toISOString().replace('.000Z', 'Z');
    if (!this.supportedTimes.includes(stamp)) {
      throw new Error('Choose a supported 10-minute UTC timestamp within the supplied date range');
    }
    this.abort?.abort();
    const abort = new AbortController(); this.abort = abort;
    const generation = ++this.version;
    const prepared = await Promise.all(['sun', 'earth'].map(async target => {
      const item = await loadVisibilityFrame(this.baseUrl, this.manifest, target, stamp, abort.signal);
      const provider = await this.C.SingleTileImageryProvider.fromUrl(item.imageUrl, {
        rectangle: this.C.Rectangle.fromDegrees(...item.frame.rectangle_degrees),
        ellipsoid: this.C.Ellipsoid.MOON,
        credit: 'LOLA / JPL Horizons — provisional geometric visibility'
      });
      return { target, item, provider };
    }));
    if (generation !== this.version || this.disposed) return false;
    // Add hidden first; preserve old layers if either new provider fails.
    const staged = [];
    try {
      for (const p of prepared) {
        const layer = this.viewer.imageryLayers.addImageryProvider(p.provider);
        layer.show = false; staged.push({ ...p, layer });
      }
    } catch (error) {
      for (const p of staged) this.viewer.imageryLayers.remove(p.layer, true);
      throw error;
    }
    for (const old of Object.values(this.layers)) this.viewer.imageryLayers.remove(old, true);
    this.layers = {}; const grids = {};
    for (const p of staged) {
      this.layers[p.target] = p.layer; grids[p.target] = p.item.grid;
      p.layer.show = this.options[p.target].show;
      p.layer.alpha = this.options[p.target].alpha;
    }
    this.current = { timeUTC: stamp, grids };
    this.viewer.scene.requestRender();
    this.onApplied(stamp);
    return true;
  }

  setVisible(target, visible) {
    if (!this.options[target]) throw new Error('Unknown target');
    this.options[target].show = Boolean(visible);
    if (this.layers[target]) this.layers[target].show = Boolean(visible);
    this.viewer.scene.requestRender();
  }

  setOpacity(target, alpha) {
    if (!this.options[target] || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      throw new Error('Opacity must be between 0 and 1 for sun or earth');
    }
    this.options[target].alpha = alpha;
    if (this.layers[target]) this.layers[target].alpha = alpha;
    this.viewer.scene.requestRender();
  }

  sample(target, longitudeEastDegrees, latitudeDegrees) {
    const grid = this.current?.grids[target];
    if (!grid) return null;
    const value = sampleVisibility(grid, longitudeEastDegrees, latitudeDegrees);
    return value === null ? null : { fraction: value, percentage: 100 * value,
                                    timeUTC: this.current.timeUTC,
                                    resolutionMeters: grid.source_pixel_spacing_m };
  }

  dispose() {
    this.disposed = true; ++this.version; this.abort?.abort();
    for (const layer of Object.values(this.layers)) this.viewer.imageryLayers.remove(layer, true);
    this.layers = {}; this.current = null;
    this.viewer.scene.requestRender();
  }
}
