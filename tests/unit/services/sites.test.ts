import { describe, expect, it } from 'vitest';
import {
  coordStatus,
  outcomeStatus,
  findSite,
  isTodoSource,
  parseSites,
  SiteDataError,
  SITES,
  type Site,
} from '../../../src/services/sites';

const valid = {
  id: 'test-site',
  name: 'Test Site',
  region: null,
  lat: -85,
  lonEast: 30,
  coordSource: 'TODO (team)',
  coordNote: null,
  sourceIds: [],
  landerId: 'test-lander',
  landingDateUtc: '2025-03-06',
  landingDateSource: 'TODO (team)',
  landingOutcome: 'Landed',
  landingOutcomeSource: 'TODO (team)',
  missionOutcome: 'Worked',
  missionOutcomeSource: 'https://example.org/test',
  why: 'A test record, made up for this test only.',
};

const problemsOf = (raw: unknown): readonly string[] => {
  try {
    parseSites(raw);
  } catch (error) {
    if (error instanceof SiteDataError) return error.problems;
    throw error;
  }
  return [];
};

describe('data/sites.json', () => {
  it('loads the four real sites in file order', () => {
    expect(SITES.map((site) => site.id)).toEqual(['im1', 'im2', 'bg1', 'ch3']);
  });

  it('keeps the coordinates from the plan, north-positive and east-positive', () => {
    const at = (id: string) => {
      const site = findSite(id);
      return site && [site.lat, site.lon];
    };
    expect(at('im1')).toEqual([-80.13, 1.44]);
    expect(at('im2')).toEqual([-84.7906, 29.1957]);
    expect(at('bg1')).toEqual([18.5623, 61.8103]);
    expect(at('ch3')).toEqual([-69.3741, 32.32]);
  });

  it('keeps landing and mission outcomes as separate fields', () => {
    const im2 = findSite('im2');
    expect(im2?.landingOutcome).toBe('Landed on its side, in a 20 m crater');
    expect(im2?.landingOutcomeSource).toBe('https://www.lroc.im-ldi.com/images/1408');
    expect(im2?.missionOutcome).toBe('Partial: some data returned, ended early');
    expect(im2?.missionOutcomeSource).toBe(
      'https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/',
    );
  });

  it('has a source for every coordinate and outcome', () => {
    expect(coordStatus(findSite('im1') as Site)).toBe('sourced');
    expect(SITES.every((site) => coordStatus(site) === 'sourced')).toBe(true);
    expect(SITES.every((site) => outcomeStatus(site, 'landing') === 'sourced')).toBe(true);
    expect(SITES.every((site) => outcomeStatus(site, 'mission') === 'sourced')).toBe(true);
  });

  it("keeps ch3's note on the planned target against the observed site", () => {
    expect(findSite('ch3')?.coordNote).toBe(
      "ISRO's planned target was 69.367621° S, 32.348126° E; we use LROC's observed site.",
    );
    expect(findSite('im1')?.coordNote).toBeNull();
  });

  it('labels an outcome "source TODO" only while its own source is a TODO', () => {
    const [site] = parseSites({ sites: [valid] });
    expect(outcomeStatus(site as Site, 'landing')).toBe('source TODO');
    expect(outcomeStatus(site as Site, 'mission')).toBe('sourced');
    expect(isTodoSource((site as Site).landingOutcomeSource)).toBe(true);
  });

  it('links every site to a lander id', () => {
    expect(SITES.map((site) => site.landerId)).toEqual([
      'nova-c',
      'nova-c',
      'blue-ghost-1',
      'chandrayaan-3',
    ]);
  });
});

describe('parseSites', () => {
  it('accepts a valid record, latitude positive or negative', () => {
    expect(parseSites({ sites: [valid] })[0]).toMatchObject({ id: 'test-site', lon: 30 });
    expect(parseSites({ sites: [{ ...valid, lat: 18.5 }] })[0]?.lat).toBe(18.5);
  });

  it('rejects a file without a sites list, or an empty one', () => {
    expect(problemsOf(null)).toEqual(['expected an object with a "sites" list']);
    expect(problemsOf({ sites: [] })).toEqual(['"sites" is empty']);
  });

  it('lists every problem at once', () => {
    const problems = problemsOf({
      sites: [
        {
          ...valid,
          lat: -95,
          lonEast: 200,
          landingDateUtc: '2025-02-30',
          coordSource: 'somewhere',
          name: '',
          region: '',
          sourceIds: ['24'],
        },
      ],
    });
    expect(problems).toEqual([
      'sites[0].name must be a non-empty string',
      'sites[0].region must be a non-empty string or null',
      'sites[0].lat must be a number from -90 to 90',
      'sites[0].lonEast must be a number from -180 to 180',
      'sites[0].landingDateUtc "2025-02-30" must be a real date, YYYY-MM-DD',
      'sites[0].coordSource must be a URL or "TODO (…)"',
      'sites[0].sourceIds must be a list of "SRC-123" ids (may be empty)',
    ]);
  });

  it('rejects repeated ids and badly formed ones', () => {
    expect(problemsOf({ sites: [valid, valid] })).toEqual(['sites[1].id "test-site" is repeated']);
    expect(problemsOf({ sites: [{ ...valid, id: 'Has Space' }] })).toEqual([
      'sites[0].id "Has Space" must be lower-case letters, digits, -',
    ]);
  });

  it('rejects a missing field', () => {
    const noLander: Record<string, unknown> = { ...valid };
    delete noLander.landerId;
    expect(problemsOf({ sites: [noLander] })).toEqual([
      'sites[0].landerId must be a non-empty string',
    ]);
  });
});
