/// <reference types="jest" />
/// <reference types="node" />
// Fixtures are real Open Library responses (saved Nov 2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findByIsbn, listBooks, migrate } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { addFromSearch } from '../addFromSearch';
import type { Fetch } from '../lookup';
import { LookupUnavailableError } from '../lookup';
import {
  bookFromEdition,
  bookFromWork,
  dedupeEditions,
  deviceLanguage,
  inLanguage,
  listEditions,
  parseEdition,
  searchWorks,
  sortEditions,
  type EditionResult,
} from '../titleSearch';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

function fakeFetch(body: unknown, status = 200): Fetch & { urls: string[] } {
  const urls: string[] = [];
  const fn = (async (url: string) => {
    urls.push(url);
    return { ok: status < 400, status, json: async () => body };
  }) as Fetch & { urls: string[] };
  fn.urls = urls;
  return fn;
}

describe('searchWorks', () => {
  it('reads real Open Library search results', async () => {
    const f = fakeFetch(fixture('search-hobbit.json'));
    const works = await searchWorks(f, 'the hobbit', 'tolkien');
    expect(works[0]).toMatchObject({
      key: '/works/OL27482W',
      title: 'The Hobbit',
      authors: 'J.R.R. Tolkien',
      firstPublished: 1937,
      coverUrl: expect.stringMatching(/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg$/),
    });
    expect(works[0].editionCount).toBeGreaterThan(400);
    expect(f.urls[0]).toContain('title=the%20hobbit');
    expect(f.urls[0]).toContain('author=tolkien');
  });

  it('returns nothing for no matches or an empty title', async () => {
    expect(await searchWorks(fakeFetch(fixture('search-none.json')), 'zzqxv nonexistent book')).toEqual([]);
    const f = fakeFetch({});
    expect(await searchWorks(f, '   ')).toEqual([]);
    expect(f.urls).toHaveLength(0); // didn't even ask
  });

  it('says plainly when Open Library can\'t be reached', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as Fetch;
    await expect(searchWorks(offline, 'dune')).rejects.toThrow(/Couldn't reach Open Library/);
    await expect(searchWorks(fakeFetch({}, 503), 'dune')).rejects.toBeInstanceOf(LookupUnavailableError);
  });
});

describe('editions', () => {
  const page = fixture('editions-hobbit.json');

  it('reads a real page of editions, converting ISBN-10s to ISBN-13', async () => {
    const { editions, total, received } = await listEditions(fakeFetch(page), '/works/OL27482W');
    expect(total).toBe(482);
    expect(received).toBe(page.entries.length);
    expect(editions[0]).toMatchObject({ title: 'Hobit ali Tja in spet nazaj', languages: ['slv'], isbn: '9788611171982' });
    const dutch = editions.find((e) => e.isbn === '9789027400437');
    expect(dutch).toBeDefined(); // was ISBN-10 9027400431
  });

  it('refuses anything that isn\'t an Open Library work', async () => {
    await expect(listEditions(fakeFetch(page), '/../../evil')).rejects.toThrow(/Not an Open Library work/);
  });

  it('merges editions listed twice under one ISBN, keeping the one with a cover', () => {
    const all = page.entries.map(parseEdition).filter(Boolean) as EditionResult[];
    const twice = all.filter((e) => e.isbn === '9780345339683');
    expect(twice).toHaveLength(2);
    const merged = dedupeEditions(all).filter((e) => e.isbn === '9780345339683');
    expect(merged).toHaveLength(1);
    expect(merged[0].coverUrl).not.toBeNull();
  });

  it('puts your language first, then editions with no language recorded', () => {
    const all = dedupeEditions(page.entries.map(parseEdition).filter(Boolean) as EditionResult[]);
    const sorted = sortEditions(all, 'eng');
    expect(sorted[0].languages).toEqual(['eng']);
    const groups = sorted.map((e) => (e.languages.includes('eng') ? 0 : e.languages.length ? 2 : 1));
    expect(groups).toEqual([...groups].sort());
    const mine = inLanguage(sorted, 'eng');
    expect(mine.every((e) => e.languages.length === 0 || e.languages.includes('eng'))).toBe(true);
    expect(mine.length).toBeLessThan(all.length);
  });

  it('works out the device language, defaulting to English', () => {
    expect(deviceLanguage('es-MX')).toEqual({ code: 'spa', name: 'Spanish' });
    expect(deviceLanguage('en-US')).toEqual({ code: 'eng', name: 'English' });
    expect(deviceLanguage('xx-YY')).toEqual({ code: 'eng', name: 'English' });
  });
});

describe('adding the chosen edition', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  const work = { title: 'The Hobbit', authors: 'J.R.R. Tolkien' };
  const edition: EditionResult = {
    key: '/books/OL1M', title: 'The Hobbit', subtitle: null, publisher: 'Del Rey', publishDate: '1986',
    edition: null, format: 'Paperback', pageCount: 304, isbn: '9780345339683', languages: ['eng'],
    coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
  };

  it('fills in the book from the edition, with the author from the work and a large cover', () => {
    expect(bookFromEdition(work, edition)).toMatchObject({
      title: 'The Hobbit', authors: 'J.R.R. Tolkien', publisher: 'Del Rey', pageCount: 304, format: 'Paperback',
      isbn: '9780345339683', coverRemoteUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg', lookupState: 'done',
    });
  });

  it('marks it for a background lookup only when details are missing and there is an ISBN', () => {
    expect(bookFromEdition(work, { ...edition, publisher: null }).lookupState).toBe('pending');
    expect(bookFromEdition(work, { ...edition, isbn: null, publisher: null }).lookupState).toBe('manual');
  });

  it('adds it, and won\'t add the same ISBN twice', async () => {
    const first = await addFromSearch(db, bookFromEdition(work, edition));
    expect(first.kind).toBe('added');
    const again = await addFromSearch(db, bookFromEdition(work, edition));
    expect(again.kind).toBe('duplicate');
    expect(await listBooks(db)).toHaveLength(1);
    expect((await findByIsbn(db, '9780345339683'))?.authors).toBe('J.R.R. Tolkien');
  });

  it('"Can\'t find my edition" adds the book itself to finish by hand', async () => {
    const r = await addFromSearch(db, bookFromWork({ ...work, key: '/works/OL27482W', firstPublished: 1937, editionCount: 482, coverUrl: null }));
    expect(r.kind === 'added' && r.book).toMatchObject({ title: 'The Hobbit', authors: 'J.R.R. Tolkien', isbn: null, lookupState: 'manual' });
  });
});
