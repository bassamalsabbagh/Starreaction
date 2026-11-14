# Demo Script

> **Status:** draft flow, about 3 minutes, rewritten 2026-11-14 for the four-step plan. Rehearse
> against the production build (`npm run build && npm run preview`), not the dev server. The Sun
> and Earth are real and the past landings are real; the mission's needs are the ones typed in.
> Say so once, early.

## Setup checklist (before presenting)

- [ ] Latest branch pulled, `npm ci` run, `npm run check` passes
- [ ] Production build running locally (`npm run preview`)
- [ ] Map tiles and the Layers images load on the venue network
- [ ] Browser zoom at 100%, notifications off, unrelated tabs closed
- [ ] Backup: screen recording of the full demo
- [ ] Share says "Link copied"

## Flow (about 3 minutes; adjust to the competition rules)

| Step | Presenter | Action                                                                                      | What the audience should take away                               |
| ---- | --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    |           | The problem: "The launch slipped. On the new date, at our site: power? Earth in view?"      | Planners need a fast answer when the date or site changes        |
| 2    |           | The map opens straight down on the south pole (Top). Click **3D**, then **Top** again       | The pole's low Sun and Earth, seen as a map and with the horizon |
| 3    |           | **1 Location:** click **IM-2 Athena** under Past landings, then **Next**                    | Any spot works: typed coordinates, a map click or a past landing |
| 4    |           | **2 Mission:** type a name; set Sun, power days and Earth; **Next**                         | The mission's own needs, in plain words                          |
| 5    |           | **3 Dates:** keep today + 14 days, **Next**                                                 | Any dates up to 12 months                                        |
| 6    |           | **4 Results:** hours with the Sun up, the Earth up and both; the pass/fail lines            | The answer first, with its data source and time step             |
| 7    |           | **+7 days**, then **+1 month**                                                              | The slip: both dates move, the answer updates at once            |
| 8    |           | **Compare with another location:** add IM-1; the longest usable window comes first          | Side by side, same mission and dates                             |
| 9    |           | **Layers** (bottom left): Elevation on, then off                                            | The terrain at the pole, from the team's rasters                 |
| 10   |           | Limits and next steps: terrain horizons beyond IM-1 and IM-2, the slope check, sources page | Honest about what is a test or a prototype                       |

Fallbacks: **H** gives a clean presentation view; a shared link reopens an exact moment (mission,
location, dates and time).

## Likely questions from judges

- Where does the data come from? → About → Data and credits, and `DATA_SOURCES.md`
- How are the checks worked out, and what do they ignore? → `LANDER_RULES.md`
- Are the mission numbers real? → They are the user's own; the form starts from neutral starting
  values, labelled so
