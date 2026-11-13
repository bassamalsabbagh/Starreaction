# CLAUDE.md — CLPS Lunar Mission Browser

## Project context

- **What:** a planning tool for Moon landing sites for CLPS missions, focused on the south pole. For
  any site or point and date, it checks whether a mission gets sunlight for power and the Earth in
  view for direct contact, shows both against the horizon, lists usable landing windows, and shows
  what changes if the launch slips. Sites first pass or fail the mission's needs (Sun, Earth,
  slope), then are ranked in real units (usable window in days, % of mission needs met), never by
  invented weights, and can be compared side by side. A Lessons page covers real past landings with
  sources (e.g. Intuitive Machines IM-1 and IM-2).
- **Not built yet (2026-11-13):** the slope check (needs real LOLA data). Don't assume it exists.
- **Why:** NASA Space Apps Challenge 2026, Amman, November 14–15, 2026. Team of 4.
- **Constraint:** competition deadline. Prefer simple, working, demo-able features over ambitious
  ones. The app must stay runnable at all times.
- Plan and milestones: `docs/PROJECT_PLAN.md`. Known issues: `docs/KNOWN_ISSUES.md`.

## Stack

Vite 8 · React 19 · TypeScript 6 (strict) · CesiumJS 1.146 (Moon ellipsoid; a top-down default view plus a south-pole view, no Cesium ion) · CSS Modules + design
tokens in `src/styles/global.css` · ESLint 10 (flat config) · Prettier · Vitest 5 + Testing Library.

**Not allowed without explicit team approval:** a backend, database, authentication, paid APIs,
global state libraries (Redux, Zustand, …), 3D engines, CSS frameworks, or new runtime dependencies.
Propose the trade-off first.

**Approved exceptions (2026-11-12, decision log in `docs/LANDER_RULES.md`):** one Vercel server
function, `api/slip.ts`, and the Google Gemini API (free tier, plain `fetch`, no npm package) for
the "Launch slipped?" assistant. Its key lives only in `GEMINI_API_KEY` on the server. The AI may
only read the user's text into existing settings; it never supplies numbers, specs or prose. The
site must keep working fully without it.

**Also approved (2026-11-12, same decision log):** offline data scripts in `scripts/data/` (Python
with rasterio/GDAL, versions pinned in `scripts/data/requirements.txt`) to prepare LOLA slope and
terrain data. They run only on team laptops, are never shipped to the browser, and output small
data files with sources in `docs/DATA_SOURCES.md`. They are kept apart from the Node build scripts
in `scripts/` (`check-no-secrets.mjs`, `copy-cesium-assets.mjs`).

## Commands

```bash
npm run dev          # start dev server
npm test             # unit tests (once)
npm run lint         # ESLint
npm run typecheck    # tsc -b
npm run build        # typecheck + production build
npm run check        # lint + format check + tests + build (run before declaring work done)
```

## Code layout and conventions

- Feature code lives in `src/features/<feature>/`. A feature owns its components, hooks and
  feature-specific helpers. Shared UI goes in `src/components/`; pure helpers in `src/utils/`;
  shared types in `src/types/`; data access in `src/services/`.
- Features may import from `components`, `utils`, `types`, `services`, `data`. Avoid features
  importing from each other; lift shared code instead.
- Function components with named exports (`export function MissionCard()`), one component per file,
  `PascalCase.tsx` for components, `camelCase.ts` for everything else.
- Styling: a `Component.module.css` next to each component, using tokens (`var(--color-…)`,
  `var(--space-…)`) from `src/styles/global.css`. No hard-coded colors in components.
