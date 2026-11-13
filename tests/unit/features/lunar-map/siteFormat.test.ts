import { describe, expect, it } from 'vitest';
import {
  formatLandingDate,
  formatSiteCoordinates,
} from '../../../../src/features/lunar-map/siteFormat';

describe('formatSiteCoordinates', () => {
  it('shows latitude and longitude with N/S and E/W, every digit the data has', () => {
    expect(formatSiteCoordinates({ lat: -80.13, lon: 1.44 })).toBe('80.13° S, 1.44° E');
    expect(formatSiteCoordinates({ lat: 18.5623, lon: 61.8103 })).toBe('18.5623° N, 61.8103° E');
    expect(formatSiteCoordinates({ lat: -84.79, lon: 29.2 })).toBe('84.79° S, 29.2° E');
    expect(formatSiteCoordinates({ lat: 3, lon: -31.8 })).toBe('3° N, 31.8° W');
  });
});

describe('formatLandingDate', () => {
  it('reads a UTC date as day, month and year', () => {
    expect(formatLandingDate('2024-02-22')).toBe('22 Feb 2024');
    expect(formatLandingDate('2023-08-23')).toBe('23 Aug 2023');
  });

  it('shows anything else as it is', () => {
    expect(formatLandingDate('soon')).toBe('soon');
  });
});
