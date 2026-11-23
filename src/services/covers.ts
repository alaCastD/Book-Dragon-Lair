import { Directory, File, Paths } from 'expo-file-system';

function coversDir(): Directory {
  const dir = new Directory(Paths.document, 'covers');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Below this many bytes an "image" is a blank placeholder, not a real cover. */
const MIN_COVER_BYTES = 1000;

/**
 * Downloads a cover into the app's private storage so it shows offline.
 * Returns the local file address, or null if the source has no cover.
 * Throws if the download couldn't happen (e.g. offline), so it can be retried.
 */
export async function downloadCover(url: string, bookId: number): Promise<string | null> {
  const target = new File(coversDir(), `cover-${bookId}.jpg`);
  let file: File;
  try {
    file = await File.downloadFileAsync(url, target, { idempotent: true });
  } catch (e) {
    // A 404 means "no cover"; anything else (no connection, timeout) is worth retrying.
    if (/\b(404|410)\b/.test(String((e as Error).message))) return null;
    throw e;
  }
  if ((file.size ?? 0) < MIN_COVER_BYTES) {
    file.delete();
    return null;
  }
  return file.uri;
}

/** Removes a saved cover file; ignores files that are already gone. */
export function deleteCoverFile(uri: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Not worth bothering the user about.
  }
}
