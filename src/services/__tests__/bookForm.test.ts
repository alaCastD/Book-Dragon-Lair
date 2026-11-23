/// <reference types="jest" />
import { addBook, getBook, migrate, updateBook } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { emptyForm, formFromBook, saveBookForm, validateForm, type BookForm } from '../bookForm';

const form = (over: Partial<BookForm>): BookForm => ({ ...emptyForm(), ...over });

describe('validateForm', () => {
  it('needs a title', () => {
    const r = validateForm(form({ title: '  ' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.title).toBeDefined();
  });

  it('cleans up the fields', () => {
    const r = validateForm(form({ title: ' Dune ', authors: ' Frank Herbert ', isbn: '0-441-17271-7', pageCount: '535' }));
    expect(r.ok && r.fields).toMatchObject({
      title: 'Dune',
      authors: 'Frank Herbert',
      isbn: '9780441172719',
      pageCount: 535,
      publisher: null,
    });
  });

  it('rejects a bad ISBN or page count', () => {
    const r = validateForm(form({ title: 'Dune', isbn: '12345', pageCount: 'lots' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.isbn).toBeDefined();
      expect(r.errors.pageCount).toBeDefined();
    }
  });

  it('allows no ISBN', () => {
    expect(validateForm(form({ title: 'Zine' })).ok).toBe(true);
  });
});

describe('saveBookForm', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('adds a hand-entered book without an ISBN as complete', async () => {
    const r = await saveBookForm(db, form({ title: 'Family Recipes', status: 'read', rating: 5 }));
    expect(r.ok && r.book).toMatchObject({ title: 'Family Recipes', lookupState: 'manual', status: 'read', rating: 5 });
  });

  it('marks a hand-entered book with an ISBN for lookup, to fill in blanks', async () => {
    const r = await saveBookForm(db, form({ title: 'Dune', isbn: '9780441172719' }));
    expect(r.ok && r.book.lookupState).toBe('pending');
  });

  it('refuses an ISBN another book already has', async () => {
    await addBook(db, { title: 'Dune', isbn: '9780441172719' });
    const r = await saveBookForm(db, form({ title: 'Dune again', isbn: '978-0441172719' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.isbn).toMatch(/Dune/);
      expect(r.existing?.title).toBe('Dune');
    }
  });

  it('edits a book, keeping its notes, finished date and lookup state', async () => {
    const b = await addBook(db, { title: 'Dun', isbn: '9780441172719', lookupState: 'done', notes: 'Mine', status: 'read' });
    const f = formFromBook(b);
    const r = await saveBookForm(db, { ...f, title: 'Dune', publisher: 'Ace' }, b.id);
    expect(r.ok && r.book).toMatchObject({
      title: 'Dune',
      publisher: 'Ace',
      notes: 'Mine',
      lookupState: 'done',
      dateRead: b.dateRead,
    });
  });

  it('lets a book keep its own ISBN when edited', async () => {
    const b = await addBook(db, { title: 'Dune', isbn: '9780441172719' });
    const r = await saveBookForm(db, formFromBook(b), b.id);
    expect(r.ok).toBe(true);
  });

  it('looks a book up again when its ISBN is corrected', async () => {
    const b = await addBook(db, { title: 'Mystery', isbn: '9780441172719', lookupState: 'failed' });
    const r = await saveBookForm(db, { ...formFromBook(b), isbn: '9780060853983' }, b.id);
    expect(r.ok && r.book).toMatchObject({ isbn: '9780060853983', lookupState: 'pending' });
  });

  it('removing the ISBN stops further lookups', async () => {
    const b = await addBook(db, { title: 'Mystery', isbn: '9780441172719', lookupState: 'failed' });
    const r = await saveBookForm(db, { ...formFromBook(b), isbn: '' }, b.id);
    expect(r.ok && r.book).toMatchObject({ isbn: null, lookupState: 'manual' });
  });

  it('clears the finished date when switched back to To Be Read', async () => {
    const b = await addBook(db, { title: 'Dune', status: 'read' });
    await updateBook(db, b.id, { rating: 3 });
    const r = await saveBookForm(db, { ...formFromBook((await getBook(db, b.id))!), status: 'to_read' }, b.id);
    expect(r.ok && r.book).toMatchObject({ status: 'to_read', dateRead: null, rating: 3 });
  });
});
