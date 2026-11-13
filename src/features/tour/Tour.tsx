import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { joinClassNames } from '../../utils/classNames';
import { stepDurationMs } from './demoSteps';
import type { TourStep } from './tourSteps';
import styles from './Tour.module.css';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const CARD_WIDTH = 288;
const GAP = 14;

/** Where the card goes: beside the target if there is room, else below or above it. */
function cardPosition(box: Box | null): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Phones: an open sidebar fills the screen, so the card docks to the bottom, clear of the target.
  if (vw < 600) return { top: vh - 172, left: 12 };
  if (!box) return { top: vh / 2 - 80, left: vw / 2 - CARD_WIDTH / 2 };
  const clampLeft = (left: number) => Math.min(vw - CARD_WIDTH - 12, Math.max(12, left));
  const clampTop = (top: number) => Math.min(vh - 180, Math.max(12, top));
  if (box.left + box.width + GAP + CARD_WIDTH < vw) {
    return { top: clampTop(box.top), left: box.left + box.width + GAP };
  }
  if (box.left - GAP - CARD_WIDTH > 0) {
    return { top: clampTop(box.top), left: box.left - GAP - CARD_WIDTH };
  }
  if (box.top > vh / 2) return { top: clampTop(box.top - 170), left: clampLeft(box.left) };
  return { top: clampTop(box.top + box.height + GAP), left: clampLeft(box.left) };
}

interface TourProps {
  steps: readonly TourStep[];
  step: number;
  onStepChange: (step: number) => void;
  /** Skip, Escape or Done. */
  onClose: () => void;
  /**
   * "tour": a dimmed page and a card beside what it points at, stepped by hand.
   * "demo": the page stays bright; a ring marks the target, a caption bar sits at the bottom,
   * and the steps play on their own until paused.
   */
  mode?: 'tour' | 'demo';
  /** Tour only: on the last step, offer the demo. */
  onWatchDemo?: () => void;
  /** Demo only: a click anywhere in the app outside the caption bar ends it where it is. */
  onInterrupt?: () => void;
  /** Demo only: Done on the last step (Skip and Escape still use onClose). */
  onDone?: () => void;
  /**
   * Demo only: false while the app is still catching up with a step (a re-rank, a camera
   * flight). The step's timer starts once it is true, so nothing advances before it is shown.
   */
  ready?: boolean;
  /** Demo only: where the caption bar goes (the map's free middle, above the time bar). */
  captionHost?: HTMLElement | null;
  /** Demo only: the caption bar's name ("Demo", "Landing replay") and its data tag. */
  label?: string;
  tag?: string;
  /** Demo only: more under the caption for this step (the replay's result card). */
  detail?: ReactNode;
  /** Demo only: Pause or Play was pressed (the app pauses its playback and animations too). */
  onPauseChange?: (paused: boolean) => void;
}

/**
 * The guided overlay for both the first-run tour and "Watch demo": one step list at a time, a
 * spotlight or ring on its target, Escape or Skip to end. One component, so the two share their
 * caption, keyboard and ending rules.
 */
