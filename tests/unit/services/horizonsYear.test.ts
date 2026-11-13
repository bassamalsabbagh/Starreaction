import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeHorizons,
  readHorizonsIndex,
  shareAbove,
  YEAR_RANGE,
} from '../../../src/services/horizonsData';

// The real JPL Horizons files (SRC-055), read from disk: the year's Sun and Earth % over calendar
// 2027, flat horizon, upper-limb rule (docs/LANDER_RULES.md, "Is it up: the upper limb"). The
// values are ours, pinned as computed on 2026-11-13; the user's own cloud check gave IM-1 Sun 49.5
// / Earth 100 and IM-2 Sun 50.2 / Earth 79.1.
const root = decodeURIComponent(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/tests\/unit\/services\/[^/]*$/, '');
const indexPath = `${root}src/data/horizons/index.json`;
const index = existsSync(indexPath)
  ? readHorizonsIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
  : null;

const EXPECTED: Readonly<Record<string, { sun: number; earth: number }>> = {
  im1: { sun: 49.47, earth: 100 },
  im2: { sun: 50.24, earth: 79.02 },
  bg1: { sun: 49.14, earth: 100 },
  ch3: { sun: 49.02, earth: 100 },
};

describe.runIf(index !== null)(
  '2027 from the real Horizons files (flat horizon, upper limb)',
  () => {
    it.each(Object.entries(EXPECTED))('%s', (id, expected) => {
      const entry = index?.sites.find((site) => site.id === id);
      const path = `${root}public/data/horizons/${entry?.file ?? ''}`;
      if (!index || !entry || !existsSync(path)) throw new Error(`no Horizons file for ${id}`);
      // A copy, so the decoder gets a plain ArrayBuffer of exactly the file's bytes.
      const bytes = new Uint8Array(readFileSync(path));
      const series = decodeHorizons(bytes.buffer, {
        siteId: entry.id,
        startMs: index.startMs,
        stepMs: index.stepMinutes * 60_000,
        count: index.count,
      });
      if (!series) throw new Error(`could not decode ${id}`);
      const site = { lat: entry.lat, lon: entry.lonEast };
      const sun = shareAbove(series, 'sun', site, YEAR_RANGE);
      const earth = shareAbove(series, 'earth', site, YEAR_RANGE);
      // Every 10 minutes of 2027.
      expect(sun?.samples).toBe(365 * 144);
      expect(Math.abs((sun?.pct ?? 0) - expected.sun)).toBeLessThan(0.05);
      expect(Math.abs((earth?.pct ?? 0) - expected.earth)).toBeLessThan(0.05);
    });
  },
);
