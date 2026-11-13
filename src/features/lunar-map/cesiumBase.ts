// Must run before the first `cesium` import is evaluated: Cesium resolves its workers and assets
// from this base URL. scripts/copy-cesium-assets.mjs puts them in public/cesium.
declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

window.CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;

export {};
