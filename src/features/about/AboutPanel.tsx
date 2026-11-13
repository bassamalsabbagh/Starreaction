import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { DEMO_LABEL } from '../../data/demoData';
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
  { text: 'Launch slipped? Describe the change in a sentence', done: true },
  {
    text: 'Real landing sites (Apollo, CLPS targets, other countries), each value cited',
    done: false,
  },
  { text: 'Terrain horizons at the south pole from LOLA elevation data', done: false },
];

interface AboutPanelProps {
  tab: AboutTab;
  onTabChange: (tab: AboutTab) => void;
  onClose: () => void;
  onTakeTour: () => void;
  onWatchDemo: () => void;
  /** Opens Lessons from past landings. */
  onLessons: () => void;
  /** The map's data credits (from the lunar map feature). */
  credits: ReactNode;
  nonEndorsement: string;
  /** The product's name, for the title ("CLPS Lander Advisor"). */
  appName: string;
}

/**
 * About, How it works, Roadmap, and Data and credits, in one modal panel. Focus moves in on open
 * and stays inside; Escape or the close button closes it (the opener gets focus back).
 */
export function AboutPanel({
  tab,
  onTabChange,
  onClose,
  onTakeTour,
  onWatchDemo,
  onLessons,
  credits,
  nonEndorsement,
  appName,
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
                and what changes if the plan slips. The Sun and Earth are real; the sites and
                mission profiles here are demo data.
              </p>
              <h3 className={styles.subhead}>Finding your way</h3>
              <ul className={styles.guide}>
                <li>
                  <strong>The Moon</strong> fills the screen, lit by the real Sun. Drag to turn it,
                  scroll to zoom. Click a site to open it, or anywhere else to check that spot.
                </li>
                <li>
                  <strong>The menu</strong> on the left: Mission, Sites, Compare and Lessons each
                  open in the one panel beside it. Click the item again, press Esc or use the ‹ tab
                  to put the panel away. Demo and About sit at the bottom.
                </li>
                <li>
                  <strong>Sites</strong> lists the sites best first (the longest usable window this
                  month), or by sunlight, Earth time or name. Type coordinates at the top to check
                  any place.
                </li>
                <li>
                  <strong>A site&apos;s card</strong> shows the Sun and Earth now with the time left
                  before each sets, the horizon view (their paths over the month, seen from the
                  site), the best window, and other dates for when the plan slips.
                </li>
                <li>
                  <strong>Along the bottom</strong>, the timeline: play or drag through the month.
                  Teal stretches are the windows. The line above it shows the clock (Live or
                  Simulated) and the Sun and Earth at the selected place.
                </li>
                <li>
                  <strong>On the right</strong>: zoom, the whole Moon, the grid, and presentation
                  mode (H).
                </li>
                <li>
                  <strong>Launch slipped?</strong> In the Mission view, describe the change in a
                  sentence. An AI only reads it into the settings; the app checks every number
                  against your text, works out the dates and shows what it read before anything
                  changes. The mission form does the same by hand.
                </li>
              </ul>
              <p className={styles.note} data-testid="ai-notice">
                The &ldquo;Launch slipped?&rdquo; box sends what you type to Google&apos;s Gemini
                API on its free tier. Google may use text sent to the free tier, and its replies, to
                improve its models, and people may review it, so don&apos;t type anything private or
                sensitive. Nothing you type is stored by this app.
              </p>
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
                Pick a mission. Its needs are three numbers and a yes or no: how high the Sun must
                be for its solar panels to give power, how many days of power it needs in a row, how
                high the Earth must be to talk to it directly, and whether it has a relay instead.
              </p>
              <p>
                For every site (or any point you pick), the app works out where the real Sun and
                Earth are every hour over the time bar&apos;s 29.5 days (one lunar day and night),
                as seen from that place. Two checks follow:
              </p>
              <ol className={styles.gates}>
                <li>
                  <strong>Power:</strong> the longest unbroken stretch with the Sun high enough,
                  and, without a relay, the Earth up at the same time, must last the days the
                  mission needs.
                </li>
                <li>
                  <strong>Comms:</strong> without a relay, the Earth must rise high enough at some
                  point in the month.
                </li>
              </ol>
              <p>
                A window is a stretch with the Sun up and, for a mission without a relay, the Earth
                up too. Sites are listed by their longest usable window. Sunset and Earthset are
                when each body next drops below the horizon, found to about a minute.
              </p>
              <p className={styles.demoLine}>
                <span className={styles.demoTag}>{DEMO_LABEL}</span> The Sun and Earth positions are
                real (astronomy-engine, checked against NASA/JPL Horizons). The sites and the
                mission needs are made up. The horizon is a smooth Moon: crater rims and hills,
                which matter most at the south pole, are not counted yet.
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

          {tab === 'credits' ? credits : null}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.tour} onClick={onTakeTour}>
            Take the tour
          </button>
          <button type="button" className={styles.tour} onClick={onWatchDemo} data-demo-start="">
            Watch the short demo
          </button>
          <button type="button" className={styles.tour} onClick={onLessons}>
            Lessons from past landings
          </button>
        </div>
      </div>
    </div>
  );
}
