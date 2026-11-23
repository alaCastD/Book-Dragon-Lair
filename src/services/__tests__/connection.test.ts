/// <reference types="jest" />
import { addBook, countPendingLookups, getBook, getSetting, migrate } from '../../db';
import { MIGRATIONS } from '../../db/migrations';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { coverUri } from '../../utils/format';
import { addScannedIsbn } from '../addScanned';
import { isOnlineAllowed, loadConnectionSetting, setOnlineAllowed } from '../connection';
import type { LookupResult } from '../lookup';
import { syncLibrary } from '../sync';

const DUNE: LookupResult = {
  title: 'Dune', subtitle: null, authors: 'Frank Herbert', publisher: 'Ace', publishDate: '1990',
  edition: null, pageCount: 535, format: 'Paperback', coverUrl: 'https://covers.example/dune.jpg',
};

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});
afterEach(() => db.close());

describe('the Online / Offline setting', () => {
  it('defaults to Online', async () => {
    expect(await loadConnectionSetting(db)).toBe(true);
  });

  it('is saved and restored next time the app opens', async () => {
    await setOnlineAllowed(db, false);
    expect(await getSetting(db, 'online_allowed')).toBe('false');
    await setOnlineAllowed(db, true); // in memory only…
    await db.runAsync("UPDATE settings SET value = 'false' WHERE key = 'online_allowed'");
    expect(await loadConnectionSetting(db)).toBe(false); // …the saved value wins on start
    expect(isOnlineAllowed()).toBe(false);
  });
});

describe('while Offline', () => {
  it('makes no requests and leaves scanned books pending', async () => {
    await addScannedIsbn(db, '9780441172719');
    await addBook(db, { title: 'Sample', coverRemoteUrl: 'https://covers.example/s.jpg' });
    const lookup = jest.fn(async () => DUNE);
    const downloadCover = jest.fn(async () => 'file:///c.jpg');

    const report = await syncLibrary({ db, lookup, downloadCover, canConnect: () => false });
    expect(report.offline).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
    expect(downloadCover).not.toHaveBeenCalled();
    expect(await countPendingLookups(db)).toBe(1);
  });

  it('finishes the waiting books when switched back to Online', async () => {
    const r = await addScannedIsbn(db, '9780441172719');
    await syncLibrary({ db, lookup: async () => DUNE, downloadCover: async () => null, canConnect: () => false });
    await syncLibrary({ db, lookup: async () => DUNE, downloadCover: async () => 'file:///c.jpg', canConnect: () => true });
    if (r.kind === 'added') expect((await getBook(db, r.book.id))?.title).toBe('Dune');
    expect(await countPendingLookups(db)).toBe(0);
  });

  it('stops part-way if switched to Offline during a sync', async () => {
    await addScannedIsbn(db, '9780441172719');
    await addScannedIsbn(db, '9780060853983');
    let allowed = true;
    const lookup = jest.fn(async () => {
      allowed = false; // the user taps Offline after the first lookup starts
      return DUNE;
    });
    await syncLibrary({ db, lookup, downloadCover: async () => null, canConnect: () => allowed });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await countPendingLookups(db)).toBe(1);
  });

  it('shows only covers saved on the device, never ones from the web', () => {
    const saved = { coverLocalUri: 'file:///covers/1.jpg', coverRemoteUrl: 'https://x/1.jpg' };
    const webOnly = { coverLocalUri: null, coverRemoteUrl: 'https://x/2.jpg' };
    const webAsLocal = { coverLocalUri: 'https://x/3.jpg', coverRemoteUrl: 'https://x/3.jpg' }; // website
    const photo = { coverLocalUri: 'data:image/jpeg;base64,AAAA', coverRemoteUrl: null };
    expect(coverUri(saved, false)).toBe('file:///covers/1.jpg');
    expect(coverUri(webOnly, false)).toBeNull();
    expect(coverUri(webAsLocal, false)).toBeNull();
    expect(coverUri(photo, false)).toBe(photo.coverLocalUri);
    expect(coverUri(webOnly, true)).toBe('https://x/2.jpg');
  });
});

it('upgrades an existing library to the new version without losing books', async () => {
  const old = createTestDb();
  await old.execAsync(MIGRATIONS[0]);
  await old.execAsync('PRAGMA user_version = 1');
  await old.runAsync("INSERT INTO books (title, date_added) VALUES ('Kept', '2025-01-01T00:00:00.000Z')");
  await migrate(old);
  expect((await old.getAllAsync<{ title: string }>('SELECT title FROM books')).map((b) => b.title)).toEqual(['Kept']);
  expect(await getSetting(old, 'online_allowed')).toBeNull();
  old.close();
});
