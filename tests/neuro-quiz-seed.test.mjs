import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const unitMigration = readFileSync(new URL("../migrations/0034_seed_second_year_curricular_units.sql", import.meta.url), "utf8");
const quizMigration = readFileSync(new URL("../migrations/0035_seed_neuro_aula1_quiz.sql", import.meta.url), "utf8");
const bank = JSON.parse(readFileSync(new URL("../data/quizzes/neuro-aula-1.json", import.meta.url), "utf8"));

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY,role TEXT NOT NULL,status TEXT NOT NULL,commission_position TEXT,commission_department TEXT,created_at INTEGER NOT NULL);
    CREATE TABLE curricular_units (id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,ects REAL NOT NULL,study_year INTEGER NOT NULL,semester INTEGER NOT NULL,representative_user_id TEXT,active INTEGER NOT NULL,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE curricular_unit_representatives (curricular_unit_id TEXT NOT NULL,user_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(curricular_unit_id,position));
    CREATE TABLE quiz_topics (id TEXT PRIMARY KEY,curricular_unit_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,published_at INTEGER,published_by TEXT,archived_at INTEGER,archived_by TEXT,deleted_at INTEGER,deleted_by TEXT,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(curricular_unit_id,title));
    CREATE TABLE quiz_questions (id TEXT PRIMARY KEY,curricular_unit_id TEXT NOT NULL,topic_id TEXT NOT NULL,prompt TEXT NOT NULL,image_url TEXT,explanation TEXT NOT NULL,difficulty TEXT NOT NULL,status TEXT NOT NULL,published_at INTEGER,published_by TEXT,archived_at INTEGER,archived_by TEXT,deleted_at INTEGER,deleted_by TEXT,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE quiz_question_options (id TEXT PRIMARY KEY,question_id TEXT NOT NULL,option_text TEXT NOT NULL,position INTEGER NOT NULL,is_correct INTEGER NOT NULL,UNIQUE(question_id,position));
    CREATE TABLE quiz_imports (id TEXT PRIMARY KEY,filename TEXT NOT NULL,curricular_unit_id TEXT,row_count INTEGER NOT NULL,topics_created INTEGER NOT NULL,questions_created INTEGER NOT NULL,imported_by TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id TEXT,action TEXT NOT NULL,details TEXT,created_at INTEGER NOT NULL);
    CREATE TRIGGER quiz_question_options_one_correct_insert BEFORE INSERT ON quiz_question_options WHEN NEW.is_correct=1 AND EXISTS (SELECT 1 FROM quiz_question_options WHERE question_id=NEW.question_id AND is_correct=1) BEGIN SELECT RAISE(ABORT,'one correct'); END;
    INSERT INTO users VALUES ('admin','admin','active','principal_admin','management',1);
  `);
  db.exec(unitMigration);
  return db;
}

test("a primeira aula publica 50 perguntas, quatro opções e uma resposta correta", () => {
  const db = database();
  db.exec(quizMigration);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_questions").get().count, 50);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_question_options").get().count, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_questions WHERE status='published'").get().count, 50);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_questions WHERE image_url IS NOT NULL").get().count, 11);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM (SELECT question_id,SUM(is_correct) AS correct,COUNT(*) AS options FROM quiz_question_options GROUP BY question_id HAVING correct<>1 OR options<>4)").get().count, 0);
  assert.equal(db.prepare("SELECT title FROM quiz_topics").get().title, bank.theme);
});

test("a carga das perguntas é idempotente e mantém os recursos visuais internos", () => {
  const db = database();
  db.exec(quizMigration);
  db.exec(quizMigration);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_questions").get().count, 50);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_question_options").get().count, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quiz_imports").get().count, 1);
  const images = db.prepare("SELECT DISTINCT image_url FROM quiz_questions WHERE image_url IS NOT NULL").all();
  assert.equal(images.length, 8);
  for (const item of images) {
    assert.match(item.image_url, /^\/quiz-images\/neuro\/aula-1\//);
    assert.equal(existsSync(new URL(`../public${item.image_url}`, import.meta.url)), true, item.image_url);
  }
});

test("o banco de autoria preserva proveniência e não inclui matéria da página 9", () => {
  assert.equal(bank.questions.length, 50);
  assert.deepEqual(bank.source.pdfPages, [4, 5, 6, 7, 8]);
  assert.equal(bank.questions.every((question) => question.sourcePage >= 4 && question.sourcePage <= 8), true);
  assert.equal(bank.questions.every((question) => question.options.length === 4 && question.correctOption >= 0 && question.correctOption <= 3), true);
  assert.equal(bank.questions.filter((question) => question.imageAssetId).length, 11);
  assert.doesNotMatch(JSON.stringify(bank.questions), /neurula(?:ção|cao)|placa neural|neuroporo/i);
});

test("a migration não contém dados pessoais e exige uma UC NEURO ativa e um administrador", () => {
  assert.doesNotMatch(quizMigration, /up\d{9}@/i);
  assert.match(quizMigration, /cu\.code='NEURO' AND cu\.active=1/);
  assert.match(quizMigration, /commission_position='principal_admin'/);
  const db = database();
  db.exec("UPDATE curricular_units SET active=0 WHERE code='NEURO'");
  assert.throws(() => db.exec(quizMigration), /NOT NULL constraint failed/);
});
