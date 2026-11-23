/// <reference types="node" />
// Test-only adapter: implements the app's `Db` interface on Node's built-in
// SQLite so the real queries and migrations run in Jest, off-device.
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../types';

type Param = string | number | null;

function flatten(params: unknown[]): Param[] {
  if (params.length === 1 && Array.isArray(params[0])) return params[0] as Param[];
  return params as Param[];
}

export function createTestDb(): Db & { close(): void } {
  const raw = new DatabaseSync(':memory:');
  let depth = 0;

  const db = {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, ...params: unknown[]) {
      const r = raw.prepare(source).run(...flatten(params));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync(source: string, ...params: unknown[]) {
      return raw.prepare(source).get(...flatten(params)) ?? null;
    },
    async getAllAsync(source: string, ...params: unknown[]) {
      return raw.prepare(source).all(...flatten(params));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      if (depth++ === 0) raw.exec('BEGIN');
      try {
        await task();
        if (depth === 1) raw.exec('COMMIT');
      } catch (e) {
        if (depth === 1) raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close() {
      raw.close();
    },
  };
  return db as unknown as Db & { close(): void };
}
