import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { HORIZONS_INDEX } from '../../services/horizonsData';
import { formatDayMonth } from '../../utils/time';
import { AboutNotes } from './AboutNotes';
import { SourcesList } from './SourcesList';
import { HorizonsCheckTable } from './HorizonsCheckTable';
import styles from './AboutPanel.module.css';

export type AboutTab = 'about' | 'how' | 'roadmap' | 'credits';

const TABS: readonly { id: AboutTab; label: string }[] = [
  { id: 'about', label: 'About' },
  { id: 'how', label: 'How it works' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'credits', label: 'Data and credits' },
];

const ROADMAP: readonly { text: string; done: boolean }[] = [
  { text: 'Real Sun and Earth positions for any place and time', done: true },
  { text: 'Time to sunset and Earthset, and the horizon view', done: true },
  { text: 'Anywhere on the Moon: click or type coordinates', done: true },
  { text: 'Add your own mission needs', done: true },
  {
    text: 'Launch slipped? Describe the change in a sentence, and an assistant reads it into the settings (future plan)',
    done: false,
  },
  {
    text: 'Real landing sites (IM-1, IM-2, Blue Ghost Mission 1, Chandrayaan-3), each value cited',
    done: true,
  },
  { text: 'Terrain horizons at the south pole from LOLA elevation data', done: false },
];

