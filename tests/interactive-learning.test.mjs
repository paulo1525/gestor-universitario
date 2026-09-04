import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import initSqlJs from "sql.js/dist/sql-asm.js";

const migration = await readFile(new URL("../migrations/0039_interactive_learning.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/learning.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const hub = await readFile(new URL("../components/learning-hub.tsx", import.meta.url), "utf8");
const quizHub = await readFile(new URL("../components/quiz-hub.tsx", import.meta.url), "utf8");
const modules = await readFile(new URL("../lib/app-modules.ts", import.meta.url), "utf8");

test("a migration é executável e publica o percurso inicial completo", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE app_module_settings (module_key TEXT PRIMARY KEY,enabled INTEGER,updated_by TEXT,updated_at INTEGER);
      CREATE TABLE curricular_units (id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      CREATE TABLE quiz_topics (id TEXT PRIMARY KEY,curricular_unit_id TEXT);
      CREATE TABLE quiz_questions (id TEXT PRIMARY KEY);
      INSERT INTO curricular_units VALUES ('unit-neuro','NEURO',1);
      INSERT INTO quiz_topics VALUES ('quiz-topic-neuro-aula-1','unit-neuro');
      INSERT INTO quiz_questions VALUES ('quiz-neuro-a1-001'),('quiz-neuro-a1-004'),('quiz-neuro-a1-005'),('quiz-neuro-a1-009'),('quiz-neuro-a1-048');
    `);
    db.run(migration);
    assert.equal(db.exec("SELECT COUNT(*) FROM learning_modules")[0].values[0][0], 1);
    assert.equal(db.exec("SELECT COUNT(*) FROM learning_steps")[0].values[0][0], 10);
    assert.equal(db.exec("SELECT COUNT(*) FROM learning_steps WHERE step_type='exercise' AND answer_format='short_answer'")[0].values[0][0], 2);
  } finally {
    db.close();
  }
});

test("a aprendizagem interativa tem conteúdo, progresso e respostas persistentes", () => {
  for (const table of ["learning_modules", "learning_steps", "learning_attempts", "learning_step_responses"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  }
  assert.match(migration, /step_type IN \('explanation', 'exercise'\)/);
  assert.match(migration, /answer_format IN \('multiple_choice', 'short_answer'\)/);
  assert.match(migration, /idx_learning_attempts_one_active/);
  assert.match(migration, /UNIQUE\(attempt_id, step_id\)/);
  assert.match(migration, /'quizzes\.learning', 1/);
});

test("o primeiro percurso alterna cinco explicações e cinco exercícios", () => {
  const explanationSteps = migration.match(/'explanation'/g) || [];
  const exerciseSteps = migration.match(/'exercise'/g) || [];
  assert.ok(explanationSteps.length >= 5);
  assert.ok(exerciseSteps.length >= 5);
  for (let position = 1; position <= 10; position += 1) assert.match(migration, new RegExp(`id, ${position},`));
  assert.match(migration, /'multiple_choice'/);
  assert.match(migration, /'short_answer'/);
  assert.match(migration, /learning-neuro-a1/);
});

test("as rotas corrigem no servidor e não expõem respostas antes da tentativa", () => {
  assert.match(router, /handleLearningRoute, isLearningPath/);
  assert.match(router, /if \(isLearningPath\(pathname\)\)/);
  assert.match(worker, /enabled\("quizzes\.learning"\)/);
  assert.match(worker, /isShortAnswerMatch\(answerText, expectedAnswer\)/);
  assert.match(worker, /response_locked/);
  assert.match(worker, /Responde ao exercício antes de continuar/);
  assert.match(worker, /choices\.map\(\(\{ id, text: optionText, position \}\)/);
  assert.doesNotMatch(worker, /correct: choice\.correct/);
});

test("a interface mantém o ciclo explicação, exercício e feedback", () => {
  assert.match(quizHub, /href="\/testes\/aprender"/);
  assert.match(hub, /Explicação \{explanationNumber\}/);
  assert.match(hub, /Exercício \{exerciseNumber\}/);
  assert.match(hub, /multiple_choice/);
  assert.match(hub, /short_answer/);
  assert.match(hub, /Verificar resposta/);
  assert.match(hub, /Passar ao exercício/);
  assert.match(hub, /Concluir percurso/);
  assert.match(modules, /"quizzes\.learning"/);
});
