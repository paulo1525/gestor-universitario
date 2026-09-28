import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import typescript from "typescript";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const compiled = typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText;
const exported = {};
vm.runInNewContext(compiled, {
  exports: exported,
  require(specifier) {
    if (specifier === "@/lib/announcement-content") return { sanitizeRichTextHtml: value => value, richTextPlainText: value => value };
    if (specifier === "./materials-catalog") return { isMaterialsCatalogPath: () => false };
    if (specifier === "./material-uploads") return { isMaterialUploadPath: () => false };
    return {};
  },
  Request, Response, URL, crypto, TextEncoder, TextDecoder,
});

test("eventos pessoais pertencem à conta, mesmo para membros da Comissão e pedidos manipulados", async () => {
  const SQL = await initSqlJs({ locateFile: file => require.resolve(`sql.js/dist/${file}`) });
  const db = new SQL.Database();
  db.run("CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE curricular_units(id TEXT PRIMARY KEY,active INTEGER,code TEXT,name TEXT,ects INTEGER,study_year INTEGER,semester INTEGER); CREATE TABLE academic_events(id TEXT PRIMARY KEY, visibility TEXT, ends_at INTEGER, starts_at INTEGER, curricular_unit_id TEXT, status TEXT);");
  db.run(readFileSync(new URL("../migrations/0095_private_calendar_events.sql", import.meta.url), "utf8"));
  db.run("INSERT INTO users(id) VALUES ('student-a'),('student-b');");
  const D1 = {
    prepare(sql) {
      let params = [];
      const rows = () => {
        const statement = db.prepare(sql);
        statement.bind(params);
        const result = [];
        while (statement.step()) result.push(statement.getAsObject());
        statement.free();
        return result;
      };
      return {
        bind(...values) { params = values; return this; },
        async all() { return { results: rows() }; },
        async first() { return rows()[0] || null; },
        async run() { db.run(sql, params); return { meta: { changes: db.getRowsModified() } }; },
      };
    },
  };
  const makeUser = (id, commissionPosition = null) => ({ id, role: "student", commissionPosition, commissionDepartment: null });
  const call = async (path, method, user, body) => {
    const url = new URL(`https://example.test${path}`);
    const request = new Request(url, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const response = await exported.handleAcademicHubRoute(request, { DB: D1 }, url, user, async () => true);
    return { status: response.status, body: await response.json() };
  };
  const start = "2026-10-01T15:00:00.000Z", end = "2026-10-01T17:00:00.000Z";
  const payload = { title: "Estudar Fisiologia", type: "study", startsAt: start, endsAt: end, ownerId: "student-b", visibility: "public", scope: "commission" };
  assert.equal((await call("/api/calendar-events", "POST", makeUser("student-a"), payload)).status, 403);
  const created = await call("/api/personal-calendar-events", "POST", makeUser("student-a"), payload);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await call("/api/personal-calendar-events", "GET", makeUser("student-a"))).body.events[0].scope, "personal");
  assert.deepEqual((await call("/api/personal-calendar-events", "GET", makeUser("student-b", "member"))).body.events, []);
  assert.deepEqual((await call("/api/calendar-events", "GET", makeUser("student-b", "member"))).body.events, []);
  assert.equal((await call("/api/personal-calendar-events", "PUT", makeUser("student-b", "member"), { ...payload, id, title: "Invadido" })).status, 404);
  assert.equal((await call("/api/personal-calendar-events", "PATCH", makeUser("student-b"), { id, startsAt: start, endsAt: end })).status, 404);
  assert.equal((await call("/api/personal-calendar-events", "DELETE", makeUser("student-b"), { id })).status, 404);
  assert.equal((await call("/api/personal-calendar-events", "GET", null)).status, 401);
  assert.equal((await call("/api/personal-calendar-events", "GET", makeUser("student-a"))).body.events[0].title, "Estudar Fisiologia");
  assert.equal((await call("/api/personal-calendar-events", "DELETE", makeUser("student-a"), { id })).status, 200);
  assert.deepEqual((await call("/api/personal-calendar-events", "GET", makeUser("student-a"))).body.events, []);
  db.close();
});
