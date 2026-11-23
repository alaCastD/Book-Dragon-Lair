/// <reference types="jest" />
import { listBooks, migrate } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { addScannedIsbn, pendingTitle } from '../addScanned';
import { isbn10To13, isValidIsbn10, isValidIsbn13, parseIsbn } from '../isbn';

describe('ISBN validation', () => {
  it('accepts real ISBN-13s and rejects a wrong check digit', () => {
    expect(isValidIsbn13('9780441172719')).toBe(true); // Dune
    expect(isValidIsbn13('9791032305690')).toBe(true); // 979 prefix
    expect(isValidIsbn13('9780441172718')).toBe(false);
    expect(isValidIsbn13('1234567890128')).toBe(false); // valid EAN, not a book
  });

  it('accepts ISBN-10s, including an X check digit', () => {
    expect(isValidIsbn10('0441172717')).toBe(true);
    expect(isValidIsbn10('080442957X')).toBe(true);
    expect(isValidIsbn10('0441172718')).toBe(false);
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(isbn10To13('0441172717')).toBe('9780441172719');
    expect(isbn10To13('080442957X')).toBe('9780804429573');
  });
});

describe('parseIsbn', () => {
  it('returns the ISBN-13 for scanned or typed input', () => {
    expect(parseIsbn('9780441172719')).toEqual({ ok: true, isbn: '9780441172719' });
    expect(parseIsbn('978-0-441-17271-9')).toEqual({ ok: true, isbn: '9780441172719' });
    expect(parseIsbn(' 0-441-17271-7 ')).toEqual({ ok: true, isbn: '9780441172719' });
    expect(parseIsbn('080442957x')).toEqual({ ok: true, isbn: '9780804429573' });
  });

  it('recognises barcodes that are not books', () => {
    expect(parseIsbn('5012345678900')).toEqual({ ok: false, reason: 'not-a-book' }); // grocery EAN
    expect(parseIsbn('036000291452')).toEqual({ ok: false, reason: 'not-a-book' }); // UPC-A
    expect(parseIsbn('51699')).toEqual({ ok: false, reason: 'not-a-book' }); // price add-on
  });

  it('flags misreads and typos', () => {
    expect(parseIsbn('9780441172718')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseIsbn('1234')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseIsbn('hello')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseIsbn('')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('addScannedIsbn', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('adds a new book as pending, with the ISBN as a placeholder title', async () => {
    const r = await addScannedIsbn(db, '9780441172719');
    expect(r.kind).toBe('added');
    if (r.kind !== 'added') return;
    expect(r.book).toMatchObject({
      isbn: '9780441172719',
      title: pendingTitle('9780441172719'),
      lookupState: 'pending',
      status: 'to_read',
    });
  });

  it('reports a book that is already in the library instead of adding it twice', async () => {
    const first = await addScannedIsbn(db, '9780441172719');
    // Same book, scanned via its old 10-digit ISBN.
    const second = await addScannedIsbn(db, '0441172717');
    expect(second.kind).toBe('duplicate');
    if (first.kind === 'added' && second.kind === 'duplicate') {
      expect(second.book.id).toBe(first.book.id);
    }
    expect(await listBooks(db)).toHaveLength(1);
  });

  it('does not add anything for non-book or invalid codes', async () => {
    expect((await addScannedIsbn(db, '036000291452')).kind).toBe('not-a-book');
    expect((await addScannedIsbn(db, '9780441172718')).kind).toBe('invalid');
    expect(await listBooks(db)).toHaveLength(0);
  });
});
