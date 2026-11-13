import { useId, useMemo, useState } from 'react';
import { Collapsible } from '../../components/Collapsible';
import {
  BATTERY_WH_PER_KG,
  CELL_EFFICIENCY,
  POWER_SLIDERS,
  SOLAR_IRRADIANCE_W_M2,
  powerCheck,
  type PanelType,
} from '../../data/powerCheck';
import { joinClassNames } from '../../utils/classNames';
import type { LatLon } from '../../utils/lunarSky';
import { hourlySky, longestDarkHours } from '../../utils/skyVisibility';
import type { TimeRange } from '../../utils/time';
import styles from './PowerCheck.module.css';

interface PowerCheckProps {
  place: LatLon;
  /** The checked month: its longest night is the one the battery must last. */
  range: TimeRange;
  /** The Sun's height at the place now (the app's own calculation), degrees. */
  sunHeightDeg: number;
}

type SliderKey = keyof typeof POWER_SLIDERS;

const SLIDER_LABEL: Readonly<Record<SliderKey, { name: string; unit: string; digits: number }>> = {
  areaM2: { name: 'Panel area', unit: 'm²', digits: 1 },
  heaterW: { name: 'Heater', unit: 'W', digits: 0 },
  batteryKg: { name: 'Battery', unit: 'kg', digits: 0 },
};

/**
 * Miral's Moon power lab in Site details (docs/LANDER_RULES.md, "Power check"): panel power now and
 * the battery for the longest night this month, with teaching sliders. Information only: it never
 * changes the checks. The night is worked out only while the section is open.
 */
export function PowerCheck({ place, range, sunHeightDeg }: PowerCheckProps) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelType>('flat');
  const [values, setValues] = useState<Record<SliderKey, number>>({
    areaM2: POWER_SLIDERS.areaM2.initial,
    heaterW: POWER_SLIDERS.heaterW.initial,
    batteryKg: POWER_SLIDERS.batteryKg.initial,
  });
  const night = useMemo(
    () => (open ? longestDarkHours(hourlySky(range), place, range) : null),
    [open, range, place],
  );
  const result = night
    ? powerCheck({
        panel,
        areaM2: values.areaM2,
        heaterW: values.heaterW,
        batteryKg: values.batteryKg,
        sunHeightDeg,
        nightHours: night.hours,
      })
    : null;
  const atLeast = night?.atLeast ? 'at least ' : '';

  return (
    <Collapsible
      title="Power check"
      meta="Miral’s model · information only"
      variant="body"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <div className={styles.body} data-testid="power-check">
        <p className={styles.intro}>
          Panel power now, and the battery a heater needs for the longest night this month. Built
          from <strong>Miral’s</strong> Moon power lab. It doesn’t change the checks.
        </p>

        <div className={styles.panelType} role="group" aria-label="Panel type">
          {(['flat', 'standing'] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={styles.choice}
              aria-pressed={panel === type}
              onClick={() => setPanel(type)}
            >
              {type === 'flat' ? 'Flat panel' : 'Standing panel, facing the Sun'}
            </button>
          ))}
        </div>

        {(Object.keys(POWER_SLIDERS) as SliderKey[]).map((key) => {
          const slider = POWER_SLIDERS[key];
          const label = SLIDER_LABEL[key];
          const id = `${baseId}-${key}`;
          return (
            <div key={key} className={styles.slider}>
              <label htmlFor={id} className={styles.sliderLabel}>
                <span>{label.name}</span>
                <span className={styles.sliderValue}>
                  {values[key].toFixed(label.digits)} {label.unit}
                </span>
              </label>
              <input
                id={id}
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={values[key]}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, [key]: Number(event.target.value) }))
                }
              />
            </div>
          );
        })}
        <p className={styles.note}>Teaching defaults, not a real lander’s figures.</p>

        {result && night ? (
          <dl className={styles.results}>
            <div>
              <dt>Sun now</dt>
              <dd>{sunHeightDeg > 0 ? `${sunHeightDeg.toFixed(1)}° up` : 'below the horizon'}</dd>
            </div>
            <div>
              <dt>Panel power now</dt>
              <dd>{Math.round(result.panelW)} W</dd>
            </div>
            <div>
              <dt>Longest night this month</dt>
              <dd>{night.hours === 0 ? 'no night this month' : `${atLeast}${night.hours} h`}</dd>
            </div>
            <div>
              <dt>Battery needed</dt>
              <dd>
                {atLeast}
                {result.neededKg.toFixed(1)} kg
              </dd>
            </div>
          </dl>
        ) : null}
        {result ? (
          <p
            className={joinClassNames(styles.verdict, result.survives ? styles.ok : styles.fail)}
            data-testid="power-verdict"
          >
            {result.survives
              ? night?.atLeast
                ? 'Survives the night checked (it runs on past this month)'
                : 'Survives the night'
              : `Needs ${atLeast}${result.shortKg} kg more`}
          </p>
        ) : null}

        <p className={styles.note}>
          A simplified model: no shadows, no panel losses, only the heater runs at night, and the
          battery figure is a minimum. {SOLAR_IRRADIANCE_W_M2} W/m² sunlight (NASA Moon Fact Sheet),{' '}
          {CELL_EFFICIENCY * 100}% cells (NASA small-spacecraft report), {BATTERY_WH_PER_KG} Wh/kg
          from LuSEE-Night’s planned battery (a team assumption for every mission).
        </p>
      </div>
    </Collapsible>
  );
}
