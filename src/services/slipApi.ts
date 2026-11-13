/**
 * Asks the server function (api/slip.ts) to read a "launch slipped" text. Whatever goes wrong (no
 * server, no key, no network, a timeout, an error or a malformed reply) comes back as
 * "unavailable", never as a thrown error, so the Mission form can take over.
 */
import { SLIP_TEXT_MAX, readSlipReading, type SlipReading } from './slipReading';

export const SLIP_ENDPOINT = '/api/slip';
/** The whole call, the server's one retry included, gives up after this long. */
export const SLIP_TIMEOUT_MS = 22_000;

export type SlipResult =
  | { readonly kind: 'ok'; readonly reading: SlipReading }
  | { readonly kind: 'tooLong' }
  | { readonly kind: 'unavailable' };

export interface SlipCallOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  endpoint?: string;
}

const UNAVAILABLE: SlipResult = { kind: 'unavailable' };

export async function readSlipText(
  text: string,
  { fetchImpl, timeoutMs = SLIP_TIMEOUT_MS, endpoint = SLIP_ENDPOINT }: SlipCallOptions = {},
): Promise<SlipResult> {
  const trimmed = text.trim();
  if (trimmed === '') return UNAVAILABLE;
  if (trimmed.length > SLIP_TEXT_MAX) return { kind: 'tooLong' };
  const call = fetchImpl ?? globalThis.fetch;
  if (typeof call !== 'function') return UNAVAILABLE;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await call(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
    });
    if (response.status === 413) return { kind: 'tooLong' };
    if (!response.ok) return UNAVAILABLE;
    const body: unknown = await response.json();
    const reading =
      typeof body === 'object' && body !== null && 'reading' in body
        ? readSlipReading(body.reading)
        : null;
    return reading ? { kind: 'ok', reading } : UNAVAILABLE;
  } catch {
    // Offline, aborted by the time limit, or a reply that is not JSON.
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}
