# Project Plan — CLPS Lunar Mission Browser

**Event:** NASA Space Apps Challenge 2026, Amman — November 14–15, 2026
**Team size:** 4

## Vision

An interactive, Google Maps-style lunar mission browser. Users can:

1. Pan and zoom a lunar map showing landing locations.
2. Select a CLPS lander and see which candidate sites are compatible with it.
3. Compare candidate sites side by side.
4. Understand site rankings **and the reasoning behind them**.
5. ~~Explore documented mission risks and outcomes (the Lessons page).~~ Removed 2026-11-14 by
   team decision; the past landings (IM-1, IM-2, Blue Ghost 1, Chandrayaan-3) remain as
   "Past landings" in the wizard's Location step, with their sourced facts under More details.

The vision is the direction, not a commitment to build everything. Scope is cut to what can be
demonstrated reliably.

## Guiding principles

- **Sourced over impressive:** every fact shown has a citation (see `DATA_SOURCES.md`).
- **Transparent ranking:** criteria, weights and rationale are documented before they are coded.
- **Always runnable:** `npm run check` stays green on `main`.
- **Minimal dependencies:** static front-end only; no backend.

## Milestones (proposed — adjust as a team)

| #   | Milestone                                                                                       | Status  |
| --- | ----------------------------------------------------------------------------------------------- | ------- |
| M0  | Project foundation: tooling, structure, docs, agents, starter page                              | Done    |
| M1  | Decide lunar basemap + map projection; research and cite initial mission set (incl. IM-1, IM-2) | Pending |
| M2  | Map MVP: lunar basemap renders, sourced landing locations as markers, mission detail panel      | Pending |
| M3  | Lander selection + site comparison; ranking criteria documented in `LANDER_RULES.md` and coded  | Pending |
| M4  | Feature freeze, QA pass, demo rehearsal (`DEMO_SCRIPT.md`)                                      | Pending |
| M5  | Hackathon: polish, presentation, submission                                                     | Pending |

## Suggested team roles (4 people)

- **Map lead:** `features/lunar-map` — basemap, projection, markers, zoom/pan.
- **Data lead:** `data/`, `services/`, `DATA_SOURCES.md` — research, citations, data schema.
- **Lander and ranking lead:** `features/landers`, `features/site-ranking`, `LANDER_RULES.md`.
- **UX and demo lead:** `features/missions`, layout, accessibility, `DEMO_SCRIPT.md`, presentation.

## Open decisions (need team input)

1. **Lunar basemap source.** Candidates to investigate include NASA's Moon Trek and USGS
   Astrogeology lunar mosaics. Each must be verified for tile availability, projection, usage terms
   and offline/demo reliability.
   - **Status:** candidates researched and recorded in `DATA_SOURCES.md` as
     **candidate — not adopted**. **No basemap is adopted.** Licence, attribution, CORS and polar
     coverage are still unresolved (see the "Unresolved questions" list there and KI-008).
2. **Map projection / Leaflet CRS.** Leaflet's default CRS (EPSG:3857 Web Mercator) assumes Earth.
   The CRS must match the chosen lunar tile set (for example an equirectangular/simple-cylindrical
   grid). Coordinates must be stored as selenographic latitude/longitude with the convention
   documented.
   - **Superseded (user-approved):** the map engine is now **CesiumJS**, not Leaflet,
     so the bullets below describe the earlier Leaflet setup.
     - **Shape:** Cesium's Moon ellipsoid (`Ellipsoid.MOON`).
     - **Views:** one 3D view with the camera held straight down, so it zooms
       continuously from the whole Moon to a flat-looking close-up (500 m minimum height). The
       earlier flat Web Mercator view and its 3D/flat toggle were removed. No Cesium ion.
     - **Imagery:** Moon Trek WMTS tiles, read with a geographic tiling scheme. Still a preview, not
       adopted (KI-010).
     - **Stored coordinates are unchanged:** latitude/longitude in the provisional convention.
     - **Leaflet removed:** the Earth-radius limitation (KI-007) no longer applies, and Leaflet is
       uninstalled. Cost: KI-011.
   - **Interim decision (provisional):** until a basemap is verified, the planned map
     (implementation step 3, not yet built) is a tile-free Leaflet viewport with a coordinate grid,
     with no tiles and no tile requests. Coordinates use latitude −90° to +90° and longitude −180° to
     +180°, east-positive (`COORDINATE_CONVENTION` in `src/utils/selenographic.ts`). This convention
     **must be confirmed against the eventual data sources** before real data is added (see KI-006).
   - **CRS decision (provisional):** the viewport will use Leaflet's `L.CRS.EPSG4326`,
     not `L.CRS.Simple`.
     - **Why:** it is an equirectangular longitude/latitude projection. Its tile layout (two
       256 × 256 tiles at zoom 0, origin (−180, +90); `DATA_SOURCES.md` SRC-016) matches the
       candidate Moon Trek tile grid (SRC-001). If that candidate is adopted later, stored
       coordinates would not need to change. This match is an inference that has not been tested
       with real tiles, and it does **not** mean Moon Trek is approved.
     - **Limitations:** in the installed Leaflet 1.9.4 source, `EPSG4326` is built on Leaflet's
       Earth CRS:
       - Earth radius `R: 6371000` m.
       - `map.distance()` uses that radius.
       - The scale control uses `map.distance()`.
       - `L.Circle` converts radii in metres using the Earth radius.
       - Longitude wraps at ±180°.

       All metre-based and distance-based Leaflet features would therefore give **Earth values,
       which are wrong for the Moon** (see KI-007).

     - **Rules for step 3:**
       - No basemap tiles.
       - No scale bar.
       - No `map.distance()`, and no metre-radius `L.Circle` (use pixel-based `L.CircleMarker`).
       - No Earth-based distance or area calculations.

       If lunar distances are ever needed, compute them in our own tested helper with the
       1737.4 km reference sphere (SRC-012), after a separate approval.

     - **Polar regions** are strongly stretched in this projection (KI-009).
3. **Data format.** Recommendation: small typed datasets in `src/data/` (type-checked at build),
   large GeoJSON in `public/data/`. Validate records in unit tests.
4. **Ranking methodology.** Which criteria, from which sources, and how they are combined. Must be
   documented and justified in `LANDER_RULES.md` first.
5. **Competition rules.** Confirm the Space Apps 2026 rules on work prepared before the event and
   on use of AI tools, and how they should be disclosed. _Not yet verified._

## Out of scope (unless the team approves)

Backend or database, user accounts, paid APIs, 3D globe rendering, live telemetry, mobile app.
