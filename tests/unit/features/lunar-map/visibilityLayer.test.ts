import { describe, expect, it, vi } from 'vitest';
import {
  FRAME_FIRST_UTC,
  FRAME_LAST_UTC,
  IDLE_RUNTIME,
  INITIAL_VISIBILITY,
  NO_FRAME_TEXT,
  applyVisibilityDisplay,
  createFrameRequester,
  formatFrameTime,
  frameLine,
  frameStamp,
  isAbortError,
  raiseOverlayToTop,
  readingSource,
  shownTargets,
  snapToFrame,
  visibilityDisplay,
  visibilityReadout,
  type VisibilityRuntime,
} from '../../../../src/features/lunar-map/visibilityLayer';

const at = (iso: string) => Date.parse(iso);
const READY: VisibilityRuntime = {
  ...IDLE_RUNTIME,
  status: 'ready',
  appliedTime: '2026-11-30T12:10:00Z',
};

describe('snapToFrame', () => {
  it('snaps to the nearest 10-minute frame, with an explicit Z and whole seconds', () => {
    expect(snapToFrame(at('2026-11-30T12:04:59Z'))).toBe('2026-11-30T12:00:00Z');
    expect(snapToFrame(at('2026-11-30T12:05:01Z'))).toBe('2026-11-30T12:10:00Z');
    expect(snapToFrame(at('2026-11-30T12:10:00.400Z'))).toBe('2026-11-30T12:10:00Z');
    // Exactly halfway takes the later frame.
    expect(snapToFrame(at('2026-11-30T12:05:00Z'))).toBe('2026-11-30T12:10:00Z');
  });

  it('includes both ends of the range', () => {
    expect(snapToFrame(at(FRAME_FIRST_UTC))).toBe('2026-11-24T00:00:00Z');
    expect(snapToFrame(at(FRAME_LAST_UTC))).toBe('2026-12-08T00:00:00Z');
    expect(snapToFrame(at('2026-11-24T00:04:00Z'))).toBe('2026-11-24T00:00:00Z');
    expect(snapToFrame(at('2026-12-07T23:56:00Z'))).toBe('2026-12-08T00:00:00Z');
  });

  it('gives no frame outside the range (nothing made up)', () => {
    expect(snapToFrame(at('2026-11-23T23:59:59Z'))).toBeNull();
    expect(snapToFrame(at('2026-12-08T00:00:01Z'))).toBeNull();
    expect(snapToFrame(at('2027-01-01T00:00:00Z'))).toBeNull();
    expect(snapToFrame(Number.NaN)).toBeNull();
  });

  it('formats stamps as the manifest does, and for people', () => {
    expect(frameStamp(at('2026-12-01T03:20:00Z'))).toBe('2026-12-01T03:20:00Z');
    expect(formatFrameTime('2026-12-01T03:20:00Z')).toBe('2026-12-01 03:20 UTC');
  });
});

describe('settings and display', () => {
  it('starts with the Sun as the one overlay, and nothing loading', () => {
    expect(INITIAL_VISIBILITY.on).toBe(false);
    expect(shownTargets(INITIAL_VISIBILITY)).toEqual([]);
    expect(shownTargets({ ...INITIAL_VISIBILITY, on: true })).toEqual(['sun']);
    expect(shownTargets({ ...INITIAL_VISIBILITY, on: true, active: 'earth' })).toEqual(['earth']);
    expect(visibilityDisplay(INITIAL_VISIBILITY, '2026-11-24T00:00:00Z').load).toBe(false);
  });

  it('shows a target only with a frame for the time', () => {
    const settings = { ...INITIAL_VISIBILITY, on: true, started: true };
    const display = visibilityDisplay(settings, '2026-11-24T00:00:00Z');
    expect(display.load).toBe(true);
    expect(display.sun.visible).toBe(true);
    expect(display.earth.visible).toBe(false);
    expect(visibilityDisplay(settings, null).sun.visible).toBe(false);
    // Switched off again: nothing shown, but what was loaded stays loaded.
    const off = visibilityDisplay({ ...settings, on: false }, '2026-11-24T00:00:00Z');
    expect(off.load).toBe(true);
    expect(off.sun.visible).toBe(false);
  });
});

