// CLAUDE.md: every data record carries a source that matches an entry in docs/DATA_SOURCES.md.
// This ties data/sites.json and data/landers.json to the register, so a new link can't slip in
// unrecorded.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HORIZONS_INDEX } from '../../../src/services/horizonsData';
import { LANDER_FIELDS, LANDERS } from '../../../src/services/landers';
import { MAP_LAYERS } from '../../../src/services/mapLayers';
import { isTodoSource, SITES } from '../../../src/services/sites';

const root = decodeURIComponent(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/tests\/unit\/services\/[^/]*$/, '');
const register = readFileSync(`${root}docs/DATA_SOURCES.md`, 'utf8');
const registered = (id: string) => register.includes(`| ${id} |`);

describe('docs/DATA_SOURCES.md covers the data files', () => {
  it("has every site's source ids", () => {
    const missing = SITES.flatMap((site) => site.sourceIds.filter((id) => !registered(id)));
    expect(missing).toEqual([]);
  });

  it("has every site's source links (coordinates, landing date, both outcomes)", () => {
    const links = SITES.flatMap((site) => [
      site.coordSource,
      site.landingDateSource,
      site.landingOutcomeSource,
      site.missionOutcomeSource,
    ]);
    expect(links.filter(isTodoSource)).toEqual([]);
    expect(links.filter((link) => !register.includes(link))).toEqual([]);
  });

  it("has every lander value's source link", () => {
    const links = LANDERS.flatMap((lander) =>
      LANDER_FIELDS.map((field) => lander.fields[field].source).filter(
        (source): source is string => source !== null,
      ),
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((link) => !register.includes(link))).toEqual([]);
  });

  it('has the Horizons files’ source', () => {
    expect(HORIZONS_INDEX?.sourceId).toBe('SRC-055');
    expect(registered('SRC-055')).toBe(true);
  });

  it('has the map layers’ source', () => {
    expect(MAP_LAYERS?.sourceId).toBe('SRC-073');
    expect(registered('SRC-073')).toBe(true);
  });
});
