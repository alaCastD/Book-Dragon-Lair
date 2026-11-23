/**
 * Looks up a book's details by ISBN. Because every edition has its own ISBN,
 * this finds the specific edition you own.
 *
 * Sources (both free, no API key):
 *   1. Open Library: the edition record (format, edition name, page count…)
 *   2. Google Books: fills in anything Open Library is missing
 */

export interface LookupResult {
  title: string;
  subtitle: string | null;
  authors: string | null;
  publisher: string | null;
  publishDate: string | null;
  edition: string | null;
  pageCount: number | null;
  format: string | null;
  coverUrl: string | null;
}

/** The lookup couldn't be completed (offline, timeout, server busy). Try again later. */
export class LookupUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookupUnavailableError';
  }
}

export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const TIMEOUT_MS = 15000;

/** GET a JSON document. Returns null for "not found"; throws LookupUnavailableError for anything retryable. */
async function getJson(fetchFn: Fetch, url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new LookupUnavailableError(`${url} answered ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof LookupUnavailableError) throw e;
    // (React Native's URL class can't read .host, so pull the host out by hand.)
    const host = /^https?:\/\/([^/?#]+)/.exec(url)?.[1] ?? url;
    throw new LookupUnavailableError(`Could not reach ${host}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

const posInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;

/** Turns "paperback" / "Mass Market Paperback" into a tidy label. */
function tidyFormat(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// ---------------------------------------------------------------- Open Library

const OL = 'https://openlibrary.org';

async function openLibraryAuthorNames(fetchFn: Fetch, edition: any): Promise<string[]> {
  // Author links live on the edition, or failing that on the "work" it belongs to.
  let keys: string[] = (edition.authors ?? [])
    .map((a: any) => a?.key)
    .filter((k: unknown): k is string => typeof k === 'string');

  if (keys.length === 0) {
    const workKey = edition.works?.[0]?.key;
    if (typeof workKey === 'string') {
      const work = await getJson(fetchFn, `${OL}${workKey}.json`);
      keys = (work?.authors ?? [])
        .map((a: any) => a?.author?.key)
        .filter((k: unknown): k is string => typeof k === 'string');
    }
  }

  const names = await Promise.all(
    keys.slice(0, 5).map(async (key) => str((await getJson(fetchFn, `${OL}${key}.json`))?.name)),
  );
  return names.filter((n): n is string => n !== null);
}

export async function lookupOpenLibrary(fetchFn: Fetch, isbn: string): Promise<LookupResult | null> {
  const edition = await getJson(fetchFn, `${OL}/isbn/${isbn}.json`);
  const title = str(edition?.title);
  if (!edition || !title) return null;

  const authors = await openLibraryAuthorNames(fetchFn, edition);
  const coverId = (edition.covers ?? []).find((id: unknown) => typeof id === 'number' && id > 0);

  return {
    title,
    subtitle: str(edition.subtitle),
    authors: authors.length ? authors.join(', ') : str(edition.by_statement),
    publisher: str(edition.publishers?.[0]),
    publishDate: str(edition.publish_date),
    edition: str(edition.edition_name),
    pageCount: posInt(edition.number_of_pages),
    format: tidyFormat(edition.physical_format),
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
  };
}

// ---------------------------------------------------------------- Google Books

export async function lookupGoogleBooks(fetchFn: Fetch, isbn: string): Promise<LookupResult | null> {
  const data = await getJson(fetchFn, `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const items: any[] = data?.items ?? [];
  // Prefer the volume whose identifiers actually include this ISBN.
  const match =
    items.find((it) =>
      (it?.volumeInfo?.industryIdentifiers ?? []).some((id: any) => id?.identifier === isbn),
    ) ?? items[0];
  const info = match?.volumeInfo;
  const title = str(info?.title);
  if (!info || !title) return null;

  const authors = Array.isArray(info.authors)
    ? info.authors.filter((a: unknown) => typeof a === 'string' && a.trim())
    : [];
  const links = info.imageLinks ?? {};
  const rawCover = str(links.thumbnail) ?? str(links.smallThumbnail);

  return {
    title,
    subtitle: str(info.subtitle),
    authors: authors.length ? authors.join(', ') : null,
    publisher: str(info.publisher),
    publishDate: str(info.publishedDate),
    edition: null,
    pageCount: posInt(info.pageCount),
    format: info.printType === 'MAGAZINE' ? 'Magazine' : null,
    // Google serves covers over http with a page-curl effect; ask for https and a plain image.
    coverUrl: rawCover ? rawCover.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : null,
  };
}

// ---------------------------------------------------------------- Combined

/**
 * Returns the book's details, or null if neither source knows this ISBN.
 * Throws LookupUnavailableError if a source couldn't be reached, so the
 * book stays pending and is retried later instead of being marked "not found".
 */
export async function lookupIsbn(fetchFn: Fetch, isbn: string): Promise<LookupResult | null> {
  let unavailable: LookupUnavailableError | null = null;

  let primary: LookupResult | null = null;
  try {
    primary = await lookupOpenLibrary(fetchFn, isbn);
  } catch (e) {
    if (!(e instanceof LookupUnavailableError)) throw e;
    unavailable = e;
  }

  const complete =
    primary && primary.authors && primary.coverUrl && primary.publisher && primary.pageCount;
  if (complete) return primary;

  let secondary: LookupResult | null = null;
  try {
    secondary = await lookupGoogleBooks(fetchFn, isbn);
  } catch (e) {
    if (!(e instanceof LookupUnavailableError)) throw e;
    unavailable ??= e;
  }

  if (!primary && !secondary) {
    if (unavailable) throw unavailable;
    return null;
  }
  if (!primary) return secondary;
  if (!secondary) return primary;

  // Open Library's edition record wins; Google fills the gaps.
  const merged = { ...primary };
  for (const key of Object.keys(merged) as (keyof LookupResult)[]) {
    if (merged[key] === null && secondary[key] !== null) {
      (merged as Record<string, unknown>)[key] = secondary[key];
    }
  }
  return merged;
}
