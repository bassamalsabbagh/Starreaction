/**
 * A point on the lunar surface in selenographic coordinates, in decimal degrees.
 *
 * PROVISIONAL convention, to be confirmed against the eventual data sources:
 * latitude −90…+90 (north-positive), longitude −180…+180 (east-positive).
 */
export interface SelenographicCoordinate {
  readonly lat: number;
  readonly lon: number;
}