export function Tour({
  steps,
  step,
  onStepChange,
  onClose,
  mode = 'tour',
  onWatchDemo,
  onInterrupt,
  onDone,
  ready = true,
  captionHost = null,
  label = 'Demo',
  tag = 'DEMO',
  detail = null,
  onPauseChange,
}: TourProps) {
  const demo = mode === 'demo';
  const current = steps[step];
  const [box, setBox] = useState<Box | null>(null);
  const [paused, setPaused] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  const last = step === steps.length - 1;

  // Measure the target now and again once a sidebar has finished sliding in. The demo first
  // scrolls it into view, since it may sit lower in a sidebar.
  useLayoutEffect(() => {
    if (!current) return undefined;
    const measure = () => {
      const element = current.target
        ? document.querySelector(`[data-tour="${current.target}"]`)
        : null;
      const rect = element?.getBoundingClientRect();
      const visible = rect && rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth;
      setBox(
        visible
          ? {
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }
          : null,
      );
    };
    if (demo && current.target) {
      document
        .querySelector(`[data-tour="${current.target}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
    }
    measure();
    const timer = window.setTimeout(measure, 400);
    // A sidebar, panel or time bar that slides moves the target: measure again when it stops.
    let frame = 0;
    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', remeasure);
    document.addEventListener('transitionend', remeasure, true);
    // And whenever the target itself changes size (a full-height rail as the window settles).
    const target = current.target
      ? document.querySelector(`[data-tour="${current.target}"]`)
      : null;
    const observer =
      target && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
    if (target) observer?.observe(target);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', remeasure);
      document.removeEventListener('transitionend', remeasure, true);
    };
  }, [current, demo]);

  useEffect(() => {
    nextRef.current?.focus();
  }, [step]);

  // Escape ends it wherever focus is.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // The demo plays on its own, a step at a time, until paused; the last step waits for Done.
  // Each step gets its reading time (stepDurationMs); Pause keeps what is left of it, and Play
  // carries on from there. The handler is read from a ref, so the app re-rendering (the clock,
  // playback) never restarts the timer.
  const stepMs = current ? stepDurationMs(current) : 0;
  const remainingRef = useRef({ step: -1, ms: 0 });
  const stepChangeRef = useRef(onStepChange);
  useEffect(() => {
    stepChangeRef.current = onStepChange;
  });
  useEffect(() => {
    if (!demo || last) return undefined;
    if (remainingRef.current.step !== step) remainingRef.current = { step, ms: stepMs };
    if (paused || !ready) return undefined;
    const left = remainingRef.current;
    const started = Date.now();
    const timer = window.setTimeout(() => stepChangeRef.current(step + 1), left.ms);
    return () => {
      window.clearTimeout(timer);
      left.ms = Math.max(0, left.ms - (Date.now() - started));
    };
  }, [demo, paused, last, step, ready, stepMs]);
  const togglePause = () => {
    setPaused(!paused);
    onPauseChange?.(!paused);
  };

  // A click in the app (not on the caption bar) ends the demo and leaves the app as it is. A
  // click that starts the demo again (marked data-demo-start) is left to restart it, so the
  // state from before the first start is still what Skip puts back.
  useEffect(() => {
    if (!demo || !onInterrupt) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && barRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-demo-start]')) return;
      onInterrupt();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [demo, onInterrupt]);

  if (!current) return null;

  if (demo) {
    const bar = (
      <div
        ref={barRef}
        className={joinClassNames(styles.captionBar, captionHost && styles.hosted)}
        role="region"
        aria-label={label}
        aria-describedby={textId}
      >
        <p className={styles.barCount}>
          Step {step + 1} of {steps.length} <span className={styles.demoTag}>{tag}</span>
        </p>
        {/* Read out as it changes; the new step replaces the old one without motion. */}
        <div id={textId} className={styles.captionText} aria-live="polite">
          {current.title ? <p className={styles.title}>{current.title}</p> : null}
          <p className={styles.caption}>{current.text}</p>
        </div>
        {detail}
        {/* How long the step has left: it runs while the step's timer runs, and holds while
            paused or while the app catches up. The last step waits for Done, so it has none. */}
        {last ? null : (
          <div className={styles.progress} aria-hidden="true">
            <span
              key={step}
              className={styles.progressFill}
              data-running={!paused && ready}
              style={{ '--step-ms': `${stepMs}ms` } as CSSProperties}
            />
          </div>
        )}
        <div className={styles.barActions}>
          <button type="button" className={styles.skip} onClick={onClose}>
            Skip
          </button>
          <span className={styles.nav}>
            <button
              type="button"
              className={styles.secondary}
              disabled={step === 0}
              onClick={() => onStepChange(step - 1)}
            >
              Back
            </button>
            <button
              type="button"
              className={styles.secondary}
              aria-pressed={paused}
              onClick={togglePause}
            >
              {paused ? 'Play' : 'Pause'}
            </button>
            <button
              ref={nextRef}
              type="button"
              className={styles.primary}
              onClick={() => (last ? (onDone ?? onClose)() : onStepChange(step + 1))}
            >
              {last ? 'Done' : 'Next'}
            </button>
          </span>
        </div>
      </div>
    );
    return (
      <>
        <div className={styles.layer}>
          {box ? (
            <div
              className={styles.ring}
              style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
              aria-hidden="true"
            />
          ) : null}
          {captionHost ? null : bar}
        </div>
        {captionHost ? createPortal(bar, captionHost) : null}
      </>
    );
  }

  const position = cardPosition(box);
  return (
    <div className={styles.layer}>
      {box ? (
        <div
          className={styles.spotlight}
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          aria-hidden="true"
        />
      ) : (
        <div className={styles.dim} aria-hidden="true" />
      )}
      <div
        className={styles.card}
        style={{
          top: position.top,
          left: position.left,
          width: Math.min(CARD_WIDTH, window.innerWidth - 24),
        }}
        // Not modal: the app behind stays usable (the layer lets clicks through), so screen
        // readers must not be told the rest of the page is out of reach.
        role="dialog"
        aria-label="Tour"
        aria-describedby={textId}
      >
        <p className={styles.count}>
          {step + 1} of {steps.length}
        </p>
        <p id={textId} className={styles.text}>
          {current.text}
        </p>
        {last && onWatchDemo ? (
          <button
            type="button"
            className={joinClassNames(styles.secondary, styles.offer)}
            onClick={onWatchDemo}
          >
            Watch the short demo
          </button>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.skip} onClick={onClose}>
            Skip tour
          </button>
          <span className={styles.nav}>
            {step > 0 ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => onStepChange(step - 1)}
              >
                Back
              </button>
            ) : null}
            <button
              ref={nextRef}
              type="button"
              className={styles.primary}
              onClick={() => (last ? onClose() : onStepChange(step + 1))}
            >
              {last ? 'Done' : 'Next'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
