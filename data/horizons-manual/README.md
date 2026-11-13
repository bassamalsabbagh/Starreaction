# Manual JPL Horizons exports (Ayah)

Exported by Ayah from the Horizons web app (https://ssd.jpl.nasa.gov/horizons/app.html) on
2026-11-13, observer on the Moon at each site, 2026-11-13 to 2026-12-13 UT, 1-day steps.
`scripts/horizons_check.ts` compares them with the app's API data (docs/HORIZONS_CHECK.md;
docs/DATA_SOURCES.md SRC-056). The check finds each file's site from its "Center geodetic" header
line, not from its name. The files are byte-for-byte copies of the originals.

| File            | Original name                           | Target | Site (header lon E, lat) |
| --------------- | --------------------------------------- | ------ | ------------------------ |
| `earth-im1.txt` | `horizons_results earth im1.txt`        | Earth  | 1.44, −80.13             |
| `earth-im2.txt` | `horizons_results earth im2.txt`        | Earth  | 29.2, −84.79             |
| `earth-bg1.txt` | `horizons_results earth Blue Ghost.txt` | Earth  | 61.8103, 18.5623         |
| `earth-ch3.txt` | `horizons_result earth Chandrayaan.txt` | Earth  | 32.319, −69.373          |
| `sun-im2.txt`   | `horizons_results sun im2.txt`          | Sun    | 29.19567, −84.79059      |
| `sun-bg1.txt`   | `horizons_results sun blue.txt`         | Sun    | 61.81, 18.56 (rounded)   |
| `sun-ch3.txt`   | `horizons_results sun(5).txt`           | Sun    | 32.319, −69.373          |

**Missing:** a Sun export for im1 (IM-1).
