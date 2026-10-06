import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import initSqlJs from "sql.js/dist/sql-asm.js";

async function compile(path, require) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  new Function("module", "exports", "require", code)(compiled, compiled.exports, require);
  return compiled.exports;
}
const policy = await compile("../worker/registration-policy.ts", () => ({}));
const worker = (await compile("../worker/index.ts", name => name === "./registration-policy" ? policy : { isAcademicHubPath: () => false, isCampusPath: () => false, isQuizPath: () => false })).default;
const SQL = await initSqlJs();
const password = "ExemploSeguro2026!";
function adapter(db) {
  return { prepare(sql) {
    let values = [];
    const execute = () => { const statement = db.prepare(sql); try { statement.bind(values); const rows = []; while(statement.step()) rows.push(statement.getAsObject()); return rows; } finally { statement.free(); } };
    return { bind(...params) { values = params; return this; }, async first() { return execute()[0] || null; }, async all() { return { results: execute() }; }, async run() { execute(); return { meta: { changes: db.getRowsModified() } }; } };
  }, async batch(statements) { db.run("BEGIN"); try { const results = []; for(const statement of statements) results.push(await statement.run()); db.run("COMMIT"); return results; } catch(error) { db.run("ROLLBACK"); throw error; } } };
}
async function fixture() {
  const db = new SQL.Database();
  for(const file of ["0001_auth", "0002_user_full_name", "0003_admin_control", "0004_commission_roles", "0005_automatic_admin_roles", "0006_class_workflow_performance"]) db.run(await readFile(new URL(`../migrations/${file}.sql`, import.meta.url), "utf8"));
  const columns = new Set(db.exec("PRAGMA table_info(users)")[0].values.map(row => row[1]));
  for(const [name, type] of [["font_scale", "TEXT DEFAULT 'normal'"], ["class_representative", "INTEGER DEFAULT 0"], ["represented_class", "INTEGER"], ["study_year", "INTEGER"], ["admin_override", "INTEGER DEFAULT 0"]]) if(!columns.has(name)) db.run(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  db.run("INSERT INTO users(id,email,full_name,password_hash,password_salt,password_iterations,role,status,email_verified_at,password_changed_at,created_at,updated_at) VALUES ('admin-test','up202500000@up.pt','Administrador fictício','','',100000,'admin','active',1,1,1,1)");
  const env = { DB: adapter(db), APP_ORIGIN: "http://127.0.0.1:3006", AUTH_PEPPER: "test-only-pepper", TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA", AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) }, RESEND_API_KEY: "fake-test-key", EMAIL_FROM: "test@example.test", LOCAL_AUTO_LOGIN_EMAIL: "up202500000@up.pt" };
  async function request(path, payload, method = "POST", extra = {}) { return worker.fetch(new Request(env.APP_ORIGIN + path, { method, headers: { origin: env.APP_ORIGIN, "content-type": "application/json" }, body: JSON.stringify(payload) }), { ...env, ...extra }); }
  const deadline = value => db.run("INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES ('email_validation_closes_at',?,1)", [value || ""]);
  return { db, env, request, deadline };
}

test("prazo de validação aplica-se no instante definido e falha fechado se estiver inválido", async () => {
  const f = await fixture();
  assert.equal((await policy.registrationPolicy(f.env, 1)).administratorValidationRequired, false);
  f.deadline("2026-10-15T22:59:00.000Z");
  const cutoff = Date.parse("2026-10-15T22:59:00.000Z");
  assert.equal((await policy.registrationPolicy(f.env, cutoff - 1)).administratorValidationRequired, false);
  assert.equal((await policy.registrationPolicy(f.env, cutoff)).administratorValidationRequired, true);
  f.deadline("invalid");
  assert.equal((await policy.registrationPolicy(f.env)).administratorValidationRequired, true);
});

test("depois do prazo o registo fica pendente, não envia email e não concede sessão", async () => {
  const f = await fixture(); f.deadline("2000-01-01T00:00:00.000Z");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Não deve enviar email após o prazo"); };
  try {
    const response = await f.request("/api/auth/register", { fullName: "Estudante Fictício", email: "up202599999@up.pt", password, turnstileToken: "local-test" });
    assert.equal(response.status, 200); assert.equal((await response.json()).next, "admin-review"); assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(f.db.exec("SELECT status FROM users WHERE email='up202599999@up.pt'")[0].values[0][0], "pending");
    assert.equal(f.db.exec("SELECT COUNT(*) FROM pending_registrations")[0].values[0][0], 0);
    const wrong = await f.request("/api/auth/login", { email: "up202599999@up.pt", password: "errada", turnstileToken: "local-test" });
    assert.equal(wrong.status, 401); assert.equal((await wrong.json()).code, undefined);
    const login = await f.request("/api/auth/login", { email: "up202599999@up.pt", password, turnstileToken: "local-test" });
    assert.equal(login.status, 403); assert.equal((await login.json()).code, "ADMIN_VALIDATION_REQUIRED"); assert.equal(login.headers.get("set-cookie"), null);
    const userId = f.db.exec("SELECT id FROM users WHERE email='up202599999@up.pt'")[0].values[0][0];
    const approval = await f.request("/api/admin/users", { id: userId, fullName: "Estudante Fictício", status: "active" }, "PATCH");
    assert.equal(approval.status, 200);
    const approved = await f.request("/api/auth/login", { email: "up202599999@up.pt", password, turnstileToken: "local-test" });
    assert.equal(approved.status, 200); assert.ok(approved.headers.get("set-cookie"));
  } finally { globalThis.fetch = previousFetch; }
});

test("códigos anteriores ao prazo deixam de ativar contas; sem prazo continuam válidos", async () => {
  const f = await fixture(); let code;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { assert.equal(url, "https://api.resend.com/emails"); code = JSON.parse(options.body).subject.match(/\d{6}/)[0]; return Response.json({ id: "fake-email" }); };
  try {
    const registered = await f.request("/api/auth/register", { fullName: "Estudante Fictício", email: "up202599998@up.pt", password, turnstileToken: "local-test" });
    assert.equal(registered.status, 200); assert.equal((await registered.json()).next, "verify");
    f.deadline("2000-01-01T00:00:00.000Z");
    const blocked = await f.request("/api/auth/verify", { email: "up202599998@up.pt", code });
    assert.equal(blocked.status, 403); assert.equal(blocked.headers.get("set-cookie"), null);
    assert.equal(f.db.exec("SELECT status FROM users WHERE email='up202599998@up.pt'")[0].values[0][0], "pending");
    f.deadline(null);
    const verified = await f.request("/api/auth/verify", { email: "up202599998@up.pt", code });
    assert.equal(verified.status, 200); assert.ok(verified.headers.get("set-cookie"));
  } finally { globalThis.fetch = previousFetch; }
});

test("só administradores podem guardar o prazo; datas inválidas são recusadas e mudanças são auditadas", async () => {
  const f = await fixture();
  const denied = await f.request("/api/admin/settings", { section: "registration", emailValidationClosesAt: null }, "PUT", { LOCAL_AUTO_LOGIN_EMAIL: "" });
  assert.equal(denied.status, 403);
  for(const value of ["invalid", "2026-02-31T22:59:00.000Z", undefined]) {
    assert.equal((await f.request("/api/admin/settings", { section: "registration", emailValidationClosesAt: value }, "PUT")).status, 400);
  }
  const saved = await f.request("/api/admin/settings", { section: "registration", emailValidationClosesAt: "2026-10-15T22:59:00.000Z" }, "PUT");
  assert.equal(saved.status, 200); assert.equal((await saved.json()).emailValidationClosesAt, "2026-10-15T22:59:00.000Z");
  assert.equal(f.db.exec("SELECT COUNT(*) FROM admin_audit_log WHERE action='registration_policy_updated'")[0].values[0][0], 1);
  assert.equal((await f.request("/api/admin/settings", { section: "registration", emailValidationClosesAt: null }, "PUT")).status, 200);
});