describe('visibilityDisplay at 0 % opacity', () => {
  it('does not draw a target whose opacity is 0, exactly as if it were hidden', () => {
    const on = { ...INITIAL_VISIBILITY, on: true, started: true, active: 'sun' as const };
    const frame = '2026-11-30T12:10:00Z';
    expect(visibilityDisplay(on, frame).sun).toEqual({ visible: true, opacity: 0.8 });
    const zero = { ...on, opacity: { sun: 0, earth: 0 } };
    expect(visibilityDisplay(zero, frame).sun).toEqual({ visible: false, opacity: 0 });
    expect(visibilityDisplay(zero, frame).earth.visible).toBe(false);
    const half = { ...on, opacity: { sun: 0.5, earth: 0.8 } };
    expect(visibilityDisplay(half, frame).sun).toEqual({ visible: true, opacity: 0.5 });
    // The hidden target contributes nothing, whatever its own opacity.
    expect(visibilityDisplay(half, frame).earth.visible).toBe(false);
  });
});

describe('visibilityReadout', () => {
  const sample = (fraction: number) => ({
    fraction,
    percentage: fraction * 100,
    timeUTC: '2026-11-30T12:10:00Z',
  });
  const read = (s: ReturnType<typeof sample> | null, runtime = READY) =>
    visibilityReadout({ runtime, frame: '2026-11-30T12:10:00Z', hasPoint: true, sample: s });

  it('shows a value in whole percent with the grid and the sampled frame time', () => {
    expect(read(sample(0.3671875))).toEqual({
      main: 'Approx. visible disc: 37 %',
      detail: '9.6 km grid · 2026-11-30 12:10 UTC',
    });
    // The smallest non-zero step (1/128) still reads as more than nothing.
    expect(read(sample(1 / 128)).main).toBe('Approx. visible disc: 1 %');
  });

  it('rounds partial values to whole percent, halves up (values come in 1/128 steps)', () => {
    const cases: [number, string][] = [
      [3 / 128, '2'], // 2.34 %
      [16 / 128, '13'], // 12.5 %: exactly half, rounds up
      [43 / 128, '34'], // 33.59 %
      [48 / 128, '38'], // 37.5 %
      [63 / 128, '49'], // 49.22 %
      [64 / 128, '50'],
      [80 / 128, '63'], // 62.5 %
      [112 / 128, '88'], // 87.5 %
      [127 / 128, '99'], // 99.22 %: just under full never reads 100
      [1, '100'],
    ];
    for (const [fraction, pct] of cases) {
      expect(read(sample(fraction)).main).toBe(`Approx. visible disc: ${pct} %`);
    }
  });

  it('keeps 0 % as a value', () => {
    expect(read(sample(0)).main).toBe('Approx. visible disc: 0 %');
  });

  it('says No data outside the grid', () => {
    expect(read(null)).toEqual({ main: 'No data', detail: '9.6 km grid · 2026-11-30 12:10 UTC' });
  });

  it('shows the time of the frame it read, not the time asked for', () => {
    const older = { ...sample(0.5), timeUTC: '2026-11-30T12:00:00Z' };
    expect(read(older).detail).toBe('9.6 km grid · 2026-11-30 12:00 UTC');
  });

  it('says it is loading before the first frame is in', () => {
    const loading = { ...IDLE_RUNTIME, status: 'ready' as const, loading: true };
    expect(read(null, loading).main).toBe('Loading visibility…');
  });

  it('explains a missing frame, a missing point, and an unavailable layer', () => {
    expect(
      visibilityReadout({ runtime: READY, frame: null, hasPoint: true, sample: null }).main,
    ).toBe(NO_FRAME_TEXT);
    expect(
      visibilityReadout({ runtime: READY, frame: READY.appliedTime, hasPoint: false, sample: null })
        .main,
    ).toMatch(/Point at the south pole/);
    expect(
      visibilityReadout({
        runtime: { ...IDLE_RUNTIME, status: 'unavailable' },
        frame: '2026-11-30T12:10:00Z',
        hasPoint: true,
        sample: null,
      }).main,
    ).toMatch(/unavailable/);
  });
});

