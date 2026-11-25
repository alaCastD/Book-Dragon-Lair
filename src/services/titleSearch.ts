/**
 * Find books by title (and optionally author) on Open Library, then list the
 * editions of the chosen book so the user can pick the one they own.
 * Free, no key; Open Library allows websites to call it directly.
 */
import type { NewBook } from '../types';
import { isbn10To13, isValidIsbn10, isValidIsbn13 } from './isbn';
import { LookupUnavailableError, type Fetch } from './lookup';

const OL = 'https://openlibrary.org';
const TIMEOUT_MS = 15000;

export interface WorkResult {
  /** e.g. "/works/OL27482W" */
  key: string;
  title: string;
  authors: string | null;
  firstPublished: number | null;
  editionCount: number;
  coverUrl: string | null;
}

export interface EditionResult {
  /** e.g. "/books/OL7353617M" */
  key: string;
  title: string;
  subtitle: string | null;
  publisher: string | null;
  publishDate: string | null;
  edition: string | null;
  format: string | null;
  pageCount: number | null;
  isbn: string | null;
  /** Open Library language codes, e.g. ["eng"]; empty when the record doesn't say. */
  languages: string[];
  coverUrl: string | null;
}

async function getJson(fetchFn: Fetch, url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (res.status === 429) throw new LookupUnavailableError('Open Library is busy (too many requests). Try again in a minute.', 'refused');
    if (!res.ok) throw new LookupUnavailableError(`Open Library had a problem (error ${res.status}). Try again later.`, 'busy');
    return await res.json();
  } catch (e) {
    if (e instanceof LookupUnavailableError) throw e;
    throw new LookupUnavailableError("Couldn't reach Open Library (no response). Check your connection.", 'network');
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const coverFromId = (id: unknown) => (typeof id === 'number' && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null);
const tidy = (v: unknown) => {
  const s = str(v);
  return s ? s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) : null;
};

/** Searches by title, optionally narrowed by author. Returns up to 20 books, best matches first. */
export async function searchWorks(fetchFn: Fetch, title: string, author = ''): Promise<WorkResult[]> {
  const t = title.trim();
  if (!t) return [];
  // (Built by hand: React Native's URLSearchParams doesn't support everything.)
  const query = [
    `title=${encodeURIComponent(t)}`,
    author.trim() ? `author=${encodeURIComponent(author.trim())}` : null,
    'fields=key,title,author_name,first_publish_year,edition_count,cover_i',
    'limit=20',
  ]
    .filter(Boolean)
    .join('&');
  const data = await getJson(fetchFn, `${OL}/search.json?${query}`);
  const docs: any[] = Array.isArray(data?.docs) ? data.docs : [];
  return docs
    .filter((d) => typeof d?.key === 'string' && str(d.title))
    .map((d) => ({
      key: d.key,
      title: str(d.title)!,
      authors: Array.isArray(d.author_name) && d.author_name.length ? d.author_name.slice(0, 3).join(', ') : null,
      firstPublished: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
      editionCount: Number.isInteger(d.edition_count) ? d.edition_count : 0,
      coverUrl: coverFromId(d.cover_i),
    }));
}

function editionIsbn(e: any): string | null {
  for (const v of [...(e.isbn_13 ?? []), ...(e.isbn_10 ?? [])]) {
    const s = typeof v === 'string' ? v.replace(/[\s-]/g, '').toUpperCase() : '';
    if (isValidIsbn13(s)) return s;
    if (isValidIsbn10(s)) return isbn10To13(s);
  }
  return null;
}

export function parseEdition(e: any): EditionResult | null {
  const title = str(e?.title);
  if (!e || typeof e.key !== 'string' || !title) return null;
  return {
    key: e.key,
    title,
    subtitle: str(e.subtitle),
    publisher: str(e.publishers?.[0]),
    publishDate: str(e.publish_date),
    edition: str(e.edition_name),
    format: tidy(e.physical_format),
    pageCount: Number.isInteger(e.number_of_pages) && e.number_of_pages > 0 ? e.number_of_pages : null,
    isbn: editionIsbn(e),
    languages: (e.languages ?? [])
      .map((l: any) => (typeof l?.key === 'string' ? l.key.replace('/languages/', '') : null))
      .filter((l: string | null): l is string => !!l),
    coverUrl: coverFromId((e.covers ?? []).find((c: unknown) => typeof c === 'number' && c > 0)),
  };
}

export const EDITIONS_PAGE = 50;

/** One page of a book's editions. `total` is how many Open Library knows about. */
// (EDITIONS_PAGE records per page.)
export async function listEditions(
  fetchFn: Fetch,
  workKey: string,
  offset = 0,
): Promise<{ editions: EditionResult[]; total: number; received: number }> {
  if (!/^\/works\/OL\d+W$/.test(workKey)) throw new Error(`Not an Open Library work: ${workKey}`);
  const data = await getJson(fetchFn, `${OL}${workKey}/editions.json?limit=${EDITIONS_PAGE}&offset=${offset}`);
  const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
  return {
    editions: entries.map(parseEdition).filter((x): x is EditionResult => x !== null),
    total: Number.isInteger(data?.size) ? data.size : entries.length,
    /** Records in this page before any were skipped; add to the offset for the next page. */
    received: entries.length,
  };
}

