import { useEffect, useId, useRef, useState } from 'react';
import type { DemoMission } from '../../data/demoData';
import { joinClassNames } from '../../utils/classNames';
import { formatClock, parseUtcInput, toInputValues } from '../../utils/time';
import {
  MISSION_FIELDS,
  MISSION_NAME_MAX,
  MISSION_RANGES,
  draftFrom,
  rangeText,
  validateDraft,
  type MissionDraft,
  type MissionField,
} from './customMissions';
import styles from './MissionForm.module.css';

/** What the form opens with when the "launch slipped" assistant fills it in. */
export interface MissionPrefill {
  /** A new number fills the form again. */
  readonly seq: number;
  readonly draft: MissionDraft;
  /** The preset shown as the start, or null for none (the fields exactly as given). */
  readonly baseId: string | null;
  /** The time to move to (UTC ms), or null to keep the time bar's. */
  readonly time: number | null;
  /** A line at the top ("IM-3 isn't in our list yet, add its details."). */
  readonly note: string | null;
}

interface MissionFormProps {
  /** Every mission to start from: the demo ones and the user's own. */
  presets: readonly DemoMission[];
  /** The user's saved presets, which can be renamed and deleted here. */
  saved: readonly DemoMission[];
  /** Whether the form is showing (it stays mounted so it can slide). */
  open: boolean;
  /** Set when the last save could not reach storage. */
  storageFailed: boolean;
  /** Fills the form when it opens (from the assistant); null opens it as usual. */
  prefill?: MissionPrefill | null;
  /** Uses the mission, and moves the time bar when a date was given. */
  onUse: (draft: MissionDraft, time: number | null) => void;
  onSave: (draft: MissionDraft, time: number | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** The optional date, read in UTC: null when both boxes are empty. */
function readWhen(date: string, clock: string): { ms: number | null; error: string | null } {
  if (date.trim() === '' && clock.trim() === '') return { ms: null, error: null };
  if (date.trim() === '') return { ms: null, error: 'Enter a date too, or clear the time.' };
  const parsed = parseUtcInput(date, clock.trim() === '' ? '00:00' : clock);
  return parsed.ok ? { ms: parsed.ms, error: null } : { ms: null, error: parsed.error };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * "Add your own mission": a name, a preset to start from, and a slider with a number box for each
 * need the checks read, inside its DEMO range. Impossible values are explained where they are
 * typed, and the two actions stay off until everything is valid.
 */
export function MissionForm({
  presets,
  saved,
  open,
  storageFailed,
  prefill = null,
  onUse,
  onSave,
  onRename,
  onDelete,
  onClose,
}: MissionFormProps) {
  const formId = useId();
  const first = presets[0];
  const [baseId, setBaseId] = useState(first?.id ?? '');
  // An empty id: no preset (a mission the assistant did not know, every other field empty).
  const base = baseId === '' ? undefined : (presets.find((item) => item.id === baseId) ?? first);
  const [draft, setDraft] = useState<MissionDraft>(() =>
    first ? draftFrom(first) : { name: '', values: draftFromEmpty(), hasRelay: false },
  );
  const [nameTouched, setNameTouched] = useState(false);
  const [date, setDate] = useState('');
  const [clock, setClock] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const errors = validateDraft(draft);
  const when = readWhen(date, clock);
  const valid = Object.keys(errors).length === 0 && when.error === null;
  // The name is not marked until it is touched, so "fix the marked values" would point at nothing.
  const onlyNameMissing =
    Object.keys(errors).length === 1 && errors.name !== undefined && when.error === null;

  // Opening puts the cursor in the name box; the form starts fresh each time it opens, or with
  // what the assistant read.
  const prefillSeq = prefill?.seq ?? null;
  const [shownFor, setShownFor] = useState({ open, seq: prefillSeq });
  if (open !== shownFor.open || (open && prefillSeq !== shownFor.seq)) {
    setShownFor({ open, seq: prefillSeq });
    if (open) {
      const start = prefill && prefill.time !== null ? toInputValues(prefill.time) : null;
      setDate(start?.date ?? '');
      setClock(start?.time ?? '');
      setNote(prefill?.note ?? null);
      if (prefill) {
        setDraft(prefill.draft);
        setBaseId(prefill.baseId ?? '');
        setNameTouched(prefill.draft.name !== '');
      } else {
        setNameTouched(false);
        // After a mission the assistant did not know (no preset, empty fields), start from the
        // first preset again.
        if (baseId === '' && first) {
          setBaseId(first.id);
          setDraft(draftFrom(first));
        } else {
          setDraft((current) => ({ ...current, name: '' }));
        }
      }
    }
  }
  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const setValue = (field: MissionField, text: string) =>
    setDraft((current) => ({ ...current, values: { ...current.values, [field]: text } }));

  const startFrom = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setBaseId(id);
    setDraft((current) => ({ ...draftFrom(preset), name: current.name }));
  };

  return (
    <section
      className={styles.form}
      aria-labelledby={`${formId}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.head}>
        <h2 id={`${formId}-title`} className={styles.title}>
          Add your own mission
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label="Close the mission form"
          title="Close (Esc)"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {note ? (
        <p className={styles.notice} role="status">
          {note}
        </p>
      ) : null}
      <p className={styles.note}>
        Your values are yours; the sites are real landings. The sliders cover{' '}
        <span className={styles.demo}>DEMO</span> ranges, made up for practice.
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${formId}-name`}>
          Name
        </label>
        <input
          ref={nameRef}
          id={`${formId}-name`}
          className={styles.text}
          type="text"
          value={draft.name}
          maxLength={MISSION_NAME_MAX}
          required
          autoComplete="off"
          aria-invalid={nameTouched && errors.name ? true : undefined}
          aria-describedby={`${formId}-name-hint`}
          onChange={(event) => {
            setNameTouched(true);
            setDraft((current) => ({ ...current, name: event.target.value }));
          }}
          onBlur={() => setNameTouched(true)}
        />
        <span
          id={`${formId}-name-hint`}
          className={joinClassNames(styles.hint, nameTouched && errors.name && styles.error)}
        >
          {nameTouched && errors.name
            ? errors.name
            : `Up to ${MISSION_NAME_MAX} characters (${draft.name.length}/${MISSION_NAME_MAX}).`}
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${formId}-preset`}>
          Start from a preset
        </label>
        <select
          id={`${formId}-preset`}
          className={styles.select}
          value={base?.id ?? ''}
          onChange={(event) => startFrom(event.target.value)}
        >
          {base ? null : <option value="">None: only the values below</option>}
          {presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.custom ? `${item.name} · Custom` : item.name}
            </option>
          ))}
        </select>
      </div>

      {MISSION_FIELDS.map((field) => {
        const range = MISSION_RANGES[field];
        const id = `${formId}-${field}`;
        const error = errors[field];
        const number = Number(draft.values[field].replace('−', '-'));
        return (
          <div key={field} className={styles.field}>
            <label className={styles.label} htmlFor={id}>
              {range.label}
            </label>
            <div className={styles.pair}>
              <input
                className={styles.slider}
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={Number.isFinite(number) ? clamp(number, range.min, range.max) : range.min}
                aria-label={`${range.label} slider`}
                aria-describedby={`${id}-hint`}
                onChange={(event) => setValue(field, event.target.value)}
              />
              <span className={styles.numberWrap}>
                <input
                  id={id}
                  className={styles.number}
                  type="number"
                  inputMode="decimal"
                  step={range.step}
                  value={draft.values[field]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-hint`}
                  onChange={(event) => setValue(field, event.target.value)}
                />
                <span className={styles.unit}>{range.unit}</span>
              </span>
            </div>
            <span id={`${id}-hint`} className={joinClassNames(styles.hint, error && styles.error)}>
              {error ?? `DEMO range ${rangeText(field)}.`}
            </span>
          </div>
        );
      })}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.hasRelay}
          onChange={(event) =>
            setDraft((current) => ({ ...current, hasRelay: event.target.checked }))
          }
        />
        Has a relay (does not need to see the Earth)
      </label>

      <fieldset className={styles.when} aria-describedby={`${formId}-when-hint`}>
        <legend className={styles.label}>New date, optional (UTC)</legend>
        <div className={styles.whenPair}>
          <input
            id={`${formId}-date`}
            className={styles.text}
            type="date"
            min="1990-01-01"
            max="2100-12-31"
            value={date}
            aria-label="New date (UTC)"
            aria-invalid={when.error ? true : undefined}
            onChange={(event) => setDate(event.target.value)}
          />
          {/* Text, like the time bar's own editor: a native time box shows AM/PM on some
              systems, and every time in the app is 24-hour UTC. */}
          <input
            id={`${formId}-clock`}
            className={styles.text}
            type="text"
            inputMode="numeric"
            placeholder="HH:MM"
            maxLength={5}
            autoComplete="off"
            spellCheck={false}
            value={clock}
            aria-label="New time (UTC)"
            aria-invalid={when.error ? true : undefined}
            onChange={(event) => setClock(event.target.value)}
          />
        </div>
        <span
          id={`${formId}-when-hint`}
          className={joinClassNames(styles.hint, when.error && styles.error)}
        >
          {when.error ??
            (when.ms !== null
              ? `Moves the time bar to ${formatClock(when.ms)}.`
              : 'For a launch that slipped. Leave empty to keep the time bar’s date; the time is 24-hour, 00:00 if empty.')}
        </span>
      </fieldset>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!valid}
          onClick={() => onUse(draft, when.ms)}
        >
          Use without saving
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={!valid}
          onClick={() => onSave(draft, when.ms)}
        >
          Save as preset
        </button>
      </div>
      <p className={styles.hint}>
        {valid
          ? '“Use without saving” lasts for this visit; a preset is kept in this browser.'
          : onlyNameMissing
            ? 'Give it a name to use this mission.'
            : 'Fix the marked values to use this mission.'}
      </p>
      {storageFailed ? (
        <p className={joinClassNames(styles.hint, styles.error)} role="status">
          This browser would not store presets, so it is kept for this visit only.
        </p>
      ) : null}

      {saved.length > 0 ? (
        <div className={styles.saved}>
          <h3 className={styles.subhead}>Your presets</h3>
          <ul className={styles.savedList}>
            {saved.map((item) => (
              <SavedPreset key={item.id} mission={item} onRename={onRename} onDelete={onDelete} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function draftFromEmpty(): Record<MissionField, string> {
  return { minSunElevationDeg: '', minEarthElevationDeg: '', daysNeeded: '' };
}

/** One saved preset: its name, Rename (in place) and Delete. */
function SavedPreset({
  mission,
  onRename,
  onDelete,
}: {
  mission: DemoMission;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mission.name);
  const trimmed = name.trim();
  const ok = trimmed !== '' && trimmed.length <= MISSION_NAME_MAX;

  if (editing) {
    return (
      <li className={styles.savedItem}>
        <input
          className={styles.text}
          type="text"
          value={name}
          maxLength={MISSION_NAME_MAX}
          aria-label={`New name for ${mission.name}`}
          // The rename box takes the focus it was opened for.
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && ok) {
              onRename(mission.id, trimmed);
              setEditing(false);
            }
            // Escape cancels the rename only, not the whole form.
            if (event.key === 'Escape') {
              event.stopPropagation();
              setName(mission.name);
              setEditing(false);
            }
          }}
        />
        <button
          type="button"
          className={styles.small}
          disabled={!ok}
          onClick={() => {
            onRename(mission.id, trimmed);
            setEditing(false);
          }}
        >
          Save name
        </button>
        <button
          type="button"
          className={styles.small}
          onClick={() => {
            setName(mission.name);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </li>
    );
  }
  return (
    <li className={styles.savedItem}>
      <span className={styles.savedName}>{mission.name}</span>
      <button
        type="button"
        className={styles.small}
        aria-label={`Rename ${mission.name}`}
        onClick={() => {
          setName(mission.name);
          setEditing(true);
        }}
      >
        Rename
      </button>
      <button
        type="button"
        className={styles.small}
        aria-label={`Delete ${mission.name}`}
        onClick={() => onDelete(mission.id)}
      >
        Delete
      </button>
    </li>
  );
}
