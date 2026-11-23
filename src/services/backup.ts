import { addBook, listBooks, type Db } from '../db';
import type { Book, LookupState, ReadStatus } from '../types';
import { parseIsbn } from './isbn';

// Fixed label inside every backup file. Kept from the project's original name
// on purpose: changing it would stop older backups from restoring.
export const BACKUP_FORMAT = 'book-dragon-liar-backup';
export const BACKUP_VERSION = 1;

/** One book in a backup file. Covers you photographed travel inside the file. */
export interface BackupBook {
  isbn: string | null;
  title: string;
  subtitle: string | null;
  authors: string | null;
  publisher: string | null;
  publishDate: string | null;
  edition: string | null;
  pageCount: number | null;
  format: string | null;
  coverRemoteUrl: string | null;
  status: ReadStatus;
  rating: number;
  lookupState: LookupState;
  notes: string | null;
  dateAdded: string;
  dateRead: string | null;
  /** Base64 JPEG, only for covers that can't be downloaded again (your own photos). */
  coverImage?: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  books: BackupBook[];
}

/** A cover that exists only on this phone (a photo you took or picked). */
export function isCustomCover(b: Book): boolean {
  return b.coverLocalUri !== null && b.coverRemoteUrl === null;
}

/**
 * Builds the backup. `readCover` returns a saved cover as base64; it's only
 * called for custom covers, since downloaded ones can be fetched again.
 */
export async function buildBackup(
  db: Db,
  readCover: (uri: string) => Promise<string | null>,
): Promise<BackupFile> {
  const books = await listBooks(db, { sort: 'dateAdded' });
  const out: BackupBook[] = [];
  for (const b of books.reverse()) {
    const entry: BackupBook = {
      isbn: b.isbn,
      title: b.title,
      subtitle: b.subtitle,
      authors: b.authors,
      publisher: b.publisher,
      publishDate: b.publishDate,
      edition: b.edition,
      pageCount: b.pageCount,
      format: b.format,
      coverRemoteUrl: b.coverRemoteUrl,
      status: b.status,
      rating: b.rating,
      lookupState: b.lookupState,
      notes: b.notes,
      dateAdded: b.dateAdded,
      dateRead: b.dateRead,
    };
    if (isCustomCover(b)) {
      const img = await readCover(b.coverLocalUri!).catch(() => null);
      if (img) entry.coverImage = img;
    }
    out.push(entry);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), books: out };
}

export class BackupFormatError extends Error {}

const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const isoOr = (v: unknown, fallback: string) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback;

/** Reads a backup file. Throws BackupFormatError if it isn't one; skips damaged entries. */
export function parseBackup(text: string): { books: BackupBook[]; skipped: number } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupFormatError("This file isn't a Book Dragon Lair backup (it isn't readable).");
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.books)) {
    throw new BackupFormatError("This file isn't a Book Dragon Lair backup.");
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new BackupFormatError('This backup was made by a newer version of the app. Update the app first.');
  }

  const now = new Date().toISOString();
  const books: BackupBook[] = [];
  let skipped = 0;
  for (const raw of data.books) {
    const title = strOrNull(raw?.title)?.trim();
    if (!title) {
      skipped++;
      continue;
    }
    const parsedIsbn = typeof raw.isbn === 'string' ? parseIsbn(raw.isbn) : null;
    const rating = Number.isInteger(raw.rating) ? Math.min(5, Math.max(0, raw.rating)) : 0;
    const status: ReadStatus = raw.status === 'read' ? 'read' : 'to_read';
    const lookupState: LookupState = ['pending', 'done', 'failed', 'manual'].includes(raw.lookupState)
      ? raw.lookupState
      : 'manual';
    books.push({
      isbn: parsedIsbn?.ok ? parsedIsbn.isbn : null,
      title,
      subtitle: strOrNull(raw.subtitle),
      authors: strOrNull(raw.authors),
      publisher: strOrNull(raw.publisher),
      publishDate: strOrNull(raw.publishDate),
      edition: strOrNull(raw.edition),
      pageCount: Number.isInteger(raw.pageCount) && raw.pageCount > 0 ? raw.pageCount : null,
      format: strOrNull(raw.format),
      coverRemoteUrl: typeof raw.coverRemoteUrl === 'string' && /^https:\/\//.test(raw.coverRemoteUrl)
        ? raw.coverRemoteUrl
        : null,
      status,
      rating,
      lookupState,
      notes: strOrNull(raw.notes),
      dateAdded: isoOr(raw.dateAdded, now),
      dateRead: status === 'read' ? isoOr(raw.dateRead, now) : null,
      coverImage: typeof raw.coverImage === 'string' && raw.coverImage.length > 0 ? raw.coverImage : undefined,
    });
  }
  return { books, skipped };
}