/** "1 Nov 2026". */
const dateText = (ms: number) => `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;

/** "from 1 Nov 2026 to 31 Dec 2027": the dates the Horizons files cover; null without them. */
const HORIZONS_DATES = HORIZONS_INDEX
  ? `from ${dateText(HORIZONS_INDEX.startMs)} to ${dateText(HORIZONS_INDEX.startMs + (HORIZONS_INDEX.count - 1) * HORIZONS_INDEX.stepMinutes * 60_000)}`
  : null;

interface AboutPanelProps {
  tab: AboutTab;
  onTabChange: (tab: AboutTab) => void;
  onClose: () => void;
  /** The map's data credits (from the lunar map feature). */
  credits: ReactNode;
  nonEndorsement: string;
  /** The product's name, for the title ("CLPS Lander Advisor"). */
  appName: string;
  /** Whether the "Launch slipped?" assistant is on (its guide line and AI notice show only then). */
  slipAssistant?: boolean;
}

/**
 * About, How it works, Roadmap, and Data and credits, in one modal panel. Focus moves in on open
 * and stays inside; Escape or the close button closes it (the opener gets focus back).
 */
export function AboutPanel({
  tab,
  onTabChange,
  onClose,
  credits,
  nonEndorsement,
  appName,
  slipAssistant = false,
}: AboutPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const baseId = useId();

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    // Keep Tab inside the panel.
    const focusable = [
      ...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([tabindex="-1"]), a[href], [tabindex="0"]',
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const onTabKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (!next) return;
    onTabChange(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            StarReaction · {appName}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path
                d="M5.5 5.5l9 9M14.5 5.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="About sections">
          {TABS.map((entry, index) => (
            <button
              key={entry.id}
              id={`${baseId}-tab-${entry.id}`}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === entry.id}
              aria-controls={`${baseId}-panel`}
              tabIndex={tab === entry.id ? 0 : -1}
              onClick={() => onTabChange(entry.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div
          id={`${baseId}-panel`}
          className={styles.body}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab}`}
        >
          {tab === 'about' ? (
            <div className={styles.prose}>
              <p className={styles.lead}>
                <span className={styles.brandStar}>Star</span>
                <span className={styles.brandReaction}>Reaction</span>
              </p>
              <p>
                Pick a place and a date on the Moon, and see at once whether a mission gets sunlight
                for power and the Earth in view to talk home, how long until sunset and Earthset,
                and what changes if the plan slips. The Sun and Earth are real, and the sites are
                real landings; the mission&apos;s needs are the ones you enter.
              </p>
              <h3 className={styles.subhead}>Finding your way</h3>
              <ul className={styles.guide}>
                <li>
                  <strong>Plan</strong> on the left walks through four steps: 1 Location (type
                  coordinates, click the Moon or take a past landing), 2 Mission (its name and
                  needs), 3 Dates, and 4 Results. Back keeps what you entered.
                </li>
                <li>
                  <strong>Results</strong> shows the hours with the Sun up, the Earth up and both,
                  sampled every hour, with the pass or fail of each check. More details holds the
                  horizon view, the best window, other dates and night survival.
                </li>
                <li>
                  <strong>Compare</strong> puts up to four past landings side by side for the same
                  mission and dates, the longest usable window first.
                </li>
                <li>
                  <strong>Along the bottom</strong> on the Results step, the timeline over the dates
                  you picked. Teal stretches are the windows.
                </li>
                <li>
                  <strong>Moon Power Lab: battery and panel calculator</strong> (Power Lab in the
                  menu): how big a battery a lander needs to survive the Moon night.
                </li>
                <li>
                  <strong>On the map</strong>: Top and 3D views of the south pole, zoom, the whole
                  Moon, the grid, Layers (bottom left) and presentation mode (H).
                </li>
                {slipAssistant ? (
                  <li>
                    <strong>Launch slipped?</strong> In the Mission view, describe the change in a
                    sentence. An AI only reads it into the settings; the app checks every number
                    against your text, works out the dates and shows what it read before anything
                    changes. The mission form does the same by hand.
                  </li>
                ) : null}
              </ul>
              {slipAssistant ? (
                <p className={styles.note} data-testid="ai-notice">
                  The &ldquo;Launch slipped?&rdquo; box sends what you type to Google&apos;s Gemini
                  API on its free tier. Google may use text sent to the free tier, and its replies,
                  to improve its models, and people may review it, so don&apos;t type anything
                  private or sensitive. Nothing you type is stored by this app.
                </p>
              ) : null}
              <dl className={styles.facts}>
                <dt>Event</dt>
                <dd>NASA Space Apps 2026 - Amman</dd>
                <dt>Project</dt>
                <dd>CLPS Lunar Mission Browser</dd>
                <dt>Code</dt>
                <dd className={styles.placeholder}>GitHub link to come</dd>
                <dt>Team</dt>
                <dd className={styles.placeholder}>[Team bio - to fill in]</dd>
              </dl>
              <p className={styles.note}>{nonEndorsement}</p>
            </div>
          ) : null}

          {tab === 'how' ? (
            <div className={styles.prose}>
              <p>
                Enter your mission. Its needs are three numbers and a yes or no: how high the Sun
                must be for its solar panels to give power, how many days of power it needs in a
                row, how high the Earth must be to talk to it directly, and whether it has a relay
                instead.
              </p>
              <p>
                For every site (or any point you pick), the app works out where the real Sun and
                Earth are every hour over the range checked, as seen from that place. The range is
                the dates you pick in the Dates step (today and the next 14 days at first, up to 12
                months), sampled every hour. Three checks follow, each measuring one thing:
              </p>
              <ol className={styles.gates}>
                <li>
                  <strong>Power:</strong> the Sun only. The longest unbroken stretch with the Sun
                  high enough must last the days the mission needs.
                </li>
                <li>
                  <strong>Comms:</strong> the Earth only. Without a relay, the Earth must rise high
                  enough at some point in the range; a mission with a relay always passes.
                </li>
                <li>
                  <strong>Usable window:</strong> the Sun and the Earth both. The longest stretch
                  with both up at once must last the days the mission needs. With a relay the usable
                  window is the power stretch, so it is not listed separately.
                </li>
              </ol>
              <p>
                A window is a stretch with the Sun up and, for a mission without a relay, the Earth
                up too. Compare orders the past landings by their longest usable window. Sunset and
                Earthset are when each body next drops below the horizon. +7 days moves both dates
                by seven days; +1 month moves both by one calendar month.
              </p>
              <p className={styles.demoLine}>
                The Sun and Earth positions are real:{' '}
                {HORIZONS_DATES
                  ? `JPL Horizons at the four landing sites ${HORIZONS_DATES}; our engine (astronomy-engine) for clicked points and other dates, checked against JPL Horizons`
                  : 'our engine (astronomy-engine), checked against JPL Horizons'}
                , and the sites are real landings. The mission&apos;s needs are yours. The horizon
                is a smooth Moon: crater rims and hills, which matter most at the south pole, are
                not counted yet.
              </p>
            </div>
          ) : null}

          {tab === 'roadmap' ? (
            <ul className={styles.roadmap}>
              {ROADMAP.map((item) => (
                <li key={item.text}>
                  <span className={item.done ? styles.done : styles.planned}>
                    {item.done ? 'Done' : 'Planned'}
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === 'credits' ? (
            <>
              {credits}
              <HorizonsCheckTable />
              <AboutNotes />
              <SourcesList />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
