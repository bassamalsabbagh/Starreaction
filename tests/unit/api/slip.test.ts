import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import slipFunction, {
  DEFAULT_MODEL,
  SLIP_SCHEMA,
  SLIP_TEXT_MAX,
  handleSlip,
} from '../../../api/slip';
import { SLIP_FIELDS, SLIP_TEXT_MAX as CLIENT_TEXT_MAX } from '../../../src/services/slipReading';

const SITE = 'https://starreaction.example';
const KEY = 'test-key-not-real-1234567890';
const TEXT = 'Launch slipped 3 weeks and we now need 6 days of power.';

const READING = {
  missionName: null,
  shift: { shift: 3, unit: 'weeks' },
  date: null,
  powerDays: 6,
  minSunDeg: null,
  minEarthDeg: null,
  relay: null,
  question: null,
  unclear: [],
};

function request(
  body: unknown = { text: TEXT },
  { method = 'POST', origin = SITE, type = 'application/json' } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': type };
  if (origin) headers.Origin = origin;
  return new Request(`${SITE}/api/slip`, {
    method,
    headers,
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A Gemini generateContent reply carrying `text` as the model's answer. */
function gemini(text: string, { finishReason = 'STOP', status = 200, extra = {} } = {}) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }],
      ...extra,
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

const env = { apiKey: KEY };

let logs: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  // The function never logs or keeps what the user typed.
  for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

async function errorOf(response: Response) {
  return { status: response.status, body: (await response.json()) as unknown };
}

describe('api/slip: what it accepts', () => {
  it('keeps the same fields and text limit as the browser', () => {
    expect(SLIP_SCHEMA.required).toEqual([...SLIP_FIELDS]);
    expect(Object.keys(SLIP_SCHEMA.properties)).toEqual([...SLIP_FIELDS]);
    expect(SLIP_TEXT_MAX).toBe(CLIENT_TEXT_MAX);
    expect(typeof slipFunction.fetch).toBe('function');
  });

  it.each([
    ['a GET', request(undefined, { method: 'GET' }), 405],
    ['no Origin', request(undefined, { origin: '' }), 403],
    ['another site', request(undefined, { origin: 'https://elsewhere.example' }), 403],
    ['not JSON', request('text=hi', { type: 'text/plain' }), 415],
    ['broken JSON', request('{"text": "hi"'), 400],
    ['an extra field', request({ text: TEXT, missionName: 'Mission B' }), 400],
    ['text that is not a string', request({ text: 42 }), 400],
    ['empty text', request({ text: '   ' }), 400],
    ['text over 500 characters', request({ text: 'x'.repeat(501) }), 413],
    ['a body over 4 KB', request({ text: 'x'.repeat(5000) }), 413],
  ])('rejects %s without calling Gemini', async (_label, incoming, status) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const response = await handleSlip(incoming, env, fetchImpl);
    expect(response.status).toBe(status);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is unavailable without a key, and never calls Gemini', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await errorOf(await handleSlip(request(), {}, fetchImpl))).toEqual({
      status: 503,
      body: { error: 'unavailable' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('api/slip: the call to Gemini', () => {
  it('sends the key in a header (never the URL), the schema and the text, and returns the reading', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => gemini(JSON.stringify(READING)));
    const response = await handleSlip(request({ text: `  ${TEXT}  ` }), env, fetchImpl);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ reading: READING });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`,
    );
    expect(String(url)).not.toContain(KEY);
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(KEY);
    const sent = JSON.parse(String(init?.body)) as {
      contents: { parts: { text: string }[] }[];
      generationConfig: Record<string, unknown>;
      systemInstruction: { parts: { text: string }[] };
    };
    expect(sent.contents[0]?.parts[0]?.text).toBe(TEXT);
    expect(sent.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: SLIP_SCHEMA,
      thinkingConfig: { thinkingLevel: 'minimal' },
    });
    expect(sent.systemInstruction.parts[0]?.text).toMatch(/Never use your own knowledge/);
  });

  it('lets the AI name only the five kinds of question the app answers, never an answer', () => {
    const question = SLIP_SCHEMA.properties.question.anyOf[0];
    expect(question?.properties.about.enum).toEqual([
      'when',
      'where',
      'sunlight',
      'earth',
      'passes',
    ]);
    expect(question?.additionalProperties).toBe(false);
  });

  it('uses GEMINI_MODEL when set', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => gemini(JSON.stringify(READING)));
    await handleSlip(request(), { apiKey: KEY, model: 'gemini-3.5-flash-lite' }, fetchImpl);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/models/gemini-3.5-flash-lite:generateContent',
    );
  });

  it("skips the model's thought parts", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'Thinking: maybe 9 days?', thought: true },
                    { text: JSON.stringify(READING) },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const response = await handleSlip(request(), env, fetchImpl);
    expect(await response.json()).toEqual({ reading: READING });
  });

  it.each([
    ['broken JSON', gemini('{"missionName": null, "shift":')],
    ['a missing field', gemini(JSON.stringify({ ...READING, relay: undefined }))],
    ['an invented field', gemini(JSON.stringify({ ...READING, launchDate: '2026-12-06' }))],
    ['a cut-off reply', gemini(JSON.stringify(READING), { finishReason: 'MAX_TOKENS' })],
    ['a safety stop', gemini(JSON.stringify(READING), { finishReason: 'SAFETY' })],
    [
      'a blocked prompt',
      new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }),
    ],
    ['an empty reply', new Response('{}', { status: 200 })],
    ['a reply that is not JSON', new Response('<html>', { status: 200 })],
    ['rate limited (429)', gemini('', { status: 429 })],
    ['a bad request (400)', gemini('', { status: 400 })],
  ])('turns %s into 502, without a retry', async (_label, answer) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => answer);
    expect(await errorOf(await handleSlip(request(), env, fetchImpl))).toEqual({
      status: 502,
      body: { error: 'unavailable' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries once after a server error, then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(gemini('', { status: 503 }))
      .mockResolvedValueOnce(gemini(JSON.stringify(READING)));
    const response = await handleSlip(request(), env, fetchImpl);
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after two failed attempts (timeouts or no network)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    expect(await errorOf(await handleSlip(request(), env, fetchImpl))).toEqual({
      status: 504,
      body: { error: 'unavailable' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry when too little of the 20 seconds is left', async () => {
    let clock = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      clock += 18_000;
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const response = await handleSlip(request(), env, fetchImpl, () => clock);
    expect(response.status).toBe(504);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives each attempt only the time that is left', async () => {
    let clock = 0;
    const timeouts: boolean[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      timeouts.push(init?.signal instanceof AbortSignal);
      clock += 3_000;
      return gemini('', { status: 500 });
    });
    await handleSlip(request(), env, fetchImpl, () => clock);
    expect(timeouts).toEqual([true, true]);
  });
});

describe('api/slip: the outcome log', () => {
  async function logged(answers: Response[], clockStep = 0) {
    let clock = 0;
    const lines: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      clock += clockStep;
      const next = answers.shift();
      if (!next) throw new DOMException('The operation timed out.', 'TimeoutError');
      return next;
    });
    const response = await handleSlip(
      request(),
      env,
      fetchImpl,
      () => clock,
      (line) => {
        lines.push(line);
      },
    );
    return { status: response.status, lines };
  }

  it('writes one line with the status, each try and the time, never the text', async () => {
    const { status, lines } = await logged([gemini('', { status: 503 })], 4_000);
    expect(status).toBe(504);
    expect(lines).toEqual([
      `slip 504 model=${DEFAULT_MODEL} tries=[status 503 4000ms, timeout 4000ms] ms=8000`,
    ]);
    for (const word of ['Launch', 'slipped', 'weeks', 'power']) {
      expect(lines.join(' ')).not.toContain(word);
    }
  });

  it('names the stop reason when a reply has no answer', async () => {
    const { lines } = await logged([gemini('', { finishReason: 'MAX_TOKENS' })]);
    expect(lines[0]).toContain('tries=[stopped MAX_TOKENS 0ms]');
  });

  it('logs a success', async () => {
    const { status, lines } = await logged([gemini(JSON.stringify(READING))]);
    expect(status).toBe(200);
    expect(lines[0]).toMatch(/^slip 200 .* tries=\[ok 0ms\]/);
  });

  it('logs nothing for a request turned away before Gemini', async () => {
    const lines: string[] = [];
    await handleSlip(request({ text: '' }), env, fetch, Date.now, (line) => lines.push(line));
    expect(lines).toEqual([]);
  });
});
