---
name: StarReaction · CLPS Lander Advisor
description: A full-screen Moon with one quiet panel beside a menu rail, for checking any site and date for sunlight (power) and the Earth in view (comms), and what changes if the plan slips.
colors:
  space: '#020203'
  bg: '#0c0d0f'
  surface: '#16171a'
  panel: '#0e0f11'
  panel-raised: '#18191c'
  panel-edge: '#26282c'
  border: '#2a2c31'
  border-strong: '#3c3e44'
  text: '#eceae6'
  text-muted: '#a9a8a4'
  text-faint: '#8e8d89'
  on-primary: '#0c0d0f'
  accent-orange: '#ffb347'
  window-teal: '#4fc9c0'
  score-great: '#5fd49a'
  score-ok: '#f0c75e'
  score-poor: '#ff7b72'
  status-demo: '#ff9e8a'
  error: '#ff7b72'
  marker: '#d8d5ce'
typography:
  readout:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.75rem'
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.375rem'
    fontWeight: 600
    lineHeight: 1.2
  heading:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.55
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.75rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.14em'
rounded:
  sm: '4px'
  md: '8px'
  lg: '12px'
  pill: '999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '24px'
  '6': '32px'
components:
  button-primary:
    backgroundColor: '{colors.text}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
  rail-item:
    backgroundColor: 'transparent'
    textColor: '{colors.text-muted}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    height: '52px'
  rail-item-active:
    backgroundColor: '{colors.panel-raised}'
    textColor: '{colors.text}'
  floating-panel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    width: '24rem'
  chip:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '4px 8px'
  timeline:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.lg}'
    height: '6rem'
---

# Design System: StarReaction · CLPS Lander Advisor

## Overview

**The Moon is the screen.** The app opens on a full-screen, Sun-lit Moon (CesiumJS, top-down). Everything else floats over it, quietly, and never resizes or moves it: a slim menu rail on the left, **one** panel beside the rail, a top row with the breadcrumb, a status line and a full-width timeline along the bottom, the map's icons and readout on the right. Inspired by Windy, NASA Eyes and Flightradar: the subject is the picture, and the controls are instruments around its edge.

**The answer first.** The default view is Sites: the place with the longest usable window for the chosen mission at the top, with its best window and how much of the month the Sun and Earth are up, then the rest, then the places that do not suit the mission, with one-line reasons. A site's card answers the planner's question at a glance: power and comms OK or not, the Sun and Earth now with the time left before each sets, the horizon view, and other dates if the plan slips.

**Plain and honest.** One wording everywhere, written for a judge rather than a specialist ("Power and comms OK", "Not suitable for this mission", "Best window", "sets in 2d 4h"). Mission profiles and sites are demo data, and the UI says so ("Data: Demo"). The Sun and Earth positions are real, and so is everything on the Lessons page (sourced past landings).

Mode: **Operate.** A tool shown live to hackathon judges. Ambition shows as precision and restraint, not decoration.

## Colors

A neutral near-black palette with **one accent, the logo orange**, and one functional teal.

### Primary

- **Logo orange `#ffb347` (`--color-accent`)**: the selected or active state only. The rail's active marker, the best-match marker, the selected site's ring on the map, the timeline's selected-time marker and slider thumb, the selected speed, the SIMULATED outline. Never a large fill, never body text.

### Secondary

- **Window teal `#4fc9c0` (`--color-window`)**: windows on the timeline, in the card's window bar and the Sites list's window bars, and nothing else. It never means Live.

### Neutral

- **Space `#020203`** behind the Moon; **panel `#0e0f11`** for every floating surface (solid, no blur); **panel-raised `#18191c`** for hover and active fills; **bg `#0c0d0f`** for wells (chips, inputs).
- Text: **off-white `#eceae6`** (16:1 on a panel), **muted `#a9a8a4`** (8.1:1), **faint `#8e8d89`** (5.8:1). All AA on panels.
- Lines: **panel-edge `#26282c`** (the 1px panel rim), **border `#2a2c31`**, **border-strong `#3c3e44`**.

### Status, Sun and Earth

- **Green `#5fd49a`, amber `#f0c75e`, red `#ff7b72`** (`--color-score-*`): OK / cut short / fails, always with the word ("OK", "Fails", "Full mission", "Ended early"), never colour alone.
- **Sun yellow `#ffd27a` (`--color-sun`) and Earth blue `#9cc3ff` (`--color-earth`)**: the two bodies in the horizon view, always named beside their dot.
- **LIVE** uses the green (a green dot and green text); **SIMULATED** is an orange outline with off-white text.
- **Demo coral `#ff9e8a`**: the "Data: Demo" pill and DEMO tags.
- **Halo `rgb(0 0 0 / 0.6)`** (`--color-halo`): a dark rim on marks drawn straight on the Moon, so they read over bright highland. **Scrim `rgb(2 4 9 / 0.62)`** (`--color-scrim`): the dim behind the tour and About.

### Named Rules

