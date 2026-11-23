// The Online / Offline switch. While Offline, the app makes no internet
// requests at all: no book lookups, no cover downloads, and covers aren't
// loaded from the web. Scanned books wait as "pending" until Online again.
import { useSyncExternalStore } from 'react';

import { getSetting, setSetting, type Db } from '../db';

const SETTING_KEY = 'online_allowed';

let allowed = true;
const listeners = new Set<() => void>();

function emit() {
  for (const l of [...listeners]) l();
}

/** True when the user allows the app to use the internet. */
export function isOnlineAllowed(): boolean {
  return allowed;
}

/** Loads the saved choice. Call once at startup, before showing screens. Defaults to Online. */
export async function loadConnectionSetting(db: Db): Promise<boolean> {
  allowed = (await getSetting(db, SETTING_KEY)) !== 'false';
  emit();
  return allowed;
}

/** Saves the user's choice and tells every screen. */
export async function setOnlineAllowed(db: Db, value: boolean): Promise<void> {
  allowed = value;
  emit();
  await setSetting(db, SETTING_KEY, value ? 'true' : 'false');
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For screens: re-renders when the switch changes. */
export function useOnlineAllowed(): boolean {
  return useSyncExternalStore(subscribeConnection, isOnlineAllowed, isOnlineAllowed);
}
