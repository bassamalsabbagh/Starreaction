import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { DAY_MS, HOUR_MS, parseUtcInput, toInputValues } from '../../utils/time';
import { useTime } from './timeContext';
import styles from './TimePopover.module.css';

/** The gap between the clock and the popover, and the popover and the window's edges. */
const GAP_PX = 8;
const EDGE_PX = 16;

/**
 * Sets the app time by hand, in UTC. Focus moves into the date field on open; Enter applies,
 * Escape cancels, and focus goes back to the button that opened it. The quick buttons apply at
 * once and keep the popover open.
 *
 * It is drawn at the page's top level, above the clock (`anchor`) and inside the window: the clock
 * sits low on the map, whose layer is under the left panel, so drawn there it was cut off by the
 * window's bottom edge or hidden behind the panel.
 */
export function TimePopover({ anchor }: { anchor: HTMLElement | null }) {
  const { time, setTime, stepBy, goLive, closeEditor } = useTime();
  const [values, setValues] = useState(() => toInputValues(time));
  const [error, setError] = useState<{ message: string; field: 'date' | 'time' } | null>(null);
  const [place, setPlace] = useState<{ left: number; bottom: number } | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const errorId = useId();
  const dateId = useId();
  const timeId = useId();

  // Centred above the clock, kept inside the window.
  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      if (!anchor || !root) return;
      const box = anchor.getBoundingClientRect();
      const width = root.offsetWidth;
      const centred = box.left + box.width / 2 - width / 2;
      setPlace({
        left: Math.max(EDGE_PX, Math.min(centred, window.innerWidth - width - EDGE_PX)),
        bottom: Math.max(EDGE_PX, window.innerHeight - box.top + GAP_PX),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchor]);

  useEffect(() => {
    dateRef.current?.focus();
  }, []);

  // A pointer press outside cancels, like Escape. Presses on the clock itself are left to its own
  // toggle, so clicking it closes the popover rather than closing and reopening it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (rootRef.current?.contains(target) || anchor?.contains(target)))
        return;
      closeEditor();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [anchor, closeEditor]);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseUtcInput(values.date, values.time);
    if (!parsed.ok) {
      setError({ message: parsed.error, field: parsed.field });
      return;
    }
    setTime(parsed.ms);
    closeEditor();
  };

  const quick = (change: () => number | null) => {
    const next = change();
    if (next !== null) setValues(toInputValues(next));
    setError(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeEditor();
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      className={styles.popover}
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      // Hidden for the moment before it is measured, so it never flashes in the wrong place.
      style={place ? { left: place.left, bottom: place.bottom } : { visibility: 'hidden' }}
    >
      <form className={styles.form} onSubmit={apply} noValidate>
        <p id={titleId} className={styles.title}>
          Set the time <span className={styles.utc}>(UTC)</span>
        </p>
        <div className={styles.fields}>
          <label className={styles.field} htmlFor={dateId}>
            <span className={styles.fieldLabel}>Date</span>
            <input
              ref={dateRef}
              id={dateId}
              className={styles.input}
              type="date"
              min="1990-01-01"
              max="2100-12-31"
              value={values.date}
              aria-invalid={error?.field === 'date'}
              aria-describedby={error?.field === 'date' ? errorId : undefined}
              onChange={(event) => {
                setValues({ ...values, date: event.target.value });
                setError(null);
              }}
            />
          </label>
          <label className={styles.field} htmlFor={timeId}>
            <span className={styles.fieldLabel}>Time (HH:MM)</span>
            <input
              id={timeId}
              className={styles.input}
              type="text"
              placeholder="HH:MM"
              maxLength={5}
              autoComplete="off"
              spellCheck={false}
              value={values.time}
              aria-invalid={error?.field === 'time'}
              aria-describedby={error?.field === 'time' ? errorId : undefined}
              onChange={(event) => {
                setValues({ ...values, time: event.target.value });
                setError(null);
              }}
            />
          </label>
        </div>
        {error ? (
          <p id={errorId} className={styles.error} role="alert">
            {error.message}
          </p>
        ) : null}

        <div className={styles.quick} role="group" aria-label="Quick changes">
          <button
            type="button"
            className={styles.chip}
            onClick={() =>
              quick(() => {
                goLive();
                return Date.now();
              })
            }
          >
            Now
          </button>
          <button
            type="button"
            className={styles.chip}
            onClick={() =>
              quick(() => {
                stepBy(-DAY_MS);
                return time - DAY_MS;
              })
            }
          >
            −1 day
          </button>
          <button
            type="button"
            className={styles.chip}
            onClick={() =>
              quick(() => {
                stepBy(DAY_MS);
                return time + DAY_MS;
              })
            }
          >
            +1 day
          </button>
          <button
            type="button"
            className={styles.chip}
            onClick={() =>
              quick(() => {
                stepBy(-HOUR_MS);
                return time - HOUR_MS;
              })
            }
          >
            −1 hour
          </button>
          <button
            type="button"
            className={styles.chip}
            onClick={() =>
              quick(() => {
                stepBy(HOUR_MS);
                return time + HOUR_MS;
              })
            }
          >
            +1 hour
          </button>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeEditor}>
            Cancel
          </button>
          <button type="submit" className={styles.primary}>
            Apply
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
