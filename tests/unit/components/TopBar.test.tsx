import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from '../../../src/components/TopBar';

/** Lays the top row out: the row 0–1000 px, the title 200 px wide, the breadcrumb's right edge. */
function layOut(leftClusterRight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (left: number, width: number) =>
      ({ left, right: left + width, width, top: 0, bottom: 48, height: 48 }) as DOMRect;
    if (this.tagName === 'HEADER') return rect(0, 1000);
    if (this.nextElementSibling?.tagName === 'H1') return rect(0, leftClusterRight);
    return rect(0, 0);
  });
}

function renderBar() {
  render(<TopBar brand="StarReaction" product="CLPS Lander Advisor" />);
  return screen.getByRole('heading', { level: 1 });
}

describe('TopBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the centred title when it is clear of the breadcrumb', () => {
    // The title spans 400–600 px; the breadcrumb ends at 300.
    layOut(300);
    expect(renderBar()).toHaveAttribute('data-crowded', 'false');
  });

  it('hides the title (screen readers keep it) when it would touch the breadcrumb', () => {
    // A long breadcrumb ends at 390: within 24 px of the title's left edge.
    layOut(390);
    const title = renderBar();
    expect(title).toHaveAttribute('data-crowded', 'true');
    expect(title).toHaveAccessibleName(/CLPS Lander Advisor/);
  });

  it('has no "Data: Demo" pill: the sites are real, the demo missions are labelled where shown', () => {
    layOut(300);
    renderBar();
    expect(screen.queryByRole('button', { name: /Data: Demo/ })).toBeNull();
    expect(screen.getByRole('banner')).not.toHaveTextContent(/demo/i);
  });
});
