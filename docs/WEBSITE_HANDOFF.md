# StarReaction · CLPS Lander Advisor — text and theme for the HTML website

Everything below is taken from the app's own source (`src/styles/global.css`, `DESIGN.md`,
`src/features/about/AboutPanel.tsx`, `src/app/appInfo.ts`). Use it as written.

## 1. Names

- **Team / brand:** StarReaction — "Star" in white (`#ffffff`), "Reaction" in orange (`#c27803`)
- **Product:** CLPS Lander Advisor (project name: CLPS Lunar Mission Browser)
- **Event:** NASA Space Apps Challenge 2026, Amman
- **Disclaimer (must appear on the site):** Not affiliated with or endorsed by NASA.

## 2. One-line pitch

Pick a place and a date on the Moon, and see at once whether a mission gets sunlight for power and
the Earth in view to talk home, how long until sunset and Earthset, and what changes if the plan
slips.

## 2b. Project details (submission text)

**StarReaction is an interactive lunar landing-site and landing-date planning platform focused on the Moon's south pole.** At the lunar south pole, water ice is found in permanently shadowed regions, while solar power depends on access to sunlight. StarReaction addresses this challenge by showing, for any selected location and date range, how much sunlight a lander receives, when Earth is visible, and how often both conditions occur simultaneously.

### How it works

Users can select a location directly on an interactive 3D Moon, enter coordinates, or explore historical landing sites such as IM-1 and IM-2. They can then define mission requirements and select a start and end date.

The platform provides:

- **Sun Up:** Identifies the days when the Sun is above the local horizon, indicating potential solar power opportunities.
- **Earth in View:** Identifies when Earth is above the local horizon, indicating potential direct-to-Earth communication windows.
- **Sun + Earth Together:** Combines both conditions to identify periods when the lander can potentially generate solar power while maintaining direct visibility of Earth. Results are evaluated against user-defined mission requirements using clear Pass/Fail indicators.
- **Alternative Landing Dates:** Explores how changes in the mission schedule affect sunlight and communication availability and identifies more favorable nearby dates.
- **Power and Battery Analysis:** Calculates the longest darkness period within the selected date range and estimates the battery capacity needed to sustain the lander. The Moon Power Lab also allows users to experiment with battery configurations.
- **Site Comparison:** Enables side-by-side evaluation of multiple landing locations under the same date and mission requirements.
- **Terrain Layers:** Displays lunar elevation, slope, and surface roughness using NASA LOLA data.

### Tools and technologies

StarReaction was developed using TypeScript and React, with CesiumJS providing the interactive 3D lunar environment.

For celestial calculations, we use NASA JPL Horizons as a reference for selected historical landing sites and our own calculation engine, based on astronomy-engine, for other locations. We validated our engine against Horizons, achieving an angular difference within 0.007° in our comparisons.

Terrain layers were generated using Python scripts and NASA's Lunar Orbiter Laser Altimeter (LOLA) datasets. Historical landing-site coordinates were cross-checked using LROC QuickMap.

We also prioritized data transparency: numerical results are linked to their sources, and unavailable published data is identified rather than replaced with invented values.

### Creativity and innovation

Existing lunar mapping tools primarily focus on visualizing terrain and geographic information. StarReaction takes a different approach: it acts as a mission-planning advisor by integrating solar power opportunities and Earth communication visibility into one location- and date-specific assessment.

A location may receive sufficient sunlight but still have limited Earth visibility. By identifying when both conditions occur together, StarReaction provides a more realistic picture of a lander's operational opportunities rather than evaluating sunlight or communication independently.

### Factors considered

Our team considered the extremely low solar elevation angles near the lunar south pole, prolonged periods of darkness, battery requirements, Earth visibility above the local horizon, terrain slope and roughness, possible mission schedule delays, and the scientific importance of polar regions containing potential water-ice resources.

### Future development

Future improvements include incorporating local terrain horizons to account for hills and other obstacles that may block the Sun or Earth, generating regional sunlight and Earth-visibility maps, and developing an intelligent recommendation system that identifies more favorable nearby landing locations.

### Intended impact

StarReaction aims to help future lunar mission planners make better-informed decisions about where and when to land by bringing power availability, communication opportunities, and terrain information into a unified platform. Ultimately, we hope to contribute to more reliable robotic exploration and help prepare the way for sustained human presence on the Moon.

## 3. Text

### About

Pick a place and a date on the Moon, and see at once whether a mission gets sunlight for power and
the Earth in view to talk home, how long until sunset and Earthset, and what changes if the plan
slips. The Sun and Earth are real, and the sites are real landings; the mission's needs are the
ones you enter.

### Finding your way

- **Plan** walks through four steps: 1 Location (type coordinates, click the Moon or take a past
  landing), 2 Mission (its name and needs), 3 Dates, and 4 Results. Back keeps what you entered.
- **Results** shows the hours with the Sun up, the Earth up and both, sampled every hour, with the
  pass or fail of each check. More details holds the horizon view, the best window, other dates and
  night survival.
- **Compare** puts up to four past landings side by side for the same mission and dates, the
  longest usable window first.
- **Along the bottom** on the Results step, the timeline over the dates you picked. Teal stretches
  are the windows.
- **Moon Power Lab: battery and panel calculator:** how big a battery a lander needs to survive the
  Moon night.
- **On the map:** Top and 3D views of the south pole, zoom, the whole Moon, the grid, Layers and
  presentation mode (H).
- **Launch slipped?** Describe the change in a sentence. An AI only reads it into the settings; the
  app checks every number against your text, works out the dates and shows what it read before
  anything changes.

### How it works

