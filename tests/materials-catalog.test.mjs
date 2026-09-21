import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { buildMaterialApkg } from "../lib/anki/materials.ts";

const migration = await readFile(new URL("../migrations/0057_materials_catalog_anki.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/materials-catalog.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../components/material-catalog.tsx", import.meta.url), "utf8");
const essential = JSON.parse(await readFile(new URL("../data/materials/anki/neuro-essential.json", import.meta.url), "utf8"));

test("a migration 0057 cria um catálogo idempotente e conserva os metadados dos anexos", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE app_module_settings (module_key TEXT PRIMARY KEY,enabled INTEGER,updated_by TEXT,updated_at INTEGER);
      CREATE TABLE curricular_units (id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      INSERT INTO curricular_units VALUES ('unit-neuro','NEURO',1);
    `);
    db.run(migration);
    db.run(migration);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_lessons")[0].values[0][0], 8);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_anki_decks")[0].values[0][0], 2);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE material_kind='bibliography'")[0].values[0][0], 20);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE verification_status='original'")[0].values[0][0], 9);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE verification_status='verified'")[0].values[0][0], 4 + 20);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE storage_state='pending'")[0].values[0][0], 33);
  } finally {
    db.close();
  }
});

test("os anexos Anki são catalogados como dados textuais e expostos com filtros e fallback R2", () => {
  assert.equal(essential.source.noteCount, 1099);
  assert.equal(essential.cards.length, 1099);
  assert.ok(essential.cards.every((card) => ["short", "image"].includes(card.type)));
  assert.match(worker, /material-catalog/);
  assert.match(worker, /material-anki/);
  assert.match(worker, /STORAGE_NOT_READY/);
  assert.match(worker, /multipleChoiceCards/);
  assert.match(worker, /externalUrl/);
  assert.match(worker, /unitCode/);
  assert.match(component, /Visão geral|catalog\.tab\.overview/);
  assert.match(component, /Essencial/);
  assert.match(component, /Completo/);
  assert.match(component, /multiple_choice/);
  assert.match(component, /verificationFilter/);
  assert.match(component, /Páginas físicas/);
  assert.match(component, /aria-pressed/);
});

test("o builder cria um APKG com escolha múltipla, resposta curta, imagem e media", async () => {
  const pixel = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const result = await buildMaterialApkg({
    deckName: "Neuroanatomia::Essencial",
    generatedAt: 1_800_000_000_000,
    cards: [
      { id: "mcq", type: "multiple_choice", question: "Qual é a resposta?", answer: "B", options: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: true }], source: "AT1" },
      { id: "short", type: "short_answer", question: "O que é?", answer: "Uma resposta", lesson: "AT1" },
      { id: "image", type: "image", question: "Identifica a imagem.", answer: "Estrutura", image: { fileName: "figura.png", bytes: pixel }, lesson: "AP1" },
    ],
  });
  assert.equal(result.noteCount, 3);
  assert.equal(result.mediaCount, 1);
  const files = unzipSync(result.bytes);
  const media = JSON.parse(strFromU8(files.media));
  assert.equal(Object.keys(media).length, 1);
  const SQL = await initSqlJs();
  const db = new SQL.Database(files["collection.anki2"]);
  try {
    assert.equal(db.exec("SELECT COUNT(*) FROM notes")[0].values[0][0], 3);
    assert.equal(db.exec("SELECT COUNT(*) FROM cards")[0].values[0][0], 3);
    assert.match(db.exec("SELECT flds FROM notes ORDER BY id")[0].values[0][0], /material-options/);
  } finally {
    db.close();
  }
});
