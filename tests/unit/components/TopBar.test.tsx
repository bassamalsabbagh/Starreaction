import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from '../../../src/components/TopBar';

/** Lays the top row out: the row 0–1000 px, the title 200 px wide, the clusters' inner edges. */
function layOut(leftClusterRight: number, rightClusterLeft: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (left: number, width: number) =>
      ({ left, right: left + width, width, top: 0, bottom: 48, height: 48 }) as DOMRect;
    if (this.tagName === 'HEADER') return rect(0, 1000);
    if (this.nextElementSibling?.tagName === 'H1') return rect(0, leftClusterRight);
    if (this.previousElementSibling?.tagName === 'H1') return rect(rightClusterLeft, 100);
    return rect(0, 0);
  });
}

function renderBar() {
  render(<TopBar brand="StarReaction" product="CLPS Lander Advisor" onOpenAbout={() => {}} />);
  return screen.getByRole('heading', { level: 1 });
}

describe('TopBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the centred title when it is clear of both clusters', () => {
    // The title spans 400–600 px; the breadcrumb ends at 300, the DEMO pill starts at 900.
    layOut(300, 900);
    expect(renderBar()).toHaveAttribute('data-crowded', 'false');
  });

  it('hides the title (screen readers keep it) when it would touch the breadcrumb', () => {
    // A long breadcrumb ends at 390: within 24 px of the title's left edge.
    layOut(390, 900);
    const title = renderBar();
    expect(title).toHaveAttribute('data-crowded', 'true');
    expect(title).toHaveAccessibleName(/CLPS Lander Advisor/);
  });
});
