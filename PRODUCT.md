# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hackathon judges** at NASA Space Apps Challenge 2026, Amman. They see the product in a demo
  and need to understand the idea, where its data comes from and why sites rank as they do.
- **The team itself** (4 people). They use the browser while building, rehearsing and presenting.
- **Open:** whether there is any wider audience beyond the event (for example students, the public
  or mission planners). This is undecided and should not be assumed.

## Product Purpose

The CLPS Lunar Mission Browser is an interactive, map-style browser of the Moon for NASA
Commercial Lunar Payload Services (CLPS) missions. The intended experience is:

- explore lunar landing locations;
- select a CLPS lander;
- get candidate sites ranked for that lander, with time windows;
- see **the reasoning behind each ranking** and each window, factor by factor;
- compare candidate sites;
- review documented mission risks and outcomes, such as Intuitive Machines IM-1 and IM-2.

**Project status:** this is a **practice / testing project**. It exists to rehearse the workflow
and test Claude Code and its plugins. It is not the team's competition build. The vision above is
the direction, not a commitment to build every feature.

Success for the practice: a runnable app that demonstrates the workflow honestly, with no invented
data.

## Positioning

**A lander-centric advisor.** The user picks a CLPS lander first, then gets candidate landing
sites ranked for that lander, with time windows. Every score is explained factor by factor.

- **The lander is the starting point,** not the map. Sites and time windows are evaluated against
  that lander's documented constraints, not shown as a generic catalogue of places.
- **Explained scores:** each ranking shows every factor's value, weight and contribution, so the
  user sees why a site and window ranked where they did.
- **Sourced and transparent (kept as a principle; see Product Principles):** lander constraints,
  site data and window inputs come from cited sources in `docs/DATA_SOURCES.md`. Every input is
  labelled **Verified**, **Assumption** or **Illustrative**. The criteria and weights are
  documented in `docs/LANDER_RULES.md` before they are coded.

A general lunar map can show the same places. It cannot truthfully claim to advise a specific
lander with an auditable reason for every rank unless it does the same work.

## Operating Context

- **Event:** NASA Space Apps Challenge 2026, Amman, November 14–15, 2026. Milestones are in
  `docs/PROJECT_PLAN.md`.
- **Use:** shown live in a demo to judges and rehearsed by the team (see `docs/DEMO_SCRIPT.md`).
  Venue network reliability is a known risk (`docs/KNOWN_ISSUES.md` KI-004).
- **Development:** Claude Code with four project agents (`.claude/agents/`):
  `lunar-data-researcher`, `frontend-map-engineer`, `ranking-expert` and `qa-reviewer`. Their
  responsibilities and file ownership are in `CLAUDE.md`.
- **Version control:** the team chose not to commit or push during the current practice work.

## Capabilities and Constraints

**Built so far:**

- A responsive workspace shell: a top bar, an exploration sidebar, a viewport placeholder and a
  location-details panel. Every control is disabled and labelled as not yet available.
- Pure lunar-coordinate helpers with unit tests: validate, normalise longitude, parse typed
  coordinates and format them.

**Not built:** the interactive map viewport, coordinate search, lander selection, site comparison,
ranking logic, time windows and mission detail views.

**Technical constraints:**

- A static front end: Vite, React, TypeScript and CesiumJS (Moon ellipsoid, no Cesium ion).
- No backend, database, authentication, paid APIs, global state library or 3D engine without
  explicit team approval.
- No new runtime dependencies without approval.

**Map constraints:**

- **Never use Earth basemaps for the Moon.**
- **Map mode:** one top-down 3D view on Cesium's Moon ellipsoid; the camera is held straight down,
  so it zooms continuously from the whole Moon to a flat-looking close-up.
- **No Earth-based measurement:** no scale bar and no distances yet; any lunar distance must come
  from a tested helper on the 1737.4 km sphere (`docs/KNOWN_ISSUES.md` KI-007).
- **No basemap is adopted.** Moon Trek LRO WAC tiles stream as a labelled preview (KI-010);
  candidates are in `docs/DATA_SOURCES.md`, marked "candidate — not adopted".

**Coordinate convention (provisional):** selenographic latitude −90° to +90° and longitude −180°
to +180°, east-positive, in decimal degrees. It must be confirmed against the eventual data sources
(KI-006). Longitudes from 0–360° sources are never converted silently.

**Terminology:**

- **CLPS:** Commercial Lunar Payload Services.
- **Selenographic coordinates:** lunar latitude and longitude.
- **Verified / Assumption / Illustrative:** the labels for ranking inputs.
- **Candidate — not adopted:** a source that has been researched but is not in use.

**Open decisions:** the basemap source, the data format, the ranking methodology, and the
competition rules on pre-event work and AI-tool use. These are listed in `docs/PROJECT_PLAN.md`.

**Time windows are also undecided:**

- what a window means (for example lighting or Earth visibility);
- which sourced data or method defines it;
- its time range.

Windows must not be shown until the method and its sources are documented.

## Brand Commitments

- **Name:** "CLPS Lunar Mission Browser".
- **Voice:** scientific and precise, and never overstating certainty. UI copy labels estimates,
  approximations, placeholders and team assumptions as such.
- **No NASA endorsement:** the product must not claim or imply NASA endorsement or scientific
  validation.
- **Design direction stated by the user:** a scientific workspace with a dark, technical, cinematic
  theme. The main focus is exploring the Moon and its terrain. It should have a distinctive identity
  rather than copying Google Maps. This is recorded as given and not expanded here.

## Evidence on Hand

**Mission data:** none. There is no sourced mission, site, lander or terrain data yet.

- IM-1, IM-2 and every other mission are named as examples only. Their facts must be researched
  and cited before they appear anywhere.
- No real or fictional site markers exist, and none may be added without a decision.

**Map sources:** `docs/DATA_SOURCES.md` lists 16 researched sources (SRC-001 to SRC-016),
accessed 2026-10-24. They cover candidate lunar basemaps and the coordinate convention. **All are
marked "candidate — not adopted".** Trek tile licensing, attribution and CORS are unresolved.

**Not available, so do not fabricate:** testimonials, users, usage metrics, endorsements, awards,
press and deployment claims.

## Product Principles

1. **Sourced and transparent.** No source, no data. If a value cannot be cited, it is marked
   Unknown or left out; it is never guessed. Every score shows where its inputs came from.
2. **Show the reasoning.** Every ranking explains itself factor by factor, so judges can audit it.
3. **Label certainty honestly.** Placeholder, provisional, assumption and illustrative states are
   visible in the UI, not hidden in the docs.
4. **Moon-native, not Earth-borrowed.** No Earth tiles and no Earth distances. Projection and
   coordinate choices are explicit and documented.
5. **Demo-able over ambitious.** Prefer a small, working, honest feature to a large, fragile one.
   The app stays runnable at all times.
