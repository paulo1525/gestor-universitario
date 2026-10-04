import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import initSqlJs from "sql.js/dist/sql-asm.js";

const compiled = ts.transpileModule(readFileSync(new URL("../worker/academic-hub.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported, require: key => key === "./materials-catalog" ? { isMaterialsCatalogPath: () => false } : key === "./material-uploads" ? { isMaterialUploadPath: () => false } : {}, Request, Response, URL, crypto, TextEncoder, TextDecoder });
const SQL = await initSqlJs();

function fixture() {
  const db = new SQL.Database();
  db.run(`CREATE TABLE notification_preferences(user_id TEXT PRIMARY KEY, announcements_enabled INTEGER,calendar_enabled INTEGER,polls_enabled INTEGER,requests_enabled INTEGER,materials_enabled INTEGER,email_enabled INTEGER,urgent_only INTEGER,curricular_unit_ids TEXT);
    CREATE TABLE notification_states(user_id TEXT,source_type TEXT,source_id TEXT,read_at INTEGER,archived_at INTEGER,updated_at INTEGER,PRIMARY KEY(user_id,source_type,source_id));
    CREATE TABLE announcements(id TEXT PRIMARY KEY,title TEXT,body TEXT,priority TEXT,status TEXT,expires_at INTEGER,published_at INTEGER);
    CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE academic_events(id TEXT,title TEXT,description TEXT,event_type TEXT,curricular_unit_id TEXT,starts_at INTEGER,visibility TEXT,status TEXT);
    CREATE TABLE polls(id TEXT,title TEXT,description TEXT,created_at INTEGER,status TEXT,starts_at INTEGER,ends_at INTEGER);
    CREATE TABLE course_requests(id TEXT,subject TEXT,status TEXT,curricular_unit_id TEXT,updated_at INTEGER,submitted_by TEXT);
    CREATE TABLE material_submissions(id TEXT,title TEXT,description TEXT,curricular_unit_id TEXT,updated_at INTEGER,status TEXT,material_type TEXT);`);
  const statements = [];
  const D1 = { prepare(sql) {
    let params = [];
    const rows = () => { const statement = db.prepare(sql); try { statement.bind(params); const items = []; while (statement.step()) items.push(statement.getAsObject()); return items; } finally { statement.free(); } };
    return { bind(...values) { params = values; return this; }, async all() { return { results: rows() }; }, async first() { return rows()[0] ?? null; }, async run() { statements.push(sql); db.run(sql, params); return { meta: { changes: db.getRowsModified() } }; } };
  } };
  D1.batch = async queries => {
    db.run("BEGIN");
    try { const results = []; for (const query of queries) results.push(await query.run()); db.run("COMMIT"); return results; }
    catch (error) { db.run("ROLLBACK"); throw error; }
  };
  const user = id => ({ id, role: "student", commissionPosition: null, commissionDepartment: null });
  const call = async (method, body, actor = user("student-a"), enabled = true) => {
    const url = new URL("https://example.test/api/notifications?limit=100&includeArchived=true");
    const response = await exported.handleAcademicHubRoute(new Request(url, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) }), { DB: D1 }, url, actor, async () => enabled);
    return { status: response.status, body: await response.json() };
  };
  return { db, statements, user, call };
}

test("marcar todas cobre mais de cem notificações, preserva as arquivadas e os estados de outras contas", async () => {
  const { db, statements, user, call } = fixture();
  try {
    for (let i = 0; i < 150; i++) db.run("INSERT INTO announcements VALUES (?,?,?,'normal','published',NULL,?)", ["notice-" + i, "Aviso fictício " + i, "Conteúdo", i]);
    db.run("INSERT INTO announcements VALUES ('draft','Rascunho','','normal','draft',NULL,0),('expired','Expirado','','normal','published',1,0)");
    db.run("INSERT INTO notification_states VALUES ('student-a','announcement','notice-0',NULL,123,123),('student-a','announcement','notice-1',456,NULL,456),('student-b','announcement','notice-2',789,NULL,789)");
    assert.equal((await call("GET")).body.notifications.length, 100);
    const result = await call("PATCH", { action: "mark_all_read", userId: "student-b" });
    assert.equal(result.status, 200);
    assert.equal(result.body.updated, 148);
    assert.equal(statements.length, 1);
    assert.equal(db.exec("SELECT COUNT(*) FROM notification_states WHERE user_id='student-a' AND read_at IS NOT NULL")[0].values[0][0], 149);
    assert.deepEqual(db.exec("SELECT read_at,archived_at FROM notification_states WHERE user_id='student-a' AND source_id='notice-0'")[0].values, [[null, 123]]);
    assert.equal(db.exec("SELECT read_at FROM notification_states WHERE user_id='student-b'")[0].values[0][0], 789);
    assert.equal(db.exec("SELECT COUNT(*) FROM notification_states WHERE source_id IN ('draft','expired')")[0].values[0][0], 0);
    assert.equal((await call("PATCH", { all: true })).body.updated, 0);
    assert.equal((await call("PATCH", { all: true }, null)).status, 401);
    assert.equal((await call("PATCH", { all: true }, user("student-a"), false)).status, 404);
  } finally { db.close(); }
});

test("marcar todas respeita categorias, urgência, unidades curriculares e pedidos privados", async () => {
  const { db, call } = fixture();
  try {
    db.run("INSERT INTO notification_preferences VALUES ('student-a',1,0,0,1,0,0,1,'[\"unit-a\"]')");
    db.run("INSERT INTO announcements VALUES ('normal','Normal','','normal','published',NULL,0),('urgent','Urgente','','urgent','published',NULL,0)");
    db.run("INSERT INTO course_requests VALUES ('own','Pedido','open','unit-a',0,'student-a'),('other','Pedido','resolved','unit-a',0,'student-b')");
    const result = await call("PATCH", { all: true });
    assert.equal(result.body.updated, 1);
    assert.deepEqual(db.exec("SELECT source_id FROM notification_states")[0].values, [["urgent"]]);
    db.run("UPDATE notification_preferences SET urgent_only=0; INSERT INTO course_requests VALUES ('allowed','Meu pedido','open','unit-a',1,'student-a'),('excluded-unit','Meu pedido','open','unit-b',1,'student-a')");
    assert.equal((await call("PATCH", { all: true })).body.updated, 3);
    assert.equal(db.exec("SELECT COUNT(*) FROM notification_states WHERE source_id IN ('other','excluded-unit')")[0].values[0][0], 0);
  } finally { db.close(); }
});

test("o aviso conserva o HTML completo, incluindo links depois dos primeiros trezentos caracteres", async () => {
  const { db, call } = fixture();
  try {
    const body = "<p>" + "Texto longo. ".repeat(40) + '</p><p><a href="https://example.test/materiais/">Clicar aqui</a></p><p>Bons estudos</p>';
    db.run("INSERT INTO announcements VALUES ('long','Aviso longo',?,'important','published',NULL,0)", [body]);
    assert.equal((await call("GET")).body.notifications[0].body, body);
  } finally { db.close(); }
});

test("arquivar e restaurar preserva a leitura e altera apenas o arquivo da própria conta", async () => {
  const { db, call } = fixture();
  try {
    db.run("INSERT INTO announcements VALUES ('notice','Aviso fictício','','important','published',NULL,0)");
    db.run("INSERT INTO notification_states VALUES ('student-a','announcement','notice',456,NULL,456),('student-b','announcement','notice',789,NULL,789)");
    assert.equal((await call("PATCH", { sourceType: "announcement", sourceId: "notice", archived: true, userId: "student-b" })).status, 200);
    assert.equal((await call("GET")).body.notifications[0].archived, true);
    assert.equal((await call("GET")).body.notifications[0].readAt, 456);
    assert.deepEqual(db.exec("SELECT read_at,archived_at FROM notification_states WHERE user_id='student-b'")[0].values, [[789, null]]);
    assert.equal((await call("PATCH", { sourceType: "announcement", sourceId: "notice", archived: false })).status, 200);
    assert.equal((await call("GET")).body.notifications[0].archived, false);
    assert.deepEqual(db.exec("SELECT read_at,archived_at FROM notification_states WHERE user_id='student-a'")[0].values, [[456, null]]);
  } finally { db.close(); }
});
