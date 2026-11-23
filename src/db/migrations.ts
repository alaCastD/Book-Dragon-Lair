import type { Db } from './types';

/**
 * Ordered list of schema migrations. Index 0 upgrades a fresh database to
 * version 1, index 1 upgrades version 1 to 2, and so on.
 *
 * NEVER edit a migration that has shipped — users' phones already ran it.
 * To change the schema, append a new entry.
 */
export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE books (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn             TEXT UNIQUE,
    title            TEXT NOT NULL,
    subtitle         TEXT,
    authors          TEXT,
    publisher        TEXT,
    publish_date     TEXT,
    edition          TEXT,
    page_count       INTEGER,
    format           TEXT,
    cover_local_uri  TEXT,
    cover_remote_url TEXT,
    status           TEXT NOT NULL DEFAULT 'to_read' CHECK (status IN ('read', 'to_read')),
    rating           INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    lookup_state     TEXT NOT NULL DEFAULT 'manual'
                     CHECK (lookup_state IN ('pending', 'done', 'failed', 'manual')),
    notes            TEXT,
    date_added       TEXT NOT NULL,
    date_read        TEXT
  );
  CREATE INDEX idx_books_status ON books (status);
  CREATE INDEX idx_books_lookup_state ON books (lookup_state);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Brings the database up to SCHEMA_VERSION. Safe to call on every app start. */
export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Database is version ${version} but this app only knows up to ${SCHEMA_VERSION}. ` +
        'Was the app downgraded?',
    );
  }

  while (version < SCHEMA_VERSION) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      // PRAGMA can't take bound parameters; `next` is an integer we control.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
