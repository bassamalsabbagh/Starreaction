import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { UI_PREFS_KEY } from '../src/utils/uiPrefs';

// The globe is lazy-loaded; on a busy laptop it can take over the default 1 s to arrive in jsdom,
// which made the App tests fail at random. Waiting longer changes no assertion.
configure({ asyncUtilTimeout: 5000 });

// Tests start as a returning visitor (tour and the H hint already seen); tests of those
// first-run features clear this themselves.
beforeEach(() => {
  window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ tourDone: true, keyHintSeen: true }));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
