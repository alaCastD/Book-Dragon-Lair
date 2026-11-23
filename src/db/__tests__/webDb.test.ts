/// <reference types="jest" />
/// <reference types="node" />
// Runs the real queries and migrations through the website's database adapter
// (sql.js), the same way the browser does. Saving to IndexedDB is not exercised.
import initSqlJs from 'sql.js';

import { addBook, getCounts, listBooks, migrate, SCHEMA_VERSION, updateBook } from '..';
import { addScannedIsbn } from '../../services/addScanned';
import { createWebDb } from '../webDb';

jest.useFakeTimers(); // keeps the delayed save to IndexedDB from running

async function newDb() {
  const SQL = await initSqlJs();
  return createWebDb(new SQL.Database(), 'test.db');
}

it('runs migrations and the library queries', async () => {
  const db = await newDb();
  await migrate(db);
  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  expect(v?.user_version).toBe(SCHEMA_VERSION);

  const dune = await addBook(db, { title: 'Dune', isbn: '9780441172719', authors: 'Frank Herbert' });
  expect(dune.id).toBeGreaterThan(0);
  await updateBook(db, dune.id, { status: 'read', rating: 5 });
  await addBook(db, { title: 'Anathem' });

  expect(await getCounts(db)).toEqual({ total: 2, read: 1, toRead: 1 });
  expect((await listBooks(db, { search: 'herbert' })).map((b) => b.title)).toEqual(['Dune']);
  expect((await addScannedIsbn(db, '0441172717')).kind).toBe('duplicate');
});

it('rolls back a failed transaction', async () => {
  const db = await newDb();
  await migrate(db);
  await expect(
    db.withTransactionAsync(async () => {
      await addBook(db, { title: 'Ghost' });
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(await listBooks(db)).toHaveLength(0);
});
