import { getBook, listBooks, listPendingLookups, updateBook, type Db } from '../db';
import type { Book, BookUpdate } from '../types';
import { pendingTitle } from './addScanned';
import { LookupUnavailableError, type LookupResult } from './lookup';

export interface SyncDeps {
  db: Db;
  lookup: (isbn: string) => Promise<LookupResult | null>;
  /** Returns the saved file's address, null if there is no cover; throws if it should be retried. */
  downloadCover: (url: string, bookId: number) => Promise<string | null>;
}

export interface SyncReport {
  lookedUp: number;
  notFound: number;
  coversSaved: number;
  /** True if the sync stopped early because the internet wasn't reachable. */
  offline: boolean;
}

/**
 * Fields from the lookup to write onto the book. Nothing the user entered is
 * overwritten: the title only replaces the "ISBN …" placeholder, and other
 * details only fill empty fields. Status, rating and notes are never touched.
 */
export function fieldsFromLookup(book: Book, found: LookupResult): BookUpdate {
  const changes: BookUpdate = { lookupState: 'done' };
  const isPlaceholderTitle = book.isbn !== null && book.title === pendingTitle(book.isbn);
  if (isPlaceholderTitle) changes.title = found.title;

  const fill = <K extends keyof BookUpdate>(key: K, value: BookUpdate[K] | null) => {
    if ((book[key as keyof Book] === null || book[key as keyof Book] === undefined) && value !== null) {
      changes[key] = value as BookUpdate[K];
    }
  };
  fill('subtitle', found.subtitle);
  fill('authors', found.authors);
  fill('publisher', found.publisher);
  fill('publishDate', found.publishDate);
  fill('edition', found.edition);
  fill('pageCount', found.pageCount);
  fill('format', found.format);
  fill('coverRemoteUrl', found.coverUrl);
  return changes;
}

async function saveCover(deps: SyncDeps, book: Book): Promise<boolean> {
  if (!book.coverRemoteUrl || book.coverLocalUri) return false;
  const local = await deps.downloadCover(book.coverRemoteUrl, book.id);
  // No cover at that address: forget it so it isn't retried forever.
  await updateBook(deps.db, book.id, local ? { coverLocalUri: local } : { coverRemoteUrl: null });
  return local !== null;
}

/**
 * Fills in details for every pending book, then saves any covers not yet on
 * the phone. Stops quietly at the first sign of being offline; whatever is
 * left is picked up next time.
 */
export async function syncLibrary(deps: SyncDeps, onChange?: () => void): Promise<SyncReport> {
  const report: SyncReport = { lookedUp: 0, notFound: 0, coversSaved: 0, offline: false };

  for (const book of await listPendingLookups(deps.db)) {
    if (!book.isbn) {
      await updateBook(deps.db, book.id, { lookupState: 'failed' });
      continue;
    }
    let found: LookupResult | null;
    try {
      found = await deps.lookup(book.isbn);
    } catch (e) {
      if (e instanceof LookupUnavailableError) {
        report.offline = true;
        return report;
      }
      throw e;
    }

    // The book may have been edited or removed while we were looking it up.
    const current = await getBook(deps.db, book.id);
    if (!current || current.lookupState !== 'pending') continue;

    if (found) {
      await updateBook(deps.db, book.id, fieldsFromLookup(current, found));
      report.lookedUp++;
    } else {
      await updateBook(deps.db, book.id, { lookupState: 'failed' });
      report.notFound++;
    }
    onChange?.();
  }

  const needCovers = (await listBooks(deps.db)).filter((b) => b.coverRemoteUrl && !b.coverLocalUri);
  for (const book of needCovers) {
    try {
      if (await saveCover(deps, book)) report.coversSaved++;
      onChange?.();
    } catch {
      report.offline = true;
      return report;
    }
  }
  return report;
}
