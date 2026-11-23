import type { Book, BookQuery, BookUpdate, LibraryCounts, NewBook } from '../types';
import type { Db } from './types';

/** Row shape as stored in SQLite (snake_case). */
interface BookRow {
  id: number;
  isbn: string | null;
  title: string;
  subtitle: string | null;
  authors: string | null;
  publisher: string | null;
  publish_date: string | null;
  edition: string | null;
  page_count: number | null;
  format: string | null;
  cover_local_uri: string | null;
  cover_remote_url: string | null;
  status: Book['status'];
  rating: number;
  lookup_state: Book['lookupState'];
  notes: string | null;
  date_added: string;
  date_read: string | null;
}

/** Maps each camelCase Book field to its column. Also acts as an allow-list for updates. */
const COLUMNS = {
  isbn: 'isbn',
  title: 'title',
  subtitle: 'subtitle',
  authors: 'authors',
  publisher: 'publisher',
  publishDate: 'publish_date',
  edition: 'edition',
  pageCount: 'page_count',
  format: 'format',
  coverLocalUri: 'cover_local_uri',
  coverRemoteUrl: 'cover_remote_url',
  status: 'status',
  rating: 'rating',
  lookupState: 'lookup_state',
  notes: 'notes',
  dateRead: 'date_read',
} as const satisfies Record<keyof BookUpdate, string>;

type Field = keyof typeof COLUMNS;

function fromRow(r: BookRow): Book {
  return {
    id: r.id,
    isbn: r.isbn,
    title: r.title,
    subtitle: r.subtitle,
    authors: r.authors,
    publisher: r.publisher,
    publishDate: r.publish_date,
    edition: r.edition,
    pageCount: r.page_count,
    format: r.format,
    coverLocalUri: r.cover_local_uri,
    coverRemoteUrl: r.cover_remote_url,
    status: r.status,
    rating: r.rating,
    lookupState: r.lookup_state,
    notes: r.notes,
    dateAdded: r.date_added,
    dateRead: r.date_read,
  };
}

function checkRating(rating: number | undefined) {
  if (rating !== undefined && !(Number.isInteger(rating) && rating >= 0 && rating <= 5)) {
    throw new RangeError(`Rating must be a whole number from 0 to 5, got ${rating}`);
  }
}

/** Fills in date_read when a book is marked read (and clears it when un-read). */
function withReadDate<T extends BookUpdate>(fields: T, now: string): T {
  if (fields.status === 'read' && fields.dateRead === undefined) {
    return { ...fields, dateRead: now };
  }
  if (fields.status === 'to_read' && fields.dateRead === undefined) {
    return { ...fields, dateRead: null };
  }
  return fields;
}

export async function addBook(db: Db, input: NewBook): Promise<Book> {
  if (!input.title.trim()) throw new Error('A book needs a title');
  checkRating(input.rating);

  const now = new Date().toISOString();
  const fields = withReadDate({ ...input }, now);
  const keys = (Object.keys(fields) as Field[]).filter(
    (k) => k in COLUMNS && fields[k] !== undefined,
  );

  const cols = [...keys.map((k) => COLUMNS[k]), 'date_added'];
  const values = [...keys.map((k) => fields[k] ?? null), now];
  const placeholders = cols.map(() => '?').join(', ');

  const result = await db.runAsync(
    `INSERT INTO books (${cols.join(', ')}) VALUES (${placeholders})`,
    values as (string | number | null)[],
  );
  const book = await getBook(db, result.lastInsertRowId);
  if (!book) throw new Error('Book vanished right after insert');
  return book;
}

export async function getBook(db: Db, id: number): Promise<Book | null> {
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function findByIsbn(db: Db, isbn: string): Promise<Book | null> {
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE isbn = ?', isbn);
  return row ? fromRow(row) : null;
}

export async function updateBook(db: Db, id: number, changes: BookUpdate): Promise<Book | null> {
  checkRating(changes.rating);
  if (changes.title !== undefined && !changes.title.trim()) {
    throw new Error('A book needs a title');
  }

  const fields = withReadDate({ ...changes }, new Date().toISOString());
  const keys = (Object.keys(fields) as Field[]).filter(
    (k) => k in COLUMNS && fields[k] !== undefined,
  );
  if (keys.length > 0) {
    const set = keys.map((k) => `${COLUMNS[k]} = ?`).join(', ');
    const values = keys.map((k) => fields[k] ?? null) as (string | number | null)[];
    await db.runAsync(`UPDATE books SET ${set} WHERE id = ?`, [...values, id]);
  }
  return getBook(db, id);
}

export async function deleteBook(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}

const ORDER_BY: Record<NonNullable<BookQuery['sort']>, string> = {
  title: 'title COLLATE NOCASE ASC',
  author: 'authors IS NULL, authors COLLATE NOCASE ASC, title COLLATE NOCASE ASC',
  dateAdded: 'date_added DESC, id DESC',
  rating: 'rating DESC, title COLLATE NOCASE ASC',
};

export async function listBooks(db: Db, query: BookQuery = {}): Promise<Book[]> {
  const where: string[] = [];
  const params: string[] = [];

  if (query.status) {
    where.push('status = ?');
    params.push(query.status);
  }
  const search = query.search?.trim();
  if (search) {
    // Escape LIKE wildcards so a search for "100%" matches literally.
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      "(title LIKE ? ESCAPE '\\' OR subtitle LIKE ? ESCAPE '\\' OR authors LIKE ? ESCAPE '\\')",
    );
    params.push(pattern, pattern, pattern);
  }

  const sql =
    'SELECT * FROM books' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${ORDER_BY[query.sort ?? 'dateAdded']}`;

  const rows = await db.getAllAsync<BookRow>(sql, params);
  return rows.map(fromRow);
}

export async function listPendingLookups(db: Db): Promise<Book[]> {
  const rows = await db.getAllAsync<BookRow>(
    "SELECT * FROM books WHERE lookup_state = 'pending' ORDER BY date_added ASC",
  );
  return rows.map(fromRow);
}

export async function getCounts(db: Db): Promise<LibraryCounts> {
  const row = await db.getFirstAsync<{ total: number; read: number | null; to_read: number | null }>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'read') AS read,
            SUM(status = 'to_read') AS to_read
       FROM books`,
  );
  return { total: row?.total ?? 0, read: row?.read ?? 0, toRead: row?.to_read ?? 0 };
}
