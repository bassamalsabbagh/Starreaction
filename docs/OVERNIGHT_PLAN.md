# Overnight plan (2026-11-13)

Agreed with the user on 2026-11-13. Work through the items in priority order without stopping. When
something can't be decided, pick the safest option that follows this plan and `CLAUDE.md`, note it
in the report, and keep going.

## Ground rules

- **Read only** `src/`, `tests/`, `docs/`, `api/` and `scripts/`.
- **Order:** 1, 2, 5 → 6 → 3 → 4 → 9 → 7 → 8. If time runs out, stop after a finished item, never
  halfway through one.
- **Commits:** one local commit per item on the current branch. **No push, no deploy.**
- **Leave alone:** the TEST terrain data file `src/data/terrainHorizons.ts` stays uncommitted and
  untouched (its source isn't recorded yet). Mention it in the report.
- **Team files:** `docs/team/` holds the equation sheet (`.docx`) and Miral's power lab (`.html`).
  The PDF on the Desktop is an older version and is ignored.
- **Data:** no invented data; everything sourced. Reading web pages for sources is fine; **no Gemini
  calls** and no other live API calls. Downloads over 2 GB: skip, note, keep going.
- **Rules first:** any new check, measure or formula goes into `docs/LANDER_RULES.md` (and its
  sources into `docs/DATA_SOURCES.md`) before code.
- **Tests:** every fix gets a test. Run `npm run check` before each commit and fix failures.
- **Browser:** no Playwright. Use headless Edge (already installed) if it works without installing
  anything; otherwise give a checklist to check by hand. Never claim something was seen in the
  browser unless it was.
- **Agents:** `lunar-data-researcher` for sources (items 7 and 9); `qa-reviewer` for a final review.

## Items

### 1. Window length mismatch (bug)

The same site shows different window lengths in different places: Demo Site Delta shows "10.2 d
window" in the Sites list and in Compare's Power row, but its Best window is 16 Nov 23:00 to 29 Nov
20:00 UTC (12.9 days); Demo Site Bravo shows 13.1 d in one place and 13.2 days in another. Find the
real cause first. Part of it may be on purpose (since 2026-11-12, cards show the part of the window
inside this month); clearer labels are a fine outcome. Every place shows the same number for the
same thing, or the two are labelled clearly. Tests.

### 2. Compare labels

Update the rule in `LANDER_RULES.md` first: **Power** = Sun only, **Comms** = Earth only, **Usable
window** = Sun and Earth both (Sun only for relay missions). Compare gets a Sun-only Power row, a
Comms row and a Usable window row. "Best" stays the same as in the Sites list (longest usable
window). Tests.

### 5. % of mission needs met

As defined in `LANDER_RULES.md` ("% of mission needs met"), including "at least" for open-ended
windows. Shown in the Site details panel, the Sites list rows and Compare. Tests.

### 6. Projector readability

Check every panel in presentation mode at 1280×720 and 1920×1080. Raise the size and contrast of
small grey text where needed, without redesigning. Screenshots before and after (headless Edge),
or a hand checklist if that doesn't work.

### 3. South pole view

A "South pole" view button: camera over the pole, tilted and zoomed so polar sites fill the screen.
Used in the Watch demo. The current view stays the default. Tests for the camera helper; the globe
itself is manual verification.

### 4. AI box

- When no setting changed, say so plainly and give an example.
- "Best date between X and Y": the AI only reads the two dates (every number and month must appear
  in the text); the app searches that span with the same checks as Other dates and shows the best
  window with Go. At most 12 months. Past ranges are allowed and labelled "in the past". Tests for
  backwards, too-long and past ranges. (Much of this exists locally since 2026-11-12; it was not
  deployed.)
- Exactly three more question types, read by the AI and answered by the app: "how many days of
  sunlight at X?", "which site has the most Earth time?" and "does X pass for Mission Y?".
- Rules in `LANDER_RULES.md` first. Gemini is not called; its instructions are tested only with
  fixtures, so live behaviour stays unverified.

### 9. Power check (Miral's Moon power lab)

A "Power check" section in the Site details panel, built in React like the rest of the app (no
iframe, no copied page), crediting "Miral". Information only: it doesn't change pass/fail.

- **Inputs from the app:** the Sun's height at the site and the app's time; the night length = the
  longest dark stretch (Sun below the horizon) in the checked month, from the app's own Sun
  calculation.
- **Sliders (teaching defaults, labelled as such):** panel type flat / standing; panel area 0.5–4 m²
  (default 1); heater 5–100 W (default 20); battery 5–200 kg (default 30).
- **Shows:** panel watts, battery needed, and "Survives the night" or "Needs X kg more".
- **Panel power** = 1361 W/m² × area × 0.30 × angle factor; flat: sin(Sun height); standing, facing
  the Sun: cos(Sun height). (Miral's file uses 1 for standing, which is wrong at high Sun; don't
  copy it.)
- **Battery kg** = heater W × night hours ÷ 143 Wh/kg.
- **Sources (DATA_SOURCES first):** 1361 W/m² from the NASA Moon Fact Sheet; 0.30 from the NASA Small
  Spacecraft Technology State of the Art report, Power chapter (cells 30–34%, nominal 30%); 143
  Wh/kg from the LuSEE-Night source Miral cites if it can be confirmed, otherwise cite that NASA
  chapter's range for space Li-ion packs and label 143 a **team assumption**.
- Labelled a simplified model: no shadows, no panel losses, the battery figure is a minimum. Tests.

### 7. Click a point at the south pole → elevation and slope (replaced 2026-11-13)

Built now without real data, so a real file only needs dropping in and one command.

- **Input:** NASA PGDA south-pole LOLA elevation GeoTIFFs (polar stereographic, heights in metres).
  Document the exact expected format, where the file goes (`data-raw/`, git-ignored) and the one
  command, in `docs/` and the README.
- **Offline script** in `scripts/data/` (Python, rasterio): reads the GeoTIFF, checks projection
  and units (stops with a clear error if wrong), cuts it to the south-pole area, saves a small
  file the browser loads (plain binary plus a small JSON with projection, grid and source). No new
  npm package.
- **In the app:** a clicked or typed point inside the covered area is converted to the file's
  polar projection; the height is read and the slope worked out from the neighbouring pixels
  (Horn's method). The place card shows "Elevation X m · Slope Y°" with the source and pixel size;
  "No elevation data loaded yet" with no file; "No elevation data here" outside the area.
- **Layers:** "Elevation" and "Slope" next to the existing ones, disabled with the same "no data
  yet" note until a file is loaded.
- **Slope is a fact only:** no pass/fail until a sourced slope limit exists for each lander. The
  method goes into `LANDER_RULES.md` before code.
- **Tests with a fake grid only** (flat plane, known tilted plane, bowl), generated in the tests:
  elevation lookup, coordinate conversion and slope against known answers. The fake grid is never
  shown in the app or committed as data. The uncommitted TEST terrain file is not used.
- A short "first real file" checklist: run the script, then check 3 known points against published
  values and the expected numbers.
- Its own commit, after `npm run check`.

### 8. Team equation sheet (report only)

Read the equation sheet in `docs/team/`. For each equation: already in the app, should be added as
a pass/fail check or mission value, or conflicts with `CLAUDE.md` (weighted scores). Note any number
that disagrees with the app. Report only; no code changes from it.

## Final report

What changed (per commit), what was seen in the browser (only if it was), choices made without
asking, and what's left for the user. Run `npm run check` at the end and report the real result.
