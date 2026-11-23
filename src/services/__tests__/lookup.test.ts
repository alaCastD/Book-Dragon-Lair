/// <reference types="jest" />
import { lookupGoogleBooks, lookupIsbn, lookupOpenLibrary, LookupUnavailableError, type Fetch } from '../lookup';

// Hand-written responses in the shape the two services document.
const OL_EDITION = {
  title: 'Dune',
  publishers: ['Ace'],
  publish_date: '1990',
  number_of_pages: 535,
  physical_format: 'mass market paperback',
  edition_name: '25th anniversary ed.',
  authors: [{ key: '/authors/OL79034A' }],
  covers: [-1, 8231856],
  works: [{ key: '/works/OL893415W' }],
};
const OL_AUTHOR = { name: 'Frank Herbert' };
const GOOGLE = {
  totalItems: 2,
  items: [
    { volumeInfo: { title: 'Some Other Dune', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9999999999999' }] } },
    {
      volumeInfo: {
        title: 'Dune',
        subtitle: 'A Novel',
        authors: ['Frank Herbert'],
        publisher: 'Penguin',
        publishedDate: '2005-08-02',
        pageCount: 528,
        printType: 'BOOK',
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441172719' }],
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&zoom=1&edge=curl&source=gbs_api' },
      },
    },
  ],
};

type Routes = Record<string, unknown | number | Error>;

/** A fake fetch: a route maps to a JSON body, an HTTP status number, or an Error to throw. */
function fakeFetch(routes: Routes): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const r = key === undefined ? 404 : routes[key];
    if (r instanceof Error) throw r;
    if (typeof r === 'number') return { ok: r < 400, status: r, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  }) as Fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const OL_ISBN = 'https://openlibrary.org/isbn/9780441172719.json';
const OL_AUTHOR_URL = 'https://openlibrary.org/authors/OL79034A.json';
const GOOGLE_URL = 'https://www.googleapis.com/books/v1/volumes?q=isbn:9780441172719';

describe('Open Library', () => {
  it('reads the edition, author names and cover', async () => {
    const r = await lookupOpenLibrary(
      fakeFetch({ [OL_ISBN]: OL_EDITION, [OL_AUTHOR_URL]: OL_AUTHOR }),
      '9780441172719',
    );
    expect(r).toEqual({
      title: 'Dune',
      subtitle: null,
      authors: 'Frank Herbert',
      publisher: 'Ace',
      publishDate: '1990',
      edition: '25th anniversary ed.',
      pageCount: 535,
      format: 'Mass Market Paperback',
      coverUrl: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
    });
  });

  it('gets authors from the work when the edition has none', async () => {
    const edition = { ...OL_EDITION, authors: undefined };
    const r = await lookupOpenLibrary(
      fakeFetch({
        [OL_ISBN]: edition,
        'https://openlibrary.org/works/OL893415W.json': { authors: [{ author: { key: '/authors/OL79034A' } }] },
        [OL_AUTHOR_URL]: OL_AUTHOR,
      }),
      '9780441172719',
    );
    expect(r?.authors).toBe('Frank Herbert');
  });

  it('returns null for an unknown ISBN', async () => {
    expect(await lookupOpenLibrary(fakeFetch({}), '9780441172719')).toBeNull();
  });
});

describe('Google Books', () => {
  it('picks the volume matching the ISBN and cleans up the cover address', async () => {
    const r = await lookupGoogleBooks(fakeFetch({ [GOOGLE_URL]: GOOGLE }), '9780441172719');
    expect(r).toMatchObject({
      title: 'Dune',
      subtitle: 'A Novel',
      authors: 'Frank Herbert',
      publisher: 'Penguin',
      pageCount: 528,
      coverUrl: 'https://books.google.com/books/content?id=abc&zoom=1&source=gbs_api',
    });
  });

  it('returns null when there are no results', async () => {
    expect(await lookupGoogleBooks(fakeFetch({ [GOOGLE_URL]: { totalItems: 0 } }), '9780441172719')).toBeNull();
  });
});

describe('lookupIsbn', () => {
  it('uses Open Library alone when its record is complete', async () => {
    const f = fakeFetch({ [OL_ISBN]: OL_EDITION, [OL_AUTHOR_URL]: OL_AUTHOR, [GOOGLE_URL]: GOOGLE });
    const r = await lookupIsbn(f, '9780441172719');
    expect(r?.publisher).toBe('Ace');
    expect(f.calls.some((u) => u.includes('googleapis'))).toBe(false);
  });

  it("fills Open Library's gaps from Google Books, keeping the edition's own details", async () => {
    const sparse = { title: 'Dune', publish_date: '1990', physical_format: 'paperback' };
    const r = await lookupIsbn(fakeFetch({ [OL_ISBN]: sparse, [GOOGLE_URL]: GOOGLE }), '9780441172719');
    expect(r).toMatchObject({
      title: 'Dune',
      publishDate: '1990', // from Open Library, not Google's 2005
      format: 'Paperback',
      authors: 'Frank Herbert', // from Google
      publisher: 'Penguin',
      pageCount: 528,
      coverUrl: expect.stringContaining('books.google.com'),
    });
  });

  it('uses Google Books when Open Library does not know the ISBN', async () => {
    const r = await lookupIsbn(fakeFetch({ [GOOGLE_URL]: GOOGLE }), '9780441172719');
    expect(r?.title).toBe('Dune');
  });

  it('returns null when neither source knows the ISBN', async () => {
    expect(await lookupIsbn(fakeFetch({ [GOOGLE_URL]: { totalItems: 0 } }), '9780441172719')).toBeNull();
  });

  it('says "try later" (not "not found") when offline', async () => {
    const offline = fakeFetch({
      'https://openlibrary.org': new TypeError('Network request failed'),
      'https://www.googleapis.com': new TypeError('Network request failed'),
    });
    await expect(lookupIsbn(offline, '9780441172719')).rejects.toBeInstanceOf(LookupUnavailableError);
  });

  it('says "try later" when a source is busy and the other has nothing', async () => {
    const f = fakeFetch({ 'https://openlibrary.org': 503, [GOOGLE_URL]: { totalItems: 0 } });
    await expect(lookupIsbn(f, '9780441172719')).rejects.toBeInstanceOf(LookupUnavailableError);
  });

  it('still succeeds when one source is down and the other has the book', async () => {
    const f = fakeFetch({ 'https://openlibrary.org': 503, [GOOGLE_URL]: GOOGLE });
    expect((await lookupIsbn(f, '9780441172719'))?.title).toBe('Dune');
  });
});
