import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MINUTE_MS,
  TIME_MAX_MS,
  clampTime,
  dayCentre,
  floorToMinute,
  rangeAround,
  recentre,
} from '../../utils/time';
import { PLAY_SPEEDS, TimeContext, type PlaySpeedId, type TimeApi } from './timeContext';

/** Playback advances the clock this often (real time). */
const PLAY_TICK_MS = 100;

/**
 * Owns the app's one time. Live mode reads the real clock and updates on each new minute; any
 * manual change freezes it as simulated time, which playback can then advance.
 */
export function TimeProvider({
  children,
  initialTime,
}: {
  children: ReactNode;
  /** A shared link's exact time: the app opens simulated at that moment instead of live. */
  initialTime?: number;
}) {
  const [time, setTimeState] = useState(() =>
    initialTime === undefined ? floorToMinute(Date.now()) : clampTime(initialTime),
  );
  const [mode, setMode] = useState<'live' | 'simulated'>(
    initialTime === undefined ? 'live' : 'simulated',
  );
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeedId>('6h');
  const [editorOpen, setEditorOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  /** Where the current playback stops, if it was started with one. */
  const stopAtRef = useRef<number | null>(null);

  // The range follows the time's day; while the slider is dragged it stays put (unless the time
  // leaves it), so the track does not slide under the pointer.
  const [scrubbing, setScrubbing] = useState(false);
  const [centre, setCentre] = useState(() => dayCentre(time));
  const wantedCentre = scrubbing ? recentre(centre, time) : dayCentre(time);
  if (wantedCentre !== centre) setCentre(wantedCentre);
  const range = useMemo(() => rangeAround(wantedCentre), [wantedCentre]);

  // Live: tick on each minute boundary.
  useEffect(() => {
    if (mode !== 'live') return undefined;
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      setTimeState(floorToMinute(now));
      timer = window.setTimeout(tick, MINUTE_MS - (now % MINUTE_MS) + 50);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [mode]);

  // Playback: advance simulated time, the range following it a day at a time; stop at its stop
  // time if it was started with one, or at the clock's last moment (2100).
  useEffect(() => {
    if (!playing) return undefined;
    const step = (PLAY_SPEEDS.find((entry) => entry.id === speed)?.msPerSecond ?? 0) / 10;
    const timer = window.setInterval(() => {
      setTimeState((current) => {
        const end = Math.min(TIME_MAX_MS, stopAtRef.current ?? TIME_MAX_MS);
        const next = Math.min(clampTime(current + step), Math.max(current, end));
        if (next >= end) setPlayingState(false);
        return next;
      });
    }, PLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, speed]);

  const setTime = useCallback((ms: number) => {
    setMode('simulated');
    setTimeState(clampTime(ms));
  }, []);

  const stepBy = useCallback((ms: number) => {
    setMode('simulated');
    setTimeState((current) => clampTime(current + ms));
  }, []);

  const goLive = useCallback(() => {
    setPlayingState(false);
    setMode('live');
    setTimeState(floorToMinute(Date.now()));
  }, []);

  const setPlaying = useCallback((next: boolean, until?: number) => {
    stopAtRef.current = next ? (until ?? null) : null;
    if (next) setMode('simulated');
    setPlayingState(next);
  }, []);

  const openEditor = useCallback((opener: HTMLElement | null) => {
    openerRef.current = opener;
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    openerRef.current?.focus();
  }, []);

  const api = useMemo<TimeApi>(
    () => ({
      time,
      range,
      setScrubbing,
      mode,
      playing,
      speed,
      setTime,
      stepBy,
      goLive,
      setPlaying,
      setSpeed,
      editorOpen,
      openEditor,
      closeEditor,
    }),
    [
      time,
      range,
      mode,
      playing,
      speed,
      setTime,
      stepBy,
      goLive,
      setPlaying,
      editorOpen,
      openEditor,
      closeEditor,
    ],
  );

  return <TimeContext.Provider value={api}>{children}</TimeContext.Provider>;
}
