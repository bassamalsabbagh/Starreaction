# Demo Script

> **Status:** draft flow, about 3 minutes. Rehearse against the production build
> (`npm run build && npm run preview`), not the dev server. The mission profiles and sites are
> DEMO; the Sun and Earth are real, and the Lessons page is sourced. Say so once, early.

## Setup checklist (before presenting)

- [ ] Latest `main` pulled, `npm ci` run, `npm run check` passes
- [ ] Production build running locally (`npm run preview`)
- [ ] Map tiles load on the venue network; offline fallback tested
- [ ] Browser zoom at 100%, notifications off, unrelated tabs closed
- [ ] Backup: screen recording of the full demo
- [ ] **Watch the short demo** advances on its own on the demo laptop (fixed 2026-11-12: it used to
      freeze on a step when the Moon's idle drift was running); Share says "Link copied"
- [ ] "Launch slipped?" assistant: it only works on the Vercel deployment with `GEMINI_API_KEY`
      set (not under `npm run preview`). Try the step 3 sentence there on the venue network. If it
      fails, present step 3 with the plain-form backup below; nothing else depends on it

## Flow (about 3 minutes; adjust to the competition rules)

| Step | Presenter | Action                                                                                                                    | What the audience should take away                                            |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    |           | The problem: "The launch slipped. On the new date, at our site: power? Earth in view?"                                    | Planners need a fast answer when the date or site changes                     |
| 2    |           | Rail → Mission: Demo Mission A's needs (Sun 5° for the panels, 3 days of power, Earth in view)                            | The question is set by the mission's needs                                    |
| 3    |           | **Launch slipped?** Type "Launch slipped 3 weeks and we now need 6 days of power." → Read it → "I read this as …" → Apply | The AI only reads the sentence; the date maths and every result are the app's |
| 4    |           | Rail → Sites: the best site, its best window, Sun and Earth time this month                                               | Every site is checked with the real Sun and Earth, best window first          |
| 5    |           | Open the site's card: the Sun and Earth now, "sets in …", and the horizon view                                            | Sunset and Earthset at a glance; the Sun and Earth seen from the site         |
| 6    |           | Press Play on the timeline; then open **Other dates**                                                                     | If the plan slips, the best window for each of the next months is one click   |
| 7    |           | Open Demo Site India (south pole): the Sun skims the horizon, the Earth comes and goes                                    | Why the south pole is hard: small changes in place or date matter             |
| 8    |           | Type coordinates, or click anywhere on the Moon                                                                           | Any spot gets the same check                                                  |
| 9    |           | Compare two sites; then Rail → Lessons (IM-1, IM-2, SLIM…)                                                                | Real landings show what sunlight and the Earth decide; every fact is sourced  |
| 10   |           | Limits and next steps: terrain horizons from LOLA, real sites from the research data                                      | Honest about the smooth horizon; a clear path to a sourced tool               |

Fallbacks: **Watch demo** (rail) runs the same story in a little over a minute (about 75 s); **H** gives a clean
presentation view; a shared link reopens an exact moment (mission, site or spot, time).

### Plain-form backup for step 3 (no AI, no network needed)

If the box says "The assistant isn't available right now" (no key, no network, a timeout), or
there is no time to wait for it, do the same change by hand. Say: "the assistant only fills in
this form; here it is by hand."

1. Click **Open the mission form** under the message (or Mission → **Add your own mission**).
2. Name: `Demo Mission A slipped`. Start from preset: Demo Mission A. Days of power needed: `6`.
3. **New date, optional (UTC):** the date shown on the time bar plus 21 days (for example,
   15 Nov 2026 → `2026-12-06`), and the same time. The hint confirms "Moves the time bar to …".
4. **Use without saving.** The time bar, the Sites list and the map update as in step 3.

## Likely questions from judges

- Where does the data come from? → `DATA_SOURCES.md`
- How is the ranking calculated, and what does it ignore? → `LANDER_RULES.md`
- Can the AI make up numbers? → No: it only reads the sentence into fields; every number must be
  in the user's text, the app does the dates and the checks, and the result sentence is a fixed
  template (`LANDER_RULES.md`, "Launch slipped assistant")