- **One accent.** Orange marks what is selected or active. If two things are orange, one of them is wrong.
- **Teal is time.** Teal only ever means a landing window.
- **Nothing on the Moon without a backing.** Text over the Moon sits on a solid panel; a line or ring drawn on it carries the dark halo.
- **No cyan, no glass.** The old blue accent and backdrop blur are gone for good (blur redraws on every frame of the moving Moon).

## Typography

One family: the system UI sans (`system-ui`, Segoe UI, Roboto…). Numbers use it too, with `tabular-nums` wherever they change (heights, clock, readout, countdowns).

### Hierarchy

One type scale: **12 / 13 / 15 (base) / 16 / 18 / 22 / 28 px**.

- **28 px bold**: the Sun's and Earth's heights on the card.
- **22 px semibold**: the place's name on its card, and the demo caption titles.
- **18 px**: the demo captions (read from across a room), the About wordmark, Compare's names.
- **15 px**: body text in panels and captions.
- **13 px**: secondary text, chips, the timeline's controls and legend.
- **12 px semibold, 0.14em, uppercase**: panel view titles ("SITES", "LANDER") and rail labels (rail labels without the uppercase).

### Named Rules

- **The heading carries the weight.** No eyebrow labels above headings; a field whose view title already names it keeps its label for screen readers only.
- `text-wrap: balance` on headings, `pretty` on body.

## Layout

The **shell** (`src/app/App.module.css`) places fixed chrome over the Moon by CSS variables:

- **Top row** (`--top-bar-height` 4.25rem): logo, "StarReaction" and the breadcrumb (Moon › mission › site) in one cluster at the left; the product title centred on the window; the "Data: Demo" pill at the right. The centred title is measured against both clusters and drops out (screen readers keep it) whenever it would come within 24px of either.
- **Menu rail** (`--rail-width` 4rem): full height from under the top row to the bottom edge. Views first (Mission, Sites, Compare, Lessons); actions (Demo, About) at the foot under a hairline.
- **One panel** (`--panel-width` 24rem; Compare is wider): beside the rail, above the bottom stack. One view at a time: Sites (default), a site's or point's card, Mission, Lessons, Compare, the mission form. A ‹ / › handle on its right edge; closed, only the handle stays, next to the rail.
- **Bottom stack** (`--bottom-stack`): the status line (`--status-line-height` 2.5rem) centred above the timeline (`--time-bar-height` 6rem). The timeline spans from the rail to the readout.
- **Right edge**: the map's icon column, vertically centred; the readout (Altitude, Zoom, Distance) in the bottom-right corner, level with the timeline.
- Gutters: `--panel-gap` (12px) from every window edge; 8px between neighbours.

Spacing is the 4px scale: **4 / 8 / 12 / 16 / 24 / 32 px** (`--space-1` to `--space-6`). Hairline gaps (1–2px) appear only inside tight label/value pairs.

**Breakpoints** (things give way in order, nothing overlaps):

- ≥1600px: day labels every other day.
- <1100px: the timeline legend gives way.
- <900px: the day-step buttons and the fold label give way; day labels every sixth day.
- <768px: the speed choice gives way (6 h/s stays set).
- <600px: phones. The brand name and most of the readout fold away (Altitude stays, with its word); narrow screens start with the panel closed.

## Elevation & Depth

Flat, solid surfaces over the Moon, lifted by one soft shadow; nothing is translucent.

### Shadow Vocabulary

- `--shadow-float` `0 2px 10px rgb(0 0 0 / 0.4)`: every floating panel (rail, panel, timeline, status line, map icons, readout).
- `--shadow-tip` `0 2px 8px rgb(0 0 0 / 0.35)`: tooltips and the map's name tag.
- `--shadow-pop` / `--shadow-modal`: popovers and the About dialog.
- A 1px inset sheen (`--glass-sheen`, 3% white) on the panel's top edge.

### Named Rules

- **Borders for structure, shadows for lift.** The 1px panel rim is structure; elevation comes from the shadow.
- **Layering** (z-index): map overlays 5–10 · panel 30 · rail 35 · top row 40 · skip button 60 · tour 90.

## Shapes

One radius scale: **4 / 8 / 12 px and pill** (`--radius-sm`, `-md`, `-lg`, `-pill`).

- **12 px**: floating surfaces (rail, panel, timeline, map icon column, readout, dialogs).
- **8 px**: controls and cards inside them (buttons, inputs, chips, site rows, the handle).
- **4 px**: small parts (timeline buttons, the speed group, the slider thumb, tags).
- **Pill**: the status line, the DEMO pill, track rails, window zones, hairline markers.
- Nested corners stay concentric: a segmented group is rounded only at its ends.

## Components

### Buttons

- **Primary**: off-white fill, near-black text (e.g. the tour's Next and the timeline's Play, which is round and a size up). One per view.
- **Secondary**: transparent with a `--color-border-strong` outline, off-white text; hover fills with panel-raised.
- **Icon buttons**: 32px (timeline) or 40px (map, panel) targets, 20px icons; 16px icons beside text.
- Press: `scale(0.96)` where motion is allowed.

### Chips

Mission needs (Sun for power, Power needed, Earth for contact): bg-well chips, label on top in faint 12px, value at the bottom in 15px off-white; the values stay in line when a label wraps.

### Cards / Containers

