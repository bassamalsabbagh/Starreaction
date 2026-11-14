import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest hands CSS to tests as empty text, so the files are read from disk. The project root is
// worked out from this file's own location (tests/unit/styles/).
const root = decodeURIComponent(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/tests\/unit\/styles\/[^/]*$/, '');
const read = (file: string) => readFileSync(`${root}src/${file}`, 'utf8');
const globalCss = read('styles/global.css');
const appCss = read('app/App.module.css');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(globalCss);
  if (!match?.[1]) throw new Error(`--${name} is not a #rrggbb colour in global.css`);
  return match[1];
}

/** WCAG 2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const BACKGROUNDS = ['color-bg', 'color-panel', 'color-panel-raised', 'color-surface'];

describe('text colours (projector readability, 2026-11-13)', () => {
  it('keeps every grey at WCAG AA (4.5:1) or better on every background', () => {
    for (const text of ['color-text', 'color-text-muted', 'color-text-faint']) {
      for (const background of BACKGROUNDS) {
        expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('gives presentation mode greys of at least 7:1 (WCAG AAA) for a washed-out projector', () => {
    for (const text of ['color-text-muted-projector', 'color-text-faint-projector']) {
      for (const background of BACKGROUNDS) {
        expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('keeps the order of emphasis: faint is quieter than muted, in both modes', () => {
    const bg = token('color-bg');
    expect(contrast(token('color-text-faint'), bg)).toBeLessThan(
      contrast(token('color-text-muted'), bg),
    );
    expect(contrast(token('color-text-faint-projector'), bg)).toBeLessThan(
      contrast(token('color-text-muted-projector'), bg),
    );
  });

  it('switches presentation mode to the projector greys and larger small text', () => {
    const block = /\.shell\.presenting \{([^}]*)\}/.exec(appCss)?.[1] ?? '';
    expect(block).toContain('--color-text-muted: var(--color-text-muted-projector)');
    expect(block).toContain('--color-text-faint: var(--color-text-faint-projector)');
    expect(block).toMatch(/--font-size-xs:\s*0\.875rem/);
  });
});

describe('Timeline colours (Phase E, projector-safe)', () => {
  it('stand out from the panel and the track; Sun and Earth differ in lightness; "both" is told from Sun by its stripes', () => {
    for (const name of ['color-timeline-both', 'color-timeline-sun', 'color-timeline-earth']) {
      expect(contrast(token(name), token('color-panel'))).toBeGreaterThanOrEqual(3);
      expect(contrast(token(name), token('color-timeline-track'))).toBeGreaterThanOrEqual(3);
    }
    // Yellow and blue differ in lightness, so they part even without colour vision.
    expect(
      contrast(token('color-timeline-sun'), token('color-timeline-earth')),
    ).toBeGreaterThanOrEqual(1.8);
    // "Both" carries a stripe pattern that reads at 3:1 within itself.
    expect(
      contrast(token('color-timeline-both'), token('color-timeline-both-stripe')),
    ).toBeGreaterThanOrEqual(3);
  });
});
