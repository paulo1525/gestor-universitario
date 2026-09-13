import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import initSqlJs from "sql.js/dist/sql-asm.js";

const sanitizerSource = await readFile(new URL("../lib/announcement-content.ts", import.meta.url), "utf8");
const sanitizerUri = "data:text/javascript;base64," + Buffer.from(ts.transpileModule(sanitizerSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString("base64");
const code = (await readFile(new URL("../worker/study-annotations.ts", import.meta.url), "utf8")).replace("@/lib/announcement-content", sanitizerUri);
const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { handleStudyAnnotations } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const migration = await readFile(new URL("../migrations/0040_private_study_annotations.sql", import.meta.url), "utf8");
const SQL = await initSqlJs();
const source = "Uma frase de estudo com substância cinzenta.";
const annotation = { id: "11111111-1111-4111-8111-111111111111", paragraphId: "paragraph-1", start: 0, end: 9, quote: "Uma frase", note: "Rever antes da aula.", color: "yellow", revision: 0 };

function context() {
  let currentSource = source;
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('a'),('b'),('admin');");
  db.run(migration);
  const DB = { prepare(sql) {
    return { bind(...bindings) {
      const rows = () => {
        const query = db.prepare(sql); query.bind(bindings); const result = [];
        while (query.step()) result.push(query.getAsObject()); query.free(); return result;
      };
      return {
        async first() { return rows()[0] ?? null; },
        async all() { return { results: rows() }; },
        async run() { db.run(sql, bindings); return { meta: { changes: db.getRowsModified() } }; },
      };
    } };
  } };
  const call = async (method, body, user = { id: "a" }, enabled = true) => {
    const request = new Request("https://example.test/api/study/neuro-ap1/annotations", { method, ...(method === "GET" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return handleStudyAnnotations(request, { DB }, user, async () => enabled, (id) => id === "paragraph-1" ? currentSource : id === "document" ? "" : undefined);
  };
  return { db, call, reviseSource: (text) => { currentSource = text; } };
}

test("revising a lesson preserves existing private notes while rejecting fabricated anchors", async () => {
  const { db, call, reviseSource } = context();
  try {
    await call("PUT", annotation);
    reviseSource("Texto novo.");
    const update = await call("PUT", { ...annotation, revision: 1, note: "Nota ainda editável", color: "blue" });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).annotation.quote, "Uma frase");
    assert.equal((await call("PUT", { ...annotation, id: "22222222-2222-4222-8222-222222222222" })).status, 400);
    assert.equal((await call("PUT", { ...annotation, revision: 2, quote: "Inventado" })).status, 400);
    assert.equal((await call("PUT", { ...annotation, revision: 2 }, { id: "b" })).status, 400);
    assert.equal((await call("PUT", { ...annotation, revision: 1 })).status, 409);
    reviseSource(undefined);
    assert.equal((await call("PUT", { ...annotation, revision: 2, note: "Parágrafo removido, nota preservada" })).status, 200);
  } finally { db.close(); }
});

test("personal annotations require authentication and the enabled materials module", async () => {
  const { db, call } = context();
  try {
    assert.equal((await call("GET", null, null)).status, 401);
    assert.equal((await call("GET", null, { id: "a" }, false)).status, 404);
    assert.equal((await call("POST", annotation)).status, 405);
  } finally { db.close(); }
});

test("annotations survive reload and users cannot read, update or delete each other's notes", async () => {
  const { db, call } = context();
  try {
    assert.equal((await call("PUT", annotation)).status, 200);
    const response = await call("GET");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).annotations[0].note, annotation.note);
    assert.deepEqual((await (await call("GET", null, { id: "b" })).json()).annotations, []);
    assert.equal((await call("PUT", { ...annotation, revision: 1, note: "Changed", user_id: "a" }, { id: "b" })).status, 409);
    assert.equal((await call("DELETE", { id: annotation.id, revision: 1 }, { id: "b" })).status, 200);
    assert.equal((await (await call("GET")).json()).annotations.length, 1);
    assert.deepEqual((await (await call("GET", null, { id: "a", actorId: "admin" })).json()).annotations, []);
  } finally { db.close(); }
});

test("duplicate retries are idempotent and stale edits/deletions preserve the saved note", async () => {
  const { db, call } = context();
  try {
    await call("PUT", annotation);
    await call("PUT", annotation);
    assert.equal((await (await call("GET")).json()).annotations.length, 1);
    const edited = await (await call("PUT", { ...annotation, revision: 1, note: "Nova nota" })).json();
    assert.equal(edited.annotation.revision, 2);
    assert.equal((await call("PUT", { ...annotation, revision: 1, note: "Nota antiga" })).status, 409);
    assert.equal((await call("DELETE", { id: annotation.id, revision: 1 })).status, 409);
    assert.equal((await (await call("GET")).json()).annotations[0].note, "Nova nota");
    assert.equal((await call("DELETE", { id: annotation.id, revision: 2 })).status, 200);
    assert.equal((await (await call("GET")).json()).annotations.length, 0);
  } finally { db.close(); }
});

test("annotation anchors and limits are checked against the actual text on the server", async () => {
  const { db, call } = context();
  try {
    for (const invalid of [
      { paragraphId: "missing" }, { start: -1 }, { end: 9999 }, { quote: "Texto inventado" },
      { note: "x".repeat(12001) }, { color: "red" }, { revision: -1 }, { id: "../../another-user" },
      { start: 0, end: 0, quote: "", note: " " },
    ]) assert.equal((await call("PUT", { ...annotation, ...invalid })).status, 400, JSON.stringify(invalid).slice(0,100));
    const response = await call("PUT", { ...annotation, paragraphId: "document", start: 0, end: 0, quote: "", note: "Apontamento livre" });
    assert.equal(response.status, 200);
  } finally { db.close(); }
});

test("formatted notes persist with safe headings, lists and links, and reject visually empty notes", async () => {
  const { db, call } = context();
  try {
    const draft = { ...annotation, note: '<h3 onclick="evil()">Revisão</h3><p><b>Estudar</b></p><ul><li>Raízes</li></ul><img src=x onerror=evil()><a href="javascript:evil()">link</a>' };
    assert.equal((await call("PUT", draft)).status, 200);
    const saved = (await (await call("GET")).json()).annotations[0];
    assert.equal(saved.note, '<h3>Revisão</h3><p><b>Estudar</b></p><ul><li>Raízes</li></ul><a>link</a>');
    assert.equal((await call("PUT", draft)).status, 200);
    assert.equal((await call("PUT", { ...annotation, paragraphId: 'document', start: 0, end: 0, quote: '', note: '<p><br></p>' })).status, 400);
  } finally { db.close(); }
});
