/**
 * Lessons from past landings: REAL missions (four of them are also the app's landing sites, linked
 * by `siteId` to data/sites.json). Every fact here comes from a
 * source in docs/DATA_SOURCES.md (SRC-023 to SRC-036), opened on 2026-11-11, and says only what
 * that source states; where sources disagree, both values are kept (`note`). "The lesson" is the
 * team's planning takeaway, not a claim from the source.
 */

export type LessonOutcome = 'success' | 'recovered' | 'partial' | 'lost';

export const LESSON_OUTCOME_LABEL: Readonly<Record<LessonOutcome, string>> = {
  success: 'Full mission',
  recovered: 'Recovered',
  partial: 'Cut short',
  lost: 'Ended early',
};

export interface LandingLesson {
  readonly id: string;
  readonly name: string;
  /** Agency or company. */
  readonly who: string;
  /** The landing date, as the source gives it. */
  readonly when: string;
  readonly where: string;
  readonly outcome: LessonOutcome;
  readonly whatHappened: string;
  /** What it means for choosing a site and a date: power, the Earth, the lunar night. */
  readonly lesson: string;
  /** Where sources disagree or a fact comes from journalism, said plainly. */
  readonly note?: string;
  /** docs/DATA_SOURCES.md ids, with the label and URL shown in the app. */
  readonly sources: readonly { id: string; label: string; url: string }[];
  /** The landing site in the tool (data/sites.json id), for "See it in the tool". */
  readonly siteId?: string;
}

export const LANDING_LESSONS: readonly LandingLesson[] = [
  {
    id: 'chandrayaan-3',
    siteId: 'ch3',
    name: 'Chandrayaan-3 (Vikram)',
    who: 'ISRO',
    when: '23 August 2023',
    where: 'South polar region; planned site near 69.37° S, 32.35° E',
    outcome: 'success',
    whatHappened:
      'Soft-landed and worked through its planned mission life of one lunar day (about 14 Earth days). Before the lunar night, the lander and rover were put into sleep mode, to be woken around the next sunrise, 22 September 2023.',
    lesson:
      'A solar-powered lander gets one lunar day of light at a time. When the window opens is when the mission clock starts.',
    note: 'The coordinates are ISRO’s planned site, not a measured touchdown point. ISRO’s updates end with efforts to make contact after sunrise; news reports at the time (journalism) said no signal was received.',
    sources: [
      {
        id: 'SRC-032',
        label: 'ISRO: mission updates',
        url: 'https://www.isro.gov.in/Chandrayaan3.html',
      },
      {
        id: 'SRC-033',
        label: 'ISRO: mission details',
        url: 'https://www.isro.gov.in/Chandrayaan3_Details.html',
      },
      {
        id: 'SRC-034',
        label: 'PTI via Telangana Today (journalism)',
        url: 'https://telanganatoday.com/isro-makes-attempt-to-wake-up-chandrayaan-3s-lander-rover-but-no-signals-from-them-so-far',
      },
    ],
  },
  {
    id: 'slim',
    name: 'SLIM',
    who: 'JAXA',
    when: '20 January 2024 (Japan time)',
    where: 'About 55 m east of its planned target',
    outcome: 'recovered',
    whatHappened:
      'It came to rest not at its planned attitude, with its solar cells facing west, and they generated no power at first, so it was shut down by command. JAXA said power could return as the sunlight changed. It later survived three lunar nights; the last contact was 28 April 2024.',
    lesson:
      'Which way the panels face matters as much as how much sunlight the site gets: as the Sun crosses the lunar sky, power can come and go.',
    sources: [
      {
        id: 'SRC-029',
        label: 'JAXA, 20 Jan 2024',
        url: 'https://global.jaxa.jp/press/2024/01/20240120-1_e.html',
      },
      {
        id: 'SRC-030',
        label: 'JAXA, 25 Jan 2024',
        url: 'https://global.jaxa.jp/press/2024/01/20240125-1_e.html',
      },
      {
        id: 'SRC-031',
        label: 'JAXA, 26 Aug 2024',
        url: 'https://global.jaxa.jp/press/2024/08/20240826-1_e.html',
      },
    ],
  },
  {
    id: 'im-1',
    siteId: 'im1',
    name: 'IM-1 (Odysseus)',
    who: 'Intuitive Machines, NASA CLPS',
    when: '22 February 2024',
    where: 'Near Malapert A, south polar region (80.13° S, 1.44° E)',
    outcome: 'partial',
    whatHappened:
      'Broken landing legs left it at rest but tilted, on ground sloped about 12°. Leaning, it could still collect solar power and send images and data; its science operations ended seven days after landing.',
    lesson:
      'Near the pole the Sun stays low, so the local slope and how a lander comes to rest decide how well its panels and antennas face the Sun and the Earth.',
    note: 'NASA gave 29 February as the planned end of surface operations. A tilt angle and power-down date often quoted elsewhere could not be checked against an agency page that loaded, so they are left out.',
    sources: [
      {
        id: 'SRC-023',
        label: 'NASA, 23 Feb 2024',
        url: 'https://www.nasa.gov/news-release/nasa-tech-contributes-to-soft-moon-landing-agency-science-underway/',
      },
      {
        id: 'SRC-024',
        label: 'NASA LRO image',
        url: 'https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/',
      },
      {
        id: 'SRC-025',
        label: 'NASA, 1 Mar 2024',
        url: 'https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/',
      },
      {
        id: 'SRC-026',
        label: 'NASA APOD',
        url: 'https://science.nasa.gov/image-article/apod-2024-march-2-odysseus-on-the-moon',
      },
    ],
  },
  {
    id: 'blue-ghost-1',
    siteId: 'bg1',
    name: 'Blue Ghost Mission 1',
    who: 'Firefly Aerospace, NASA CLPS',
    when: '2 March 2025',
    where: 'Mare Crisium, on the near side',
    outcome: 'success',
    whatHappened:
      'Worked for about 14 days, the equivalent of one lunar day, and several hours into the lunar night, concluding on 16 March 2025. Firefly reports 346 hours of daylight and just over 5 hours into the night.',
    lesson:
      'A whole lunar day of light, with the Earth in view the whole time, gave a full mission: the window a lander lands in sets the length of its mission.',
    sources: [
      {
        id: 'SRC-035',
        label: 'NASA, 18 Mar 2025',
        url: 'https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/',
      },
      {
        id: 'SRC-036',
        label: 'Firefly (provider)',
        url: 'https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon',
      },
    ],
  },
  {
    id: 'im-2',
    siteId: 'im2',
    name: 'IM-2 (Athena)',
    who: 'Intuitive Machines, NASA CLPS',
    when: '6 March 2025',
    where: 'Mons Mouton, closer to the south pole than any lander before it',
    outcome: 'lost',
    whatHappened:
      'It touched down on its side, inside a crater, away from its intended spot. It returned some data before its batteries were depleted, and the mission was ended early, in the first hours of 7 March.',
    lesson:
      'At the pole a crater or a fall can take a lander out of the low Sun: the sunlight a site gets only helps if the lander’s panels can reach it.',
    note: 'NASA’s article gives the distance from the intended site as more than 400 m (1,300 ft) in its text and about 820 ft in an image caption; both are kept.',
    sources: [
      {
        id: 'SRC-027',
        label: 'NASA, 7 Mar 2025',
        url: 'https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/',
      },
      {
        id: 'SRC-028',
        label: 'NASA LRO image',
        url: 'https://www.nasa.gov/image-article/nasas-lunar-reconnaissance-orbiter-views-im-2-on-moons-surface/',
      },
    ],
  },
];
