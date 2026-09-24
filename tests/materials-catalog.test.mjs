import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { buildMaterialApkg } from "../lib/anki/materials.ts";

const migration = await readFile(new URL("../migrations/0057_materials_catalog_anki.sql", import.meta.url), "utf8");
const rightsMigration = await readFile(new URL("../migrations/0062_material_rights_substitution.sql", import.meta.url), "utf8");
const authorizedMigration = await readFile(new URL("../migrations/0064_publish_authorized_neuro_materials.sql", import.meta.url), "utf8");
const highlightsMigration = await readFile(new URL("../migrations/0063_material_pdf_highlights.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/materials-catalog.ts", import.meta.url), "utf8");
const artifactScript = await readFile(new URL("../scripts/prepare-material-artifacts.mjs", import.meta.url), "utf8");
const component = await readFile(new URL("../components/material-catalog.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../components/material-catalog.module.css", import.meta.url), "utf8");
const pdfReader = await readFile(new URL("../components/material-pdf-reader.tsx", import.meta.url), "utf8");

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

test("a autorização de redistribuição repõe os downloads verificados", async () => {
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
    db.run(authorizedMigration);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE publication_status='published' AND storage_backend='r2' AND storage_state='ready'")[0].values[0][0], 33);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_catalog WHERE material_kind='bibliography' AND checksum_sha256 IS NOT NULL")[0].values[0][0], 20);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_anki_decks WHERE publication_status='published' AND storage_state='ready'")[0].values[0][0], 2);
  } finally {
    db.close();
  }
});

test("os downloads preparados não expõem os pacotes protegidos", () => {
  assert.match(worker, /material-catalog/);
  assert.match(worker, /material-anki/);
  assert.doesNotMatch(worker, /neuro-essential\.json|neuro-complete\.json/);
  assert.match(worker, /STORAGE_NOT_READY/);
  assert.match(worker, /WHERE id=\? AND publication_status='published'/);
  assert.match(worker, /item\.storage_state !== "ready"/);
  // The unit's prepared package is a plain download link; nothing is built on the device.
  assert.match(component, /selectedDeck\?\.downloadUrl \? <a className="button button--secondary button--compact" href=\{selectedDeck\.downloadUrl\} download>/);
  assert.match(component, /Referência bibliográfica apenas/);
  assert.doesNotMatch(component, /buildMaterialApkg|materialApkgBlob|URL\.createObjectURL|MaterialCompendiumExport/);
  assert.match(component, /verificationFilter/);
  assert.match(component, /Páginas físicas/);
  // Essential / Complete is the shared segmented filter (accessible state handled there).
  assert.match(component, /<FilterSegmented label=\{t\("community\.materials\.catalog\.packageBase"\)\} value=\{ankiVariant\}/);
});

test("a consulta do catálogo fornece os dois bindings do filtro de pesquisa", () => {
  assert.match(worker, /const queryPattern = query \? `%\$\{query\}%` : "";/);
  assert.match(worker, /kind && catalogKinds\.has\(kind\) \? kind : "", kind && catalogKinds\.has\(kind\) \? kind : "", queryPattern, queryPattern/);
});

test("downloads de artefactos pré-gerados suportam cache HTTP e intervalos", () => {
  assert.match(worker, /cache-control.*max-age=3600/);
  assert.match(worker, /if-none-match/);
  assert.match(worker, /content-range/);
  assert.match(worker, /range \? 206 : 200/);
  assert.match(worker, /request\.method !== "HEAD"/);
  assert.doesNotMatch(worker, /material-anki\/media/);
  assert.match(artifactScript, /MIMED/);
  assert.match(artifactScript, /with-summary-covers/);
  assert.match(artifactScript, /logo-comissao-curso-fmup-2025-2031-transparente\.png/);
  assert.match(artifactScript, /da717fcfdd2c34c3c6e8c7dd0d48dccf116ff8adb212453a80238af09477ff88/);
  assert.match(artifactScript, /uploadStatus: "ready"/);
  assert.match(artifactScript, /stageCatalogEntries/);
  assert.match(artifactScript, /uploadStatus: "review-required"/);
});

