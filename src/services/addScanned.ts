import { addBook, findByIsbn, type Db } from '../db';
import type { Book } from '../types';
import { formatIsbn, parseIsbn } from './isbn';

export type ScanOutcome =
  | { kind: 'added'; book: Book }
  | { kind: 'duplicate'; book: Book }
  | { kind: 'not-a-book' }
  | { kind: 'invalid' };

/** Placeholder title for a scanned book whose details haven't been looked up yet. */
export function pendingTitle(isbn: string): string {
  return `ISBN ${formatIsbn(isbn)}`;
}

/**
 * Adds a scanned or typed ISBN to the library straight away, marked
 * "pending" so its title, edition and cover can be filled in once the
 * phone is online (step 4). Works with no connection.
 */
export async function addScannedIsbn(db: Db, raw: string): Promise<ScanOutcome> {
  const parsed = parseIsbn(raw);
  if (!parsed.ok) return { kind: parsed.reason };

  const existing = await findByIsbn(db, parsed.isbn);
  if (existing) return { kind: 'duplicate', book: existing };

  const book = await addBook(db, {
    isbn: parsed.isbn,
    title: pendingTitle(parsed.isbn),
    lookupState: 'pending',
  });
  return { kind: 'added', book };
}
