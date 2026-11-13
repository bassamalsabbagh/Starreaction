/**
 * Small UI preferences kept in localStorage: which sections are open, whether the sidebars were
 * hidden, and which one-time hints have been seen. Storage can be missing, full or blocked (private
 * windows, tests), so every read and write is guarded and the app works without it.
 */

/**
 * Bumped when a stored shape could leave the UI in a bad state: v1 (earlier builds) could save
 * every Site details section closed. Older keys are simply ignored.
 */
export const UI_PREFS_KEY = 'starreaction.ui.v2';

export interface UiPrefs {
  /** Open or closed, by section id ("advise.lander", "advise.sites", …). */
  sections?: Record<string, boolean>;
  /** The one open Site details section, or null when all are closed. */
  detailsSection?: string | null;
  sidebars?: { advise?: boolean; details?: boolean };
  timeBarCollapsed?: boolean;
  tourDone?: boolean;
  /** The left panel was slid away (its handle or the active rail item); it stays closed. */
  panelClosed?: boolean;
  keyHintSeen?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as UiPrefs) : {};
  } catch {
    return {};
  }
}

/** Merges a change into the stored preferences; silently does nothing if storage fails. */
export function saveUiPrefs(change: UiPrefs): void {
  try {
    const current = loadUiPrefs();
    const next: UiPrefs = {
      ...current,
      ...change,
      sections: { ...current.sections, ...change.sections },
      sidebars: { ...current.sidebars, ...change.sidebars },
    };
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Not saved; the app keeps working with its in-memory state.
  }
}

/** A stored section state, or the given default. */
export function sectionOpen(prefs: UiPrefs, id: string, fallback: boolean): boolean {
  const stored = prefs.sections?.[id];
  return typeof stored === 'boolean' ? stored : fallback;
}
