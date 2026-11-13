import { createContext, useContext } from 'react';
import { DAY_MS, HOUR_MS, type TimeRange } from '../../utils/time';

/** Playback speeds, in simulated milliseconds per real second. */
export const PLAY_SPEEDS = [
  { id: '1h', label: '1 h/s', hint: '1 hour of time per second', msPerSecond: HOUR_MS },
  { id: '6h', label: '6 h/s', hint: '6 hours of time per second', msPerSecond: 6 * HOUR_MS },
  { id: '1d', label: '1 day/s', hint: '1 day of time per second', msPerSecond: DAY_MS },
] as const;

export type PlaySpeedId = (typeof PLAY_SPEEDS)[number]['id'];

export interface TimeApi {
  /** The app's one shared time, UTC milliseconds. */
  time: number;
  /**
   * The time bar's 29.5 days, centred on the time's day: what the Sun and Earth shares, the
   * ranking and the landing windows are computed over. It holds still while the slider is dragged.
   */
  range: TimeRange;
  /** True while the slider is being dragged, so the range does not slide under the pointer. */
  setScrubbing: (scrubbing: boolean) => void;
  /** Live follows the real clock (once a minute); simulated is frozen or played by hand. */
  mode: 'live' | 'simulated';
  playing: boolean;
  speed: PlaySpeedId;
  /** Sets the time; any manual change switches to simulated. */
  setTime: (ms: number) => void;
  stepBy: (ms: number) => void;
  /** Back to live: the real time, playback stopped. */
  goLive: () => void;
  /** Starts or stops playback; with `until`, playback stops on that time (the landing replay). */
  setPlaying: (playing: boolean, until?: number) => void;
  setSpeed: (speed: PlaySpeedId) => void;
  /** The time editor popover, opened from the clock or the time bar's calendar button. */
  editorOpen: boolean;
  openEditor: (opener: HTMLElement | null) => void;
  /** Closes the editor and returns focus to whatever opened it. */
  closeEditor: () => void;
}

export const TimeContext = createContext<TimeApi | null>(null);

export function useTime(): TimeApi {
  const api = useContext(TimeContext);
  if (!api) throw new Error('useTime needs a TimeProvider');
  return api;
}
