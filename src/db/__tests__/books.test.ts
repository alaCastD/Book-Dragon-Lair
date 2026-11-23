/// <reference types="jest" />
import {
  addBook,
  deleteBook,
  findByIsbn,
  getBook,
  getCounts,
  listBooks,
  listPendingLookups,
  migrate,
  SCHEMA_VERSION,
  updateBook,
} from '..';
import { createTestDb } from './nodeSqliteDb';

let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});
afterEach(() => db.close());

describe('migrations', () => {
  it('sets the schema version', async () => {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(SCHEMA_VERSION);
  });

  it('is safe to run again on every app start', async () => {
    await addBook(db, { title: 'Dune' });
    await migrate(db);
    await migrate(db);
    expect(await listBooks(db)).toHaveLength(1);
  });

  it('refuses a database from a newer app version', async () => {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/downgraded/);
  });
});

describe('books', () => {
  it('adds a book with sensible defaults', async () => {
    const b = await addBook(db, { title: 'Dune', isbn: '9780441172719', authors: 'Frank Herbert' });
    expect(b).toMatchObject({
      id: expect.any(Number),
      title: 'Dune',
      status: 'to_read',
      rating: 0,
      lookupState: 'manual',
      dateRead: null,
    });
    expect(new Date(b.dateAdded).toString()).not.toBe('Invalid Date');
    expect(await getBook(db, b.id)).toEqual(b);
  });

  it('rejects an empty title', async () => {
    await expect(addBook(db, { title: '   ' })).rejects.toThrow(/title/);
  });

  it('rejects the same ISBN twice', async () => {
    await addBook(db, { title: 'Dune', isbn: '9780441172719' });
    await expect(addBook(db, { title: 'Dune again', isbn: '9780441172719' })).rejects.toThrow();
  });

  it('allows several hand-entered books without an ISBN', async () => {
    await addBook(db, { title: 'Zine 1' });
    await addBook(db, { title: 'Zine 2' });
    expect(await listBooks(db)).toHaveLength(2);
  });

  it('finds a book by ISBN', async () => {
    const b = await addBook(db, { title: 'Dune', isbn: '9780441172719' });
    expect((await findByIsbn(db, '9780441172719'))?.id).toBe(b.id);
    expect(await findByIsbn(db, '9780000000000')).toBeNull();
  });

  it('records the read date when marked read and clears it when un-read', async () => {
    const b = await addBook(db, { title: 'Dune' });
    const read = await updateBook(db, b.id, { status: 'read' });
    expect(read?.status).toBe('read');
    expect(read?.dateRead).toEqual(expect.any(String));

    const unread = await updateBook(db, b.id, { status: 'to_read' });
    expect(unread?.dateRead).toBeNull();
  });

  it('rates 0–5 and rejects anything else', async () => {
    const b = await addBook(db, { title: 'Dune' });
    expect((await updateBook(db, b.id, { rating: 5 }))?.rating).toBe(5);
    expect((await updateBook(db, b.id, { rating: 0 }))?.rating).toBe(0);
    await expect(updateBook(db, b.id, { rating: 6 })).rejects.toThrow(RangeError);
    await expect(updateBook(db, b.id, { rating: 2.5 })).rejects.toThrow(RangeError);
  });

  it('updates only the fields given', async () => {
    const b = await addBook(db, { title: 'Dune', authors: 'Frank Herbert', rating: 4 });
    const u = await updateBook(db, b.id, { notes: 'Loved it' });
    expect(u).toMatchObject({ title: 'Dune', authors: 'Frank Herbert', rating: 4, notes: 'Loved it' });
  });

  it('deletes a book', async () => {
    const b = await addBook(db, { title: 'Dune' });
    await deleteBook(db, b.id);
    expect(await getBook(db, b.id)).toBeNull();
  });
});

describe('listing', () => {
  beforeEach(async () => {
    await addBook(db, { title: 'dune', authors: 'Frank Herbert', status: 'read', rating: 5 });
    await addBook(db, { title: 'Anathem', authors: 'Neal Stephenson', rating: 3 });
    await addBook(db, { title: 'Good Omens', authors: 'Terry Pratchett, Neil Gaiman', status: 'read' });
    await addBook(db, { title: '100% Kitchen', lookupState: 'pending', isbn: '9781234567897' });
  });

  it('filters by status', async () => {
    const read = await listBooks(db, { status: 'read' });
    expect(read.map((b) => b.title).sort()).toEqual(['Good Omens', 'dune']);
  });

  it('searches title and author case-insensitively', async () => {
    expect((await listBooks(db, { search: 'GAIMAN' })).map((b) => b.title)).toEqual(['Good Omens']);
    expect((await listBooks(db, { search: 'anath' })).map((b) => b.title)).toEqual(['Anathem']);
  });

  it('treats % and _ in a search literally', async () => {
    expect((await listBooks(db, { search: '100%' })).map((b) => b.title)).toEqual(['100% Kitchen']);
    expect(await listBooks(db, { search: '_' })).toHaveLength(0);
  });

  it('sorts by title, rating and newest first', async () => {
    expect((await listBooks(db, { sort: 'title' })).map((b) => b.title)).toEqual([
      '100% Kitchen',
      'Anathem',
      'dune',
      'Good Omens',
    ]);
    expect((await listBooks(db, { sort: 'rating' }))[0].title).toBe('dune');
    expect((await listBooks(db))[0].title).toBe('100% Kitchen');
  });

  it('lists books waiting for an online lookup', async () => {
    expect((await listPendingLookups(db)).map((b) => b.title)).toEqual(['100% Kitchen']);
  });

  it('counts read and to-be-read', async () => {
    expect(await getCounts(db)).toEqual({ total: 4, read: 2, toRead: 2 });
  });
});