export interface ImportReport {
  added: number;
  alreadyHad: number;
  skipped: number;
}

const sameBook = (a: { title: string; authors: string | null }, b: { title: string; authors: string | null }) =>
  a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
  (a.authors ?? '').trim().toLowerCase() === (b.authors ?? '').trim().toLowerCase();

/**
 * Adds the backup's books to the library. Books already there (same ISBN, or
 * same title and author when there's no ISBN) are left as they are, so
 * restoring twice never creates duplicates.
 */
export async function importBackup(
  db: Db,
  backup: { books: BackupBook[]; skipped: number },
  writeCover: (base64: string, bookId: number) => Promise<string | null>,
): Promise<ImportReport> {
  const report: ImportReport = { added: 0, alreadyHad: 0, skipped: backup.skipped };
  const existing = await listBooks(db);
  const isbns = new Set(existing.map((b) => b.isbn).filter(Boolean));

  await db.withTransactionAsync(async () => {
    for (const { coverImage, ...b } of backup.books) {
      const duplicate = b.isbn ? isbns.has(b.isbn) : existing.some((e) => !e.isbn && sameBook(e, b));
      if (duplicate) {
        report.alreadyHad++;
        continue;
      }
      const book = await addBook(db, { ...b, coverLocalUri: null });
      if (b.isbn) isbns.add(b.isbn);
      existing.push(book);
      report.added++;
      if (coverImage) {
        const uri = await writeCover(coverImage, book.id).catch(() => null);
        if (uri) await db.runAsync('UPDATE books SET cover_local_uri = ? WHERE id = ?', uri, book.id);
      }
    }
  });
  return report;
}

// ---------------------------------------------------------------- Spreadsheet

const CSV_COLUMNS: [string, (b: Book) => string | number | null][] = [
  ['Title', (b) => b.title],
  ['Subtitle', (b) => b.subtitle],
  ['Authors', (b) => b.authors],
  ['ISBN', (b) => b.isbn],
  ['Publisher', (b) => b.publisher],
  ['Published', (b) => b.publishDate],
  ['Edition', (b) => b.edition],
  ['Format', (b) => b.format],
  ['Pages', (b) => b.pageCount],
  ['Status', (b) => (b.status === 'read' ? 'Read' : 'To Be Read')],
  ['Rating', (b) => (b.rating || null)],
  ['Date added', (b) => b.dateAdded.slice(0, 10)],
  ['Date finished', (b) => b.dateRead?.slice(0, 10) ?? null],
  ['Notes', (b) => b.notes],
];

function csvCell(v: string | number | null): string {
  if (v === null) return '';
  let s = String(v);
  // Stop spreadsheet apps treating a cell as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The library as a spreadsheet (CSV). Starts with a marker so Excel reads accents correctly. */
export function toCsv(books: Book[]): string {
  const rows = [CSV_COLUMNS.map(([h]) => h), ...books.map((b) => CSV_COLUMNS.map(([, get]) => get(b)))];
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
