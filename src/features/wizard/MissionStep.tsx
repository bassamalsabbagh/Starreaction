import { useId } from 'react';
import { joinClassNames } from '../../utils/classNames';
import {
  MISSION_FIELDS,
  MISSION_NAME_MAX,
  MISSION_RANGES,
  validateDraft,
  type MissionDraft,
  type MissionField,
} from '../missions/customMissions';
import styles from './Steps.module.css';

/** The question for each need, and a short hint where one is needed. */
const FIELD_HELP: Readonly<Record<MissionField, { label: string; help: string }>> = {
  minSunElevationDeg: {
    label: 'How high must the Sun be?',
    help: '0° = just above the horizon.',
  },
  daysNeeded: {
    label: 'Days of sunlight needed in a row',
    help: '',
  },
  minEarthElevationDeg: {
    label: 'How high must Earth be for radio?',
    help: '',
  },
};

/** The order shown: Sun, power days, Earth. */
const SHOWN: readonly MissionField[] = ['minSunElevationDeg', 'daysNeeded', 'minEarthElevationDeg'];

/** The name used when the box is left empty. */
export const DEFAULT_MISSION_NAME = 'My mission';

interface MissionStepProps {
  draft: MissionDraft;
  onChange: (draft: MissionDraft) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** "0°" or "0.5": a slider end's label (the unit beside the number box says "days"). */
function endLabel(value: number, unit: string): string {
  return unit === '°' ? `${value}°` : String(value);
}

/**
 * Step 2: the mission's name and needs. Each question is a label, then a slider with its two ends
 * labelled, a number box and the unit, on one row, so the step fits without scrolling.
 */
export function MissionStep({ draft, onChange }: MissionStepProps) {
  const id = useId();
  // The name is never an error: left empty it becomes "My mission".
  const errors = validateDraft({ ...draft, name: draft.name.trim() || DEFAULT_MISSION_NAME });
  const setValue = (field: MissionField, value: string) =>
    onChange({ ...draft, values: { ...draft.values, [field]: value } });

  return (
    <div className={styles.tight}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-name`}>
          Mission name
        </label>
        <input
          id={`${id}-name`}
          className={styles.text}
          type="text"
          maxLength={MISSION_NAME_MAX}
          autoComplete="off"
          placeholder={DEFAULT_MISSION_NAME}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>

      {SHOWN.filter((field) => MISSION_FIELDS.includes(field)).map((field) => {
        const range = MISSION_RANGES[field];
        const help = FIELD_HELP[field];
        const fieldId = `${id}-${field}`;
        const error = errors[field];
        const number = Number(draft.values[field].replace('−', '-'));
        return (
          <div key={field} className={styles.field}>
            <label className={styles.label} htmlFor={fieldId}>
              {help.label}
            </label>
            {help.help ? (
              <span id={`${fieldId}-hint`} className={styles.help}>
                {help.help}
              </span>
            ) : null}
            <div className={styles.sliderRow}>
              <span className={styles.end} aria-hidden="true">
                {endLabel(range.min, range.unit)}
              </span>
              <input
                className={styles.slider}
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={Number.isFinite(number) ? clamp(number, range.min, range.max) : range.min}
                aria-label={`${help.label} slider`}
                onChange={(event) => setValue(field, event.target.value)}
              />
              <span className={styles.end} aria-hidden="true">
                {endLabel(range.max, range.unit)}
              </span>
              <span className={styles.numberWrap}>
                <input
                  id={fieldId}
                  className={styles.number}
                  type="number"
                  inputMode="decimal"
                  step={range.step}
                  value={draft.values[field]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={help.help ? `${fieldId}-hint` : undefined}
                  onChange={(event) => setValue(field, event.target.value)}
                />
                <span className={styles.unit}>{range.unit}</span>
              </span>
            </div>
            {error ? (
              <span className={joinClassNames(styles.hint, styles.error)}>{error}</span>
            ) : null}
          </div>
        );
      })}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.hasRelay}
          onChange={(event) => onChange({ ...draft, hasRelay: event.target.checked })}
        />
        Has a relay (does not need to see the Earth)
      </label>
    </div>
  );
}
