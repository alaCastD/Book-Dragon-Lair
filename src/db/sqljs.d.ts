// Minimal types for the parts of sql.js the web version uses.
declare module 'sql.js/dist/sql-wasm-browser.js' {
  export type SqlValue = string | number | Uint8Array | null;
  export interface Statement {
    bind(values?: SqlValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): boolean;
  }
  export interface Database {
    exec(sql: string): unknown;
    prepare(sql: string): Statement;
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | null) => Database;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}

// The Node build, used by the tests.
declare module 'sql.js' {
  export { default } from 'sql.js/dist/sql-wasm-browser.js';
  export * from 'sql.js/dist/sql-wasm-browser.js';
}
