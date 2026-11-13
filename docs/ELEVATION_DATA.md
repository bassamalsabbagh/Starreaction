# South-pole elevation data: loading the first real file

The app can already show **elevation and slope** for any point near the south pole, and the
**Elevation** and **Slope** map layers. Until a file is loaded it says "No elevation data loaded
yet". This page is how to load one. Method and rules: `docs/LANDER_RULES.md`, "Elevation and slope
at a point". Sources: `docs/DATA_SOURCES.md` SRC-048 to SRC-054.

## The file it expects

A NASA PGDA south-pole LOLA elevation GeoTIFF:

| What            | Expected                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------- |
| Bands           | 1: surface height                                                                             |
| Height unit     | metres, above the reference sphere (1737.4 km assumed for the adjusted files; see below)      |
| Projection      | south polar stereographic: centre 90° S, central longitude 0°, scale 1, sphere 1737.4 km      |
| Grid            | x/y in metres, north up, square pixels                                                        |
| Covers          | the pole out to at least the latitude asked for (default 80° S)                               |
| Good first file | `LDEM_80S_80MPP_ADJ.TIF` (80 m, 181 MB) from PGDA product 90, SRC-048 (cite SRC-049)          |
| Too big for now | the 5 m south-pole mosaic `ldem_87s_5mpp.tif` (3.3 GB, SRC-051): over the 2 GB limit, skipped |

The script refuses anything else and says why (another projection, another sphere, feet or
kilometres, several bands, a rotated grid).

## Where it goes

Put the GeoTIFF in **`data-raw/`** at the project root. That folder (and every `.tif`) is
git-ignored: the raw file stays on your laptop and is never committed.

## The one command

Once, set up the script's own Python environment (nothing is installed system-wide):

```powershell
python -m venv scripts/data/.venv
scripts/data/.venv/Scripts/python -m pip install -r scripts/data/requirements.txt
```

Then, for each new file:

```powershell
scripts/data/.venv/Scripts/python scripts/data/elevation_grid.py data-raw/LDEM_80S_80MPP_ADJ.TIF --source SRC-048 --heights-in-metres
```

`--heights-in-metres` is needed only when the file itself doesn't state its height unit; PGDA's
page for this product describes each LDEM file as giving "surface height (in meters)" (SRC-048).
That the heights are above a 1737.4 km sphere is stated only for the older, unadjusted version
(SRC-053), so for the adjusted files it is an assumption until confirmed (checklist step 2 tests
it). `--max-lat -85` covers less and gives finer cells; `--max-size 2048` gives finer cells and a
bigger file (about 16 MB).

It writes two files, which **are** committed once the source is recorded:

- `public/data/elevation/south-pole.f32`: the heights (float32, little-endian, row 0 at the top,
  NaN for gaps), at most 1024 × 1024 cells by default (about 4 MB);
- `src/data/elevation/southPole.json`: the description (size, cell size, projection, source).

Restart `npm run dev` (or rebuild). The place card then shows "Elevation X m · Slope Y°" with the
source and cell size, and the Elevation and Slope layers can be switched on. Then mark the source
**Adopted** in `docs/DATA_SOURCES.md`.

## First real file: checklist

Check three points against the published files before trusting the numbers. "Published values"
here are PGDA's own maps: the height file you loaded, and its slope file (`LDSM_80S_80MPP_ADJ.TIF`,
231 MB, SRC-048). Read them in QGIS with the Identify tool at the same coordinates.

1. **The script ran cleanly:** no "Refused"; the heights it prints are within about −9 to +9 km
   (the Moon's range), and gaps are near 0%.
2. **The pole (90° S):** the app's elevation equals the value the script printed for "the pole",
   and is close to QGIS's value at x = 0, y = 0 on the original file. Expect small differences
   only: the app's cells are averages of 8 × 8 original pixels by default.
3. **A flat spot and a steep spot:** pick one of each from the PGDA product 78 site list (SRC-050;
   their locations are in the product's own files) or anywhere obviously flat or steep in QGIS.
   - Elevation: the app's value should match QGIS within the height change across one app cell.
   - Slope: compare with the LDSM slope file. The app's slope is over the app's cell size (shown
     on the card), so it is **lower** than the 80 m slope on rough ground and close to it on smooth
     ground. A slope several times higher than LDSM, or a flat spot reading steep, means something
     is wrong: stop and check the projection.
4. **Orientation:** longitude 0° must be "up" from the pole on the map and 90° E to the right; a
   point at 85.5° S, 31° E should read the same height in the app and in QGIS. A mirrored or turned
   map shows as heights that match QGIS at the pole but nowhere else.

Write down the three values (app, QGIS, LDSM) in the decision log in `docs/LANDER_RULES.md` when
the file is adopted.

## What it does not do yet

- **No pass/fail on slope:** no lander slope limit is sourced yet. Slope is shown as a fact.
- The map layers redraw the grid once as a single image of the polar cap; at close zoom it is as
  coarse as the grid cells.
- Only the area south of the chosen latitude; points further north say "No elevation data here".
