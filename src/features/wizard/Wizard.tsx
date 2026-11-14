import { useEffect, useId, useRef, type ReactNode } from 'react';
import { joinClassNames } from '../../utils/classNames';
import { WIZARD_STEPS, canOpen, stepComplete, type WizardInputs } from './wizardSteps';
import styles from './Wizard.module.css';

interface WizardProps {
  step: number;
  onStep: (step: number) => void;
  inputs: WizardInputs;
  /** Why Next is blocked on this step, shown under the buttons. */
  blockedText: string | null;
  /** A heading override for the current step (the defaults are in WIZARD_STEPS). */
  title?: string;
  children: ReactNode;
}

/**
 * The left panel as four steps: a stepper (completed steps can be opened again), the step's
 * heading, its content, and Back / Next. Back keeps every entered value (the values live in the
 * app); Next waits until the step's input is valid. The heading takes the focus on each new step.
 */
export function Wizard({ step, onStep, inputs, blockedText, title, children }: WizardProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const current = WIZARD_STEPS[step] ?? WIZARD_STEPS[0];
  const complete = stepComplete(step, inputs);
  const last = step === WIZARD_STEPS.length - 1;

  return (
    <section className={styles.wizard} aria-labelledby={headingId}>
      <nav aria-label="Steps">
        <ol className={styles.stepper}>
          {WIZARD_STEPS.map((item, index) => {
            const open = canOpen(index, inputs);
            const here = index === step;
            return (
              <li key={item.id} className={styles.stepItem}>
                <button
                  type="button"
                  className={joinClassNames(
                    styles.stepButton,
                    here && styles.stepCurrent,
                    !here && index < step && styles.stepDone,
                  )}
                  aria-current={here ? 'step' : undefined}
                  disabled={!open}
                  onClick={() => onStep(index)}
                >
                  <span className={styles.stepNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className={styles.stepLabel}>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <p className={styles.announce} aria-live="polite">
        Step {step + 1} of {WIZARD_STEPS.length}: {current.label}
      </p>

      <h2 id={headingId} ref={headingRef} className={styles.title} tabIndex={-1}>
        {title ?? current.title}
      </h2>

      <div className={styles.body}>{children}</div>

      <div className={styles.nav}>
        <button
          type="button"
          className={styles.back}
          disabled={step === 0}
          onClick={() => onStep(step - 1)}
        >
          Back
        </button>
        {last ? null : (
          <button
            type="button"
            className={styles.next}
            disabled={!complete}
            aria-describedby={!complete && blockedText ? `${headingId}-blocked` : undefined}
            onClick={() => onStep(step + 1)}
          >
            Next
          </button>
        )}
      </div>
      {!complete && blockedText ? (
        <p id={`${headingId}-blocked`} className={styles.blocked}>
          {blockedText}
        </p>
      ) : null}
    </section>
  );
}