/** How complete an edition record is; used to keep the better of two duplicates. */
const richness = (e: EditionResult) =>
  [e.coverUrl, e.publisher, e.publishDate, e.format, e.pageCount, e.languages.length ? 1 : null].filter(Boolean).length;

/** Drops repeated ISBNs, keeping the most complete record. Editions without an ISBN are all kept. */
export function dedupeEditions(list: EditionResult[]): EditionResult[] {
  const byIsbn = new Map<string, EditionResult>();
  const out: EditionResult[] = [];
  for (const e of list) {
    if (!e.isbn) {
      out.push(e);
      continue;
    }
    const seen = byIsbn.get(e.isbn);
    if (!seen) {
      byIsbn.set(e.isbn, e);
      out.push(e);
    } else if (richness(e) > richness(seen)) {
      out[out.indexOf(seen)] = e;
      byIsbn.set(e.isbn, e);
    }
  }
  return out;
}

/**
 * Orders editions for someone reading `language`: theirs first, then ones
 * whose language isn't recorded (often still theirs), then the rest. Within
 * each group, ones with a cover and an ISBN come first.
 */
export function sortEditions(list: EditionResult[], language: string): EditionResult[] {
  const group = (e: EditionResult) => (e.languages.includes(language) ? 0 : e.languages.length === 0 ? 1 : 2);
  const detail = (e: EditionResult) => (e.coverUrl ? 0 : 1) + (e.isbn ? 0 : 1);
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => group(a.e) - group(b.e) || detail(a.e) - detail(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

/** Editions to show when "Only <language>" is on: theirs, plus ones with no language recorded. */
export function inLanguage(list: EditionResult[], language: string): EditionResult[] {
  return list.filter((e) => e.languages.length === 0 || e.languages.includes(language));
}

/** The book to add for a chosen edition (author comes from the work: editions rarely name it). */
export function bookFromEdition(work: Pick<WorkResult, 'title' | 'authors'>, e: EditionResult): NewBook {
  return {
    title: e.title,
    subtitle: e.subtitle,
    authors: work.authors,
    publisher: e.publisher,
    publishDate: e.publishDate,
    edition: e.edition,
    format: e.format,
    pageCount: e.pageCount,
    isbn: e.isbn,
    coverRemoteUrl: e.coverUrl?.replace('-M.jpg', '-L.jpg') ?? null,
    // With an ISBN, a background lookup can still fill anything this record lacks
    // (it never overwrites what's here). Without one there's nothing to look up.
    lookupState: e.isbn && (!e.publisher || !e.pageCount || !e.coverUrl) ? 'pending' : e.isbn ? 'done' : 'manual',
  };
}

/** For "Can't find my edition": the book itself, to finish by hand. */
export function bookFromWork(work: WorkResult): NewBook {
  return {
    title: work.title,
    authors: work.authors,
    coverRemoteUrl: work.coverUrl?.replace('-M.jpg', '-L.jpg') ?? null,
    lookupState: 'manual',
  };
}

// ---------------------------------------------------------------- Language

/** Device language (two letters) → Open Library's language code and a display name. */
const LANGUAGES: Record<string, [code: string, name: string]> = {
  en: ['eng', 'English'], es: ['spa', 'Spanish'], fr: ['fre', 'French'], de: ['ger', 'German'],
  it: ['ita', 'Italian'], pt: ['por', 'Portuguese'], nl: ['dut', 'Dutch'], sv: ['swe', 'Swedish'],
  da: ['dan', 'Danish'], nb: ['nor', 'Norwegian'], no: ['nor', 'Norwegian'], fi: ['fin', 'Finnish'],
  pl: ['pol', 'Polish'], cs: ['cze', 'Czech'], hu: ['hun', 'Hungarian'], ro: ['rum', 'Romanian'],
  ru: ['rus', 'Russian'], uk: ['ukr', 'Ukrainian'], el: ['gre', 'Greek'], tr: ['tur', 'Turkish'],
  he: ['heb', 'Hebrew'], ar: ['ara', 'Arabic'], hi: ['hin', 'Hindi'], ja: ['jpn', 'Japanese'],
  zh: ['chi', 'Chinese'], ko: ['kor', 'Korean'], sl: ['slv', 'Slovenian'], ca: ['cat', 'Catalan'],
};

/** The device's language as Open Library codes it; English if unknown. */
export function deviceLanguage(locale?: string): { code: string; name: string } {
  let tag = locale;
  if (!tag) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      tag = 'en';
    }
  }
  const [code, name] = LANGUAGES[(tag ?? 'en').slice(0, 2).toLowerCase()] ?? LANGUAGES.en;
  return { code, name };
}
