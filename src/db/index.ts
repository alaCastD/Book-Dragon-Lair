export * from './books';
export { migrate, SCHEMA_VERSION } from './migrations';
export type { Db } from './types';

/** File name of the on-device database (stored in the app's private data folder). */
export const DATABASE_NAME = 'library.db';
