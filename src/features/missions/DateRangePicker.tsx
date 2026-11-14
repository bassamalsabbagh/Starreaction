import { useId, useState, type MouseEvent } from 'react';
import { DAY_MS } from '../../utils/time';
import { joinClassNames } from '../../utils/classNames';
import {
  dateInputValue,
  dateRangeError,
  dateRangeText,
  delayRange,
  readDateRange,
  RANGE_MONTHS_MAX,
  type DateRange,
} from './dateRange';
import styles from './DateRangePicker.module.css';

/** Until the stop date is set by hand, it is the start plus this many days. */
const FOLLOW_DAYS = 14;

interface DateRangePickerProps {
  /** The picked dates, or null: the checks then use the time bar's 29.5 days. */
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  /** False in the wizard's Dates step: no title, no Delay buttons (they sit with the results). */
  withActions?: boolean;
}

/**
 * "Dates to check" in the Mission view (docs/LANDER_RULES.md, "Date range and hours"): a start and
 * a stop date (UTC, the stop date included), "+7 days" and "+1 month". A valid pair is
 * used at once; an impossible one is explained inline and changes nothing.
 */
export function DateRangePicker({ value, onChange, withActions = true }: DateRangePickerProps) {
  const baseId = useId();
  const [start, setStart] = useState(value ? dateInputValue(value.startMs) : '');
  const [stop, setStop] = useState(value ? dateInputValue(value.stopMs) : '');
  const [delayError, setDelayError] = useState<string | null>(null);
  // Until the stop date is set by hand, it follows the start: 14 days later.
  const [stopTouched, setStopTouched] = useState(false);
  // Dates set from outside (Delay, the assistant, Clear) replace what the fields show.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setStart(value ? dateInputValue(value.startMs) : '');
    setStop(value ? dateInputValue(value.stopMs) : '');
    setDelayError(null);
  }

  // A click on a date box opens the browser's calendar; typing still works.
  const openCalendar = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker();
    } catch {
      // Not allowed or not supported here: the box still takes typing.
    }
  };

  const read = readDateRange(start, stop);
  const error = read && 'error' in read ? read.error : null;
  const change = (nextStart: string, nextStop: string) => {
    setStart(nextStart);
    setStop(nextStop);
    setDelayError(null);
    const next = readDateRange(nextStart, nextStop);
    if (next && 'range' in next) onChange(next.range);
    else if (nextStart === '' && nextStop === '' && value) onChange(null);
  };
  const delay = (by: 'week' | 'month') => {
    if (!value) return;
    const next = delayRange(value, by);
    const problem = dateRangeError(next);
    if (problem) setDelayError(problem);
    else onChange(next);
  };

  const hint =
    error ??
    delayError ??
    (value
      ? `Checking ${dateRangeText(value)}, the stop date included.`
      : start !== '' || stop !== ''
        ? 'Pick both dates.'
        : !withActions
          ? 'Pick a start and a stop date (UTC).'
          : `Checking the time bar’s 29.5 days. Pick dates to check your own range, up to ${RANGE_MONTHS_MAX} months; Delay works once both are picked.`);

  return (
    <section className={styles.dates} aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className={styles.title}>
        Dates to check
      </h3>
      <div className={styles.pair}>
        <label className={styles.field}>
          <span className={styles.label}>Start (UTC)</span>
          <input
            className={styles.input}
            type="date"
            min="1990-01-01"
            max="2100-12-31"
            value={start}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${baseId}-hint`}
            onClick={openCalendar}
            onChange={(event) => {
              const next = event.target.value;
              const day = next === '' ? NaN : Date.parse(`${next}T00:00:00Z`);
              // The stop date follows the start (14 days on) until it is set by hand.
              const stopDay = stop === '' ? NaN : Date.parse(`${stop}T00:00:00Z`);
              const follow =
                Number.isFinite(day) && (!stopTouched || !(stopDay >= day))
                  ? dateInputValue(day + FOLLOW_DAYS * DAY_MS)
                  : stop;
              change(next, follow);
            }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Stop (UTC)</span>
          <input
            className={styles.input}
            type="date"
            min="1990-01-01"
            max="2100-12-31"
            value={stop}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${baseId}-hint`}
            onClick={openCalendar}
            onChange={(event) => {
              setStopTouched(true);
              change(start, event.target.value);
            }}
          />
        </label>
      </div>
      <p
        id={`${baseId}-hint`}
        className={joinClassNames(styles.hint, (error ?? delayError) && styles.error)}
        role={error || delayError ? 'alert' : undefined}
      >
        {hint}
      </p>
      {withActions ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={!value}
            title={value ? undefined : 'Pick a start and a stop date first'}
            aria-describedby={`${baseId}-hint`}
            onClick={() => delay('week')}
          >
            +7 days
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={!value}
            title={value ? undefined : 'Pick a start and a stop date first'}
            aria-describedby={`${baseId}-hint`}
            onClick={() => delay('month')}
          >
            +1 month
          </button>
          {value ? (
            <button type="button" className={styles.button} onClick={() => onChange(null)}>
              Use the time bar’s 29.5 days
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
