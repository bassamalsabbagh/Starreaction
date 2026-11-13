import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback with one identity for the component's life that always calls the latest `fn`. For
 * handlers passed to a memoised child (the globe), so a re-render never counts as a prop change.
 */
export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
