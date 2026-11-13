import { useEffect, useState, type RefObject } from 'react';
import type { ViewInsets } from '../features/lunar-map/cameraControls';

function same(a: ViewInsets | null, b: ViewInsets): boolean {
  return (
    a !== null &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left
  );
}

/**
 * How much of each map edge the chrome covers, so the map can frame the whole Moon in what is left.
 * The sides and the bottom come from `area`, an invisible box the CSS places between the sidebars
 * and above the time bar without transitions, so it reports where a slide ends, not where it is.
 * The top is the bottom of `top` (the presentation label) when there is one, else the area's.
 */
export function useViewInsets(
  map: RefObject<HTMLElement | null>,
  area: RefObject<HTMLElement | null>,
  top: RefObject<HTMLElement | null>,
): ViewInsets | null {
  const [insets, setInsets] = useState<ViewInsets | null>(null);

  useEffect(() => {
    const mapEl = map.current;
    const areaEl = area.current;
    if (!mapEl || !areaEl || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const box = mapEl.getBoundingClientRect();
      const visible = areaEl.getBoundingClientRect();
      const strip = top.current?.getBoundingClientRect();
      const next: ViewInsets = {
        top: Math.round(strip ? Math.max(0, strip.bottom - box.top) : visible.top - box.top),
        right: Math.round(box.right - visible.right),
        bottom: Math.round(box.bottom - visible.bottom),
        left: Math.round(visible.left - box.left),
      };
      setInsets((previous) => (same(previous, next) ? previous : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(mapEl);
    observer.observe(areaEl);
    if (top.current) observer.observe(top.current);
    return () => observer.disconnect();
  }, [map, area, top]);

  return insets;
}
