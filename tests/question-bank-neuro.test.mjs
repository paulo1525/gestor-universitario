import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0059_question_bank_neuro.sql", import.meta.url), "utf8");

function database({ withNeuro = true, withActor = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE app_module_settings (module_key TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT NOT NULL, status TEXT NOT NULL, commission_department TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE curricular_units (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, ects REAL NOT NULL, study_year INTEGER NOT NULL, semester INTEGER NOT NULL, representative_user_id TEXT, active INTEGER NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO users (id,role,status,commission_department,created_at) VALUES ('actor-test','admin','active','management',1);
  `);
  if (withActor) db.exec("UPDATE users SET status='active' WHERE id='actor-test'");
  if (!withActor) db.exec("UPDATE users SET status='suspended'");
  if (withNeuro) db.exec("INSERT INTO curricular_units (id,code,name,ects,study_year,semester,active,created_by,updated_by,created_at,updated_at) VALUES ('unit-neuro','NEURO','Neuroanatomia',6,2,1,1,'actor-test','actor-test',1,1)");
  return db;
}

test("a migration importa a origem canónica com proveniência anonimizada", () => {
  const db = database();
  db.exec(migration);
  const source = db.prepare("SELECT * FROM question_bank_sources").get();
  assert.equal(source.locator, "184x7c5w44eZJ5SsUlgUlDMKyOoUNvQGRH74YGvdETUQ");
  assert.equal(source.source_row_count, 1370);
  assert.equal(source.imported_count, 1207);
  assert.equal(source.published_count, 890);
  assert.equal(source.review_count, 317);
  assert.equal(source.verification_status, "review");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_topics").get().count, 21);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items").get().count, 1207);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE status='published'").get().count, 890);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE status='review'").get().count, 317);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE status='published' AND trim(review_note)<>''").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE status='published' AND response_type='multiple_choice'").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE status='published' AND response_type='multiple_choice' AND (instr(lower(options_text),'a)')=0 OR instr(lower(options_text),'b)')=0)").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT lower(trim(prompt))) AS count FROM question_bank_items").get().count, 1207);
  const typeCounts = Object.fromEntries(db.prepare("SELECT response_type,COUNT(*) AS count FROM question_bank_items GROUP BY response_type ORDER BY response_type").all().map((item) => [item.response_type, item.count]));
  assert.deepEqual(typeCounts, { case: 18, multiple_choice: 169, short_answer: 1020 });
  assert.equal(db.prepare("SELECT COUNT(DISTINCT source_subtopic) AS count FROM question_bank_items").get().count, 149);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT source_academic_year) AS count FROM question_bank_items").get().count, 6);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT source_assessment) AS count FROM question_bank_items").get().count, 11);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT source_session) AS count FROM question_bank_items").get().count, 21);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE validation_state='VALIDADO' AND confidence='ALTO'").get().count, 1207);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE status='review' AND trim(review_note)<>''").get().count, 317);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items WHERE options_text<>'' AND answer_indicated<>'' AND answer_text<>''").get().count, 1207);
  const itemColumns = new Set(db.prepare("PRAGMA table_info(question_bank_items)").all().map((column) => column.name));
  for (const column of ["source_original", "anatomical_justification"]) assert.ok(itemColumns.has(column));
  assert.match(String(source.coverage_json), /"subtopic":\{"nonEmpty":1370,"distinct":154\}/);
  assert.match(String(source.coverage_json), /"columns":18/);
  assert.match(String(source.coverage_json), /"reviewTotal":317/);
  assert.match(String(source.coverage_json), /sourceOriginal/);
  assert.match(String(source.coverage_json), /anatomicalJustification/);
  assert.doesNotMatch(migration, /mimed/i);
  assert.doesNotMatch(migration, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i);
  assert.doesNotMatch(migration, /up\d{9}/i);
});

test("a carga é idempotente e mantém a divisão publicada/revisão", () => {
  const db = database();
  db.exec(migration);
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_sources").get().count, 1);
  const source = db.prepare("SELECT published_count,review_count,verification_status FROM question_bank_sources").get();
  assert.equal(source.published_count, 890);
  assert.equal(source.review_count, 317);
  assert.equal(source.verification_status, "review");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_topics").get().count, 21);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM question_bank_items").get().count, 1207);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT external_key) AS count FROM question_bank_items").get().count, 1207);
});

test("uma base sem UC NEURO ativa ou ator técnico falha explicitamente", () => {
  assert.throws(() => database({ withNeuro: false }).exec(migration), /NOT NULL constraint failed/);
  assert.throws(() => database({ withActor: false }).exec(migration), /NOT NULL constraint failed/);
});
