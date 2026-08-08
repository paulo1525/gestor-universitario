import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../worker/quizzes.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0030_quizzes.sql", import.meta.url), "utf8");
const commentThreadsMigration = await readFile(new URL("../migrations/0032_quiz_comment_threads.sql", import.meta.url), "utf8");
const seed = await readFile(new URL("../scripts/setup-local-test.mjs", import.meta.url), "utf8");

test("quiz schema preserves the former classes data while disabling its modules", () => {
  assert.match(migration, /UPDATE app_module_settings[\s\S]*'classes\.special_statuses'/);
  assert.match(migration, /SET enabled = 0/);
  for (const key of ["quizzes", "quizzes.practice", "quizzes.progress", "quizzes.management"]) assert.match(migration, new RegExp(`'${key.replaceAll(".", "\\.")}', 1`));
  assert.doesNotMatch(migration, /DROP TABLE classes/i);
  assert.doesNotMatch(migration, /DELETE FROM classes/i);
});

test("quiz schema has safe question, attempt, import and moderation records", () => {
  for (const table of ["quiz_topics", "quiz_questions", "quiz_question_options", "quiz_attempts", "quiz_attempt_questions", "quiz_comments", "quiz_imports"]) assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  assert.match(migration, /position INTEGER NOT NULL CHECK \(position BETWEEN 1 AND 4\)/);
  assert.match(migration, /quiz_question_options_one_correct_insert/);
  assert.match(migration, /config_json TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(migration, /duration_seconds INTEGER/);
  assert.match(migration, /expires_at INTEGER/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration, /filename TEXT NOT NULL/);
});

test("quiz routes are authenticated, module-gated and wired into the Worker", () => {
  assert.match(router, /handleQuizRoute, isQuizPath/);
  assert.match(router, /if \(isQuizPath\(pathname\)\)/);
  for (const key of ["quizzes.practice", "quizzes.progress", "quizzes.management"]) assert.ok(worker.includes(`"${key}"`), `missing module check for ${key}`);
  assert.match(worker, /isAdmin\(user\)/);
  assert.match(worker, /user_id=\?/);
});

test("practice feedback is immediate while exam answers stay hidden until completion", () => {
  assert.match(worker, /correctOptionId: reveal \? item\.correct_option_id : undefined/);
  assert.match(worker, /explanation: reveal \? item\.explanation : undefined/);
  assert.match(worker, /activeAttempt\.mode !== "exam" \? \{ answer, question:/);
  assert.match(worker, /attempt\.status !== "active" \|\| !isExam/);
  assert.match(worker, /answer_locked/);
});

test("quiz selection, universal timing and abandonment are enforced server side", () => {
  assert.match(worker, /not_enough_mistakes/);
  assert.match(worker, /all_questions_seen/);
  assert.match(worker, /MIN_TEST_QUESTIONS = 10/);
  assert.match(worker, /MAX_TEST_QUESTIONS = 50/);
  assert.match(worker, /const durationSeconds = requestedCount \* 60/);
  assert.match(worker, /code: "not_enough_questions"/);
  assert.match(worker, /status='abandoned'/);
  assert.match(worker, /answers\|finish\|abandon/);
  assert.match(worker, /enforceAttemptExpiry/);
  assert.match(worker, /attempt_expired/);
  assert.doesNotMatch(worker, /difficult: "quick"/);
  assert.doesNotMatch(worker, /hard: "quick"/);
});

test("quiz comments are immediately public, threaded and keep a stable author contract", () => {
  assert.match(commentThreadsMigration, /UPDATE quiz_comments\s+SET status = 'published'/);
  assert.match(commentThreadsMigration, /ADD COLUMN parent_comment_id TEXT REFERENCES quiz_comments\(id\) ON DELETE SET NULL/);
  assert.match(commentThreadsMigration, /CREATE TRIGGER quiz_comments_publish_immediately/);
  assert.match(commentThreadsMigration, /idx_quiz_comments_parent/);
  assert.match(worker, /parentCommentId \?\? body\?\.parentId \?\? body\?\.replyToCommentId/);
  assert.match(worker, /parent_comment_id,author_user_id,body,status/);
  assert.match(worker, /VALUES \(\?,\?,\?,\?,\?,'published',\?,\?\)/);
  assert.match(worker, /ORDER BY c\.created_at ASC,c\.id ASC/);
  assert.match(worker, /threads: commentThreads\(comments\)/);
  assert.match(worker, /parentCommentId, parentId, replyTo/);
  assert.match(worker, /authorRole, isAdmin: authorRole === "admin"/);
  assert.match(worker, /QUIZ_COMMENT_MODERATION_DISABLED/);
  assert.match(worker, /commentModeration: \{ enabled: false \}/);
  assert.doesNotMatch(worker, /async function adminComments\(/);
});

test("local setup seeds only fictional quizzes and keeps classes disabled", () => {
  assert.match(seed, /localQuizTopics/);
  assert.match(seed, /localQuizQuestions/);
  assert.match(seed, /DELETE FROM quiz_attempt_questions/);
  assert.match(seed, /module_key LIKE 'classes%' THEN 0 ELSE 1/);
  assert.doesNotMatch(seed, /https?:\/\/.*quiz/i);
});
