# Map layers: elevation and slope

How the Phase C map layers are made, what the site serves, and how to check them. Rule:
`docs/LANDER_RULES.md`, "Map layers: elevation and slope". Source: `docs/DATA_SOURCES.md` SRC-073
(origin of the rasters still to be recorded).

## Inputs (from the team)

One folder with, for each layer, a numerical GeoTIFF and its rendered colours:

| File                      | Contents                                                                                     | Status              |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------- |
| `slope_40m.tif`           | float32 degrees, NoData NaN                                                                  | used                |
| `slope_40m_color.tif`     | 8-bit RGBA, the team's slope render                                                          | used                |
| `Elevation.tiff`          | float32 metres, NoData NaN (passed with `--values`; the first `elevation_40m.tif` was empty) | used                |
| `elevation_40m_color.tif` | 8-bit RGBA, the team's elevation render                                                      | used (colours only) |

All four must be 15200 × 15200 at 40 m, uncompressed, one row per strip, south polar stereographic
on the 1737.4 km sphere (centre 90° S, 0° E up, scale 1, PixelIsArea), top-left at −304000,
+304000 m. The script checks all of this (size, pixel size, origin, tiepoint and the GeoTIFF keys)
and stops with a clear message otherwise. The display draws a colour only inside 80° S and only
where the values file holds data, so NoData stays transparent.

## Rebuild (team laptop, offline)

```bash
python scripts/data/make_map_layers.py "<folder with the four files>" --source-id SRC-073 \
  --values elevation="<folder>/Elevation.tiff"
python -m unittest scripts/data/test_make_map_layers.py
```

It needs only numpy (`scripts/data/requirements.txt`) and takes a few minutes. When the elevation
file is replaced with a non-empty one, run it again: elevation values, its legend and its check
points appear without any code change. Then run `npm run check`; `tests/unit/services/mapLayers.test.ts`
re-reads every check point through the app's own code.

## What the site serves

| Path                                                    | What                                                        | Size                           |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `src/data/layers/index.json`                            | grid, encoding, tile list, image bounds, legend (bundled)   | small                          |
| `public/data/layers/<layer>/display/preview-q*.png`     | 4 quarters of 80–90° S, 512 px, shown first                 | ~0.7 MB each                   |
| `public/data/layers/<layer>/display/base-q*.png`        | the same quarters, 2048 px (~160 m)                         | slope ~9.8 MB, elev ~2 MB each |
| `public/data/layers/<layer>/display/im1.png, im2.png`   | 40 m colours in the patches, transparent outside the square | slope ~2.5 MB, elev ~0.2 MB    |
| `public/data/layers/<layer>/values/<level>/<r>_<c>.bin` | 256 × 256 value tiles (see encoding)                        | slope 30.3 MB in all           |

In all: 482 files, about 112 MB. A browser downloads a layer's images only when the layer is
switched on (preview first), and one 128 KB value tile per new spot the cursor visits (cached).

**Encoding of the value tiles:** little-endian, row 0 at the top. Elevation int16, metres, signed,
value = stored × 1 m + 0 m, NoData −32768. Slope uint16, degrees = stored × 0.01, NoData 65535. A
stored 0 is a real 0. Levels: `base` = 160 m (each value the mean of the 4 × 4 underlying 40 m pixels
that hold data) for 80–90° S; `im1`, `im2` = the original 40 m pixels in a 40.96 km square around each
site. A tile that would hold no data is not written; the app reads that as "No data".

## Hosting requirements

- **Static files only.** No server code, database or tile server. Vercel serves `public/` as-is with
  the rest of the site; nothing to configure. The `.bin` tiles are fetched from the same origin, so
  no CORS setup is needed.
- **Size:** about 112 MB and 482 files are added to the deployment and to the repository. Check the
  hosting plan's limits on deployment size and file count before deploying.
- **Elsewhere:** to serve the layers from another host (e.g. a storage bucket or CDN), copy
  `public/data/layers/` there, allow CORS `GET` from the site's origin, and change
  `layerFileUrl` in `src/services/mapLayers.ts` to that base URL.
- **Caching:** the files never change between rebuilds; long cache lifetimes are safe (rebuilding
  overwrites them, so redeploying refreshes them).
- **Venue network:** switching slope on downloads ~3 MB of previews at once and ~39 MB of full
  images behind them. On a slow network the previews stay visible; the readout does not depend on
  the images.

## Checking against QGIS

`docs/LAYER_CHECK.md` lists points with their latitude and longitude, their stereographic x, y in
metres (the rasters' own coordinates), the original pixel value and the decoded value. In QGIS, open
`slope_40m.tif`, use **Identify Features** at the x, y given (project CRS = the raster's CRS), and
compare with the "Original pixel" column. Inside the IM-1 and IM-2 patches the app shows that pixel
value to 0.01°; elsewhere it shows the 160 m mean (the "Expected" column).

## Limits

- 160 m outside the patches: smaller slopes are averaged out (the readout says which resolution).
- The display images are copied by nearest pixel to a longitude/latitude grid: exact colours, but
  some pixels of the 40 m render are skipped at the 160 m view.
- No terrain horizons for IM-1 and IM-2 yet: the elevation file now allows them, but running the
  horizon pipeline changes the sites' checks and needs the team's go-ahead.
- The rasters' origin and processing are not yet recorded (SRC-073).
