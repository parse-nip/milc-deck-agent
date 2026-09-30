import type { Database, SqlJsStatic } from "sql.js";

let engine: SqlJsStatic | null = null;

export async function loadSqlEngine(): Promise<SqlJsStatic> {
  if (engine) return engine;
  const initSqlJs = (await import("sql.js")).default;
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const wasmFile = readFileSync(join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
  const wasmBinary = wasmFile.buffer.slice(
    wasmFile.byteOffset,
    wasmFile.byteOffset + wasmFile.byteLength
  );
  engine = await initSqlJs({ wasmBinary });
  return engine;
}

export async function openEmptySqlite(): Promise<Database> {
  const SQL = await loadSqlEngine();
  return new SQL.Database();
}
