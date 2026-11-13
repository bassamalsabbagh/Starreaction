# CLPS Lunar Mission Browser

An interactive, map-style browser for lunar landing locations and NASA Commercial Lunar Payload
Services (CLPS) landers. Built for the **NASA Space Apps Challenge 2026 — Amman (November 14–15, 2026)**.

> **Status:** project foundation only. The starter page confirms the app runs; the lunar map,
> lander selection, site comparison and mission data are not implemented yet.
> See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## Requirements

- **Node.js** `^20.19.0` or `>=22.12.0` (required by Vite 8). Developed on Node 24.
- **npm** 10+ (bundled with Node)
- **Git**

Check your versions:

```bash
node --version
npm --version
git --version
```

## Install

From the project root:

```bash
npm install
```

Use `npm ci` instead when you want an exact install from `package-lock.json` (for example in CI or
after pulling lockfile changes).

## Develop

```bash
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173>). Edits reload automatically.

## Test, lint and build

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm test`             | Run unit tests once (Vitest + Testing Library, jsdom)          |
| `npm run test:watch`   | Run unit tests in watch mode                                   |
| `npm run lint`         | Lint all TypeScript/TSX with ESLint                            |
| `npm run lint:fix`     | Lint and auto-fix where possible                               |
| `npm run format`       | Format all files with Prettier                                 |
| `npm run format:check` | Check formatting without changing files                        |
| `npm run typecheck`    | Type-check the project with TypeScript                         |
| `npm run build`        | Type-check, build `dist/`, then check it holds no API key      |
| `npm run preview`      | Serve the production build locally (run `npm run build` first) |
| `npm run check`        | Lint + format check + tests + build — run before every commit  |

## Project structure

```text
src/
  app/            App shell and top-level layout
  components/     Shared, presentation-only UI components
  features/
    lunar-map/    Map view (CesiumJS, Moon ellipsoid, top-down zoom) and the two sidebars
    missions/     Mission details, timelines and outcomes (e.g. IM-1, IM-2)
    landers/      CLPS lander profiles and selection
    site-ranking/ Candidate site comparison and documented ranking reasoning
  data/           Typed, source-cited datasets bundled with the app
  services/       Data loading and access functions
  types/          Shared TypeScript types
  utils/          Pure helper functions
  styles/         Global CSS and design tokens
public/
  data/           Static data files served as-is (e.g. large JSON/GeoJSON)
tests/
  unit/           Vitest unit tests
docs/             Plan, data sources, lander rules, demo script, known issues
.claude/agents/   Claude Code specialist subagents
```

## Tech stack

Vite · React 19 · TypeScript · CesiumJS · CSS Modules with CSS custom properties ·
ESLint · Prettier · Vitest. No backend, database or paid APIs.

## Data integrity

Every mission fact, coordinate and lander constraint must have a cited source recorded in
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md). Unsourced data is not added to the app.

## South-pole elevation data

The app shows elevation and slope for points near the south pole once a NASA PGDA LOLA elevation
file is loaded (until then it says "No elevation data loaded yet"). Put the GeoTIFF in `data-raw/`
(git-ignored) and run one command:

```powershell
scripts/data/.venv/Scripts/python scripts/data/elevation_grid.py data-raw/LDEM_80S_80MPP_ADJ.TIF --source SRC-048 --heights-in-metres
```

Setup, the expected format and the first-file checklist:
[docs/ELEVATION_DATA.md](docs/ELEVATION_DATA.md).

## Environment variables

The app needs none. See [.env.example](.env.example). Never commit `.env` or `.env.local` files.

The optional "Launch slipped?" assistant uses one Vercel server function, `api/slip.ts`, which
calls Google's Gemini API (free tier). It reads `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`)
**on the server only**: set them in the Vercel project's Environment Variables, never with a
`VITE_` prefix. `npm run build` fails if the key shows up in `dist/`. Without the function (for
example under `npm run dev` or `npm run preview`) the assistant says it is unavailable and the
Mission form does the same job by hand. To run the function locally, use the Vercel CLI
(`npx vercel dev`) with the key in `.env.local`. Rules: `docs/LANDER_RULES.md`, "Launch slipped
assistant".
