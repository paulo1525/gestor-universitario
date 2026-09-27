import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import initSqlJs from "sql.js/dist/sql-asm.js";

const source = await readFile(new URL("../worker/material-views.ts", import.meta.url), "utf8");
const compiled = { exports: {} };
new Function("module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(compiled, compiled.exports);
const { recordMaterialView, materialViewCounts } = compiled.exports;
const migration = await readFile(new URL("../migrations/0091_material_views.sql", import.meta.url), "utf8");
const SQL = await initSqlJs();
const user = { id: "test-user" };
const enabled = async () => true;

function fixture(migrate = true) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE material_catalog(id TEXT PRIMARY KEY, publication_status TEXT, public_access INTEGER,storage_state TEXT,storage_backend TEXT);
    CREATE TABLE material_anki_decks(id TEXT PRIMARY KEY,publication_status TEXT,public_access INTEGER,storage_state TEXT,storage_backend TEXT);
    INSERT INTO material_catalog VALUES ('pdf','published',1,'ready','r2'),('private','published',0,'ready','r2'),('draft','draft',1,'ready','r2'),('pending','published',1,'pending','r2'),('reference','published',1,'ready','inline');
    INSERT INTO material_anki_decks VALUES ('pdf','published',1,'ready','r2');`);
  if (migrate) { db.run(migration); db.run(migration); }
  const env = { AUTH_PEPPER: "test-only-secret", AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) }, DB: { prepare(sql) {
    let params = [];
    const execute = () => {
      const stmt = db.prepare(sql);
      try { stmt.bind(params); const results = []; while (stmt.step()) results.push(stmt.getAsObject()); return results; }
      finally { stmt.free(); }
    };
    return { bind(...values) { params = values; return this; }, async first() { return execute()[0] ?? null; }, async all() { return { results: execute() }; }, async run() { execute(); return { meta: { changes: db.getRowsModified() } }; } };
  } } };
  return { db, env };
}
function call(f, { id = "pdf", type = "catalog", actor = user, method = "POST", headers = {}, modules = enabled } = {}) {
  return recordMaterialView(new Request(`https://example.test/api/material-views/${type}/${id}`, { method, headers }), f.env, type, id, actor, modules);
}

test("views persist, deduplicate for 30 minutes and distinguish materials, people and Anki", async (t) => {
  const f = fixture();
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  try {
    assert.deepEqual(await (await call(f)).json(), { views: 1, counted: true });
    assert.deepEqual(await (await call(f)).json(), { views: 1, counted: false });
    assert.deepEqual(await (await call(f, { actor: { id: "other" } })).json(), { views: 2, counted: true });
    assert.deepEqual(await (await call(f, { type: "anki" })).json(), { views: 1, counted: true });
    assert.deepEqual(await (await call(f, { id: "private" })).json(), { views: 1, counted: true });
    now += 1800000 - 1;
    assert.deepEqual(await (await call(f)).json(), { views: 2, counted: false });
    now += 1;
    assert.deepEqual(await (await call(f)).json(), { views: 3, counted: true });
    assert.equal((await materialViewCounts(f.env, "anki")).get("pdf"), 1);
    const rows = f.db.exec("SELECT viewer_hash FROM material_view_visitors")[0].values;
    assert.ok(rows.every(([hash]) => /^[a-f0-9]{64}$/.test(hash)));
  } finally { f.db.close(); }
});

test("GET, HEAD, cross-site, disabled, unpublished and unavailable resources never count", async () => {
  const f = fixture();
  try {
    for (const method of ["GET", "HEAD", "DELETE"]) assert.equal((await call(f, { method })).status, 405);
    assert.equal((await call(f, { headers: { origin: "https://other.test" } })).status, 403);
    assert.equal((await call(f, { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
    assert.equal((await call(f, { modules: async () => false })).status, 404);
    for (const id of ["draft", "missing"]) assert.equal((await call(f, { id })).status, 404);
    for (const id of ["pending", "reference"]) assert.equal((await call(f, { id })).status, 409);
    assert.equal((await materialViewCounts(f.env, "catalog")).size, 0);
  } finally { f.db.close(); }
});

test("anonymous views require a public resource, use a pseudonymous key and respect the limiter", async () => {
  const f = fixture();
  try {
    const options = { actor: null, headers: { "cf-connecting-ip": "192.0.2.10" } };
    for (const id of ["private", "draft", "missing"]) assert.equal((await call(f, { ...options, id })).status, 401);
    assert.deepEqual(await (await call(f, options)).json(), { views: 1, counted: true });
    assert.deepEqual(await (await call(f, options)).json(), { views: 1, counted: false });
    assert.equal((await call(f, { actor: null })).status, 503);
    f.env.AUTH_RATE_LIMITER.limit = async () => ({ success: false });
    assert.equal((await call(f, { actor: { id: "rate-limited" } })).status, 429);
    assert.equal((await materialViewCounts(f.env, "catalog")).get("pdf"), 1);
  } finally { f.db.close(); }
});

test("a pending migration degrades safely and does not report a fabricated zero", async () => {
  const f = fixture(false);
  try {
    assert.equal(await materialViewCounts(f.env, "catalog"), null);
    assert.equal((await call(f)).status, 503);
  } finally { f.db.close(); }
});

test("repeated simultaneous opens retain a single aggregate increment", async () => {
  const f = fixture();
  try {
    const responses = await Promise.all(Array.from({ length: 12 }, () => call(f)));
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.equal(bodies.filter((body) => body.counted).length, 1);
    assert.equal((await materialViewCounts(f.env, "catalog")).get("pdf"), 1);
  } finally { f.db.close(); }
});
