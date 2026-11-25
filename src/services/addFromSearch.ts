import { addBook, findByIsbn, type Db } from '../db';
import type { Book, NewBook } from '../types';

export type AddOutcome = { kind: 'added'; book: Book } | { kind: 'duplicate'; book: Book };

/** Adds a book picked from title search, unless one with the same ISBN is already in the library. */
export async function addFromSearch(db: Db, book: NewBook): Promise<AddOutcome> {
  if (book.isbn) {
    const existing = await findByIsbn(db, book.isbn);
    if (existing) return { kind: 'duplicate', book: existing };
  }
  return { kind: 'added', book: await addBook(db, book) };
}