describe('frameLine', () => {
  it('names the applied frame, and keeps it while a new one loads', () => {
    expect(frameLine('2026-11-30T12:10:00Z', READY)).toBe('Frame shown: 2026-11-30 12:10 UTC');
    expect(frameLine('2026-11-30T12:20:00Z', { ...READY, loading: true })).toBe(
      'Frame shown: 2026-11-30 12:10 UTC · loading the new frame…',
    );
    expect(frameLine('2026-11-30T12:20:00Z', { ...READY, appliedTime: null, loading: true })).toBe(
      'Loading visibility frame…',
    );
    expect(frameLine(null, READY)).toBe(NO_FRAME_TEXT);
    expect(NO_FRAME_TEXT).toBe('No frame for this time (frames: 24 Nov–8 Dec 2026 UTC)');
  });
});

describe('readingSource', () => {
  it('follows the visibility target last switched on or picked', () => {
    expect(readingSource('slope', ['sun', 'earth'], 'earth')).toEqual({
      kind: 'visibility',
      target: 'earth',
    });
    // The preferred target was switched off: the other shown one.
    expect(readingSource('slope', ['sun'], 'earth')).toEqual({ kind: 'visibility', target: 'sun' });
  });

  it('follows the map layer when that was the last choice, or when no target is shown', () => {
    expect(readingSource('slope', ['sun'], null)).toEqual({ kind: 'map', id: 'slope' });
    expect(readingSource('slope', [], 'sun')).toEqual({ kind: 'map', id: 'slope' });
    expect(readingSource(null, ['earth'], null)).toEqual({ kind: 'visibility', target: 'earth' });
    expect(readingSource(null, [], null)).toBeNull();
  });
});

describe('applyVisibilityDisplay', () => {
  const settings = { ...INITIAL_VISIBILITY, on: true, started: true };
  function run(display: ReturnType<typeof visibilityDisplay>) {
    const controller = { setVisible: vi.fn(), setOpacity: vi.fn() };
    const requester = { request: vi.fn(), stop: vi.fn() };
    applyVisibilityDisplay(controller, requester, display);
    return { controller, requester };
  }

  it('shows the chosen overlay and hides the other, each at its own opacity', () => {
    const sun = run(
      visibilityDisplay(
        { ...settings, opacity: { sun: 0.6, earth: 0.35 } },
        '2026-11-24T00:00:00Z',
      ),
    );
    expect(sun.controller.setVisible.mock.calls).toEqual([
      ['sun', true],
      ['earth', false],
    ]);
    expect(sun.controller.setOpacity.mock.calls).toEqual([
      ['sun', 0.6],
      ['earth', 0.35],
    ]);
    expect(sun.requester.request).toHaveBeenCalledWith('2026-11-24T00:00:00Z');

    // Switching to the Earth: the Sun hides, and both opacities are kept as they were.
    const earth = run(
      visibilityDisplay(
        { ...settings, active: 'earth', opacity: { sun: 0.6, earth: 0.35 } },
        '2026-11-24T00:00:00Z',
      ),
    );
    expect(earth.controller.setVisible.mock.calls).toEqual([
      ['sun', false],
      ['earth', true],
    ]);
    expect(earth.controller.setOpacity.mock.calls).toEqual([
      ['sun', 0.6],
      ['earth', 0.35],
    ]);
  });

  it('hides both and asks for nothing without a frame', () => {
    const none = run(visibilityDisplay(settings, null));
    expect(none.controller.setVisible.mock.calls).toEqual([
      ['sun', false],
      ['earth', false],
    ]);
    expect(none.requester.request).not.toHaveBeenCalled();
  });
});

