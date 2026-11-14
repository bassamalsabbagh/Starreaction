import type { DemoMission, SkyAssessment } from '../../data/demoData';
import { daysFromHours, tileHours, type TileKey } from './checkTileValues';
import { joinClassNames } from '../../utils/classNames';
import { formatHours, tenthsOfDayDown } from '../../utils/time';
import styles from './CheckTiles.module.css';

interface CheckTilesProps {
  assessment: SkyAssessment;
  mission: DemoMission;
  /** The tiles to mark "Best" (Compare: the winner of each row). */
  best?: ReadonlySet<TileKey>;
  /** Tighter, for a card in Compare. */
  compact?: boolean;
}

/**
 * Sun up, Earth in view, and Sun + Earth together, in days (hours in a tooltip), each with Pass or
 * Fail and, on a fail, one short line (docs/LANDER_RULES.md, "The checks"). Used by Results and by
 * each Compare card, so both say the same things the same way.
 */
export function CheckTiles({ assessment, mission, best, compact = false }: CheckTilesProps) {
  const { sky } = assessment;
  const check = (id: 'sunlight' | 'earth' | 'window') =>
    assessment.checks.find((item) => item.id === id);
  const needs = (days: number) =>
    `needs ${mission.daysNeeded} days in a row, gets ${tenthsOfDayDown(days)}`;
  const hours = tileHours(assessment);
  const tiles: {
    key: TileKey;
    label: string;
    result: ReturnType<typeof check>;
    failLine: string;
  }[] = [
    {
      key: 'sun',
      label: 'Sun up',
      result: check('sunlight'),
      failLine: needs(sky.longestSunlitDays),
    },
    {
      key: 'earth',
      label: 'Earth in view',
      result: check('earth'),
      failLine: `never ${mission.minEarthElevationDeg}° up`,
    },
    {
      key: 'both',
      label: 'Sun + Earth together',
      result: check('window'),
      failLine: needs(sky.longestWindowDays),
    },
  ];
  return (
    <ul className={joinClassNames(styles.tiles, compact && styles.compact)} aria-label="Checks">
      {tiles.map((tile) => {
        const relay = mission.hasRelay && tile.key !== 'sun';
        const passes = relay || (tile.result?.passes ?? false);
        return (
          <li key={tile.key} className={styles.tile}>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileValue} title={formatHours(hours[tile.key])}>
              {daysFromHours(hours[tile.key])}
            </span>
            <span className={styles.marks}>
              <span className={joinClassNames(styles.word, passes ? styles.ok : styles.fail)}>
                {relay ? 'Relay' : passes ? 'Pass' : 'Fail'}
              </span>
              {best?.has(tile.key) ? <span className={styles.best}>Best</span> : null}
            </span>
            {!passes ? <span className={styles.failLine}>{tile.failLine}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