- **Site row** (Sites view): rank, name, a teal bar for the usable window, and the value of the chosen order ("13.9 d window", "62% Earth up"). The #1 row carries the orange best-match marker, its best window and the month's Sun and Earth shares. Above the list: "Go to coordinates" and the order switch (Longest window, Most sunlight, Most Earth time, Name).
- **Place card** (a site or any point): "‹ All sites"; name, rank (sites), coordinates or the nearest demo site; the verdict line with a status dot; two "now" tiles (Sun · power, Earth · comms: height, then sets or rises in …); the horizon view; the best window and window bar; the month's numbers; the two checks (Power, Comms: OK or Fails with the value behind it); Other dates (next six months, each with Go); Compare (sites) and Share; "How this is worked out".
- **Horizon view**: a sky chart in a well: compass directions along the bottom (S in the middle for a northern place, N for a southern one), height up the side in round steps, the ground below 0°, the Sun's and Earth's paths over the month, their dots now with names, the mission's lowest Sun height dashed. The scale follows the sky, so the pole's few degrees fill the chart. Flat horizon until terrain data exists, and it says so.
- **Lessons card**: one real past landing: name and outcome word, who · when · where, what happened, "The lesson" in orange, a note on conflicts or journalism, and source links.

### Inputs / Fields

Native `select` and inputs on the bg well, 8px radius, 40px tall, `--color-border-strong` outline that brightens on hover. Visible labels, except where the view title already names the field.

### Navigation

- **Menu rail**: icon (20px, 1.5 stroke) over a 12px label; the whole 56×52 tile is the target. The active view: panel-raised fill, off-white, and a 3px orange marker on the rail's outer edge. A view item opens its view; clicking the active one closes the panel. Compare shows how many sites are picked (and says it to screen readers).
- **Breadcrumb**: Moon › mission › site or point, in step with the rail. Moon opens Sites; the mission opens the Mission view with the picker focused; the site or point opens its card.

### Timeline (signature component)

Play leads (round, off-white), then the speeds (1 h/s, 6 h/s, 1 day/s; the selected one has an orange inset outline), day steps, the calendar, the countdown ("Window open – closes in 6d 19h", a link to the window's start), the legend ("Landing windows · site · range"), Now and the fold handle. Under them, a day strip (ticks every day, labels every few days) over a track with the teal windows and the orange selected-time marker. With no site selected it shows the best site's windows ("Best site: …"). Folds to a thin line with a "Timeline" handle.

### Point pin and point card ("Anywhere on the Moon")

A click on bare Moon (not a beacon), or typed coordinates, drops a **pin**: a 22px orange ring with a centre dot, the dark halo on both sides, and a "Your point" tag; it stays at full strength near the rim like the selection ring. The cursor is a crosshair over the ground. The panel opens the same **place card** a site gets, named by its coordinates ("12.4° N, 31.8° W") with the nearest demo site as a quiet underlined link.

### Status line

A pill centred above the timeline: mission · LIVE (green dot and text) or SIMULATED (orange outline) · the clock · the Sun and Earth at the selected place, each with "sets in …" or "rises in …".

## Motion

- **Transform and opacity only**, 200–300 ms, ease-out (`--ease-out`, `cubic-bezier(0.23, 1, 0.32, 1)`); `--duration-panel` is 250 ms.
- **Panel**: slides out to the left with a fade over 250 ms; the handle glides to its spot beside the rail and its arrow turns ‹ → ›. The same for the handle, Esc and the active rail item. Interruptible (CSS transitions).
- **Views and cards** fade and rise 6px in over 220 ms.
- **Timeline marker** follows the time directly (no easing), so scrubbing never lags.
- **While the Moon is dragged** nothing decorative moves: hover is off and the selection pulse stops.
- **Reduced motion**: every slide, fade and pulse becomes instant; the demo steps time instead of playing it.
- The tour ring is the one exception that moves its size (top/left/width/height, 250 ms), because it must morph between targets; it is a fixed, childless overlay.

## Do's and Don'ts

### Do:

- **Do** keep the Moon full screen and still; float everything over it.
- **Do** show one panel at a time, opened from the rail.
- **Do** put the answer first: the best match, its main reason and its best time to land.
- **Do** keep orange for the selected or active state, and teal for landing windows.
- **Do** label demo data as demo, and print a status word next to its colour.
- **Do** keep text on solid panels at AA contrast; give marks on the Moon a dark halo.
- **Do** keep focus visible (2px off-white ring), Tab order top row → rail → panel → map, Esc closing the top panel, H toggling presentation mode.

### Don't:

- **Don't** use glass, backdrop blur, cyan, gradient text or eyebrow labels.
- **Don't** add a second accent or a second type family.
- **Don't** animate width, height, left or top for chrome; don't animate anything while the Moon is dragged.
- **Don't** bring back "Excluded", "Advisor", "Featured", "Simple / Expert": the wording is "Not suitable", "Sites", "Mission". Don't bring back a 0–100 score or weights.
- **Don't** move or resize the Moon when a panel opens; a fly-to aims beside the open panel instead.
- **Don't** state real mission facts in the UI except on Lessons, where each one carries its source.