describe('raiseOverlayToTop', () => {
  /** A stand-in for Cesium's ImageryLayerCollection: first is drawn lowest. */
  function stack(names: string[]) {
    const order = [...names];
    return {
      order,
      contains: (layer: string) => order.includes(layer),
      raiseToTop: (layer: string) => {
        order.splice(order.indexOf(layer), 1);
        order.push(layer);
      },
    };
  }

  it('puts the overlay above elevation and slope, whatever came first', () => {
    // A frame applied before slope was switched on, then slope raised itself to the top.
    const layers = stack(['basemap', 'sun-frame', 'earth-frame', 'elevation', 'slope']);
    raiseOverlayToTop(layers, ['sun-frame', 'earth-frame']);
    expect(layers.order).toEqual(['basemap', 'elevation', 'slope', 'sun-frame', 'earth-frame']);
    // Running it again changes nothing.
    raiseOverlayToTop(layers, ['sun-frame', 'earth-frame']);
    expect(layers.order).toEqual(['basemap', 'elevation', 'slope', 'sun-frame', 'earth-frame']);
  });

  it('skips layers that are missing or already removed', () => {
    const layers = stack(['basemap', 'sun-frame', 'slope']);
    raiseOverlayToTop(layers, [undefined, 'old-frame', 'sun-frame']);
    expect(layers.order).toEqual(['basemap', 'slope', 'sun-frame']);
  });
});

describe('createFrameRequester', () => {
  /** A load whose promise the test settles by hand. */
  function manualLoads() {
    const calls: {
      stamp: string;
      settle: (applied: boolean) => void;
      fail: (e: unknown) => void;
    }[] = [];
    const load = (stamp: string) =>
      new Promise<boolean>((resolve, reject) => {
        calls.push({ stamp, settle: resolve, fail: reject });
      });
    return { calls, load };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('loads one frame at a time, then only the newest one asked for meanwhile', async () => {
    const { calls, load } = manualLoads();
    const report = vi.fn();
    const requester = createFrameRequester(load, report);
    requester.request('A');
    requester.request('B');
    requester.request('C');
    expect(calls.map((call) => call.stamp)).toEqual(['A']);
    calls[0]?.settle(true);
    await flush();
    expect(calls.map((call) => call.stamp)).toEqual(['A', 'C']);
    calls[1]?.settle(true);
    await flush();
    expect(report).toHaveBeenLastCalledWith({ loading: false, failed: false });
    // The frame already applied is not loaded again.
    requester.request('C');
    expect(calls).toHaveLength(2);
  });

  it('is quiet about aborts and superseded loads, and reports a real failure', async () => {
    const { calls, load } = manualLoads();
    const report = vi.fn();
    const requester = createFrameRequester(load, report);
    requester.request('A');
    calls[0]?.fail(new DOMException('aborted', 'AbortError'));
    await flush();
    expect(report).toHaveBeenLastCalledWith({ loading: false, failed: false });
    requester.request('B');
    calls[1]?.settle(false);
    await flush();
    expect(report).toHaveBeenLastCalledWith({ loading: false, failed: false });
    requester.request('C');
    calls[2]?.fail(new Error('Numerical grid request failed: 500'));
    await flush();
    expect(report).toHaveBeenLastCalledWith({ loading: false, failed: true });
    // A failed or superseded frame can be asked for again.
    requester.request('B');
    expect(calls[3]?.stamp).toBe('B');
  });

  it('reports nothing after it is stopped', async () => {
    const { calls, load } = manualLoads();
    const report = vi.fn();
    const requester = createFrameRequester(load, report);
    requester.request('A');
    requester.request('B');
    requester.stop();
    report.mockClear();
    calls[0]?.settle(true);
    await flush();
    expect(report).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('recognises abort errors only', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
