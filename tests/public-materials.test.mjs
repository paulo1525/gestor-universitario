import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import initSqlJs from "sql.js/dist/sql-asm.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const catalogMigration = await read("../migrations/0057_materials_catalog_anki.sql");
const formatsMigration = await read("../migrations/0065_material_bibliography_formats.sql");
const publicMigration = await read("../migrations/0074_public_materials_and_notes.sql");
const worker = await read("../worker/materials-catalog.ts");
const hub = await read("../worker/academic-hub.ts");
const page = await read("../components/public-materials.tsx");
const tree = await read("../components/useful-links-tree.tsx");
const catalog = await read("../components/material-catalog.tsx");

test("a migration 0074 torna tudo privado por omissão e separa sumários de resumos", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE app_module_settings (module_key TEXT PRIMARY KEY,enabled INTEGER,updated_by TEXT,updated_at INTEGER);
      CREATE TABLE curricular_units (id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      INSERT INTO curricular_units VALUES ('unit-neuro','NEURO',1);
    `);
    db.run(catalogMigration);
    db.run(formatsMigration);
    db.run("INSERT INTO material_catalog(id,material_kind,title,created_at,updated_at) VALUES ('s-1','summary','Sumário',1,1),('b-1','bibliography','Livro',1,1)");
    db.run(publicMigration);
    const rows = db.exec("SELECT id,public_access,summary_format FROM material_catalog WHERE id IN ('b-1','s-1') ORDER BY id")[0].values;
    assert.deepEqual(rows, [["b-1", 0, null], ["s-1", 0, "lecture"]]);
    assert.equal(db.exec("SELECT COUNT(*) FROM pragma_table_info('material_anki_decks') WHERE name='public_access'")[0].values[0][0], 1);
    assert.throws(() => db.run("UPDATE material_catalog SET summary_format='outro' WHERE id='s-1'"));
    assert.throws(() => db.run("UPDATE material_catalog SET public_access=2 WHERE id='s-1'"));
  } finally {
    db.close();
  }
});

test("visitantes sem sessão nunca recebem o nome, o id ou o link de um material reservado", () => {
  // The redaction is done on the server: a locked entry is built from the section alone.
  assert.match(worker, /user \|\| isPublic \? \{ \.\.\.entry, locked: false, isPublic: manager \? isPublic : undefined \} : \{ section: entry\.section, locked: true \}/);
  // Downloads, the inline viewer and Anki decks all refuse restricted items without a session, with the same answer as an unknown id.
  assert.equal((worker.match(/const denied = await anonymousDenied\(request, env, user, item\);/g) || []).length, 3);
  assert.match(worker, /if \(!item \|\| Number\(item\.public_access\) !== 1\) return unauthenticated\(\);/);
  assert.match(worker, /public-material:\$\{ip\}/);
  // Only managers switch access, and every change is audited.
  assert.match(worker, /if \(!manager\) return json\(\{ error: "Sem permissão para alterar o acesso\." \}, 403\);/);
  assert.match(worker, /'material_public_access_updated'/);
});

test("o linktree mostra os links reservados censurados, sem títulos nem URLs", () => {
  assert.match(hub, /SELECT l\.category,COUNT\(\*\) AS n FROM useful_links l WHERE l\.status='published' AND l\.visibility!='cc' AND NOT/);
  assert.doesNotMatch(hub, /SELECT l\.title[^`]*NOT \(\$\{USEFUL_LINKS_ANONYMOUS_SCOPE\}\)/);
  assert.match(tree, /styles\.redacted/);
  assert.match(tree, /Array\.from\(\{ length: group\.locked \}/);
});

test("a página pública pesquisa e separa por disciplina e os materiais têm a secção Resumos", () => {
  assert.match(page, /fetch\("\/api\/public-materials"/);
  assert.match(page, /type="search"/);
  // Drive-like navigation: subject folders → type folders → files, with the open folder in the address.
  assert.match(page, /url\.searchParams\.set\("pasta", value\)/);
  assert.match(page, /styles\.redacted/);
  assert.match(catalog, /"overview" \| "summaries" \| "notes" \| "bibliography"/);
  assert.match(catalog, /activeTab !== "notes" \|\| item\.summaryFormat === "notes"/);
});
