// What happened the last time the app tried to look books up, so screens can
// say what's actually going on instead of guessing.
import { useSyncExternalStore } from 'react';

export interface SyncStatus {
  /** When the last attempt finished (ISO time). */
  at: string;
  /** Set when the attempt stopped early, e.g. "Couldn't reach Open Library (no response)." */
  problem: string | null;
}

let status: SyncStatus | null = null;
const listeners = new Set<() => void>();

export function setSyncStatus(next: SyncStatus): void {
  status = next;
  for (const l of [...listeners]) l();
}

export function getSyncStatus(): SyncStatus | null {
  return status;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSyncStatus(): SyncStatus | null {
  return useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus);
}
