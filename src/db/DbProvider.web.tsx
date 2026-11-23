// Website version: the library is stored in this browser (see webDb.ts).
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { DATABASE_NAME } from './constants';
import { migrate } from './migrations';
import type { Db } from './types';
import { createWebDb, loadSaved } from './webDb';

const DbContext = createContext<Db | null>(null);

/** Where the site is hosted (e.g. "/Book-Dragon-Lair" on GitHub Pages), set at build time. */
const BASE_URL = process.env.EXPO_BASE_URL ?? '';

let opening: Promise<Db> | null = null;

function openLibrary(): Promise<Db> {
  opening ??= (async () => {
    const SQL = await initSqlJs({ locateFile: (file) => `${BASE_URL}/${file}` });
    const saved = await loadSaved(DATABASE_NAME);
    const db = createWebDb(new SQL.Database(saved), DATABASE_NAME);
    await migrate(db);
    return db;
  })();
  return opening;
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openLibrary().then(setDb, (e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, textAlign: 'center' }}>
          Couldn&apos;t open your library in this browser: {error}
        </Text>
      </View>
    );
  }
  if (!db) return null;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside <DbProvider>');
  return db;
}
