import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { buildMaterialApkg } from "../lib/anki/materials.ts";

const migration = await readFile(new URL("../migrations/0057_materials_catalog_anki.sql", import.meta.url), "utf8");
const rightsMigration = await readFile(new URL("../migrations/0062_material_rights_substitution.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/materials-catalog.ts", import.meta.url), "utf8");
const artifactScript = await readFile(new URL("../scripts/prepare-material-artifacts.mjs", import.meta.url), "utf8");
const component = await readFile(new URL("../components/material-catalog.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../components/material-catalog.module.css", import.meta.url), "utf8");

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
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE material_kind='bibliography' AND publication_status='published'")[0].values[0][0], 0);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE material_kind='bibliography' AND publication_status='draft'")[0].values[0][0], 20);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_anki_decks WHERE publication_status='published'")[0].values[0][0], 0);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_anki_decks WHERE publication_status='draft'")[0].values[0][0], 2);
  } finally {
    db.close();
  }
});

test("a resolução de direitos publica apenas metadados bibliográficos e arquiva os APKG binários", async () => {
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
    db.run(rightsMigration);
    db.run(rightsMigration);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE material_kind='bibliography' AND publication_status='published' AND storage_backend='inline' AND storage_state='ready' AND file_name IS NULL")[0].values[0][0], 19);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE id='material-bibliography-neuro-package' AND publication_status='archived'")[0].values[0][0], 1);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_anki_decks WHERE publication_status='archived'")[0].values[0][0], 2);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_anki_decks WHERE publication_status='published'")[0].values[0][0], 0);
  } finally {
    db.close();
  }
});

test("o APKG personalizado usa apenas o banco moderado e não depende dos pacotes protegidos", () => {
  assert.match(worker, /material-catalog/);
  assert.match(worker, /material-anki/);
  assert.match(worker, /question_bank_items/);
  assert.match(worker, /q\.status='published'/);
  assert.match(worker, /question-bank-reviewed/);
  assert.match(worker, /imageUrl: null/);
  assert.doesNotMatch(worker, /neuro-essential\.json|neuro-complete\.json/);
  assert.match(component, /APKG revisto/);
  assert.match(component, /sem media bibliográfica protegida/);
  assert.match(component, /Referência bibliográfica apenas/);
  assert.doesNotMatch(component, /setAnkiVariant/);
  assert.match(component, /verificationFilter/);
  assert.match(component, /Páginas físicas/);
  assert.match(component, /aria-pressed/);
});

test("downloads de artefactos pré-gerados suportam cache HTTP e intervalos", () => {
  assert.match(worker, /cache-control.*max-age=3600/);
  assert.match(worker, /if-none-match/);
  assert.match(worker, /content-range/);
  assert.match(worker, /range \? 206 : 200/);
  assert.match(worker, /request\.method !== "HEAD"/);
  assert.match(worker, /id IN \('anki-neuro-essential', 'anki-neuro-complete'\) AND publication_status='published' AND storage_state='ready'/);
  assert.match(worker, /A media Anki aguarda revisão de direitos/);
  assert.match(artifactScript, /MIMED/);
  assert.match(artifactScript, /with-summary-covers/);
  assert.match(artifactScript, /logo-comissao-curso-fmup-2025-2031-transparente\.png/);
  assert.match(artifactScript, /da717fcfdd2c34c3c6e8c7dd0d48dccf116ff8adb212453a80238af09477ff88/);
  assert.match(artifactScript, /uploadStatus: "blocked"/);
  assert.match(artifactScript, /uploadStatus !== "blocked"/);
  assert.match(artifactScript, /uploadStatus: "review-required"/);
});

test("a gestão do catálogo fica limitada a administradores e à direção", () => {
  assert.match(worker, /function isManager\(user: MaterialsCatalogUser \| null\): boolean \{ return Boolean\(user && \(user\.role === "admin" \|\| user\.commissionDepartment === "management"\)\); \}/);
  assert.doesNotMatch(worker, /user\.commissionDepartment === "management" \|\| user\.commissionPosition/);
});

test("o catálogo mantém os estados e a navegação de tabs acessíveis", () => {
  assert.match(component, /role="tablist"/);
  assert.match(component, /aria-controls=\{`material-panel-\$\{tab\}`\}/);
  assert.match(component, /tabIndex=\{activeTab === tab \? 0 : -1\}/);
  assert.match(component, /ArrowRight/);
  assert.match(component, /role="tabpanel"/);
  assert.match(component, /retryCatalog/);
  assert.match(component, /cardsError/);
  assert.match(component, /noCardTypes/);
  assert.match(styles, /scrollbar-width:\s*none/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /resourceActions \.button \{ width: 100%/);
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
