import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { R2_MONTHLY_READ_RESERVATION_LIMIT, reserveR2ReadOperations } from "../worker/r2-read-budget.ts";

const migration = await readFile(new URL("../migrations/0060_r2_read_budget.sql", import.meta.url), "utf8");

function database() {
  const sqlite = new DatabaseSync(":memory:");
  // Migration 0060 also hardens the protected material rows created by
  // migration 0057. Keep this fixture representative of an already seeded
  // D1 database so the compatibility check covers both operations.
  sqlite.exec(`
    CREATE TABLE material_catalog (
      id TEXT PRIMARY KEY,
      material_kind TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE material_anki_decks (
      id TEXT PRIMARY KEY,
      publication_status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO material_catalog (id, material_kind, publication_status, updated_at)
      VALUES
        ('material-biblio-gray41-227-236', 'bibliography', 'published', 0),
        ('material-bibliography-neuro-package', 'bibliography', 'published', 0),
        ('material-summary-at1', 'summary', 'published', 0);
    INSERT INTO material_anki_decks (id, publication_status, updated_at)
      VALUES
        ('anki-neuro-essential', 'published', 0),
        ('anki-neuro-complete', 'published', 0),
        ('anki-other', 'published', 0);
  `);
  sqlite.exec(migration);
  return {
    sqlite,
    prepare(query) {
      return { bind: (...values) => ({ first: async () => sqlite.prepare(query).get(...values) ?? null }) };
    },
  };
}

test("o orçamento reserva leituras R2 de forma atómica e fecha ao atingir o teto", async () => {
  const { sqlite, ...db } = database();
  const now = new Date("2026-09-21T12:00:00Z");
  assert.equal(await reserveR2ReadOperations(db, 2, now), "allowed");
  sqlite.prepare("UPDATE r2_read_budget SET reserved_operations=? WHERE period_utc=?")
    .run(R2_MONTHLY_READ_RESERVATION_LIMIT - 1, "2026-09");
  assert.equal(await reserveR2ReadOperations(db, 2, now), "exhausted");
  assert.equal(await reserveR2ReadOperations(db, 1, now), "allowed");
  assert.equal(await reserveR2ReadOperations(db, 1, now), "exhausted");
  assert.equal(sqlite.prepare("SELECT reserved_operations FROM r2_read_budget WHERE period_utc=?").get("2026-09").reserved_operations, R2_MONTHLY_READ_RESERVATION_LIMIT);
  assert.equal(await reserveR2ReadOperations(db, 1, new Date("2026-10-01T00:00:00Z")), "allowed");
  sqlite.close();
});

test("a migration mantém bibliografia protegida e APKG em draft em D1 já semeada", () => {
  const { sqlite } = database();
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM material_catalog WHERE material_kind='bibliography' AND publication_status='draft'").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM material_anki_decks WHERE publication_status='draft'").get().count, 2);
  assert.equal(sqlite.prepare("SELECT publication_status FROM material_catalog WHERE id='material-summary-at1'").get().publication_status, "published");
  assert.equal(sqlite.prepare("SELECT publication_status FROM material_anki_decks WHERE id='anki-other'").get().publication_status, "published");
  sqlite.close();
});

test("uma falha da D1 impede a leitura do R2", async () => {
  const db = { prepare() { throw new Error("D1 indisponível"); } };
  assert.equal(await reserveR2ReadOperations(db, 1), "unavailable");
});
