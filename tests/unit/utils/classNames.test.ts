import { describe, expect, it } from 'vitest';
import { joinClassNames } from '../../../src/utils/classNames';

describe('joinClassNames', () => {
  it('joins present names and skips missing or empty ones', () => {
    expect(joinClassNames('a', undefined, '', false, null, 'b')).toBe('a b');
  });

  it('returns an empty string when nothing is present', () => {
    expect(joinClassNames(undefined, false)).toBe('');
  });
});
