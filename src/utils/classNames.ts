/** Joins CSS class names, skipping empty or missing ones (CSS Module lookups may be undefined). */
export function joinClassNames(...names: ReadonlyArray<string | false | null | undefined>): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ');
}