- State: React state and props first; `useContext` for genuinely app-wide state (e.g. the
  app's time). No state-management library.
- TypeScript: strict mode, no `any`, no non-null assertions (`!`) on data that could be missing.
  `noUncheckedIndexedAccess` is on — handle `undefined` from index access.
- Tests live in `tests/unit/` and mirror the `src/` path (`tests/unit/features/missions/…`).
  Pure logic (ranking, filtering, coordinate conversion) must have unit tests.
- Comments explain _why_, not _what_. Keep them sparse.
- Formatting is Prettier's job; don't hand-format.

## Data integrity rules (non-negotiable)

- **Never invent** mission facts, dates, coordinates, lander specifications, outcomes or citations.
- Every data record must carry a source reference that matches an entry in `docs/DATA_SOURCES.md`
  (URL, publisher, access date). Prefer NASA primary sources; see the priority list there.
- Uncertain or conflicting values are recorded as such (with both sources), never silently resolved.
- Pass/fail checks and ranking measures must be documented in `docs/LANDER_RULES.md` with their
  rationale and sources _before_ they are implemented. No speculative scoring formulas. No weighted
  scores.
- Demo data is allowed only while the team's research is pending. Every demo record is marked as
  demo in the data (a whole demo file such as `src/data/demoData.ts` counts), shown with the
  "Data: Demo" label, and replaced with sourced data before the final build. If the research isn't
  in by then, the final build keeps the "Data: Demo" label visible.
- UI copy must not overstate certainty: label estimates, approximations and team assumptions.

## Verification rules

Before saying a change is done:

1. `npm run check` passes (lint, format check, tests, build). Report the actual result.
2. New logic has unit tests; UI changes have at least a render test where practical.
3. Anything only checkable in a browser (map rendering, tile loading, interactions, layout) is
   listed as **manual verification needed** — never claimed as tested.
4. Distinguish clearly between "tested", "type-checked only" and "assumed".

## Safety rules

- Never commit secrets or `.env*` files (except `.env.example`). Anything in a `VITE_` variable is
  public in the browser bundle.
- No pushing, deploying or publishing without explicit approval from the user.
- No global package installs; no destructive commands (`git reset --hard`, force push, `rm -rf`)
  without explicit approval.
- Never overwrite or delete user files without looking at them and confirming first.

## Agent responsibilities

Specialist subagents live in `.claude/agents/`. The **main session coordinates them**: it scopes
each task, decides which agent runs, records research results, and relays reports to the user.
Research and QA agents are read-only. The two implementing agents each own separate paths, so no two
agents write the same file. Never run two writing agents on overlapping files at the same time.

| Agent                   | Role                                                                                                                                                                                                             | Writes files?                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| main session            | Coordinates agents; owns `docs/` (incl. `DATA_SOURCES.md`), data records (`src/data`, `public/`), `api/`, `scripts/`, `src/services`, `CLAUDE.md`, config and `.claude/`; records sources the researcher returns | Yes                                                                                                                                                       |
| `lunar-data-researcher` | Finds mission/lander/site data from authoritative sources (NASA first); returns findings with URLs, access dates and confidence                                                                                  | No                                                                                                                                                        |
| `frontend-map-engineer` | Implements scoped UI and lunar-map features; inspects first, minimal changes, verifies with tests/build; no invented data, no Earth tiles                                                                        | `src/app`, `src/assets`, `src/components`, `src/features/*` (every feature except `site-ranking`), `src/styles`, `src/utils`, `src/types`, matching tests |
| `ranking-expert`        | Pass/fail checks and ranking in real units; classifies every input as Verified / Assumption / Illustrative; reports formulas, assumptions, edge cases and tests                                                  | `src/features/site-ranking`, its tests, and _Proposed_ drafts in the methodology section of `docs/LANDER_RULES.md`                                        |
| `qa-reviewer`           | Independently reviews changes, runs lint/tests/build, reports reproducible bugs, separates tested behaviour from assumptions                                                                                     | No                                                                                                                                                        |

Typical workflows:

- **New data:** `lunar-data-researcher` returns cited findings → main session adds them to
  `docs/DATA_SOURCES.md` and the dataset → `qa-reviewer` checks the change.
- **Map/UI feature:** main session scopes the task → `frontend-map-engineer` implements →
  `qa-reviewer` reviews.
- **Ranking:** `ranking-expert` proposes criteria → team agrees and logs the decision in
  `docs/LANDER_RULES.md` → `ranking-expert` implements → `frontend-map-engineer` displays the
  reason for each pass/fail and the ranking number → `qa-reviewer` reviews.

No agent installs packages, commits or pushes. Those need explicit user approval via the main
session.
