import { describe, expect, it } from 'vitest';
import { MIN_HEIGHT_M } from '../../../../src/features/lunar-map/cameraControls';
import { zoomPercent } from '../../../../src/features/lunar-map/moonLook';

describe('zoom readout', () => {
  const whole = 11_000_000;

  it('reads 100% at the whole-Moon view and 0% at the closest zoom', () => {
    expect(zoomPercent(whole, whole)).toBe(100);
    expect(zoomPercent(MIN_HEIGHT_M, whole)).toBe(0);
  });

  it('follows the whole-Moon view when the layout moves it', () => {
    expect(zoomPercent(8_000_000, 8_000_000)).toBe(100);
    expect(zoomPercent(8_000_000, whole)).toBeLessThan(100);
  });
});
