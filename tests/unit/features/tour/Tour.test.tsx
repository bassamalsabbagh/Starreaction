import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Tour } from '../../../../src/features/tour/Tour';
import { DEMO_STEPS, stepDurationMs } from '../../../../src/features/tour/demoSteps';

const FIRST_STEP_MS = DEMO_STEPS[0] ? stepDurationMs(DEMO_STEPS[0]) : 0;

describe('Tour, demo mode: step timing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('6. waits until the app is ready before the next step, then gives it its full time', () => {
    vi.useFakeTimers();
    const onStepChange = vi.fn();
    const { rerender } = render(
      <Tour
        mode="demo"
        steps={DEMO_STEPS}
        step={0}
        onStepChange={onStepChange}
        onClose={() => {}}
        ready={false}
      />,
    );
    // Still catching up (a camera flight, a re-rank): no advance, however long it takes.
    act(() => {
      vi.advanceTimersByTime(FIRST_STEP_MS * 3);
    });
    expect(onStepChange).not.toHaveBeenCalled();
    rerender(
      <Tour
        mode="demo"
        steps={DEMO_STEPS}
        step={0}
        onStepChange={onStepChange}
        onClose={() => {}}
        ready
      />,
    );
    act(() => {
      vi.advanceTimersByTime(FIRST_STEP_MS - 1);
    });
    expect(onStepChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStepChange).toHaveBeenCalledWith(1);
  });
});
