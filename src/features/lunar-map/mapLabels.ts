/**
 * NASA/JPL Moon Trek, LRO WAC global mosaic (docs/DATA_SOURCES.md SRC-001, SRC-003; re-checked
 * 2026-10-25): a CANDIDATE, not adopted. Moon Trek states no licence or attribution terms (KI-008),
 * so it is shown only as a labelled preview. The WMTS template, layer, style and tile matrix set
 * are as published in the capabilities document, including the double slash after 1.0.0. Its tile
 * grid (2×1 tiles at level 0, origin −180, +90) is a geographic tiling scheme, which Cesium reads
 * natively. Levels 0–8 exist (level 9 is 404); level 8 is about 83 m per pixel, so zooming closer
 * than that only magnifies.
 */
export const PREVIEW_IMAGERY = {
  wmtsTemplate:
    'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0//{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
  layer: 'LRO_WAC_Mosaic_Global_303ppd_v02',
  style: 'default',
  tileMatrixSetID: 'default028mm',
  format: 'image/jpeg',
  maximumLevel: 8,
  credit: 'NASA/JPL Moon Trek, LRO WAC global mosaic',
} as const;

/** The short credit for the close-up tiles, shown under "Data sources". */
export const IMAGERY_CREDIT = 'Imagery: NASA/JPL Moon Trek';

/**
 * LROC's published credit line for its images (docs/DATA_SOURCES.md SRC-017, accessed 2026-10-25). Using
 * it for Trek tiles is a team assumption: Trek itself publishes no attribution text.
 */
export const LROC_CREDIT = 'LRO WAC mosaic: NASA/GSFC/Arizona State University';

export const MOON_TREK_URL = 'https://trek.nasa.gov/moon/';

/** Tile errors (with none loaded) after which the preview counts as failed. */
export const PREVIEW_FAILURE_THRESHOLD = 3;

export type ImageryStatus = 'loading' | 'loaded' | 'failed';
