// Phone version: the library is an SQLite file in the app's private storage.
// (The website uses DbProvider.web.tsx instead.)
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { Suspense, type ReactNode } from 'react';

import { DATABASE_NAME } from './constants';
import { migrate } from './migrations';
import type { Db } from './types';

/** Opens (or creates) the library and runs migrations before any screen renders. */
export function DbProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
        {children}
      </SQLiteProvider>
    </Suspense>
  );
}

/** The library database, for screens and hooks. */
export function useDb(): Db {
  return useSQLiteContext();
}
