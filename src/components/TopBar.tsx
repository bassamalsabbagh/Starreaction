import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import markUrl from '../assets/starreaction-mark.png';
import { DEMO_NOTICE } from '../data/demoData';
import { Tooltip } from './Tooltip';
import styles from './TopBar.module.css';

interface TopBarProps {
  brand: string;
  /** The site title, centred at the top ("CLPS Lander Advisor"). */
  product: string;
  /** Opens the About panel on a tab; the button that opened it gets focus back on close. */
  onOpenAbout: (tab: 'about' | 'credits', opener: HTMLElement) => void;
  /** After the logo: where you are ("Moon › lander › site"). */
  breadcrumb?: ReactNode;
}

/**
 * The top row over the full-screen Moon: the logo, name and breadcrumb on the left, the site title
 * quietly centred, the DEMO pill on the right (About is on the menu rail). The row itself lets the map through.
 */
export function TopBar({ brand, product, onOpenAbout, breadcrumb }: TopBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const crowded = useCrowdedTitle(barRef, leftRef, titleRef, rightRef);
  return (
    <header ref={barRef} className={styles.bar}>
      <div ref={leftRef} className={styles.cluster}>
        <p className={styles.brand}>
          <img
            className={styles.mark}
            src={markUrl}
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          <span className={styles.brandName}>{brand}</span>
        </p>
        {breadcrumb}
      </div>
      <h1 ref={titleRef} className={styles.title} data-crowded={crowded}>
        <span className="visually-hidden">{brand} · </span>
        {product}
      </h1>
      <div ref={rightRef} className={styles.cluster}>
        <Tooltip content={DEMO_NOTICE} align="end">
          {(describedBy) => (
            <button
              type="button"
              className={styles.demo}
              aria-describedby={describedBy}
              onClick={(event) => onOpenAbout('credits', event.currentTarget)}
            >
              <span className={styles.demoDot} aria-hidden="true" />
              Data: Demo
            </button>
          )}
        </Tooltip>
      </div>
    </header>
  );
}

/** The clear space the centred title keeps from either cluster, in px. */
const TITLE_CLEARANCE_PX = 24;

/**
 * Whether the centred title would come within TITLE_CLEARANCE_PX of the breadcrumb or the DEMO
 * pill. Measured, not guessed from the window width, since a long lander or site name widens the
 * breadcrumb. The title's scrollWidth is its full text width even while it is clipped.
 */
function useCrowdedTitle(
  bar: RefObject<HTMLElement | null>,
  left: RefObject<HTMLElement | null>,
  title: RefObject<HTMLElement | null>,
  right: RefObject<HTMLElement | null>,
): boolean {
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    const barEl = bar.current;
    const leftEl = left.current;
    const titleEl = title.current;
    const rightEl = right.current;
    if (!barEl || !leftEl || !titleEl || !rightEl) return undefined;
    const measure = () => {
      const box = barEl.getBoundingClientRect();
      const half = titleEl.scrollWidth / 2;
      const centre = box.left + box.width / 2;
      setCrowded(
        leftEl.getBoundingClientRect().right + TITLE_CLEARANCE_PX > centre - half ||
          rightEl.getBoundingClientRect().left - TITLE_CLEARANCE_PX < centre + half,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    for (const element of [barEl, leftEl, rightEl]) observer.observe(element);
    return () => observer.disconnect();
  }, [bar, left, title, right]);
  return crowded;
}
