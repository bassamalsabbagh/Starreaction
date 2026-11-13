import { useId, type Ref } from 'react';
import type { DemoMission } from '../data/demoData';
import { Tooltip } from './Tooltip';
import styles from './MissionPicker.module.css';

interface MissionPickerProps {
  missions: readonly DemoMission[];
  mission: DemoMission;
  onMissionChange: (missionId: string) => void;
  /** Opens the "Add your own mission" form. */
  onAddMission: () => void;
  missionFormOpen: boolean;
  selectRef?: Ref<HTMLSelectElement>;
}

/** Pick a mission: the dropdown, its needs as chips, and "Add your own mission". */
export function MissionPicker({
  missions,
  mission,
  onMissionChange,
  onAddMission,
  missionFormOpen,
  selectRef,
}: MissionPickerProps) {
  const selectId = useId();
  return (
    <div className={styles.picker}>
      {/* The view's heading already says "Mission": the field keeps its name, for screen readers. */}
      <label className="visually-hidden" htmlFor={selectId}>
        Mission
      </label>
      <select
        ref={selectRef}
        id={selectId}
        className={styles.select}
        value={mission.id}
        onChange={(event) => onMissionChange(event.target.value)}
        data-tour="mission"
      >
        {missions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.custom ? `${entry.name} · Custom` : entry.name}
          </option>
        ))}
      </select>
      <ul className={styles.chips} aria-label={`${mission.name} needs`} data-tour="mission-needs">
        <li className={styles.chip}>
          <span className={styles.chipLabel}>Sun for power</span>
          <span className={styles.chipValue}>≥ {mission.minSunElevationDeg}°</span>
        </li>
        <li className={styles.chip}>
          <span className={styles.chipLabel}>Power needed</span>
          <span className={styles.chipValue}>{mission.daysNeeded} days</span>
        </li>
        <li className={styles.chip}>
          <span className={styles.chipLabel}>Earth for contact</span>
          <span className={styles.chipValue}>
            {mission.hasRelay ? 'Relay' : `≥ ${mission.minEarthElevationDeg}°`}
          </span>
        </li>
      </ul>
      <p className={styles.customNote}>
        {mission.custom ? (
          <>
            <span className={styles.customTag}>Custom</span> Your values. The sites are real
            landings, checked with the real Sun and Earth.
          </>
        ) : (
          <>
            <span className={styles.demoTag}>DEMO</span> These needs are made up for practice. The
            sites are real landings, checked against them with the real Sun and Earth.
          </>
        )}
      </p>
      <Tooltip
        content="Make a mission from your own needs; the sites are real landings."
        placement="above"
        align="start"
      >
        {(describedBy) => (
          <button
            type="button"
            className={styles.add}
            aria-describedby={describedBy}
            aria-expanded={missionFormOpen}
            onClick={onAddMission}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 3v10M3 8h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Add your own mission
          </button>
        )}
      </Tooltip>
    </div>
  );
}
