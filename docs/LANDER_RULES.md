# Lander Rules and Site-Ranking Methodology

This document defines **how** lander constraints and site rankings are represented. It must be
filled in with sourced values **before** any constraint or scoring logic is implemented in code.

> **Status (2026-11-13):** the sites are now the four **real** landings (data/sites.json, "Real
> landing sites" below) with Sun and Earth positions from JPL Horizons. The **missions** (their
> minimum Sun and Earth heights, days of power and relay) are still made up for practice and keep
> their "Demo Mission" names. Lander facts come only from `data/landers.json` with sources ("Lander
> night survival"). No weighted score is used anywhere.

## Rules for this document

- Every constraint value cites a source ID from `DATA_SOURCES.md`.
- Values that are estimates, inferred or team assumptions are labelled **Assumption** and shown as
  such in the UI.
- If a constraint is unknown, write **Unknown**. Do not guess.
- Ranking criteria, weights and their rationale are agreed by the team and recorded here, with a
  date, before code is written.

## Lander profile template

Copy this block for each lander.

```markdown
### <Lander name> (<Provider>)

| Field                  | Value | Unit | Source ID | Status (Sourced / Assumption / Unknown) |
| ---------------------- | ----- | ---- | --------- | --------------------------------------- |
| CLPS task order(s)     |       |      |           |                                         |
| Missions flown/planned |       |      |           |                                         |
| Constraint: …          |       |      |           |                                         |

Notes:
```

Constraint categories to investigate (names only, no values implied): landing latitude range,
terrain slope and roughness tolerance, landing ellipse size, lighting and solar power needs,
direct-to-Earth communication visibility, thermal environment, payload mass class.

## Site-ranking methodology

_Not yet defined._ When defined, record:

1. **Criteria:** what is measured, its unit, and its data source.
2. **Eligibility filters:** hard constraints that exclude a site for a lander.
3. **Scoring:** how criteria are normalised and combined, with the rationale for each weight.
4. **Explanation:** how the UI shows the user why a site ranked where it did.
5. **Limitations:** what the ranking does _not_ account for.

## Practice demo fixture (not a methodology)

`src/data/demoData.ts` holds the made-up mission profiles (Demo Mission A, B, C) and the checks.
Since 2026-11-13 the **sites are real** (data/sites.json, below) and the demo sites are gone. **The
mission needs in this section are DEMO** (made up for practice); the Sun and Earth positions are
real.

### In plain words (agreed 2026-11-11)

The app answers the challenge's question for a place and a date: **does the mission get sunlight
for power, and the Earth in view to talk home?** A mission is described by its **needs**: the
lowest Sun height its panels can use (`minSunElevationDeg`), the days of unbroken power it needs
(`daysNeeded`), the lowest Earth height for direct contact (`minEarthElevationDeg`), and whether it
has a relay (`hasRelay`). Every site, and any point the user picks, gets the same checks from the
real Sun and Earth. There is **no score**: sites are listed by their longest usable window.

### The checks (checked in this order, every failure listed; split into three 2026-11-13)

Each check measures one thing, and its name says which:

1. **Power (the Sun only):** the longest unbroken stretch inside the range with the Sun at or above
   `minSunElevationDeg` must last at least `daysNeeded` → fails as "Not enough sunlight for its
   power".
2. **Comms (the Earth only):** without a relay, the Earth must reach `minEarthElevationDeg` at some
   point in the range → fails as "No line of sight to Earth". A mission with a relay always passes.
3. **Usable window (the Sun and the Earth both; the Sun only with a relay):** the longest unbroken
   stretch inside the range with the Sun at or above `minSunElevationDeg` and the Earth at or above
   `minEarthElevationDeg` at the same time must last at least `daysNeeded` → fails as "Not enough
   time with Sun and Earth both up". With a relay the usable window **is** the power stretch, so
   this check is not listed separately (it would only repeat Power).

A place that passes them all is **suitable** ("Power and comms OK for …"). A stretch cut by the
range's edge counts only the part inside the range. The split changes no result: a usable window
of `daysNeeded` already means the Sun was up that long and the Earth was up at some point, so the
same places pass as before; a failing place now names each thing it lacks. Compare shows one row
per check (Power, Comms, Usable window); its "Best" for the usable window is the Sites list's best.

### Order of the Sites list

Suitable sites first, numbered, then the rest without a number. The order is the user's choice.
Whatever the order, **"best"** (the highlighted card, the time bar's "Best site", the demo and the
"Launch slipped?" sentence) always means the suitable site with the longest usable window, ties by
name (2026-11-12):

| Order               | Sorted by (highest first; ties by name)                       |
| ------------------- | ------------------------------------------------------------- |
| Longest window      | the usable stretch the power check uses (default)             |
| Most hours of Sun   | hours in the range with the Sun up (`minSunElevationDeg`)     |
| Most hours of Earth | hours in the range with the Earth up (`minEarthElevationDeg`) |
| Most hours of both  | hours in the range with both up at once                       |
| Name                | A–Z                                                           |

The two share-based orders (most sunlight, most Earth time) were replaced by hours on 2026-11-13
("Date range and hours" below).

These are orderings of measured values, not a weighted score; no weights are involved.

### % of mission needs met (agreed 2026-11-12, built 2026-11-13)

**% of mission needs met** = longest usable window ÷ power days needed (`daysNeeded`), capped at
100%. Sites below 100% show the percentage and what's missing. Sites at 100% show the window length
and how many times over the need it is (for example "13.1 d, 6.5× what it needs"). The Sites list
stays ordered by longest usable window. An open-ended window (a long polar day; its true length is
not known) gives only a lower bound, so both numbers say "at least" (for example "at least 6.5×",
"at least 80%").

- **Which window:** the usable window inside the checked month (`usableDays`, what the checks use).
- **Rounding:** the percentage and the "×" are rounded down and the days short are rounded up (to
  one decimal), so a near miss never reads as met and a shortfall never reads as none.
- **Where:** Site details ("Mission needs met"), each Sites list row ("6.5× what it needs"; a site
  that is not suitable shows "61% of needs met · 1.2 d short of 3 d") and a Compare row. Code:
  `src/data/needsMet.ts`.

### Is it up: the upper limb (agreed 2026-11-13)

A body is **up** (visible over the horizon) when any part of its disc is: its **upper limb** is
above the horizon, **elevation + angular radius > horizon elevation**, with angular radius =
asin(R ÷ distance). R_sun = 695,700 km and R_earth = 6,378.137 km (the "Target radii" in the JPL
Horizons headers, SRC-055); the distance is the site-to-body distance at that time from our engine
(astronomy-engine, SRC-022), also for the hours whose direction comes from Horizons (the Horizons
files hold only azimuth and elevation). This matches Horizons' `*` and `i` flags and PGDA product
69 ("any part of the disc visible", SRC-069).

- **Where:** every horizon test, flat (0°) and terrain: whether the Sun or the Earth is up in the
  checks, shares, hours and windows; the longest darkness and night survival; sunset, sunrise,
  Earthset and Earthrise; the Timeline bars; the year's Sun and Earth % (2027).
- **The mission's minimum heights stay on the disc's centre:** "Sun at least 5° up" is a power need,
  not visibility, so a body counts for a mission when its upper limb is above the horizon **and**
  its centre is at or above the mission's minimum.
- Replaces the centre rule used until 2026-11-13. Decision by the user, checked against their own
  cloud computation (2027, flat horizon): IM-1 Sun 49.5 % / Earth 100 %, IM-2 Sun 50.2 % / Earth
  79.1 %.

### Real landing sites (agreed 2026-11-13)

The Sites list, Compare, the map and the assistant use the four real landings in `data/sites.json`,
read and checked by `src/services/sites.ts` (every problem listed; a bad file fails the tests):

| id  | Name                 | Region                            | Lat (N+) | Lon (E+) | Lander          | Landed     |
| --- | -------------------- | --------------------------------- | -------- | -------- | --------------- | ---------- |
| im1 | IM-1 Odysseus        | near Malapert A                   | −80.1300 | 1.4400   | `nova-c`        | 2024-02-22 |
| im2 | IM-2 Athena          | Mons Mouton region                | −84.7906 | 29.1957  | `nova-c`        | 2025-03-06 |
| bg1 | Blue Ghost Mission 1 | near Mons Latreille, Mare Crisium | 18.5623  | 61.8103  | `blue-ghost-1`  | 2025-03-02 |
| ch3 | Chandrayaan-3 Vikram | Shiv Shakti Point                 | −69.3741 | 32.3200  | `chandrayaan-3` | 2023-08-23 |

- **Schema:** id, name, region (or null), lat (north-positive), lonEast (east-positive), landerId
  (a lander in `data/landers.json`), landingDateUtc, landingOutcome and landingOutcomeSource,
  missionOutcome and missionOutcomeSource, coordSource, coordNote (or null), sourceIds (DATA_SOURCES
  ids), why. Each source is a URL or "TODO (…)"; a value whose own source is a TODO is tagged
  "source TODO".
- **Sources (Ayah, 2026-11-13):** every coordinate is LROC's (SRC-057 to SRC-060), and each
  landing and mission outcome has its own source (SRC-024, SRC-027, SRC-035, SRC-058, SRC-060 to
  SRC-063). ch3 uses LROC's observed site; its note says ISRO's planned target was 69.367621° S,
  32.348126° E (DATA_SOURCES conflict 16). IM-1's tilt after landing is not sourced and not shown.
  Landing dates: SRC-023, SRC-027, SRC-035, SRC-032. The "why" lines are team drafts. Landing
  outcome and mission outcome are separate fields and both are shown.
- **Terrain:** im1 and im2 (south of 80° S) use a LOLA terrain horizon once the elevation file is
  loaded (Phase C); until then, and always for bg1 and ch3, the horizon is flat and labelled "Flat
  horizon: no terrain data for this site". im1 sits on the 80° S edge of the polar map: any
  direction whose ray reaches the edge of the data before its full distance is labelled "cut off
  at data edge".
- **Labels:** the "Data: Demo" label is removed (the sites are real). The missions stay made up and
  keep their "Demo Mission" names, and the mission picker and About page say so.

### Sun and Earth positions: JPL Horizons (agreed 2026-11-13)

- **Fixed sites:** the Sun's and the Earth's airless apparent azimuth and elevation, seen from the
  site on the 1737.4 km reference sphere at 0 km altitude (a reference height, not measured
  terrain), every 10 minutes from 2026-11-01 00:00 to 2027-12-31 23:50 UTC, from the JPL Horizons
  API (SRC-055; `scripts/fetch_horizons.ts`, `src/services/horizonsData.ts`). Labelled "Sun and
  Earth positions: JPL Horizons".
- **Same checks:** every check, share, window and night uses one sample per whole hour, as before;
  for a fixed site each hour's sample is the Horizons value at that time. A body is **up** when its
  centre is at or above the mission's minimum height and, where the site has a terrain horizon,
  above the terrain in its direction; otherwise above the flat horizon.
- **Sunset and Earthset for fixed sites:** found from the 10-minute Horizons samples, the crossing
  placed by straight-line interpolation between the two samples around it.
- **Clicked points, and dates outside the files:** our engine (astronomy-engine, SRC-022), labelled
  "Sun and Earth positions: our engine (checked against JPL Horizons)". A range only partly inside
  the files uses Horizons for the hours it covers and the engine for the rest, and says so.
- The browser never calls Horizons. "View in JPL Horizons" (Site details) opens the same API query
  for the selected site and range in a new tab: plain text, 1-hour steps, `QUANTITIES='4'`, one
  link for the Sun and one for the Earth (Horizons takes one target per request).

### Checked against JPL Horizons (agreed 2026-11-13)

`npm run horizons:check` (`scripts/horizons_check.ts`) writes `docs/HORIZONS_CHECK.md` and the About
page's table (`src/data/horizonsCheck.json`):

- **(a)** Our engine (no terrain) against the API files for im1 and im2 over three days, every 10
  minutes: the largest and mean elevation difference per body; **fails above 0.2°**. The Earth's
  parallax from the site is at most about 0.26°, so an Earth failure with a Sun pass would mean the
  engine measures from the Moon's centre.
- **(b)** Ayah's web-app exports (SRC-056): each row's `*` (daylight) and `i` (Earth up) flag must
  agree with the API data at the same time. Horizons sets these flags from the disc's **upper
  limb**, the API data gives the **centre**, so every row is judged by the upper limb (rule "Is it
  up: the upper limb": centre + asin(R ÷ distance) > 0°). Rows with the centre within 1° of the
  horizon are listed as close calls; they are judged too.
- **(c)** The exports with "Azi (a-app) Elev" columns (bg1 and ch3 Sun): elevations must match the
  API data within 0.2° (bg1's rounded coordinates, about 70 m, are negligible).
- A file whose header does not say "Center body name: Moon (301)" is skipped and reported.
- **Result (2026-11-13):** all pass. (a) at most 0.0068° (Sun) and 0.0055° (Earth); (b) all 434 flag rows
  in the 7 files agree, the 28 close calls included (upper limb, re-checked 2026-11-13); (c) at most
  0.0058° (ch3, after its coordinates moved about 40 m from those in Ayah's export; re-checked 2026-11-13).

### Date range and hours (agreed 2026-11-13)

- **Range:** start and stop dates (UTC) in the Mission panel: from 00:00 UTC on the start date to
  00:00 UTC after the stop date (the stop date is included). Until the user picks dates, the range
  is the time bar's 29.5 days, as before. At most 12 months.
- **Delay 1 week / Delay 1 month** shift both dates by 7 days, or by one calendar month (a day the
  month lacks becomes its last day). The "Launch slipped?" assistant can also fill the range
  ("between 12 Dec and 25 Dec": the AI only reads the two dates from the text; the app checks
  them). As built: every number and the month must appear in the text; a missing day means the
  1st on the first date and the month's last day on the last; a missing year on the first date
  means the next one on or after the time bar's month, and on the last date the next one on or
  after the first date's month (so "28 Nov to 5 Dec" read in December runs into next year); a
  range together with a shift or a single date is an error and Apply stays off. Picking dates (by
  hand, a delay or the assistant) moves the app's time to 00:00 UTC on the start date; the checks
  keep the picked dates while the time bar moves.
- **Hours:** for each site, over the range, the **hours of Sun** (Sun at or above the mission's
  minimum), **hours of Earth** (Earth at or above its minimum) and **hours of both** (both at once),
  counted from the hourly samples (one hour each). Shown in the Sites list and in Compare.
- **Order of the Sites list:** suitable sites first, as before; the user orders by longest window
  (default), most hours of Sun, most hours of Earth, most hours of both, or name. Measured values,
  no weights. A full 29.5-day range gives the same numbers as before: hours = share × range hours.

### Light, water and Earth over the year (agreed 2026-11-13)

At the top of Site details and as columns in Compare, each with its data-status tag (Real data /
Calculated / Assumed / Unavailable) and source:

- **Light:** % of the year in sunlight, from the PGDA south-polar lighting product (terrain
  included). **Unavailable** until Mahmoud's files are in `data/raw/`. bg1 and ch3: "Not
  applicable: outside south-polar data".
- **Water:** "Nearest permanent shadow (where ice may be): X km", the nearest pixel with 0%
  illumination in the same product, computed offline (Python). Never says ice is there.
  **Unavailable** until the files arrive; bg1 and ch3: "Not applicable: outside south-polar data".
- **Earth:** % of the year the Earth's upper limb is above the horizon (rule "Is it up"), from
  the Horizons files (SRC-055) over **calendar year 2027** (the only full year inside them; team
  choice), flat horizon (the terrain horizon once a site has one). Calculated, for all four sites.
  2027 values (flat horizon): Sun / Earth: im1 49.47 / 100.00 %, im2 50.24 / 79.02 %, bg1 49.14 /
  100.00 %, ch3 49.02 / 100.00 % (pinned in tests/unit/services/horizonsYear.test.ts; the user's
  cloud check gave im1 49.5 / 100, im2 50.2 / 79.1).

### Timeline (agreed 2026-11-13, Phase E)

A "Timeline" tab in Compare shows, for each compared site, **12 months from the start date** as one
row of bars. It adds no new check or measure: it draws the existing Sun-up and Earth-up tests.

- **`yearWindows(site, start, months = 12, stepHours = 6)`:** for each 6-hour step from 00:00 UTC on
  the start date, the Sun and the Earth at the step's start are tested exactly as the checks test
  them: at or above the mission's minimum height and, where the site has a terrain horizon, above
  the terrain. Positions as everywhere (JPL Horizons for the four sites inside the files, our engine
  outside them, labelled). Each step stands for its 6 hours, so the bars are a coarse view; the
  hours in the Sites list and Compare stay hourly.
- **Colours:** green = both up, yellow = Sun only, blue = Earth only, nothing = neither. They must
  read on a projector and for colour-blind viewers (strong contrast, a legend, and the state in
  text on hover/focus).
- **Bracket:** a see-through bracket as wide as the selected range (the picked dates, or the time
  bar's 29.5 days). Dragging it moves the start and stop dates together by whole days, kept inside
  the 12 months, and every site's hours, the checks and the Sites list update as it moves. Map
  markers are green when the site passes every check for the dates checked and red when it does
  not (the same "suitable" verdict as the Sites list), so they recolour as the bracket moves.
- **As built (2026-11-13):** the default 29.5-day range counts as 30 whole days from its first
  day, so the first drag turns it into picked dates 30 days long. The 12 months stay put while the
  bracket moves. The map markers are green or red **at all times** (not only in the Timeline), by
  the suitable verdict for the dates checked; they were off-white and grey before.

### Distances (agreed 2026-11-13)

Haversine on a sphere of R = 1737.4 km: d = 2R·asin√(sin²(Δφ/2) + cos φ₁·cos φ₂·sin²(Δλ/2)).
Distance from the south pole is the same formula to latitude −90°. Shown in Site details and
Compare.

### Lander night survival (agreed 2026-11-13)

- **Data:** `data/landers.json` (Miral, 2026-11-13): a list of landers (`nova-c`,
  `blue-ghost-1`, `griffin-1`, `chandrayaan-3`), each with `solarPowerW`, `batteryWh`, `heaterW`,
  `panelAreaM2`, `touchdownSlopeDeg`, each `{ value, tag, source, note }`. Tags: S opened source,
  S\* seen on a secondary page, D derived, A assumption, "not published" (value null). A site finds
  its lander by `landerId`. Sources: DATA_SOURCES SRC-033 and SRC-064 to SRC-068.
- **`heaterW` is the whole night load** (heater plus electronics), labelled "Night load (heater +
  electronics)", never "Heater". Nova-C's 100 W is a **team assumption** (tag A): Intuitive
  Machines said IM-1 had roughly 10 to 20 hours of battery left after sunset, which with 1554 Wh
  implies about 78 to 155 W; 100 W is the middle (Miral's note).
- **Hours the battery lasts** = batteryWh ÷ heaterW, against the **longest darkness** in the
  selected range (the longest unbroken run of hours with the Sun's centre below the horizon; "at
  least" when it touches the range's edge). "Survives" or "Doesn't survive" **only when both values
  are non-null**; otherwise "Can't judge: not published". When the darkness is only a lower bound
  (it touches the range's edge), a battery shorter than it still "Doesn't survive", but one that
  outlasts it gives "Can't judge: the night runs past the dates checked" (QA, 2026-11-13: a one-day
  range at IM-1 had read "Survives" against "at least 14 h" of a 323 h night).
- **Today:** Nova-C 1554 Wh ÷ 100 W = **15.5 h** (survives 10 h of darkness, fails 43 h); Blue
  Ghost 1, Griffin-1 (upcoming, every value not published) and Chandrayaan-3: "Can't judge: not
  published".
- **Battery needed here:** night load W × longest darkness h = X Wh, and X ÷ 143 Wh/kg = Y kg (the
  Power check's battery figure, SRC-046, derived). The night load here is the user's own choice on
  the Power check's slider (default 20 W), not the lander's value, and the text says so; the verdict
  line names the lander's value and its tag (Nova-C 100 W, assumed).
- Every value shows its tag (S, S\*, A, not published) and source, and the note where it records a
  conflict: Nova-C's 788 W against 200 W (conflict 19), and 1554 Wh against 700 Wh (conflict 18).
  `touchdownSlopeDeg` is information only (Chandrayaan-3: up to 12°, tag S, ISRO), never a pass
  or fail.

### Sunset, Earthset and the horizon view

- **Now:** the Sun's and the Earth's elevation and azimuth at the place and the app's time.
- **Sunset / Earthset (or rise):** the next time the body's centre crosses 0° elevation above the
  smooth-sphere horizon. Found from the cached hourly samples, then narrowed to about a minute by
  bisection; searched up to 32 days ahead ("up for the whole next month" otherwise). Code:
  `src/utils/riseSet.ts`.
- **Horizon view:** the hourly azimuth and elevation of both bodies over the range, drawn as paths
  above a flat horizon, with the mission's `minSunElevationDeg` as a dashed line. When a terrain
  profile exists for a site (`src/data/terrainPatches.ts`, none yet), its skyline replaces the flat
  horizon. Code: `src/features/lunar-map/HorizonView.tsx`.

### Other dates

For the selected site or point, the same checks for each of the next six 29.5-day ranges (the
current one first), each with its best window. "Go" moves the app's time to that window's start.
Code: `src/features/lunar-map/OtherDates.tsx`.

### Retired (2026-11-11)

The weighted 0–100 score (slope, daylight margin, Earth visibility, thermal margin, science
interest, with `DEMO_WEIGHTS`), the Great/OK/Poor rating words, the slope and temperature gates,
the "what changed" score comparison and the landing area check are **removed**. They rested on
made-up site values (slope, temperatures, science interest, safe area) and placeholder weights,
and the challenge asks for power and communication windows, not a score. See the decision log.

### Real geometry behind the checks and the windows

Agreed 2026-10-26 (user request; see the decision log). Code: `src/utils/lunarSky.ts`,
`src/utils/skyVisibility.ts`; positions from astronomy-engine (DATA_SOURCES SRC-022), checked
against JPL Horizons (SRC-019).

1. **Range:** the time bar's 29.5 days (one synodic month), centred on noon UTC of the app time's
   day. It moves a day at a time, so everything is recomputed once per day of app time, and when
   the lander or the site list changes; never on every clock tick.
2. **Sampling:** one sample per whole hour (about 708 in the range). Each sample is the Sun's and
   the Earth's elevation above the site's horizon on a smooth sphere of radius 1737.4 km (no
   terrain), measured from the site, so the Earth's parallax is included.
3. **Landing windows:** the hours with the Sun up and, for a lander without a relay, the Earth up
   too, merged into continuous intervals (hour resolution). They are found up to 15 days beyond
   the range, so a window keeps its true start and end. A lander with a relay only needs the Sun.
   A window still open at the first or last hour sampled (a long polar day, longer than the
   sampled span) is marked **open-ended** (2026-11-12): its start or end is only where checking
   stopped, so it is shown as "before …" or "after …", its length as "over N days", and it has
   no closing countdown.
4. **Best window:** the window with the most time inside the range (judged inside the range, like
   the daylight gate, so a window that mostly fell before it does not win), shown with its start, end
   and length in days (in the best-match card for the best site, and in Site details for the
   selected one). The time bar shows the selected site's windows; while one is open its countdown
   reads "Window open – closes in Xd Yh".

**DEMO thresholds per lander** (made up, labelled DEMO in the UI):

| Demo mission | `minSunElevationDeg` | `minEarthElevationDeg` | `daysNeeded` | `hasRelay` |
| ------------ | -------------------- | ---------------------- | ------------ | ---------- |
| A            | 5°                   | 5°                     | 3            | No         |
| B            | 1°                   | 1°                     | 6            | Yes        |
| C            | 10°                  | 10°                    | 2            | No         |

**Classification:** Sun and Earth positions **Verified** (Horizons, within 0.01°); gates'
thresholds, sites, weights and rating cut-offs **Illustrative** (DEMO); smooth-sphere horizon an
**Assumption** (KNOWN_ISSUES KI-014: no terrain shadows or local horizons).

**Limitations:** no terrain (a crater rim can hide the Sun or Earth for real); elevation of the
body's centre (no Sun disc radius); hour resolution; shares and stretches depend on where the
range falls in the month, so scores move a little as the date changes.

### Terrain horizon (TEST, 2026-11-13, local testing only)

For a site with a terrain horizon (`src/data/terrainHorizons.ts`), the Sun or the Earth counts as
up only when its centre is at or above **both** the mission's minimum height **and** the terrain
horizon in its direction (`horizonAt`, linear between whole degrees). This applies to every check,
share and window for that site (Sites list, Site details, Other dates, the assistant's answers).
Points and sites without a horizon keep the smooth-sphere horizon.

- **Horizon:** for each whole azimuth, the highest angle of the terrain seen from the site's
  ground, out to 250 km or the edge of the elevation map, in true 3D on the 1737.4 km sphere
  (curvature included). Computed offline by `scripts/data/horizon_profile.py`.
- **Data (TEST):** a QGIS export of the LOLA south-polar elevation map `LDEM_80S_80MPP_ADJ` (80 m
  per pixel, 80° S to the pole). Its source is **not yet recorded** in `DATA_SOURCES.md`, so it
  must not be committed or deployed until it is: the generated `src/data/terrainHorizons.ts` is
  git-ignored and loaded only if present (`import.meta.glob`), so without it every site keeps the
  smooth horizon. The local TEST file was made for a former demo site (2026-11-13) and matches no
  current site; im1 and im2 get their horizons when Mahmoud's file arrives (Phase C), each
  direction cut by the map's edge marked `edgeCut` ("cut off at data edge").
- **Limitations:** 80 m pixels (smaller rocks and rims are missed); the Sun's centre, not its disc;
  the site's own slope counts as terrain; no light bounced from terrain.

### Elevation and slope at a point (built 2026-11-13; no data loaded yet)

A clicked or typed point inside the covered south-pole area gets its **elevation and slope** from
a LOLA elevation file, once one is loaded. **Facts only:** no pass/fail until a sourced slope limit
exists for each lander. Code: `src/utils/elevationGrid.ts` (pure), `src/services/elevationData.ts`
(loading), `scripts/data/elevation_grid.py` (offline). How to load a file: `docs/ELEVATION_DATA.md`.

- **The file:** heights in metres ("surface height (in meters)", SRC-048) on a south polar
  stereographic grid (centre 90° S, longitude 0° up, scale 1 at the pole, projection radius
  1737.4 km, SRC-049), as NASA PGDA publishes them. Heights are above the reference sphere; that
  it is 1737.4 km is stated only for the older, unadjusted version (SRC-053), so for the adjusted
  files it is an **Assumption** until confirmed. The offline script checks the projection and units
  and stops on anything else; it cuts the file to the south-pole area and averages it down to a
  small grid (plain binary plus a JSON description with the projection, grid and source).
- **Point to grid:** x = ρ·sin(lon), y = ρ·cos(lon), ρ = 2R·tan(45° + lat/2), R = 1737.4 km.
- **Elevation:** bilinear between the four nearest grid heights.
- **Slope:** Horn's method on the 3 × 3 heights around the nearest grid point: east-west gradient
  ((c + 2f + i) − (a + 2d + g)) ÷ 8Δ, north-south gradient ((g + 2h + i) − (a + 2b + c)) ÷ 8Δ,
  slope = atan of their combined size. Δ is the true ground spacing: the grid spacing divided by
  the projection's scale k = 2 ÷ (1 + sin|lat|). The slope is over the grid's spacing (shown with
  it), so it smooths anything smaller.
- **Shown:** on the place card, "Elevation X m · Slope Y°" with the source and pixel size; "No
  elevation data loaded yet" with no file; "No elevation data here" outside the area or on gaps.
  "Elevation" and "Slope" map layers appear only once a file is loaded (no greyed-out buttons,
  2026-11-13); their colours are a continuous scale, never pass/fail colours.
- **Tests use made-up grids only** (a flat plane, a known tilted plane and a bowl, built inside the
  tests). No made-up grid is ever shown in the app or committed as data.

### Map layers: elevation and slope (agreed 2026-11-13, Phase C)

The team's rasters (DATA_SOURCES SRC-073): for each layer a **numerical** GeoTIFF (values) and a
`*_color.tif` (its intended look, rendered by the team). Both are 15200 × 15200 at 40 m on the
south polar stereographic grid of the 1737.4 km sphere (centre 90° S, 0° E up), ±304 km.

- **Values come only from the numerical TIFF, colours only from the colour TIFF.** No value is ever
  read from a colour. The colours are copied pixel for pixel (nearest pixel, no blending).
- **Coverage:** 80° S to the pole. Outside it: "No data here: this tool covers 80° S to the pole".
  Inside, a pixel the numerical TIFF marks NoData reads "No data" and draws transparent; a valid
  0 stays a value.
- **Resolution (team decision):** values at **160 m** for all of 80–90° S (each value is the mean of
  the 4 × 4 underlying 40 m pixels that hold data) and at the full **40 m** in a 40.96 km square
  patch around IM-1 and around IM-2. The readout names the resolution used at that spot. The
  display follows the same split: the 160 m view everywhere, the 40 m colours inside the patches.
- **Encoding of the value tiles** (static files, 256 × 256, little-endian, row 0 at the top):
  elevation int16 metres, signed (value = stored × 1 m + 0 m; NoData −32768); slope uint16
  (degrees = stored × 0.01; NoData 65535). Documented with the source in DATA_SOURCES SRC-073.
- **Readout:** the value of the pixel under the cursor (desktop) or the tapped point (mobile) for
  the **active layer**, with its unit, resolution, tag and source. A tile is fetched only when
  needed; nothing loads the full rasters into the browser.
- **Legends:** elevation in metres, slope in degrees, read from matching value and colour pixels of
  the team's files (which colour the team's render gives each value), never invented.
- **Fixed in time:** the layers do not change with the date or time.
- **Labels:** "Slope: average over one pixel (160 m or 40 m), not a pass/fail"; no slope pass/fail.
- **Status (2026-11-13, 21:34):** the first `elevation_40m.tif` was empty (0 bytes); the team then
  supplied `Elevation.tiff`, and both layers now have values, legends and colours.
- **As built (2026-11-13):** a "Map layers" panel (switch, opacity and legend per layer, "Readings
  from" choice); each layer's 512 px previews first, then the full quarters and the 40 m patches;
  elevation under slope. The earlier single-grid elevation path (`docs/ELEVATION_DATA.md`) is no
  longer used for display or readout. **Not done:** moving the camera to a straight-down south-pole
  view when a layer is switched on (plan C4): the app has no such view yet.

### Visibility prototype layer (agreed 2026-11-13)

The team's full-cap visibility prototype (DATA_SOURCES SRC-074) as a date-dependent map layer,
separate from the fixed elevation and slope layers.

- **What a value is:** the approximate share of the Sun's or the Earth's **apparent disc** that is
  geometrically above the terrain skyline at one instant, 0–100 % (the file's 0–1 fraction).
  Instantaneous geometric visibility only: **not** a share of time lit, not solar power, not
  Earth-station (DSN) link availability, not landing or power validation.
- **Times:** only the supplied frames, 2026-11-24 00:00 to 2026-12-08 00:00 UTC every 10 minutes.
  The app's time is snapped to the nearest supplied frame and the **actual sampled UTC time** is
  always shown; outside the range there is no frame and the layer says so. No interpolation, no
  animation. Imagery and values change together; until the newly requested pair is applied, the
  old time label stays and a loading state shows; superseded loads are dropped quietly.
- **Readout:** from the frame's numerical grid (nearest 9.6 km cell), never from colours: "Approx.
  visible disc: N %", the sampled UTC time and "9.6 km grid". 0 % is a valid value; outside the
  grid's coverage, "No data".
- **Display:** Sun and Earth as separate layers with their own switch and opacity; Sun on and
  Earth off at first (so one opaque layer does not hide the other); a fixed 0–1 legend (the
  manifest's colours). Always labelled: **"Prototype geometric visibility · 9.6 km grid · 2 m
  assumed height · eclipses not modeled"**.
- The layer does not feed any check, ranking or verdict.

### Power check (Miral's Moon power lab; agreed 2026-11-13)

A teaching model in Site details, credited to **Miral** (the team's power lab,
`docs/team/Moon power lab (4).html`), rebuilt in React. **Information only:** it never changes a
check, the order of the list or a window. Code: `src/data/powerCheck.ts`,
`src/features/lunar-map/PowerCheck.tsx`.

- **From the app:** the Sun's height at the place at the app's time (its centre, smooth-sphere
  horizon); the **night** = the longest unbroken stretch inside the checked month (the time bar's
  range) with the Sun's centre below 0°, from the hourly samples. A night that reaches the edge of
  the month is only a lower bound ("at least").
- **Sliders (teaching defaults, labelled so):** panel flat or standing; area 0.5–4 m² (default 1);
  night load 5–100 W (default 20; labelled "Night load (heater + electronics)" since 2026-11-13,
  never "Heater"); battery 5–200 kg (default 30).
- **Panel power** = 1361 W/m² × area × 0.30 × angle factor. Flat panel: sin(Sun height). Standing
  panel facing the Sun: cos(Sun height). Both are 0 while the Sun is down. (The team file uses 1
  for the standing panel, which is wrong when the Sun is high; not copied.)
- **Battery needed (kg)** = heater W × night hours ÷ 143 Wh/kg. "Survives the night" when the
  battery is at least that; otherwise "Needs X kg more" (X rounded up to 0.1 kg).
- **Sources:** 1361 W/m² SRC-044 (NASA Moon Fact Sheet); 0.30 SRC-045 (NASA small-spacecraft
  report, "nominal efficiency of 30%"); 143 Wh/kg **derived** from SRC-046 (LuSEE-Night's planned
  7160 Wh battery of 50 kg; DATA_SOURCES conflicts 13 and 14). Using that one battery figure for
  every mission is a **team assumption**.
- **Labelled a simplified model:** no shadows or terrain, no panel losses (heat, dust, wiring,
  pointing), only the heater draws power at night, and the battery figure is a minimum (no
  reserve).

### Anywhere on the Moon (point check)

Agreed 2026-11-10; simplified 2026-11-11. Clicking any point on the Moon that is not a site, or
typing its coordinates, gives that point **exactly the checks a site gets** (above), from the same
hourly samples and range, plus the nearest landing site and its great-circle distance (mean
sphere).
A point is not put in the Sites list or in Compare. Code: `src/data/pointCheck.ts`;
`src/utils/lunarSky.ts` (`greatCircleKm`).

**Classification:** the Sun and Earth geometry **Verified** (as above); the mission needs
**Illustrative** (DEMO).

### "Launch slipped" assistant (agreed 2026-11-12)

An optional text box in the Mission view. It never decides or calculates anything: it only reads
the user's text into the settings the app already has. Code: `api/slip.ts` (server),
`src/services/slipReading.ts` and `slipApi.ts` (the reply's shape and the call),
`src/features/missions/slipPlan.ts` (the app's checks and date maths),
`src/features/missions/SlipAssistant.tsx` (the box).

1. **What the AI may return** (every field may be null): the mission name exactly as typed; a date
   shift (`{ shift, unit }`, unit days, weeks, months or years) **or** a date (day or null, month,
   year or null); days of power; lowest Sun height; lowest Earth height; relay yes or no; and
   "unclear" quotes. Google Gemini, free tier, Flash model (`gemini-3.6-flash` by default), with a
   strict JSON schema.
2. **What the app accepts** (anything else is dropped and the user is told so):
   - every number (shift, day, year, needs) must appear in the user's text, as digits or as an
     English word from one to twenty ("a"/"an" counts as 1 only before day, week, month, year or
     degree). Other scripts and number words are not read (English only);
   - the shift's unit word and the month (its name, short name or number) must appear in the text;
   - relay is read only when the text contains the word "relay";
   - the mission name and every "unclear" quote must appear word for word in the text.
3. **Ranges:** the needs go through the Mission form's own check (`validateDraft`, the DEMO
   ranges). An out-of-range value is shown with its error and never changed; Apply stays off.
4. **Dates (all UTC, all worked out by the app):** a shift counts from the time bar's date (whole
   calendar months and years, the day kept or moved to the month's last day); a day is 00:00 UTC
   that day; a month alone is the 15th at 00:00 UTC, so the 29.5-day range covers the month; a
   missing year is the next one on or after the time bar's month (and day). Impossible dates, dates
   outside 1990–2100, part months or years, and both a shift and a date are errors.
5. **Missions:** the app matches the typed name against its own list (ignoring case, spacing and a
   leading "Demo"). No name means the selected mission. An unknown name shows "{name} isn't in our
   list yet, add its details"; "Add its details" opens the Add-your-own-mission form with the name
   and the numbers from the text, every other field empty. The AI never supplies a lander's
   specifications.
6. **Confirmation:** "I read this as …" (the full UTC date and every need, changed or not) shows
   before anything changes. **Apply** uses it (a changed need makes a new mission for this visit,
   e.g. "Demo Mission A (2)"; the demo missions are never edited); **Edit** opens the Mission form
   with the same values and date.
7. **The explanation** is a fixed sentence filled from the app's own results after Apply (the site
   with the longest usable window, its length and dates, and how many sites pass all the checks
   over the time bar's range). No AI-written text is shown.
8. **Failure:** no key, no network, a timeout, a refusal or a malformed reply all end the same way:
   "The assistant isn't available right now", and the Mission form (which has a date field) does
   the same job by hand.
9. **Questions about when or where to land (agreed 2026-11-12).** The AI may also say that the
   text asks _when_ or _where_ to land (`question: { about, siteName, from, to }`); it never
   answers. The app answers from its own results (`src/features/missions/slipQuestion.ts`):
   - **Months:** `from` and `to` are calendar months (UTC, from the 1st 00:00 to the end of the
     last day). A month must appear in the text (name, short name or number) and a year must be
     typed to be used; a missing year means the next time that month starts on or after the time
     bar's month (the current month counts), and `to` is the first such month on or after `from`.
     One month alone means that month. No month: _where_ uses the time bar's range (as the Sites
     list does); _when_ uses the six ranges from the time bar's range on (as Other dates does). At
     most 12 months; dates outside 1990–2100 are errors.
   - **Site:** a site name must appear in the text and match one of the four sites (ignoring case,
     spaces and hyphens), by its name, its id or an alias: im1 "IM-1", "Odysseus"; im2 "IM-2",
     "Athena"; bg1 "Blue Ghost"; ch3 "Chandrayaan-3", "Chandrayaan", "Vikram" (2026-11-13).
     Otherwise every site is checked and the user is told the name "isn't one of our sites".
   - **Answer:** the same checks as everywhere (`siteSky`, `assessSky`): with a named site, that
     site's best window over the months and whether it passes all the checks; otherwise the best site
     (`bestSite`: the suitable site with the longest usable window) and its best window. The
     mission is the one named in the text if it is in the list, otherwise the selected one.
     **Go there** selects the site and moves the time bar to the window's start. The answer is a
     fixed layout filled from the app's numbers; no AI-written text is shown.
   - **Past months (2026-11-13):** allowed. When every month asked about has ended (by the real
     clock), the answer says "in the past"; when only some have, "partly in the past".
   - **Three more questions (2026-11-13),** read the same way (the AI only names the kind of
     question, the site and the months; the app answers over the months asked, or the time bar's
     range when none are given, with the same `siteSky`/`assessSky` as the Sites list):
     - _How many days of sunlight at X?_ (`about: "sunlight"`): the longest unbroken stretch with
       the Sun at or above the mission's minimum, and the total time it is up. Needs a named site;
       without one the app asks for it.
     - _Which site has the most Earth time?_ (`about: "earth"`): the site with the largest
       share of time with the Earth at or above the mission's minimum (ties by name), with that
       share.
     - _Does X pass for Mission Y?_ (`about: "passes"`): whether the named site passes all the
       checks for the mission named in the text (or the selected one), each failure named, and the
       % of mission needs met. Needs a named site.
   - Any other question ("how much power does it need?") is not read: it goes under "Couldn't
     read", and the box says what it can read.
10. **Examples:** clickable example sentences under the box fill it in and read it at once.
11. **Nothing changed (2026-11-13):** when the text was read but changes no setting, the box says
    so plainly ("Nothing changed: …") and gives an example of what it can read.

## Decision log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                              | Rationale                                                                                                                                                                    | Agreed by                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 2026-10-25 | Demo fixture: add a made-up "Earth visibility" factor (5th factor; weights rebalanced to 1)                                                                                                                                                                                                                                                                                                                                           | The redesigned Site details shows an Earth visibility bar; to be replaced by a real calculation                                                                              | User (practice)                                 |
| 2026-10-25 | Demo fixture: rating-word cut-offs 55 / 35 instead of the planned 70 / 40                                                                                                                                                                                                                                                                                                                                                             | With 70 / 40 no demo site ever reached "Great"                                                                                                                               | Main session; reported to user                  |
| 2026-10-26 | Demo fixture: Sunlight and Earth visibility become shares of the time-bar range from the real Sun and Earth; windows computed from both; made-up per-lander minimum elevations; made-up windows removed                                                                                                                                                                                                                               | Requested by the user ("make time real"); method above                                                                                                                       | User (practice)                                 |
| 2026-10-26 | Demo fixture: `minSunlightPct` now a share of the range; C lowered from 55 to 42                                                                                                                                                                                                                                                                                                                                                      | Real shares are about 39–50% for most sites, so 55 excluded every site for C                                                                                                 | Main session; reported to user                  |
| 2026-10-26 | Demo fixture: add Demo Site India (85.5° S, 31° E, made up)                                                                                                                                                                                                                                                                                                                                                                           | Lets the south-polar Earth drop (libration) be seen; no real site implied                                                                                                    | Main session; reported to user                  |
| 2026-10-26 | Excluded sites show "Excluded" and the reason instead of a score                                                                                                                                                                                                                                                                                                                                                                      | A number next to a ranked list read as a rank it does not have                                                                                                               | User (practice)                                 |
| 2026-10-26 | Gates: slope, temperature, Earth contact (new; `hasRelay`: A no, B yes, C no) and daylight (changed: longest continuous sunlit stretch ≥ `daysNeeded`, replacing the sunlight-share gate)                                                                                                                                                                                                                                             | Stage 1 of the gate upgrade, requested by the user                                                                                                                           | User (practice)                                 |
| 2026-10-26 | Demo fixture: C's `minSunlightPct` restored to 55 (the 42 change is undone)                                                                                                                                                                                                                                                                                                                                                           | The share is no longer a gate, so the earlier reason for lowering it is gone                                                                                                 | User (practice)                                 |
| 2026-10-26 | Weighted score: one `DEMO_WEIGHTS` constant for every lander (placeholders until the research team's rules sheet; per-lander weights removed); Sunlight factor = longest stretch ÷ days needed, capped at 100; `minSunlightPct` removed                                                                                                                                                                                               | Stage 2 of the gate upgrade, requested by the user                                                                                                                           | User (practice)                                 |
| 2026-10-26 | Every result carries `decidedBy` (first failed gate, or the factor costing the most points), shown in the Site details summary                                                                                                                                                                                                                                                                                                        | Says in one line why a site landed where it did                                                                                                                              | User (practice)                                 |
| 2026-10-26 | Windows need the Earth only for landers without a relay; the best window is the one with the most time inside the range                                                                                                                                                                                                                                                                                                               | Stage 2, requested by the user                                                                                                                                               | User (practice)                                 |
| 2026-10-27 | Sunlight factor becomes Daylight margin: usable stretch ÷ days needed, 1× = 50, 3× or more = 100, linear between                                                                                                                                                                                                                                                                                                                      | Every eligible site scored 100% on sunlight, so the factor changed nothing                                                                                                   | User (practice)                                 |
| 2026-10-27 | Daylight gate uses the window rule: Sun only with a relay; Sun and Earth both up without one ("Not enough time with Sun and Earth both up")                                                                                                                                                                                                                                                                                           | A no-relay lander could pass every gate with no usable window (QA finding)                                                                                                   | User (practice)                                 |
| 2026-10-27 | Excluded sites show only the reason and the failed gate values; no factor bars or weight table                                                                                                                                                                                                                                                                                                                                        | An excluded site has no score, so its factor breakdown read as one                                                                                                           | User (practice)                                 |
| 2026-10-28 | "Add your own lander": the user sets max slope, days needed, temperature range, relay and ellipse length within DEMO ranges (no zero days, no zero or negative slope, coldest not above hottest); Sun and Earth minimum heights come from the chosen preset. Scored with the same gates and weights                                                                                                                                   | Lets the team try lander limits without new scoring inputs; values are the user's, sites stay DEMO                                                                           | User (practice)                                 |
| 2026-10-28 | Landing area check: DEMO `safeAreaKm` per site vs the lander's ellipse; Fits ≥ 1.5×, Tight ≥ 1×, Does not fit < 1×; information only, never scored                                                                                                                                                                                                                                                                                    | Shows whether the landing uncertainty fits the site, without new scoring inputs                                                                                              | User (practice)                                 |
| 2026-11-10 | "Anywhere on the Moon": clicking any point checks only the Earth-contact and daylight gates with the lander's DEMO thresholds from the real Sun and Earth; slope and temperature are "needs data"; never scored or ranked; nearest demo site shown with its distance                                                                                                                                                                  | The app's standout feature for the event: a live answer for any spot, honest about what it cannot know                                                                       | User (practice)                                 |
| 2026-11-11 | Concept refocused on the challenge: power and comms windows, the Sun and Earth against the horizon, sunset and Earthset, and other dates. The weighted score, rating words, slope and temperature gates, what-changed comparison and landing area check are retired; landers become mission needs (min Sun height, days of power, min Earth height, relay); sites are listed by longest usable window (or sunlight, Earth time, name) | The challenge asks for site and date comparison of power and DTE windows, not a score; the score rested on made-up values and placeholder weights                            | User                                            |
| 2026-11-11 | Lessons from past landings: real missions (IM-1, IM-2, SLIM, Chandrayaan-3, Blue Ghost M1), facts only as stated by SRC-023 to SRC-036                                                                                                                                                                                                                                                                                                | Replaces the placeholder Replay; ties real outcomes to sunlight, the Earth and the lunar night                                                                               | User                                            |
| 2026-11-12 | **CLAUDE.md exception 1 of 2 (see also exception 3): one Vercel server function, `api/slip.ts`**, for the "launch slipped" assistant. It holds the AI key in `GEMINI_API_KEY` (server only, never a `VITE_` variable), accepts only `{ text }` of up to 500 characters, keeps no memory and stores nothing the user typed. The site works fully without it (the Mission form is the fallback)                                         | The key must never reach the browser; a backend is otherwise not allowed (CLAUDE.md)                                                                                         | Team (approved via the user)                    |
| 2026-11-12 | **CLAUDE.md exception 2 of 2 (see also exception 3): the Google Gemini API (free tier, a Flash model)**, called with plain `fetch` from `api/slip.ts`; no new npm package. Strict JSON output, about 20 seconds (was 10; raised after the first live test, see the 2026-11-12 timing row), at most one retry. The About page says the free tier may use typed text to improve Google's models                                         | Reads a slip description into the existing mission settings; paid APIs are otherwise not allowed (CLAUDE.md)                                                                 | Team (approved via the user)                    |
| 2026-11-12 | Display fixes from the whole-site review (no rule changed): "best" means the longest usable window in every order; open-ended windows say "before"/"after"/"over" and have no closing countdown; a site's card says how much of its best window falls in this month                                                                                                                                                                   | A sort by name or sunlight made the alphabetically first site "best"; a long polar day was shown with made-up ends; the clipped month count read as contradicting the window | Main session; reported to user                  |
| 2026-11-12 | "Launch slipped" assistant, version 1: the AI only reads the user's text into fields (mission name as typed, a date shift or a day/month/year, days of power, min Sun height, min Earth height, relay, "unclear"). The app checks every value, does all date maths in UTC, matches mission names, and shows "I read this as …" before anything changes; the explanation is a fixed sentence filled from the app's own results         | Every number on screen is the user's or the app's, never the AI's (rules in "Launch slipped assistant" above)                                                                | User                                            |
| 2026-11-12 | Assistant timing and outcome log: the server limit goes from 9 s to 20 s and the browser's from 10 s to 22 s; each request that reaches Gemini logs one line on Vercel (HTTP status, each try's Gemini status or stop reason and milliseconds, total time; never the typed text)                                                                                                                                                      | The first live test timed out (HTTP 504) on three ordinary sentences, and the logs could not tell a slow reply from an overloaded one                                        | User (reported "it doesn't work"); main session |
| 2026-11-12 | "Launch slipped" assistant reads questions about **when or where to land** (rule 9 above): the AI only says what is asked (when/where, a site name, months), the app checks each against the text and answers with its own `siteSky`/`assessSky`/`bestDemoSite` results; clickable example sentences (rule 10)                                                                                                                        | Users and judges type questions ("what is the best date between oct and november"); the app already knows the answer, so the AI only has to route it                         | User                                            |
| 2026-11-12 | **CLAUDE.md exception 3: offline data scripts** in `scripts/data/` (Python with rasterio/GDAL, versions pinned in `scripts/data/requirements.txt`) to prepare LOLA slope and terrain data. They run only on team laptops, are never shipped to the browser, and output small data files with sources in `DATA_SOURCES.md`                                                                                                             | LOLA rasters are large and need GIS tools; preparing them offline adds no runtime dependency and keeps the browser download small                                            | User                                            |
| 2026-11-12 | **% of mission needs met** (definition above): longest usable window ÷ power days needed, capped at 100%; below 100% shows the percentage and what's missing, at 100% the window length and how many times over the need. The Sites list stays ordered by longest usable window. Not built yet                                                                                                                                        | Ranks in real units, with no weights, and says how close a failing site comes                                                                                                | User                                            |
| 2026-11-12 | The **slope check** (retired 2026-11-11) comes back only with real LOLA data, prepared by the offline scripts and sourced in `DATA_SOURCES.md`; never with demo values                                                                                                                                                                                                                                                                | The retired slope gate rested on made-up site slopes                                                                                                                         | User                                            |
| 2026-11-13 | **TEST, local only:** terrain horizon from a QGIS export of LOLA `LDEM_80S_80MPP_ADJ` for Demo Site India; the Sun and Earth count as up only above both the mission's minimum and the terrain (rule above). Not to be committed or deployed until the source is in `DATA_SOURCES.md`                                                                                                                                                 | A flat horizon called a site on a steep mountainside "OK"; the team wants to see real terrain in the app                                                                     | User                                            |
| 2026-11-13 | Checks split into three named for what they measure: **Power** = the Sun only, **Comms** = the Earth only, **Usable window** = both (the Sun only with a relay, then not listed separately). Same places pass as before; Compare gets one row per check                                                                                                                                                                               | Compare's Power row described the Sun-and-Earth stretch; each row now says what it measures (overnight plan item 2)                                                          | User                                            |
| 2026-11-13 | "Launch slipped" assistant: past months allowed and labelled "in the past"; three more questions read by the AI and answered by the app (days of sunlight at a site, the site with the most Earth time, does a site pass for a mission); a plain "Nothing changed" with an example (rules 9 and 11)                                                                                                                                   | Overnight plan item 4: users ask these; the app already has every answer, so the AI only routes the question                                                                 | User                                            |
| 2026-11-13 | Power check in Site details from Miral's Moon power lab (rule above): information only; panel W = 1361 × area × 0.30 × sin or cos of the Sun height; battery kg = heater W × night hours ÷ 143; sliders with teaching defaults; sources SRC-044 to SRC-046                                                                                                                                                                            | Overnight plan item 9: shows the panel and battery trade-off behind the power check, with the app's own Sun height and night length                                          | User                                            |
| 2026-11-13 | Elevation and slope at a point (rule above): built with no data; a PGDA south-pole LOLA GeoTIFF becomes a small grid offline (scripts/data/elevation_grid.py); slope by Horn's method over the grid spacing; facts only, no pass/fail; layers off until a file is loaded                                                                                                                                                              | Overnight plan item 7 (replaced): ready for the real file, so loading it is one command; no slope limit is sourced yet                                                       | User                                            |
| 2026-11-13 | **Real landing sites** replace every demo site (rule "Real landing sites"): im1, im2, bg1, ch3 from `data/sites.json`, landing and mission outcome shown separately, unsourced values tagged "source TODO"; the "Data: Demo" label removed; missions stay made up and named "Demo Mission"                                                                                                                                            | The team's final plan (Phase A1); the challenge is about real south-pole sites                                                                                               | User                                            |
| 2026-11-13 | **Sun and Earth positions from JPL Horizons** for the fixed sites (10-minute API files, 2026-11-01 to 2027-12-31), our engine for clicked points and other dates, each labelled; checked against Horizons three ways (rules "Sun and Earth positions" and "Checked against JPL Horizons")                                                                                                                                             | Final plan A2–A4: the positions come from NASA/JPL's own system, and the engine is shown to agree                                                                            | User                                            |
| 2026-11-13 | **Start and stop dates**, Delay 1 week / 1 month, and **hours of Sun, Earth and both** in the Sites list and Compare (rule "Date range and hours")                                                                                                                                                                                                                                                                                    | Final plan A5: users plan for their own launch window, in hours rather than shares                                                                                           | User                                            |
| 2026-11-13 | **Light, water and Earth over the year; distances; lander night survival** (rules above): PGDA-based values Unavailable until the files arrive; Earth % from the Horizons files over 2027; survival only with both battery and heater values published                                                                                                                                                                                | Final plan Phase B; no value is shown without its data                                                                                                                       | User                                            |
| 2026-11-13 | **Sources in:** Ayah's LROC coordinates and per-outcome sources for the four sites (im2 moved to 84.7906° S, 29.1957° E and ch3 to LROC's observed 69.3741° S, 32.32° E; Horizons re-fetched for both and re-checked); Miral's `data/landers.json` with the night load (`heaterW`) at 100 W, tag A                                                                                                                                    | Every site value now has a source; night survival can be judged for Nova-C (15.5 h)                                                                                          | User                                            |
| 2026-11-13 | **Timeline** in Compare (rule "Timeline"): 12 months of 6-hour Sun/Earth states per site from the existing checks, a draggable bracket that moves the picked dates, map markers green/red by the existing suitable verdict                                                                                                                                                                                                            | Final plan Phase E (below the cut line; started after Phases A, B and D were green); no new measure                                                                          | User                                            |
| 2026-11-13 | **Map layers (Phase C)** from the team's elevation and slope rasters (rule "Map layers"): values at 160 m across 80–90° S and 40 m around IM-1 and IM-2, colours copied from the team's colour TIFFs, on-demand static value tiles with the documented encoding                                                                                                                                                                       | User's decisions on delivery and encoding; no backend or new package                                                                                                         | User                                            |
| 2026-11-13 | **"Launch slipped?" assistant removed from the website, kept as a future plan:** the feature flag `VITE_SLIP_ASSISTANT` is now off by default (set it to "on" to show it). The code, its rules above and `api/slip.ts` stay; About lists it as planned                                                                                                                                                                                | User's decision: the site works without it; it can return later                                                                                                              | User                                            |
| 2026-11-13 | **"Up" = upper limb above the horizon** (rule "Is it up: the upper limb"): elevation + asin(R ÷ distance) > horizon, Sun and Earth, flat and terrain; mission minimums stay on the centre                                                                                                                                                                                                                                             | Matches Horizons' flags and PGDA 69; resolves the missing equation behind the 28 unjudged flag rows (KNOWN_ISSUES KI-024)                                                    | User                                            |
| 2026-11-13 | **Visibility prototype layer** (rule above): the team's full-cap Sun/Earth disc-visibility frames, 24 Nov–8 Dec 2026 every 10 minutes, wired to the app's time with the sampled time shown; information only                                                                                                                                                                                                                          | User's integration request; labelled as a prototype, not validation                                                                                                          | User                                            |
