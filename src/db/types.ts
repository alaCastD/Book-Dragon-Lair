import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The slice of expo-sqlite's database API this app uses. Keeping it narrow
 * lets the unit tests run the same code against Node's built-in SQLite.
 */
export type Db = Pick<
  SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withTransactionAsync'
>;
