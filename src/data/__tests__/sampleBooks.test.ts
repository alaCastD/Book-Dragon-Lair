/// <reference types="jest" />
import { getCounts, listBooks, migrate } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { addSampleBooks, SAMPLE_BOOKS } from '../sampleBooks';

/** ISBN-13 check digit: weights alternate 1,3; total must be a multiple of 10. */
function validIsbn13(isbn: string) {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  const sum = [...isbn].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

it('uses real, valid ISBN-13s', () => {
  for (const b of SAMPLE_BOOKS) expect(validIsbn13(b.isbn!)).toBe(true);
});

it('adds the sample books once, even if tapped twice', async () => {
  const db = createTestDb();
  await migrate(db);
  expect(await addSampleBooks(db)).toBe(SAMPLE_BOOKS.length);
  expect(await addSampleBooks(db)).toBe(0);
  expect((await listBooks(db)).length).toBe(SAMPLE_BOOKS.length);
  expect(await getCounts(db)).toEqual({ total: 5, read: 3, toRead: 2 });
  // Books marked read in the sample get a finished date automatically.
  const read = await listBooks(db, { status: 'read' });
  expect(read.every((b) => b.dateRead !== null)).toBe(true);
  db.close();
});
