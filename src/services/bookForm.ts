import { findByIsbn, addBook, getBook, updateBook, type Db } from '../db';
import type { Book, BookUpdate, ReadStatus } from '../types';
import { finishedDateProblem } from '../utils/finishedDate';
import { formatIsbn, parseIsbn } from './isbn';

/** What the add/edit form holds: text boxes are strings, the rest as chosen. */
export interface BookForm {
  title: string;
  subtitle: string;
  authors: string;
  isbn: string;
  publisher: string;
  publishDate: string;
  edition: string;
  format: string;
  pageCount: string;
  status: ReadStatus;
  rating: number;
  /** When it was finished (ISO); null means "today" when marked read. Ignored unless status is read. */
  dateRead: string | null;
}

export type FormErrors = Partial<Record<keyof BookForm, string>>;

export function emptyForm(): BookForm {
  return {
    title: '',
    subtitle: '',
    authors: '',
    isbn: '',
    publisher: '',
    publishDate: '',
    edition: '',
    format: '',
    pageCount: '',
    status: 'to_read',
    rating: 0,
    dateRead: null,
  };
}

export function formFromBook(b: Book): BookForm {
  return {
    title: b.title,
    subtitle: b.subtitle ?? '',
    authors: b.authors ?? '',
    isbn: b.isbn ? formatIsbn(b.isbn) : '',
    publisher: b.publisher ?? '',
    publishDate: b.publishDate ?? '',
    edition: b.edition ?? '',
    format: b.format ?? '',
    pageCount: b.pageCount ? String(b.pageCount) : '',
    status: b.status,
    rating: b.rating,
    dateRead: b.status === 'read' ? b.dateRead : null,
  };
}

const textOrNull = (s: string) => s.trim() || null;

/** Checks the form. Returns the cleaned-up fields, or a message per problem field. */
export function validateForm(
  form: BookForm,
): { ok: true; fields: BookUpdate & { title: string; isbn: string | null } } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};

  const title = form.title.trim();
  if (!title) errors.title = 'A title is required.';

  let isbn: string | null = null;
  if (form.isbn.trim()) {
    const parsed = parseIsbn(form.isbn);
    if (parsed.ok) isbn = parsed.isbn;
    else errors.isbn = 'Not a valid ISBN. Check the 10 or 13 digits, or leave it blank.';
  }

  let pageCount: number | null = null;
  if (form.pageCount.trim()) {
    const n = Number(form.pageCount.trim());
    if (Number.isInteger(n) && n > 0 && n < 100000) pageCount = n;
    else errors.pageCount = 'Enter a whole number of pages, or leave it blank.';
  }

  if (form.status === 'read' && form.dateRead) {
    const problem = finishedDateProblem(new Date(form.dateRead));
    if (problem) errors.dateRead = problem;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    fields: {
      title,
      isbn,
      subtitle: textOrNull(form.subtitle),
      authors: textOrNull(form.authors),
      publisher: textOrNull(form.publisher),
      publishDate: textOrNull(form.publishDate),
      edition: textOrNull(form.edition),
      format: textOrNull(form.format),
      pageCount,
      status: form.status,
      rating: form.rating,
      // Read with no date chosen: the database fills in today.
      dateRead: form.status === 'read' ? (form.dateRead ?? undefined) : null,
    },
  };
}

export type SaveResult =
  | { ok: true; book: Book }
  | { ok: false; errors: FormErrors; existing?: Book };

/**
 * Creates a book (no `bookId`) or saves changes to one.
 *
 * When a book gets a new ISBN it is marked pending, so the background
 * lookup fills in whatever was left blank. It never replaces what was typed.
 */
export async function saveBookForm(db: Db, form: BookForm, bookId?: number): Promise<SaveResult> {
  const v = validateForm(form);
  if (!v.ok) return v;
  const { fields } = v;

  if (fields.isbn) {
    const owner = await findByIsbn(db, fields.isbn);
    if (owner && owner.id !== bookId) {
      return {
        ok: false,
        errors: { isbn: `"${owner.title}" in your library already has this ISBN.` },
        existing: owner,
      };
    }
  }

  if (bookId === undefined) {
    const book = await addBook(db, {
      ...fields,
      lookupState: fields.isbn ? 'pending' : 'manual',
    });
    return { ok: true, book };
  }

  const before = await getBook(db, bookId);
  if (!before) return { ok: false, errors: { title: 'This book is no longer in your library.' } };

  const changes: BookUpdate = { ...fields };
  // Keep the original finished date if it was already read.
  if (before.status === fields.status) delete changes.status;
  if (fields.isbn !== before.isbn) {
    changes.lookupState = fields.isbn ? 'pending' : 'manual';
  }
  const book = await updateBook(db, bookId, changes);
  return book ? { ok: true, book } : { ok: false, errors: { title: 'Could not save.' } };
}
