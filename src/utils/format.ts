import type { Book } from '../types';

/** The best available cover: the copy saved on the phone, otherwise the web address. */
export function coverUri(book: Pick<Book, 'coverLocalUri' | 'coverRemoteUrl'>): string | null {
  return book.coverLocalUri ?? book.coverRemoteUrl ?? null;
}

/** "12 books · 5 read · 7 to be read" */
export function countsSummary(c: { total: number; read: number; toRead: number }): string {
  if (c.total === 0) return 'No books yet';
  const books = c.total === 1 ? '1 book' : `${c.total} books`;
  return `${books} · ${c.read} read · ${c.toRead} to be read`;
}

/** Formats an ISO timestamp as a short local date, e.g. "Nov 23, 2026". */
export function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
