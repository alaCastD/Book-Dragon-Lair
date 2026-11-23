/// <reference types="jest" />
import { addBook, listBooks, migrate } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { BACKUP_FORMAT, BackupFormatError, buildBackup, importBackup, parseBackup, toCsv } from '../backup';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});
afterEach(() => db.close());

const readCover = async (uri: string) => `BASE64(${uri})`;
const writeCover = async (b64: string, id: number) => `file:///restored/${id}.jpg#${b64.length}`;

async function seed() {
  await addBook(db, {
    title: 'Dune',
    isbn: '9780441172719',
    authors: 'Frank Herbert',
    status: 'read',
    rating: 5,
    notes: 'Spice!',
    coverRemoteUrl: 'https://covers.example/dune.jpg',
    coverLocalUri: 'file:///covers/cover-1.jpg',
    dateAdded: '2025-01-02T03:04:05.000Z',
  });
  // A book with a photo the user took: only exists on the phone.
  await addBook(db, {
    title: 'Grandma’s Recipes',
    coverLocalUri: 'file:///covers/cover-2-123.jpg',
  });
}

it('round-trips a library through a backup file', async () => {
  await seed();
  const file = JSON.stringify(await buildBackup(db, readCover));

  const fresh = createTestDb();
  await migrate(fresh);
  const report = await importBackup(fresh, parseBackup(file), writeCover);
  expect(report).toEqual({ added: 2, alreadyHad: 0, skipped: 0 });

  const books = await listBooks(fresh, { sort: 'title' });
  expect(books.map((b) => b.title)).toEqual(['Dune', 'Grandma’s Recipes']);
  expect(books[0]).toMatchObject({
    isbn: '9780441172719',
    status: 'read',
    rating: 5,
    notes: 'Spice!',
    dateAdded: '2025-01-02T03:04:05.000Z',
    coverRemoteUrl: 'https://covers.example/dune.jpg',
    coverLocalUri: null, // downloaded again by the background sync
  });
  expect(books[0].dateRead).not.toBeNull();
  // The photo cover travelled inside the file.
  expect(books[1].coverLocalUri).toMatch(/^file:\/\/\/restored\//);
  fresh.close();
});

it('only embeds covers that cannot be downloaded again', async () => {
  await seed();
  const backup = await buildBackup(db, readCover);
  const byTitle = Object.fromEntries(backup.books.map((b) => [b.title, b]));
  expect(byTitle['Dune'].coverImage).toBeUndefined();
  expect(byTitle['Grandma’s Recipes'].coverImage).toBe('BASE64(file:///covers/cover-2-123.jpg)');
});

it('restoring twice does not create duplicates', async () => {
  await seed();
  const parsed = parseBackup(JSON.stringify(await buildBackup(db, readCover)));
  const report = await importBackup(db, parsed, writeCover);
  expect(report).toEqual({ added: 0, alreadyHad: 2, skipped: 0 });
  expect(await listBooks(db)).toHaveLength(2);
});

it('rejects files that are not backups', () => {
  expect(() => parseBackup('not json')).toThrow(BackupFormatError);
  expect(() => parseBackup('{"books": []}')).toThrow(BackupFormatError);
  expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, books: [] }))).toThrow(/newer version/);
});

it('skips damaged entries and tidies odd values', () => {
  const parsed = parseBackup(
    JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      books: [
        { title: '' },
        { nope: true },
        { title: 'Odd', rating: 9, status: 'loved', isbn: 'garbage', coverRemoteUrl: 'javascript:alert(1)' },
      ],
    }),
  );
  expect(parsed.skipped).toBe(2);
  expect(parsed.books[0]).toMatchObject({ title: 'Odd', rating: 5, status: 'to_read', isbn: null, coverRemoteUrl: null });
});

describe('toCsv', () => {
  it('writes a header and escapes commas, quotes and formulas', async () => {
    await addBook(db, { title: 'Good Omens', authors: 'Terry Pratchett, Neil Gaiman', notes: 'He said "wow"' });
    await addBook(db, { title: '=HYPERLINK("x")' });
    const csv = toCsv(await listBooks(db, { sort: 'title' }));
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Title,Subtitle,Authors,ISBN/);
    expect(lines).toHaveLength(3);
    expect(csv).toContain('"Terry Pratchett, Neil Gaiman"');
    expect(csv).toContain('"He said ""wow"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
