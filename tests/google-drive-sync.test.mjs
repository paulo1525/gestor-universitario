import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { kindFromFolder, matchUnit, runDriveSync, driveDownload } from "../worker/google-drive.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/** Minimal D1 over sql.js: prepare().bind().run()/all()/first() and batch(). */
function d1(db) {
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    async run() { db.run(sql, params); return { meta: { changes: db.getRowsModified() } }; },
    async all() { const stmt = db.prepare(sql); stmt.bind(params); const results = []; while (stmt.step()) results.push(stmt.getAsObject()); stmt.free(); return { results }; },
    async first() { return (await this.all()).results[0] ?? null; },
  });
  return { prepare: (sql) => statement(sql), async batch(list) { for (const item of list) await item.run(); return []; } };
}

async function database() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE app_module_settings (module_key TEXT PRIMARY KEY,enabled INTEGER,updated_by TEXT,updated_at INTEGER);
    CREATE TABLE curricular_units (id TEXT PRIMARY KEY,code TEXT,name TEXT,active INTEGER);
    INSERT INTO curricular_units VALUES ('unit-neuro','NEURO','Neuroanatomia',1),('unit-fis','FIS1','Fisiologia I',1);
  `);
  db.run(await read("../migrations/0057_materials_catalog_anki.sql"));
  db.run(await read("../migrations/0065_material_bibliography_formats.sql"));
  db.run(await read("../migrations/0074_public_materials_and_notes.sql"));
  db.run(await read("../migrations/0075_drive_sync_state.sql"));
  db.run(await read("../migrations/0076_neuro_slides_and_summaries.sql"));
  return db;
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = (db) => ({ DB: d1(db), GOOGLE_DRIVE_FOLDER_ID: "root", GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "sync@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }) });

/** Fake Drive: folder id → children. Records every request. */
function fakeDrive(tree) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: String(url), headers: init.headers ?? {} });
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "token-1", expires_in: 3600 });
    if (url.pathname === "/drive/v3/files") {
      const parent = url.searchParams.get("q").match(/'([^']+)' in parents/)[1];
      return Response.json({ files: tree[parent] ?? [] });
    }
    return new Response("PDF", { status: 200, headers: { "content-type": "application/pdf", "content-length": "3" } });
  };
  return calls;
}

const FOLDER = "application/vnd.google-apps.folder";

test("as pastas do Drive mapeiam para tipos e UCs", () => {
  assert.deepEqual(kindFromFolder("Resumos"), { kind: "summary", summaryFormat: "notes" });
  assert.deepEqual(kindFromFolder("Sumários"), { kind: "summary", summaryFormat: "lecture" });
  assert.equal(kindFromFolder("Bibliografia").kind, "bibliography");
  assert.equal(kindFromFolder("Anki").kind, "anki");
  assert.equal(kindFromFolder("Exames antigos").kind, "exam");
  assert.equal(kindFromFolder("Diversos").kind, "other");
  assert.deepEqual(kindFromFolder("PowerPoints"), { kind: "other", summaryFormat: null, otherFormat: "slides" });
  assert.deepEqual(kindFromFolder("Compêndios"), { kind: "other", summaryFormat: null, otherFormat: "compendium" });
  const units = [{ id: "u1", code: "NEURO", name: "Neuroanatomia" }, { id: "u2", code: "FIS1", name: "Fisiologia I" }];
  assert.equal(matchUnit("NEURO", units), "u1");
  assert.equal(matchUnit("neuroanatomia", units), "u1");
  assert.equal(matchUnit("NEURO - Neuroanatomia", units), "u1");
  assert.equal(matchUnit("Fisiologia I", units), "u2");
  assert.equal(matchUnit("Pasta pessoal", units), null);
});

test("a sincronização indexa o Drive, respeita o acesso escolhido e arquiva o que desapareceu", async () => {
  const db = await database();
  const tree = {
    root: [{ id: "f-neuro", name: "NEURO", mimeType: FOLDER }, { id: "f-x", name: "Pasta pessoal", mimeType: FOLDER }],
    "f-neuro": [{ id: "f-res", name: "Resumos", mimeType: FOLDER }, { id: "f-bib", name: "Bibliografia", mimeType: FOLDER }, { id: "loose", name: "Horário.pdf", mimeType: "application/pdf", size: "10" }],
    "f-res": [{ id: "r1", name: "Resumo AT1.pdf", mimeType: "application/pdf", size: "100" }, { id: "doc1", name: "Resumo AT2", mimeType: "application/vnd.google-apps.document" }, { id: "form", name: "Inquérito", mimeType: "application/vnd.google-apps.form" }],
    "f-bib": [{ id: "f-sub", name: "Gray", mimeType: FOLDER }],
    "f-sub": [{ id: "b1", name: "Gray pp. 1-10.pdf", mimeType: "application/pdf", size: "200" }],
  };
  fakeDrive(tree);
  const first = await runDriveSync(env(db), { force: true });
  assert.equal(first.ok, true);
  assert.equal(first.files, 4);
  assert.deepEqual(first.unmatched, ["Pasta pessoal"]);
  const rows = Object.fromEntries(db.exec("SELECT id,material_kind,summary_format,title,mime_type,storage_key,public_access,publication_status,curricular_unit_id FROM material_catalog WHERE id LIKE 'drive-%'")[0].values.map((row) => [row[0], row.slice(1)]));
  assert.deepEqual(rows["drive-r1"], ["summary", "notes", "Resumo AT1", "application/pdf", "drive:r1", 0, "published", "unit-neuro"]);
  assert.deepEqual(rows["drive-doc1"], ["summary", "notes", "Resumo AT2", "application/pdf", "drive-export:doc1", 0, "published", "unit-neuro"]);
  assert.equal(rows["drive-b1"][0], "bibliography");
  assert.equal(rows["drive-loose"][0], "other");
  assert.equal(rows["drive-form"], undefined, "native forms are not indexed");

  // The access chosen on the site survives a later sync; a file removed from Drive is archived.
  db.run("UPDATE material_catalog SET public_access=1 WHERE id='drive-r1'");
  tree["f-bib"] = [];
  db.run("UPDATE drive_sync_state SET last_started_at=0");
  const second = await runDriveSync(env(db), { force: true });
  assert.equal(second.archived, 1);
  assert.equal(db.exec("SELECT public_access FROM material_catalog WHERE id='drive-r1'")[0].values[0][0], 1);
  assert.equal(db.exec("SELECT publication_status FROM material_catalog WHERE id='drive-b1'")[0].values[0][0], "archived");
  assert.equal(db.exec("SELECT last_status,files_count FROM drive_sync_state")[0].values[0].join(","), "ok,3");
  db.close();
});

test("uma sincronização recente não é repetida sem força e um erro fica registado", async () => {
  const db = await database();
  fakeDrive({ root: [] });
  assert.ok(await runDriveSync(env(db), { force: true }));
  assert.equal(await runDriveSync(env(db)), null, "within the interval nothing runs");
  globalThis.fetch = async () => Response.json({ error: { message: "quota" } }, { status: 403 });
  db.run("UPDATE drive_sync_state SET last_started_at=0");
  const failed = await runDriveSync(env(db), { force: true });
  assert.equal(failed.ok, false);
  assert.equal(db.exec("SELECT last_status FROM drive_sync_state")[0].values[0][0], "error");
  db.close();
});

test("o download vai buscar o ficheiro ao Drive com autenticação e passa o Range ao leitor", async () => {
  const db = await database();
  const calls = fakeDrive({});
  const response = await driveDownload(new Request("https://site/api/x", { headers: { range: "bytes=0-2" } }), env(db), "drive:abc", "a.pdf", "application/pdf", "inline");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-disposition"), "inline; filename*=UTF-8''a.pdf");
  const upstream = calls.find((call) => call.url.includes("/files/abc"));
  assert.match(upstream.url, /alt=media/);
  assert.equal(upstream.headers.range, "bytes=0-2");
  assert.equal(upstream.headers.authorization, "Bearer token-1");
  const exported = await driveDownload(new Request("https://site/api/x"), env(db), "drive-export:doc", "d.pdf", "application/pdf");
  assert.equal(exported.status, 200);
  assert.match(calls.at(-1).url, /\/files\/doc\/export\?mimeType=application%2Fpdf/);
  db.close();
});

test("os segredos do Drive só existem como variáveis de ambiente", async () => {
  const example = await read("../.dev.vars.example");
  assert.match(example, /# GOOGLE_SERVICE_ACCOUNT_JSON=/);
  const wrangler = await read("../wrangler.jsonc");
  assert.doesNotMatch(wrangler, /GOOGLE_SERVICE_ACCOUNT_JSON|private_key/);
});