test("os PDFs abrem em modo inline e os realces privados persistem na D1", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE material_catalog (id TEXT PRIMARY KEY);
      INSERT INTO users VALUES ('user-1');
      INSERT INTO material_catalog VALUES ('pdf-1');
    `);
    db.run(highlightsMigration);
    db.run(highlightsMigration);
    db.run("INSERT INTO material_pdf_highlights(id,user_id,material_id,page_number,x,y,width,height,color,created_at,updated_at) VALUES('h-1','user-1','pdf-1',2,.1,.2,.3,.04,'gold',1,1)");
    assert.equal(db.exec("SELECT COUNT(*) FROM material_pdf_highlights")[0].values[0][0], 1);
  } finally {
    db.close();
  }
  assert.match(worker, /content-disposition.*disposition/);
  assert.match(worker, /material_pdf_highlights/);
  assert.match(worker, /\/view/);
  assert.match(worker, /\/highlights/);
  assert.match(component, /Abrir e realçar/);
  assert.match(pdfReader, /Camada de realces/);
  assert.match(pdfReader, /page, \.\.\.shape, color, note/);
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
  // The curricular unit is chosen before the tabs appear.
  assert.match(component, /if \(!selectedUnit\) \{/);
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

test("o leitor de PDF usa a build legacy, camada de texto e realces por linha", async () => {
  const readerStyles = await readFile(new URL("../components/material-pdf-reader.module.css", import.meta.url), "utf8");
  const rectsMigration = await readFile(new URL("../migrations/0073_material_pdf_highlight_rects.sql", import.meta.url), "utf8");
  // Map#getOrInsertComputed is missing in Safari and older browsers; the legacy build polyfills it.
  assert.match(pdfReader, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(pdfReader, /pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs/);
  assert.doesNotMatch(pdfReader, /import\("pdfjs-dist"\)\.then/);
  assert.match(pdfReader, /new pdfjs\.TextLayer\(/);
  assert.match(pdfReader, /endOfContent/);
  assert.match(pdfReader, /method: "PATCH"/);
  assert.match(pdfReader, /IntersectionObserver/);
  assert.match(pdfReader, /gu-pdf-page:/);
  assert.match(readerStyles, /\.textLayer:global\(\.selecting\) :global\(\.endOfContent\) \{ top: 0; \}/);
  assert.match(rectsMigration, /ALTER TABLE material_pdf_highlights ADD COLUMN rects TEXT/);
  assert.match(worker, /request\.method === "PATCH"/);
  assert.match(worker, /function highlightRects\(value: unknown\)/);
  assert.match(worker, /missingRectsColumn/);
  assert.match(worker, /SELECT \* FROM material_pdf_highlights WHERE user_id=\? AND material_id=\?/);
});

test("a migration 0073 acrescenta os retângulos sem perder realces existentes", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE material_catalog (id TEXT PRIMARY KEY);
      INSERT INTO users VALUES ('user-1');
      INSERT INTO material_catalog VALUES ('pdf-1');
    `);
    db.run(highlightsMigration);
    db.run("INSERT INTO material_pdf_highlights(id,user_id,material_id,page_number,x,y,width,height,color,created_at,updated_at) VALUES('h-1','user-1','pdf-1',1,.1,.2,.3,.04,'gold',1,1)");
    db.run(await readFile(new URL("../migrations/0073_material_pdf_highlight_rects.sql", import.meta.url), "utf8"));
    db.run(`UPDATE material_pdf_highlights SET rects='[{"x":0.1,"y":0.2,"width":0.3,"height":0.02}]' WHERE id='h-1'`);
    assert.equal(db.exec("SELECT COUNT(*) FROM material_pdf_highlights WHERE rects IS NOT NULL")[0].values[0][0], 1);
  } finally {
    db.close();
  }
});
