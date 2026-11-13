import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from '../../../src/components/Tooltip';

describe('Tooltip', () => {
  it('lets the first Escape only hide the tooltip; the next one reaches the app', () => {
    const appEscape = vi.fn();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') appEscape();
    };
    document.addEventListener('keydown', onKeyDown);
    render(
      <Tooltip content="Real Sun and Earth">
        {(describedBy) => (
          <button type="button" aria-describedby={describedBy}>
            Sun
          </button>
        )}
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Sun' });
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(appEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(appEscape).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', onKeyDown);
  });
});
