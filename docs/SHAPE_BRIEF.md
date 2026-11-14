# Shape Brief: Workspace Shell, Lander-First Advisor

> **Superseded in part:** the layout is now two docked sidebars (Plan and Site
> details) over a full-window map; TopBar, ExplorationSidebar, ReasoningPanel and the step labels
> named below were removed. See DESIGN.md for the current structure.

**Status:** confirmed by the user (via `/impeccable shape`).
**Target:** `src/app/App.tsx` and the components it composes.
**Origin:** the two P1 issues from the first `/impeccable critique` of `src/app/App.tsx`
(`.impeccable/critique/2026-10-23T22-42-01Z__src-app-app-tsx.md`):

1. The lander, the product's main object, is missing, and the layout is map-first.
2. The screen never says what the product is, or where its data comes from.

Decisions taken in the shape interview:

- **Focal point:** the advisor flow.
- **Lander slot:** the top bar; coordinate search moves into the viewport as a secondary tool.
- **Fidelity:** structure only.
- **Sources line:** shows no counts.

## 1. Job and audience

- **Who:** hackathon judges watching a live demo, and the team rehearsing it.
- **Mode:** Operate. Within 5–10 seconds, a judge must understand what the product does (pick a
  lander → ranked sites → time windows → explained reasons). They must also see that nothing on
  screen is invented.

## 2. Outcome and proof

- **Success:** a judge can describe the 4-step flow, and see that the data isn't there yet
  _because it isn't sourced_.
- **Product-specific truth:**
  - The lander is the starting point, not the map.
  - Every status is visible.
  - The data-source state is factual: candidates researched, none adopted.
  - NASA doesn't endorse the project.
- **Evidence the screen can use:** only what exists today: the coordinate convention, the "no
  basemap adopted" state, and the source-research status. No landers, sites, factors, weights or
  windows.

## 3. Chosen direction

- **Visual system:** `DESIGN.md` ("The Instrument Console") is unchanged. This is a change of
  information structure, not a new look.
- **Core idea:** the workspace reads left to right as the advisor's 4 steps, and each region of
  the screen owns one step:

  | Step                                       | Region      | Content                                                    |
  | ------------------------------------------ | ----------- | ---------------------------------------------------------- |
  | **1 · Lander**                             | Top bar     | A disabled lander selector, the first control on the page. |
  | **2 · Ranked sites**, **3 · Time windows** | Left rail   | Each step has its own empty state and status.              |
  | **4 · Reasoning**                          | Right panel | The explained-score area for a selected site.              |

  Step numbers are allowed here (the craft rules normally discourage them) because the order is
  the information.

- **Focal point:** the viewport's empty state becomes a short summary of the flow (1 → 2 → 3 → 4,
  each with its status badge). Above it sits a one-sentence product statement marked as in
  development, and below it a factual sources line. The Placeholder badge stays. When the real map
  arrives, this summary leaves the viewport.
- **Map tools are secondary:** the coordinate search and the map layers (grid, basemap) move into
  a compact "Map" group. Search becomes a small control inside the viewport, and layers sit below
  the steps in the rail. Both stay disabled.
- **What the build has to do:** reorder the sidebar into "Ranked sites / Time windows / Map
  layers", add a lander slot to the top bar, retitle the right panel "Reasoning", turn the
  viewport placeholder into a flow-summary empty state, and change the DOM order (see section 6).

## 4. Scope and boundaries

- **Fidelity:** structure only. Every control stays disabled and labelled. No new behaviour, and
  the coordinate parser stays unconnected.
- **Target:** `src/app/App.tsx` and its components (TopBar, ExplorationSidebar,
  ViewportPlaceholder, LocationDetailsPanel), plus their tests.
- **Leave alone:**
  - `DESIGN.md` tokens and rules;
  - the status badge component;
  - the coordinate-convention block (it moves under Reasoning or keeps its own section, with
    unchanged content);
  - `src/utils/selenographic.ts`.
- **Anti-goals:**
  - no invented lander names, site names, factor names, weights, scores, windows or numbers;
  - no score columns filled with placeholder numbers;
  - no Earth basemap and no Google Maps look;
  - no eyebrow or kicker label above headings;
  - no new dependencies;
  - nothing that implies features work.

## 5. States and ranges

**Now:** only the pre-data state exists. Each step shows its empty state and reason:

| Step           | Badge      | Reason                                                                                                                                                                                      |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Lander       | Needs data | Lander constraints not sourced yet.                                                                                                                                                         |
| 2 Ranked sites | Needs data | Depends on step 1.                                                                                                                                                                          |
| 3 Time windows | Needs data | Method not yet defined.                                                                                                                                                                     |
| 4 Reasoning    | —          | Empty state: "Select a ranked site to see each factor's value, weight, contribution and source." The column names appear only in this sentence, never as an empty table with invented rows. |

**Badges:** the badge labels stay as they are: "Not built" and "Needs data".

**Later:** the structure must leave room for selected and unselected lander states, 0 to N ranked
sites, multiple windows per site, and a factor list of unknown length in Reasoning. The build
designs none of these now, but must not block them.

## 6. Interaction and layout

- **Desktop (1024px and wider):** the same 3-column grid: rail, viewport, Reasoning.
- **Below 1024px:** stacked in step order: top bar (step 1), viewport summary, rail (steps 2–3,
  then map layers), Reasoning (step 4). While it's an empty state, the viewport summary shrinks to
  fit its content, so it no longer takes up 58vh.
- **DOM order** becomes header → main → rail → Reasoning on every screen size. Reading order then
  follows the steps, which fixes the screen-reader order issue.
- **Top bar:**
  - The title, with a subtitle that spells out CLPS (for example "Commercial Lunar Payload
    Services · lander advisor").
  - The lander selector, labelled "1 · Lander", disabled, with a "Needs data" badge.
  - The global data-status badge.
  - The search box leaves the top bar.
- **Viewport empty state:**
  - The product statement, marked as in development.
  - The flow summary (1 → 2 → 3 → 4, each with its badge).
  - A sources line ("Candidate sources researched, none adopted").
  - The non-endorsement line ("Not affiliated with or endorsed by NASA").
  - The Placeholder badge.

## 7. Constraints and open decisions

**Constraints:**

- The web build and the existing components and tokens stay as they are.
- WCAG AA contrast.
- Tests are updated for the new structure, keeping honesty assertions such as "No sourced data
  yet" and "Placeholder".
- `frontend-map-engineer`'s file ownership applies.

**Open decisions (for the user, not the builder):**

- **Source counts:** whether the sources line ever shows numbers. Decided for now: **no counts**.
  If counts are added later, they must come from one place in the code, not be copied into the UI
  where they could drift from `DATA_SOURCES.md`.
- **Exact copy:** the wording of the product statement and the non-endorsement line.
- **Two label sets:** how the data-status badges will sit alongside the planned Verified /
  Assumption / Illustrative labels. That's deferred until ranking exists.
