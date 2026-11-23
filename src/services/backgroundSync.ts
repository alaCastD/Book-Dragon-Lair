import NetInfo from '@react-native-community/netinfo';
import { useDb } from '../db/DbProvider';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { Db } from '../db';
import { loadBackgroundSetting } from './appearance';
import { isOnlineAllowed, loadConnectionSetting, subscribeConnection } from './connection';
import { downloadCover } from './covers';
import { notifyLibraryChanged } from './libraryEvents';
import { lookupIsbn, type Fetch } from './lookup';
import { syncLibrary } from './sync';
import { setSyncStatus } from './syncStatus';

// In a browser, NetInfo checks for internet by fetching the site's root
// address, which doesn't exist on GitHub Pages. The browser's own
// online/offline signal is enough there.
if (Platform.OS === 'web') NetInfo.configure({ reachabilityShouldRun: () => false });

let running = false;
let again = false;

/**
 * Starts a sync unless one is already running; if one is, it runs once more
 * afterwards so nothing requested in the meantime is missed.
 */
export async function requestSync(db: Db): Promise<void> {
  // Switched to Offline: don't touch the internet. Pending books wait.
  if (!isOnlineAllowed()) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const report = await syncLibrary(
        {
          db,
          lookup: (isbn) => lookupIsbn(fetch as unknown as Fetch, isbn),
          downloadCover,
          canConnect: isOnlineAllowed,
        },
        notifyLibraryChanged,
      );
      // Switching to Offline also stops a sync early; that isn't a problem to report.
      const problem = report.offline && isOnlineAllowed() ? (report.problem ?? null) : null;
      setSyncStatus({ at: new Date().toISOString(), problem });
      if (problem) notifyLibraryChanged();
    } while (again);
  } catch (e) {
    console.warn('Book sync failed', e);
  } finally {
    running = false;
  }
}

/**
 * While the app is set to Online: syncs when the app starts, comes back to the
 * foreground, regains internet, or is switched from Offline to Online.
 */
export function useBackgroundSync(ready: boolean): void {
  const db = useDb();

  useEffect(() => {
    if (!ready) return;
    requestSync(db);

    const net = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) requestSync(db);
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') requestSync(db);
    });
    const unsubscribe = subscribeConnection(() => requestSync(db));
    return () => {
      net();
      app.remove();
      unsubscribe();
    };
  }, [db, ready]);
}

/**
 * Loads the saved settings (Online / Offline and the background). Screens
 * wait for them, so nothing reaches the internet before the app knows it's
 * allowed to, and the right background shows from the start.
 */
export function useConnectionSettingLoaded(): boolean {
  const db = useDb();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Promise.all([loadConnectionSetting(db), loadBackgroundSetting(db)])
      .catch((e) => console.warn('Could not read saved settings', e))
      .finally(() => setLoaded(true));
  }, [db]);
  return loaded;
}
