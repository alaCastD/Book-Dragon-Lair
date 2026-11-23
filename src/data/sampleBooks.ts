import { addBook, findByIsbn, type Db } from '../db';
import type { NewBook } from '../types';

/**
 * A handful of real books for trying the library out. Their covers are
 * downloaded from Open Library and saved to the phone by the background sync.
 */
const BOOKS: NewBook[] = [
  {
    isbn: '9780441172719',
    title: 'Dune',
    authors: 'Frank Herbert',
    publisher: 'Ace',
    publishDate: '1990',
    pageCount: 535,
    format: 'Paperback',
    status: 'read',
    rating: 5,
  },
  {
    isbn: '9780060853983',
    title: 'Good Omens',
    subtitle: 'The Nice and Accurate Prophecies of Agnes Nutter, Witch',
    authors: 'Terry Pratchett, Neil Gaiman',
    publisher: 'William Morrow',
    publishDate: '2006',
    pageCount: 432,
    format: 'Paperback',
    status: 'read',
    rating: 4,
  },
  {
    isbn: '9780385490818',
    title: "The Handmaid's Tale",
    authors: 'Margaret Atwood',
    publisher: 'Anchor Books',
    publishDate: '1998',
    pageCount: 311,
    format: 'Paperback',
  },
  {
    isbn: '9780679720201',
    title: 'The Stranger',
    authors: 'Albert Camus',
    publisher: 'Vintage International',
    publishDate: '1989',
    pageCount: 123,
    format: 'Paperback',
  },
  {
    isbn: '9780374529260',
    title: 'Beloved',
    authors: 'Toni Morrison',
    publisher: 'Vintage',
    publishDate: '2004',
    pageCount: 324,
    format: 'Paperback',
    status: 'read',
    rating: 5,
  },
];

export const SAMPLE_BOOKS: NewBook[] = BOOKS.map((b) => ({
  ...b,
  // `default=false` makes Open Library return an error (not a blank image) when it has no cover.
  coverRemoteUrl: `https://covers.openlibrary.org/b/isbn/${b.isbn}-L.jpg?default=false`,
  lookupState: 'manual',
}));

/** Adds any sample books not already in the library. Returns how many were added. */
export async function addSampleBooks(db: Db): Promise<number> {
  let added = 0;
  for (const book of SAMPLE_BOOKS) {
    if (book.isbn && (await findByIsbn(db, book.isbn))) continue;
    await addBook(db, book);
    added++;
  }
  return added;
}
