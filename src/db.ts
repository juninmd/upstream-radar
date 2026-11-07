import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./config/env.ts";

mkdirSync(dirname(env.dbPath), { recursive: true });
const db = new Database(env.dbPath, { create: true });
db.run("PRAGMA journal_mode = WAL");
// Cache do mapeamento pacote -> repo GitHub: o registry não muda de ideia.
db.run(`CREATE TABLE IF NOT EXISTS repo_cache (
  chave TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  at TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS vistos (
  chave TEXT NOT NULL,
  tag TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (chave, tag)
)`);

/** "" em cache = pacote sem repo GitHub; evita repetir a consulta. */
export function repoCache(chave: string): string | null {
  const r = db
    .query<{ repo: string }, [string]>("SELECT repo FROM repo_cache WHERE chave = ?")
    .get(chave);
  return r ? r.repo : null;
}

export function salvarRepo(chave: string, repo: string): void {
  db.query(
    "INSERT OR REPLACE INTO repo_cache (chave, repo, at) VALUES (?, ?, ?)",
  ).run(chave, repo, new Date().toISOString());
}

export function jaVisto(chave: string, tag: string): boolean {
  return !!db
    .query<{ tag: string }, [string, string]>(
      "SELECT tag FROM vistos WHERE chave = ? AND tag = ?",
    )
    .get(chave, tag);
}

export function marcarVisto(chave: string, tag: string): void {
  db.query("INSERT OR IGNORE INTO vistos (chave, tag, at) VALUES (?, ?, ?)").run(
    chave,
    tag,
    new Date().toISOString(),
  );
}

export function primeiraRodada(): boolean {
  return (db.query<{ n: number }, []>("SELECT COUNT(*) n FROM vistos").get()?.n ?? 0) === 0;
}
