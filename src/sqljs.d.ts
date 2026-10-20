declare module "sql.js" {
  interface SqlValue {
    [column: string]: string | number | Uint8Array | null;
  }

  interface Statement {
    bind(values?: unknown[] | Record<string, unknown>): boolean;
    step(): boolean;
    getAsObject(params?: unknown[] | Record<string, unknown> | null): SqlValue;
    free(): boolean;
  }

  interface Database {
    prepare(sql: string): Statement;
    close(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface InitSqlJsConfig {
    locateFile?: (file: string, prefix?: string) => string;
  }

  function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
  export default initSqlJs;
}
