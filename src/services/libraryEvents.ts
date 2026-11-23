/** A tiny signal so open screens refresh when books change in the background. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLibraryChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLibraryChanged(): void {
  for (const l of [...listeners]) l();
}
