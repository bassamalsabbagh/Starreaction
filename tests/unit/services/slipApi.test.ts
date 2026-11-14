import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLIP_ENDPOINT, readSlipText } from '../../../src/services/slipApi';

const READING = {
  missionName: null,
  shift: { shift: 3, unit: 'weeks' },
  date: null,
  range: null,
  powerDays: null,
  minSunDeg: null,
  minEarthDeg: null,
  relay: null,
  question: null,
  unclear: [],
};

function reply(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('readSlipText', () => {
  it('posts only the trimmed text and returns the checked reading', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply({ reading: READING }));
    const result = await readSlipText('  Launch slipped 3 weeks  ', { fetchImpl });
    expect(result).toEqual({ kind: 'ok', reading: READING });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(SLIP_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Launch slipped 3 weeks' });
  });

  it('never sends text over 500 characters', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await readSlipText('x'.repeat(501), { fetchImpl })).toEqual({ kind: 'tooLong' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a 413 from the server as too long', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply({ error: 'too_long' }, 413));
    expect(await readSlipText('text', { fetchImpl })).toEqual({ kind: 'tooLong' });
  });

  it.each([
    ['a server error', async () => reply({ error: 'unavailable' }, 502)],
    ['no key on the server', async () => reply({ error: 'unavailable' }, 503)],
    ['no server (dev server 404)', async () => new Response('Not found', { status: 404 })],
    [
      'broken JSON',
      async () => new Response('<!doctype html><p>oops', { status: 200, headers: {} }),
    ],
    ['a reply without a reading', async () => reply({ answer: READING })],
    ['a malformed reading', async () => reply({ reading: { ...READING, powerDays: 'six' } })],
    [
      'a reading with an invented field',
      async () => reply({ reading: { ...READING, newDate: '2026-12-06' } }),
    ],
    [
      'no network',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('turns %s into "unavailable"', async (_label, answer) => {
    const fetchImpl = vi.fn<typeof fetch>(answer);
    expect(await readSlipText('Launch slipped 3 weeks', { fetchImpl })).toEqual({
      kind: 'unavailable',
    });
  });

  it('gives up after the time limit (22 s by default)', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    const pending = readSlipText('Launch slipped 3 weeks', { fetchImpl });
    await vi.advanceTimersByTimeAsync(21_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ kind: 'unavailable' });
  });
});
