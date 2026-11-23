// Website version of the database: SQLite (sql.js) running in the browser,
// saved to the browser's IndexedDB storage after every change.
//
// expo-sqlite's own web build needs cross-origin isolation headers, which
// GitHub Pages can't send, so the website uses this instead. It implements
// the same small `Db` interface, so all queries and migrations are shared.
import type { Database, SqlValue } from 'sql.js/dist/sql-wasm-browser.js';

import type { Db } from './types';

type Param = string | number | null;

function flatten(params: unknown[]): SqlValue[] {
  const list = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  return list.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : (v as Param)));
}

function rows<T>(db: Database, sql: string, params: unknown[]): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(flatten(params));
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    return out;
  } finally {
    stmt.free();
  }
}

// ---------------------------------------------------------------- IndexedDB storage

// Kept from the project's original name on purpose: renaming it would make
// the website lose libraries already saved in people's browsers.
const IDB_NAME = 'book-dragon-liar';
const IDB_STORE = 'files';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadSaved(key: string): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : null);
    req.onerror = () => reject(req.error);
  });
}

async function save(key: string, bytes: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------- Db adapter

/**
 * Wraps a sql.js database as the app's `Db`. Every change is written to
 * IndexedDB shortly afterwards (batched), and right away if the tab is hidden
 * or closed, so nothing is lost.
 */
export function createWebDb(db: Database, storageKey: string): Db & { flush(): Promise<void> } {
  let depth = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty || depth > 0) return;
    dirty = false;
    await save(storageKey, db.export());
  };
  const changed = () => {
    dirty = true;
    if (!timer) timer = setTimeout(() => void flush(), 300);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
    window.addEventListener('pagehide', () => void flush());
  }

  const webDb = {
    async execAsync(source: string) {
      db.exec(source);
      changed();
    },
    async runAsync(source: string, ...params: unknown[]) {
      const stmt = db.prepare(source);
      try {
        stmt.bind(flatten(params));
        stmt.step();
      } finally {
        stmt.free();
      }
      const changes = db.getRowsModified();
      const id = rows<{ id: number }>(db, 'SELECT last_insert_rowid() AS id', [])[0]?.id ?? 0;
      changed();
      return { lastInsertRowId: Number(id), changes };
    },
    async getFirstAsync(source: string, ...params: unknown[]) {
      return rows(db, source, params)[0] ?? null;
    },
    async getAllAsync(source: string, ...params: unknown[]) {
      return rows(db, source, params);
    },
    async withTransactionAsync(task: () => Promise<void>) {
      // Nested calls join the outer transaction.
      if (depth++ === 0) db.exec('BEGIN');
      try {
        await task();
        if (depth === 1) db.exec('COMMIT');
      } catch (e) {
        if (depth === 1) db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
        changed();
      }
    },
    flush,
  };
  return webDb as unknown as Db & { flush(): Promise<void> };
}
