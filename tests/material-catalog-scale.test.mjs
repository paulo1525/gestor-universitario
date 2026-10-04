import * as materialFolders from '../lib/material-folders.ts';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import typescript from "typescript";
import { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory } from "../lib/material-categories.ts";

const source = readFileSync(new URL("../worker/materials-catalog.ts", import.meta.url), "utf8");
const compiled = typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText;
const exported = {};
const viewExports = {};
const viewSource = readFileSync(new URL("../worker/material-views.ts", import.meta.url), "utf8");
vm.runInNewContext(typescript.transpileModule(viewSource, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText, { exports: viewExports, Request, Response, URL, crypto, TextEncoder, TextDecoder });
vm.runInNewContext(compiled, {
  exports: exported,
  require(specifier) {
    if (specifier === "@/lib/material-folders") return materialFolders;
    if (specifier === "@/lib/material-categories") return { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory };
    if (specifier === "./material-views") return viewExports;
    if (specifier === "@/worker/google-drive") return { driveConfigured: () => false };
    return {};
  },
  Request, Response, URL, crypto, TextEncoder, TextDecoder,
});

function fixture(size, externalDeckUrl = null) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,name TEXT);
    CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_at INTEGER);
    INSERT INTO users VALUES ('student'),('another-student');
    INSERT INTO curricular_units VALUES ('fis','FIS1','Fisiologia I'),('hist','HIST1','Histologia I');
  `);
  const migration = readFileSync(new URL("../migrations/0057_materials_catalog_anki.sql", import.meta.url), "utf8");
  sqlite.exec(migration.split("-- Aulas da Neuroanatomia")[0]);
  sqlite.exec(readFileSync(new URL("../migrations/0081_material_catalog_favorites.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0091_material_views.sql", import.meta.url), "utf8"));
  if (externalDeckUrl) {
    sqlite.exec("ALTER TABLE material_anki_decks ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0");
    sqlite.prepare("INSERT INTO material_anki_decks(id,curricular_unit_id,title,variant,storage_backend,storage_key,storage_state,publication_status,created_at,updated_at) VALUES('neuro-external','fis','Anki','custom','external',?,'ready','published',0,0)").run(externalDeckUrl);
  }
  sqlite.exec(`
    INSERT INTO material_lessons(id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at)
    VALUES ('at1','fis','AT1','Teórica','theory',1,0,0),('ap1','fis','AP1','Prática','practical',2,0,0);
  `);
  const insert = sqlite.prepare("INSERT INTO material_catalog(id,curricular_unit_id,material_kind,title,publication_status,created_at,updated_at) VALUES (?,?,'other',?,?,0,0)");
  for (let index = 0; index < size; index++) insert.run(index === 0 ? "file-'quoted" : `file-${index}`, index === size - 1 ? "hist" : "fis", `Material ${index}`, "published");
  insert.run("draft", "fis", "Rascunho", "draft");
  insert.run("archived", "fis", "Arquivado", "archived");
  sqlite.exec(`
    INSERT INTO material_catalog_lessons(material_id,lesson_id) VALUES ('file-''quoted','ap1'),('file-''quoted','at1'),('draft','at1');
    INSERT INTO material_catalog_favorites VALUES ('student','file-''quoted',0),('another-student','file-1',0);
    INSERT INTO material_view_totals VALUES ('catalog','file-''quoted',7),('catalog','unrelated',999),('anki','unrelated-deck',200);
  `);
  // Execute the actual handler SQL in SQLite, enforcing the production D1 limit.
  const queries = [];
  const database = { prepare(sql) {
    queries.push(sql);
    const statement = sqlite.prepare(sql);
    let parameters = [];
    return {
      bind(...values) {
        assert.ok(values.length <= 100, `D1: too many SQL variables (${values.length})`);
        parameters = values;
        return this;
      },
      async all() { return { results: statement.all(...parameters) }; },
      async first() { return statement.get(...parameters) || null; },
    };
  } };
  return { database, queries, close: () => sqlite.close() };
}

async function catalog(database, query = "", favorites = true) {
  const url = new URL(`https://example.test/api/material-catalog${query}`);
  const bucket = new Proxy({}, { get() { throw new Error("Pesquisa não pode aceder ao R2"); } });
  const response = await exported.handleMaterialsCatalogRoute(new Request(url), { DB: database, MATERIALS_BUCKET: bucket }, url, { id: "student", role: "student" }, async (key) => key !== "materials.favorites" || favorites);
  assert.equal(response.status, 200);
  return response.json();
}

for (const size of [143, 500]) {
  test(`o catálogo com ${size} materiais respeita os limites D1 e preserva aulas e favoritos`, async () => {
    const { database, queries, close } = fixture(size);
    try {
      const data = await catalog(database);
      assert.equal(data.items.length, size);
      const linked = data.items.find((item) => item.id === "file-'quoted");
      assert.deepEqual(linked.lessonCodes, ["AT1", "AP1"]);
      assert.equal(linked.favorite, true);
      assert.equal(linked.views, 7);
      assert.equal(data.items.find((item) => item.id === "file-1").favorite, false);
      assert.equal(queries.length, 6, "Número constante de consultas, sem leitura de contadores de baralhos vazios");
      assert.equal(data.items.some((item) => item.id === "draft" || item.id === "archived"), false);

      const filtered = await catalog(database, "?unitId=fis&lesson=AP1");
      assert.deepEqual(filtered.items.map((item) => item.id), ["file-'quoted"]);
      assert.deepEqual(filtered.items[0].lessonCodes, ["AT1", "AP1"]);
      const hist = await catalog(database, "?unitId=hist");
      assert.deepEqual(hist.items.map((item) => item.id), [`file-${size - 1}`]);
      assert.deepEqual(hist.items[0].lessonCodes, []);
      assert.equal(hist.items[0].views, 0);
      assert.equal((await catalog(database, "?unitId=missing")).items.length, 0);
      const withoutFavorites = await catalog(database, "", false);
      assert.equal(withoutFavorites.items.every((item) => !item.favorite), true);
      assert.equal(withoutFavorites.capabilities.favorites, false);
      assert.equal((await viewExports.materialViewCounts({ DB: database }, "catalog", ["file-'quoted"])).size, 1);
    } finally { close(); }
  });
}

test('external Anki downloads link to OneDrive and retain access checks without R2', async () => {
  const link = 'https://1drv.ms/u/c/ed0b5401b9a1a159/IQDIjKZw5p_SSbXYhdGsW3RHATU6a_Enm74KN1p6nVvMdn0?e=Yov0wb&download=1';
  const { database, close } = fixture(2, link);
  try {
    const data = await catalog(database);
    assert.equal(data.decks[0].downloadUrl, link);
    const url = new URL('https://example.test/api/material-anki/neuro-external/download');
    const env = { DB: database, MATERIALS_BUCKET: new Proxy({}, { get() { throw Error('External downloads must not read R2'); } }) };
    const response = await exported.handleMaterialsCatalogRoute(new Request(url), env, url, { id: 'student', role: 'student' }, async () => true);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), link);
    const anonymous = await exported.handleMaterialsCatalogRoute(new Request(url), env, url, null, async () => true);
    assert.equal(anonymous.status, 401);
  } finally { close(); }
});