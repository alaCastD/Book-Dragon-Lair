export type ReadStatus = 'read' | 'to_read';

/** Where a book's details came from / whether they still need fetching. */
export type LookupState = 'pending' | 'done' | 'failed' | 'manual';

export interface Book {
  id: number;
  /** ISBN-13 when known; null for books entered by hand without one. */
  isbn: string | null;
  title: string;
  subtitle: string | null;
  /** Comma-separated author names, e.g. "Terry Pratchett, Neil Gaiman". */
  authors: string | null;
  publisher: string | null;
  publishDate: string | null;
  edition: string | null;
  pageCount: number | null;
  format: string | null;
  coverLocalUri: string | null;
  coverRemoteUrl: string | null;
  status: ReadStatus;
  /** 0 = unrated, otherwise 1–5. */
  rating: number;
  lookupState: LookupState;
  notes: string | null;
  /** ISO 8601 timestamps. */
  dateAdded: string;
  dateRead: string | null;
}

/** Fields accepted when creating a book. Everything except `title` is optional. */
export type NewBook = Partial<Omit<Book, 'id' | 'dateAdded'>> & { title: string };

/** Fields that can be changed on an existing book. */
export type BookUpdate = Partial<Omit<Book, 'id' | 'dateAdded'>>;

export type SortKey = 'title' | 'author' | 'dateAdded' | 'rating';

export interface BookQuery {
  status?: ReadStatus;
  /** Matches title, subtitle or authors (case-insensitive). */
  search?: string;
  sort?: SortKey;
}

export interface LibraryCounts {
  total: number;
  read: number;
  toRead: number;
}
