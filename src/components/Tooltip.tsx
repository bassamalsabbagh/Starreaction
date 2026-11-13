import { useId, useState, type ReactNode } from 'react';
import { joinClassNames } from '../utils/classNames';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: ReactNode;
  /** Renders the trigger; spread `describedBy` onto it as aria-describedby. */
  children: (describedBy: string) => ReactNode;
  placement?: 'below' | 'above' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Hide the tooltip (e.g. while the trigger's popover is open). */
  suppressed?: boolean;
  className?: string;
}

/**
 * A small text tooltip on hover and keyboard focus. Escape dismisses it until the pointer or
 * focus leaves (WCAG 1.4.13). The text is also the trigger's accessible description.
 */
export function Tooltip({
  content,
  children,
  placement = 'below',
  align = 'center',
  suppressed = false,
  className,
}: TooltipProps) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className={joinClassNames(styles.wrap, className)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || dismissed || suppressed) return;
        // The first Escape only hides the tooltip; the next one reaches the app (closing a panel).
        setDismissed(true);
        event.stopPropagation();
      }}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className={joinClassNames(
          styles.tip,
          styles[placement],
          styles[align],
          (dismissed || suppressed) && styles.off,
        )}
      >
        {content}
      </span>
    </span>
  );
}
