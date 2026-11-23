// The user's chosen background pattern (Settings → Background), saved in the
// library database so it's the same next time the app opens.
import { useSyncExternalStore } from 'react';

import { DEFAULT_BACKGROUND, isBackgroundName, type BackgroundName } from '../components/backgrounds';
import { getSetting, setSetting, type Db } from '../db';

const SETTING_KEY = 'background';

let current: BackgroundName = DEFAULT_BACKGROUND;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of [...listeners]) l();
};

export function getBackground(): BackgroundName {
  return current;
}

/** Loads the saved choice; call once at startup. Unknown or missing values fall back to the default. */
export async function loadBackgroundSetting(db: Db): Promise<BackgroundName> {
  const saved = await getSetting(db, SETTING_KEY);
  current = isBackgroundName(saved) ? saved : DEFAULT_BACKGROUND;
  emit();
  return current;
}

export async function setBackground(db: Db, name: BackgroundName): Promise<void> {
  current = name;
  emit();
  await setSetting(db, SETTING_KEY, name);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackground(): BackgroundName {
  return useSyncExternalStore(subscribe, getBackground, getBackground);
}
