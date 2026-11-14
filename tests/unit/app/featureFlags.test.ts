import { describe, expect, it } from 'vitest';
import { enabledWhenOn } from '../../../src/app/featureFlags';

describe('enabledWhenOn (VITE_SLIP_ASSISTANT)', () => {
  it('is off when unset', () => {
    expect(enabledWhenOn(undefined)).toBe(false);
  });

  it('is on for "on" (any case, spaces ignored)', () => {
    for (const value of ['on', 'ON', ' On ']) expect(enabledWhenOn(value)).toBe(true);
  });

  it('is off for anything else', () => {
    for (const value of ['', 'off', 'true', '1', 'yes', 'onn', 0, true]) {
      expect(enabledWhenOn(value)).toBe(false);
    }
  });
});
