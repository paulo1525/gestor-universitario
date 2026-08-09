import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../worker/quizzes.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../components/quiz-management.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0033_quiz_admin_pagination_indexes.sql", import.meta.url), "utf8");
const adminCatalog = worker.slice(worker.indexOf("async function adminCatalog"), worker.indexOf("async function createTopic"));

test("admin question pages use a strict page-size whitelist and clamp empty pages", () => {
  assert.match(worker, /ADMIN_QUESTION_PAGE_SIZES = new Set\(\[10, 25, 50\]\)/);
  assert.match(adminCatalog, /ADMIN_QUESTION_PAGE_SIZES\.has\(requestedPageSize\) \? requestedPageSize : 25/);
  assert.match(adminCatalog, /const totalPages = Math\.max\(1, Math\.ceil\(total \/ pageSize\)\)/);
  assert.match(adminCatalog, /const effectivePage = Math\.min\(page, totalPages\)/);
  assert.match(adminCatalog, /page: effectivePage, pageSize, total, totalPages/);
});

test("COUNT and SELECT share parameterized filters and only page options are loaded", () => {
  assert.match(adminCatalog, /const fromSql =/);
  assert.match(adminCatalog, /const whereSql =/);
  assert.match(adminCatalog, /SELECT COUNT\(\*\) AS total\$\{fromSql\}\$\{whereSql\}/);
  assert.match(adminCatalog, /SELECT q\.\*,NULL AS correct_option_id[\s\S]*\$\{fromSql\}\$\{whereSql\}[\s\S]*LIMIT \? OFFSET \?/);
  assert.match(adminCatalog, /\.bind\(\.\.\.bindings, pageSize, offset\)/);
  assert.match(adminCatalog, /q\.curricular_unit_id=\?/);
  assert.match(adminCatalog, /q\.topic_id=\?/);
  assert.match(adminCatalog, /q\.status=\?/);
  assert.match(adminCatalog, /q\.prompt LIKE \? ESCAPE/);
  assert.match(adminCatalog, /optionsForQuestions\(env, questions\.results\.map/);
  assert.doesNotMatch(adminCatalog, /LIMIT 1000/);
});

test("topic metadata is one bounded aggregate query rather than N plus one", () => {
  assert.match(adminCatalog, /const topicsPromise = env\.DB\.prepare\("SELECT t\.\*,cu\.code[\s\S]*COUNT\(q\.id\)[\s\S]*GROUP BY t\.id[\s\S]*LIMIT 2000"\)/);
  assert.equal((adminCatalog.match(/const topicsPromise/g) || []).length, 1);
});

test("the client debounces and cancels stale requests while selecting only the current page", () => {
  assert.match(client, /setTimeout\(\(\) => \{[\s\S]*setDebouncedQuery\(filter\.query\.trim\(\)\);[\s\S]*\}, 300\)/);
  assert.match(client, /loadController\.current\?\.abort\(\)/);
  assert.match(client, /signal: controller\.signal/);
  assert.match(client, /setQuestions\(nextQuestions\); setSelected\(\[\]\)/);
  assert.match(client, /Selecionar esta página/);
  assert.match(client, /Por página/);
  for (const size of [10, 25, 50]) assert.match(client, new RegExp(`<option value="${size}">${size}<\\/option>`));
});

test("pagination indexes cover recent, UC, topic and status scans without duplicating legacy indexes", () => {
  for (const index of ["idx_quiz_questions_admin_recent", "idx_quiz_questions_admin_unit_recent", "idx_quiz_questions_admin_topic_recent", "idx_quiz_questions_admin_status_recent"]) assert.match(migration, new RegExp(`CREATE INDEX IF NOT EXISTS ${index}`));
  assert.match(migration, /ON quiz_questions\(deleted_at, updated_at DESC, id\)/);
  assert.match(migration, /ON quiz_questions\(curricular_unit_id, deleted_at, updated_at DESC, id\)/);
  assert.match(migration, /ON quiz_questions\(topic_id, deleted_at, updated_at DESC, id\)/);
  assert.match(migration, /ON quiz_questions\(status, deleted_at, updated_at DESC, id\)/);
  assert.doesNotMatch(migration, /CREATE INDEX(?: IF NOT EXISTS)? idx_quiz_questions_catalog/);
  assert.doesNotMatch(migration, /CREATE INDEX(?: IF NOT EXISTS)? idx_quiz_questions_topic\s/);
});
