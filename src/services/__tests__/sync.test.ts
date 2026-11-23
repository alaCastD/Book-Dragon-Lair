/// <reference types="jest" />
import { addBook, getBook, migrate, updateBook } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { addScannedIsbn } from '../addScanned';
import { LookupUnavailableError, type LookupResult } from '../lookup';
import { syncLibrary, type SyncDeps } from '../sync';

const DUNE: LookupResult = {
  title: 'Dune',
  subtitle: null,
  authors: 'Frank Herbert',
  publisher: 'Ace',
  publishDate: '1990',
  edition: null,
  pageCount: 535,
  format: 'Paperback',
  coverUrl: 'https://covers.example/dune.jpg',
};

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});
afterEach(() => db.close());

function deps(over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    db,
    lookup: async () => DUNE,
    downloadCover: async (_url, id) => `file:///covers/cover-${id}.jpg`,
    ...over,
  };
}

async function scan(isbn: string) {
  const r = await addScannedIsbn(db, isbn);
  if (r.kind !== 'added') throw new Error('scan failed');
  return r.book;
}

it('fills in a scanned book and saves its cover to the phone', async () => {
  const book = await scan('9780441172719');
  const report = await syncLibrary(deps());
  expect(report).toEqual({ lookedUp: 1, notFound: 0, coversSaved: 1, offline: false });
  expect(await getBook(db, book.id)).toMatchObject({
    title: 'Dune',
    authors: 'Frank Herbert',
    lookupState: 'done',
    coverRemoteUrl: DUNE.coverUrl,
    coverLocalUri: `file:///covers/cover-${book.id}.jpg`,
  });
});

it('keeps the rating, status and notes set while the book was pending', async () => {
  const book = await scan('9780441172719');
  await updateBook(db, book.id, { rating: 4, status: 'read', notes: 'Gift from Sam' });
  await syncLibrary(deps());
  expect(await getBook(db, book.id)).toMatchObject({ rating: 4, status: 'read', notes: 'Gift from Sam' });
});

it("doesn't overwrite a title or details the user already entered", async () => {
  const book = await scan('9780441172719');
  await updateBook(db, book.id, { title: 'Dune (my copy)', publisher: 'Chilton' });
  await syncLibrary(deps());
  expect(await getBook(db, book.id)).toMatchObject({
    title: 'Dune (my copy)',
    publisher: 'Chilton',
    authors: 'Frank Herbert',
  });
});

it('marks a book "not found" when no source knows it', async () => {
  const book = await scan('9780441172719');
  const report = await syncLibrary(deps({ lookup: async () => null }));
  expect(report.notFound).toBe(1);
  expect((await getBook(db, book.id))?.lookupState).toBe('failed');
});

it('leaves books pending when offline, and finishes them later', async () => {
  const a = await scan('9780441172719');
  const b = await scan('9780060853983');
  const offline = deps({
    lookup: async () => {
      throw new LookupUnavailableError('offline');
    },
  });
  expect((await syncLibrary(offline)).offline).toBe(true);
  expect((await getBook(db, a.id))?.lookupState).toBe('pending');
  expect((await getBook(db, b.id))?.lookupState).toBe('pending');

  await syncLibrary(deps());
  expect((await getBook(db, a.id))?.lookupState).toBe('done');
  expect((await getBook(db, b.id))?.lookupState).toBe('done');
});

it('retries a cover download that failed for lack of connection', async () => {
  const book = await scan('9780441172719');
  const noCoverNet = deps({
    downloadCover: async () => {
      throw new Error('Network request failed');
    },
  });
  expect((await syncLibrary(noCoverNet)).offline).toBe(true);
  expect(await getBook(db, book.id)).toMatchObject({ lookupState: 'done', coverLocalUri: null });

  await syncLibrary(deps());
  expect((await getBook(db, book.id))?.coverLocalUri).toContain('cover-');
});

it('stops retrying a cover address that has no image', async () => {
  const book = await scan('9780441172719');
  await syncLibrary(deps({ downloadCover: async () => null }));
  expect(await getBook(db, book.id)).toMatchObject({ coverRemoteUrl: null, coverLocalUri: null });
});

it('also saves covers for books added another way (e.g. the samples)', async () => {
  const sample = await addBook(db, { title: 'Beloved', coverRemoteUrl: 'https://covers.example/b.jpg' });
  const lookup = jest.fn(async () => DUNE);
  await syncLibrary(deps({ lookup }));
  expect(lookup).not.toHaveBeenCalled();
  expect((await getBook(db, sample.id))?.coverLocalUri).toContain(`cover-${sample.id}`);
});

it('notifies screens after each change', async () => {
  await scan('9780441172719');
  const onChange = jest.fn();
  await syncLibrary(deps(), onChange);
  expect(onChange).toHaveBeenCalled();
});

it("never replaces a cover photo the user chose", async () => {
  const book = await scan('9780441172719');
  await updateBook(db, book.id, { coverLocalUri: 'file:///covers/my-photo.jpg' });
  const downloadCover = jest.fn(async () => 'file:///covers/downloaded.jpg');
  await syncLibrary(deps({ downloadCover }));
  expect(downloadCover).not.toHaveBeenCalled();
  expect(await getBook(db, book.id)).toMatchObject({
    title: 'Dune',
    coverLocalUri: 'file:///covers/my-photo.jpg',
    coverRemoteUrl: null,
  });
});

it('says what went wrong when a lookup has to wait', async () => {
  await scan('9780441172719');
  const report = await syncLibrary(
    deps({
      lookup: async () => {
        throw new LookupUnavailableError("Couldn't reach Open Library (no response).", 'network');
      },
    }),
  );
  expect(report).toMatchObject({ offline: true, problem: "Couldn't reach Open Library (no response)." });
});
