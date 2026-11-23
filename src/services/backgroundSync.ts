import NetInfo from '@react-native-community/netinfo';
import { useDb } from '../db/DbProvider';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import type { Db } from '../db';
import { downloadCover } from './covers';
import { notifyLibraryChanged } from './libraryEvents';
import { lookupIsbn, type Fetch } from './lookup';
import { syncLibrary } from './sync';

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
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await syncLibrary(
        {
          db,
          lookup: (isbn) => lookupIsbn(fetch as unknown as Fetch, isbn),
          downloadCover,
        },
        notifyLibraryChanged,
      );
    } while (again);
  } catch (e) {
    console.warn('Book sync failed', e);
  } finally {
    running = false;
  }
}

/** Syncs when the app starts, comes back to the foreground, or regains internet. */
export function useBackgroundSync(): void {
  const db = useDb();

  useEffect(() => {
    requestSync(db);

    const net = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) requestSync(db);
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') requestSync(db);
    });
    return () => {
      net();
      app.remove();
    };
  }, [db]);
}
