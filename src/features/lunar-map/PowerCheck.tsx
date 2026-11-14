import { useMemo } from 'react';
import { batteryNeededKg, powerCheck } from '../../data/powerCheck';
import { siteSamples, type HorizonsSeries } from '../../services/horizonsData';
import type { LatLon } from '../../utils/lunarSky';
import { longestDarkHours } from '../../utils/skyVisibility';
import { formatHours, rangeWords, type TimeRange } from '../../utils/time';
import styles from './PowerCheck.module.css';

interface PowerCheckProps {
  place: LatLon;
  /** The checked dates: their longest night is the one a battery must last. */
  range: TimeRange;
  /** The Sun's height at the place now (the app's own calculation), degrees. */
  sunHeightDeg: number;
  /** A fixed site's JPL Horizons positions (the engine where they have no data, and for points). */
  series?: HorizonsSeries | null;
  /** "Design your own battery →": opens the Moon Power Lab pop-up. */
  onDesign: () => void;
}

/** The night load the battery figure is given per, in watts. */
const PER_WATTS = 100;

/**
 * Power and battery (docs/LANDER_RULES.md, "Power check"): the Sun now, the power of a flat 1 m²
 * panel now, the longest night in the dates, and the battery that night needs per 100 W of night
 * load. Information only: it never changes a check. The model's figures are on the About page.
 */
export function PowerCheck({
  place,
  range,
  sunHeightDeg,
  series = null,
  onDesign,
}: PowerCheckProps) {
  const night = useMemo(
    () => longestDarkHours(siteSamples(series, place, range).samples, place, range),
    [range, place, series],
  );
  const panel = powerCheck({
    panel: 'flat',
    areaM2: 1,
    heaterW: PER_WATTS,
    batteryKg: 0,
    sunHeightDeg,
    nightHours: night.hours,
  });
  const atLeast = night.atLeast ? 'at least ' : '';
  const words = rangeWords(range);
  // The same formula as the check: watts × night hours ÷ Wh per kg, for 100 W.
  const kg = batteryNeededKg(PER_WATTS, night.hours);
  return (
    <div className={styles.body} data-testid="power-check">
      <dl className={styles.results}>
        <div>
          <dt>Sun now</dt>
          <dd>{sunHeightDeg > 0 ? `${sunHeightDeg.toFixed(1)}° up` : 'below the horizon'}</dd>
        </div>
        <div>
          <dt>Panel power now (flat 1 m² panel)</dt>
          <dd>{Math.round(panel.panelW)} W</dd>
        </div>
        <div>
          <dt>Longest night {words.now}</dt>
          <dd>
            {night.hours === 0 ? `no night ${words.now}` : `${atLeast}${formatHours(night.hours)}`}
          </dd>
        </div>
        <div>
          <dt>Battery needed</dt>
          <dd>
            {night.hours === 0
              ? `No night ${words.now}`
              : `${atLeast}${kg.toFixed(1)} kg per ${PER_WATTS} W of night load`}
          </dd>
        </div>
      </dl>
      <button type="button" className={styles.design} onClick={onDesign}>
        Design your own battery →
      </button>
    </div>
  );
}
