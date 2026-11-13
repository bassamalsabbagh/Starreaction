import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import markUrl from '../assets/starreaction-mark.png';
import styles from './TopBar.module.css';

interface TopBarProps {
  brand: string;
  /** The site title, centred at the top ("CLPS Lander Advisor"). */
  product: string;
  /** After the logo: where you are ("Moon › lander › site"). */
  breadcrumb?: ReactNode;
}

/**
 * The top row over the full-screen Moon: the logo, name and breadcrumb on the left, and the site
 * title quietly centred (About and the data credits are on the menu rail). The row itself lets the
 * map through.
 */
export function TopBar({ brand, product, breadcrumb }: TopBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const crowded = useCrowdedTitle(barRef, leftRef, titleRef);
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
    </header>
  );
}

/** The clear space the centred title keeps from either cluster, in px. */
const TITLE_CLEARANCE_PX = 24;

/**
 * Whether the centred title would come within TITLE_CLEARANCE_PX of the breadcrumb or the row's
 * right edge. Measured, not guessed from the window width, since a long lander or site name widens
 * the breadcrumb. The title's scrollWidth is its full text width even while it is clipped.
 */
function useCrowdedTitle(
  bar: RefObject<HTMLElement | null>,
  left: RefObject<HTMLElement | null>,
  title: RefObject<HTMLElement | null>,
): boolean {
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    const barEl = bar.current;
    const leftEl = left.current;
    const titleEl = title.current;
    if (!barEl || !leftEl || !titleEl) return undefined;
    const measure = () => {
      const box = barEl.getBoundingClientRect();
      const half = titleEl.scrollWidth / 2;
      const centre = box.left + box.width / 2;
      setCrowded(
        leftEl.getBoundingClientRect().right + TITLE_CLEARANCE_PX > centre - half ||
          box.right - TITLE_CLEARANCE_PX < centre + half,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    for (const element of [barEl, leftEl]) observer.observe(element);
    return () => observer.disconnect();
  }, [bar, left, title]);
  return crowded;
}