Enter your mission. Its needs are three numbers and a yes or no: how high the Sun must be for its
solar panels to give power, how many days of power it needs in a row, how high the Earth must be
to talk to it directly, and whether it has a relay instead.

For every site (or any point you pick), the app works out where the real Sun and Earth are every
hour over the range checked, as seen from that place. Three checks follow, each measuring one
thing:

1. **Power:** the Sun only. The longest unbroken stretch with the Sun high enough must last the
   days the mission needs.
2. **Comms:** the Earth only. Without a relay, the Earth must rise high enough at some point in
   the range; a mission with a relay always passes.
3. **Usable window:** the Sun and the Earth both. The longest stretch with both up at once must
   last the days the mission needs. With a relay the usable window is the power stretch, so it is
   not listed separately.

A window is a stretch with the Sun up and, for a mission without a relay, the Earth up too.
Compare orders the past landings by their longest usable window. Sunset and Earthset are when each
body next drops below the horizon.

The Sun and Earth positions are real: JPL Horizons at the four landing sites, and our engine
(astronomy-engine) for clicked points and other dates, checked against JPL Horizons. The sites are
real landings. The mission's needs are yours. The horizon is a smooth Moon: crater rims and hills,
which matter most at the south pole, are not counted yet.

### Roadmap

Done:

- Real Sun and Earth positions for any place and time
- Time to sunset and Earthset, and the horizon view
- Anywhere on the Moon: click or type coordinates
- Add your own mission needs
- Real landing sites (IM-1, IM-2, Blue Ghost Mission 1, Chandrayaan-3), each value cited

Planned:

- Terrain horizons at the south pole from LOLA elevation data

### AI notice (show next to the "Launch slipped?" feature)

The "Launch slipped?" box sends what you type to Google's Gemini API on its free tier. Google may
use text sent to the free tier, and its replies, to improve its models, and people may review it,
so don't type anything private or sensitive. Nothing you type is stored by this app.

### Honesty wording to keep

- Short phrases used across the app: "Power and comms OK", "Not suitable for this mission", "Best
  window", "sets in 2d 4h".
- Never claim NASA endorsement or scientific validation. Label estimates and assumptions as such.
- Scores and states are always shown with a word, never colour alone (Great / OK / Poor; Live /
  Simulated).

## 4. Theme

**Mood:** a dark, technical, cinematic science workspace. The Moon is the picture and the controls
are quiet instruments around it. One accent colour, used sparingly (selected state, small active
details, never a large fill).

### Colours

| Role                              | Hex       |
| --------------------------------- | --------- |
| Page background                   | `#0c0d0f` |
| Space / map surround              | `#020203` |
| Surface                           | `#16171a` |
| Panel                             | `#0e0f11` |
| Panel raised                      | `#18191c` |
| Border                            | `#2a2c31` |
| Border strong                     | `#3c3e44` |
| Text                              | `#eceae6` |
| Text muted                        | `#a9a8a4` |
| Text faint                        | `#9a9995` |
| **Accent (amber, from the logo)** | `#ffb347` |
| Text on accent                    | `#1a1100` |
| Accent text on white              | `#8a4b00` |
| Brand "Star"                      | `#ffffff` |
| Brand "Reaction"                  | `#c27803` |
| Sun                               | `#ffd27a` |
| Earth                             | `#9cc3ff` |
| Usable window (teal)              | `#4fc9c0` |
| Great / pass                      | `#5fd49a` |
| OK                                | `#f0c75e` |
| Poor / fail / error               | `#ff7b72` |
| Demo data label                   | `#ff9e8a` |
| Map lines                         | `#d8d5ce` |
| Timeline: both up                 | `#3ddc84` |
| Timeline: Sun only                | `#ffd23f` |
| Timeline: Earth only              | `#3d8bff` |
| Timeline: empty track             | `#1f2126` |

Light panel (white cards on the dark page): fill `#ffffff`, edge `#c4c8cf`, text `#111318`, muted
`#3d424b`, faint `#565c66`, border `#d3d6dc`, raised `#eef0f3`, pass `#106b3a`, fail `#b3261e`.

### Type

- Font: system font stack only, no web font:
  `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- Numbers use the same font with tabular figures.
- Scale: 12 / 13 / 15 (body) / 16 / 18 / 22 / 28 px
- Body 15px, weight 400, line-height 1.55. Headings 18-22px, weight 600. Big readouts 28px,
  weight 700. Small labels 12px, weight 600, uppercase-style spacing 0.14em.

### Shape, space, motion

- Radius: 4 / 8 / 12 px, pills 999px
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 px
- Panels: solid near-black, 1px edge, small shadow, no blur or glass effect
- Shadow: `0 2px 10px rgb(0 0 0 / 0.4)` for floating, `0 16px 40px rgb(0 0 0 / 0.5)` for modals
- Motion: one pace, 250 ms, `cubic-bezier(0.23, 1, 0.32, 1)`
- Focus ring: 2px off-white outline, 2px offset
- Buttons: primary is off-white fill (`#eceae6`) with near-black text; the active/selected state
  uses the amber accent

### CSS to paste

```css
:root {
  --bg: #0c0d0f;
  --space: #020203;
  --surface: #16171a;
  --panel: #0e0f11;
  --border: #2a2c31;
  --text: #eceae6;
  --text-muted: #a9a8a4;
  --accent: #ffb347;
  --on-accent: #1a1100;
  --brand-reaction: #c27803;
  --sun: #ffd27a;
  --earth: #9cc3ff;
  --window: #4fc9c0;
  --great: #5fd49a;
  --ok: #f0c75e;
  --poor: #ff7b72;
  --radius-md: 8px;
  --radius-lg: 12px;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  color-scheme: dark;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  font-size: 1rem;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
```
