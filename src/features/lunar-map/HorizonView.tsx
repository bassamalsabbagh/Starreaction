import { useId, useMemo } from 'react';
import { siteSamples, type HorizonsSeries } from '../../services/horizonsData';
import { azimuthElevationOf, type LatLon } from '../../utils/lunarSky';
import type { BodyNow } from '../../utils/riseSet';
import { edgeCutRuns, type AzimuthRun, type HorizonProfile } from '../../utils/terrainShadow';
import { rangeWords, type TimeRange } from '../../utils/time';
import styles from './HorizonView.module.css';

interface HorizonViewProps {
  place: LatLon;
  range: TimeRange;
  sun: BodyNow;
  earth: BodyNow;
  /** The mission's lowest Sun height for power, drawn as a dashed line. */
  minSunElevationDeg: number;
  /** The terrain skyline around the place, when elevation data is loaded for it. */
  terrain: HorizonProfile | null;
  /** What the place is, for the flat-horizon label ("no terrain data for this site"). */
  /** A fixed site's JPL Horizons positions (the engine where they have no data, and for points). */
  series?: HorizonsSeries | null;
}

// Drawn at about the panel's own width, so the labels show at their real size.
const WIDTH = 340;
const HEIGHT = 190;
const PAD = { left: 30, right: 8, top: 12, bottom: 22 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

interface SkyPoint {
  azimuth: number;
  elevation: number;
}

/** "120°–150°" (whole azimuths, both ends included), or "120°" for one degree. */
function runText(run: AzimuthRun): string {
  const end = (run.start + run.length - 1) % 360;
  return run.length === 1 ? `${run.start}°` : `${run.start}°–${end}°`;
}

/**
 * The view from the place: the horizon across the middle, compass directions along the bottom,
 * height above the horizon up the side. The Sun's and the Earth's paths over the month are lines;
 * where they are now is a dot with its name. The Moon has no air, so the horizon is the edge of
 * the ground: flat (a smooth Moon) until terrain data is loaded for the place. Directions whose
 * terrain ray ran off the edge of the elevation data are marked "cut off at data edge".
 */
export function HorizonView({
  place,
  range,
  sun,
  earth,
  minSunElevationDeg,
  terrain,
  series = null,
}: HorizonViewProps) {
  const titleId = useId();
  const descId = useId();
  const words = rangeWords(range);
  const clipId = useId();

  const paths = useMemo(() => {
    const { samples } = siteSamples(series, place, range);
    const of = (pick: 'sun' | 'earth'): SkyPoint[] =>
      samples.map((sample) => azimuthElevationOf(sample[pick], place));
    return { sun: of('sun'), earth: of('earth') };
  }, [place, range, series]);

  // The height scale follows the sky: at the poles everything sits within a few degrees of the
  // horizon, and a fixed 0–90° scale would flatten it to a line.
  const highest = Math.max(
    sun.elevationDeg,
    earth.elevationDeg,
    minSunElevationDeg,
    ...paths.sun.map((point) => point.elevation),
    ...paths.earth.map((point) => point.elevation),
  );
  const top = Math.min(90, Math.max(5, Math.ceil((highest + 1) / 5) * 5));
  const bottom = -Math.max(2, Math.round(top * 0.15));
  // South in the middle for a northern place (where the Sun is highest), north for a southern one.
  const centre = place.lat >= 0 ? 180 : 0;

  const x = (azimuth: number) =>
    PAD.left + (((((azimuth - centre + 540) % 360) + 360) % 360) / 360) * PLOT_W;
  const y = (elevation: number) => PAD.top + ((top - elevation) / (top - bottom)) * PLOT_H;

  /** A path through the points, broken where it wraps round the edge of the chart. */
  const line = (points: readonly SkyPoint[]) => {
    let d = '';
    let lastX: number | null = null;
    for (const point of points) {
      const px = x(point.azimuth);
      const py = y(point.elevation);
      const jump = lastX === null || Math.abs(px - lastX) > PLOT_W / 2;
      d += `${jump ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
      lastX = px;
    }
    return d;
  };

  const skyline = terrain
    ? Array.from({ length: 361 }, (_, step) => {
        const azimuth = (centre - 180 + step + 360) % 360;
        const px = PAD.left + (step / 360) * PLOT_W;
        return `${step === 0 ? 'M' : 'L'}${px.toFixed(1)} ${y(terrain.elevations[Math.floor(azimuth) % 360] ?? 0).toFixed(1)}`;
      }).join('') + `L${PAD.left + PLOT_W} ${PAD.top + PLOT_H}L${PAD.left} ${PAD.top + PLOT_H}Z`
    : null;

  // Where the terrain is only known part of the way out: bands across the chart, split where a run
  // crosses the chart's edge.
  const cutRuns = terrain ? edgeCutRuns(terrain) : [];
  const cutBands = cutRuns.flatMap((run) => {
    const from = (((run.start - centre + 180) % 360) + 360) % 360;
    const parts =
      from + run.length > 360
        ? [
            { from, length: 360 - from },
            { from: 0, length: from + run.length - 360 },
          ]
        : [{ from, length: run.length }];
    return parts.map((part) => ({
      key: `${run.start}-${part.from}`,
      x: PAD.left + (part.from / 360) * PLOT_W,
      width: (part.length / 360) * PLOT_W,
    }));
  });
  const cutText = cutRuns.map(runText).join(', ');

  const compass = [
    { label: 'N', azimuth: 0 },
    { label: 'E', azimuth: 90 },
    { label: 'S', azimuth: 180 },
    { label: 'W', azimuth: 270 },
  ];
  // Round steps: 5° near the poles, wider when the Sun climbs high.
  const tickStep = top <= 20 ? 5 : top <= 45 ? 15 : 30;
  const yTicks = Array.from({ length: Math.floor(top / tickStep) + 1 }, (_, i) => i * tickStep);
  const nowDot = (body: BodyNow, name: string, className: string) => {
    if (body.elevationDeg < bottom) return null;
    const px = x(body.azimuthDeg);
    const py = y(body.elevationDeg);
    const right = px < PAD.left + PLOT_W - 40;
    return (
      <g className={className}>
        <circle cx={px} cy={py} r={5} className={styles.dot} />
        <text
          x={right ? px + 8 : px - 8}
          y={py - 7}
          textAnchor={right ? 'start' : 'end'}
          className={styles.dotLabel}
        >
          {name}
        </text>
      </g>
    );
  };

  const describe = (body: BodyNow, name: string) =>
    `${name} now ${body.up ? `${Math.max(0, Math.round(body.elevationDeg))}° up` : 'below the horizon'}, toward ${Math.round(body.azimuthDeg)}°`;
  const sunHigh = Math.max(...paths.sun.map((point) => point.elevation));

  return (
    <figure className={styles.figure} data-tour="horizon">
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>The Sun and Earth over the horizon {words.now}</title>
        <desc id={descId}>
          {`${describe(sun, 'Sun')}. ${describe(earth, 'Earth')}. The Sun's highest ${words.now}: ${Math.round(sunHigh)}°.${cutText ? ` Horizon cut off at data edge toward ${cutText}.` : ''}`}
        </desc>
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* The ground: below the horizon, and the terrain skyline when it is known. */}
        <rect
          x={PAD.left}
          y={y(0)}
          width={PLOT_W}
          height={PAD.top + PLOT_H - y(0)}
          className={styles.ground}
        />
        {skyline ? (
          <path d={skyline} className={styles.terrain} clipPath={`url(#${clipId})`} />
        ) : null}
        {cutBands.map((band) => (
          <rect
            key={band.key}
            x={band.x}
            y={PAD.top}
            width={band.width}
            height={PLOT_H}
            className={styles.edgeCut}
            data-testid="edge-cut-band"
          />
        ))}

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(tick)}
              y2={y(tick)}
              className={tick === 0 ? styles.horizon : styles.grid}
            />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className={styles.axis}>
              {tick}°
            </text>
          </g>
        ))}
        {compass.map((point) => (
          <text
            key={point.label}
            x={x(point.azimuth) === PAD.left ? PAD.left + 6 : x(point.azimuth)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className={styles.axis}
          >
            {point.label}
          </text>
        ))}

        {minSunElevationDeg > 0 ? (
          <line
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={y(minSunElevationDeg)}
            y2={y(minSunElevationDeg)}
            className={styles.minSun}
          />
        ) : null}

        <g clipPath={`url(#${clipId})`}>
          <path d={line(paths.earth)} className={styles.earthPath} />
          <path d={line(paths.sun)} className={styles.sunPath} />
        </g>
        {nowDot(earth, 'Earth', styles.earth ?? '')}
        {nowDot(sun, 'Sun', styles.sun ?? '')}
      </svg>
      <figcaption className={styles.caption}>
        <span className={styles.key}>
          <span className={styles.swatchSun} aria-hidden="true" /> Sun path {words.now}
        </span>
        <span className={styles.key}>
          <span className={styles.swatchEarth} aria-hidden="true" /> Earth path
        </span>
        {minSunElevationDeg > 0 ? (
          <span className={styles.key}>
            <span className={styles.swatchMin} aria-hidden="true" /> Panels need ≥{' '}
            {minSunElevationDeg}°
          </span>
        ) : null}
        {cutText ? (
          <span className={styles.key}>
            <span className={styles.swatchCut} aria-hidden="true" /> Cut off at data edge: {cutText}
          </span>
        ) : null}
        <span className={styles.horizonNote}>
          {terrain
            ? `Terrain horizon: ${terrain.source}, known to ${Math.round(terrain.radiusM / 1000)} km`
            : 'Flat horizon (hills not included)'}
        </span>
      </figcaption>
    </figure>
  );
}
