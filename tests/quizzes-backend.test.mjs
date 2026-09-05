import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../worker/quizzes.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0030_quizzes.sql", import.meta.url), "utf8");
const commentThreadsMigration = await readFile(new URL("../migrations/0032_quiz_comment_threads.sql", import.meta.url), "utf8");
const publicQuizMigration = await readFile(new URL("../migrations/0038_enable_public_quizzes.sql", import.meta.url), "utf8");
const seed = await readFile(new URL("../scripts/setup-local-test.mjs", import.meta.url), "utf8");
const quizHub = await readFile(new URL("../components/quiz-hub.tsx", import.meta.url), "utf8");
const quizHubStyles = await readFile(new URL("../components/quiz-hub.module.css", import.meta.url), "utf8");

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

test("quiz selection, fixed lengths, universal timing and abandonment are enforced server side", () => {
  assert.match(worker, /not_enough_mistakes/);
  assert.match(worker, /all_questions_seen/);
  assert.match(worker, /TEST_QUESTION_COUNTS = new Set\(\[5, 10, 15, 30, 50\]\)/);
  assert.match(worker, /DEFAULT_TEST_QUESTION_COUNT = 5/);
  assert.match(worker, /!TEST_QUESTION_COUNTS\.has\(requestedCount\)/);
  assert.match(worker, /Escolha 5, 10, 15, 30 ou 50 perguntas/);
  assert.match(worker, /const durationSeconds = body\.timed === false \? null : requestedCount \* 60/);
  assert.match(worker, /code: "not_enough_questions"/);
  assert.match(worker, /status='abandoned'/);
  assert.match(worker, /answers\|finish\|abandon/);
  assert.match(worker, /enforceAttemptExpiry/);
  assert.match(worker, /attempt_expired/);
  assert.doesNotMatch(worker, /difficult: "quick"/);
  assert.doesNotMatch(worker, /hard: "quick"/);
});

test("a publicação mantém todos os módulos de testes disponíveis", () => {
  for (const key of ["quizzes", "quizzes.practice", "quizzes.progress", "quizzes.management"]) assert.match(publicQuizMigration, new RegExp(`'${key.replaceAll(".", "\\.")}', 1`));
  assert.match(publicQuizMigration, /ON CONFLICT\(module_key\) DO UPDATE SET/);
  assert.match(publicQuizMigration, /enabled = 1/);
});

test("o Worker não expõe nem depende de serviços externos para respostas curtas", () => {
  assert.doesNotMatch(worker, /evaluateShortAnswer|GEMINI|Gemma|generativelanguage|x-goog-api-key/);
  assert.doesNotMatch(router, /GEMINI_API_KEY/);
});

test("authenticated students can export the current quiz selection for Anki", () => {
  assert.match(worker, /path === "\/api\/quizzes\/export"/);
  assert.match(worker, /async function exportQuiz\(env: QuizEnv, url: URL, user: QuizUser \| null/);
  assert.match(worker, /if \(!user\) return unauthenticated\(\)/);
  assert.match(worker, /enabled\("quizzes\.practice"\)/);
  assert.match(worker, /ORDER BY RANDOM\(\) LIMIT \?/);
  assert.match(worker, /correctOptionId: correct\?\.id \|\| null/);
  for (const field of ["prompt", "imageUrl", "explanation", "difficulty", "options", "topicTitle"]) assert.match(worker, new RegExp(`\\b${field}:`));
  assert.match(worker, /Não existem perguntas suficientes para criar este ficheiro Anki/);
});

test("quiz progress adds private completed-attempt statistics without breaking its existing contract", () => {
  assert.match(worker, /async function progress\(env: QuizEnv, user: QuizUser \| null/);
  assert.match(worker, /WHERE completed\.user_id=\? AND completed\.status='completed'/);
  assert.match(worker, /WHERE a\.user_id=\? AND a\.status='completed'/);
  assert.match(worker, /COUNT\(DISTINCT aq\.question_id\).*unique_question_count/s);
  assert.match(worker, /correct_count\*2>=question_count/);
  assert.match(worker, /ORDER BY a\.completed_at DESC,a\.started_at DESC\s+LIMIT 10/);
  for (const field of ["uniqueQuestionCount", "totalDurationSeconds", "averageDurationSeconds", "passedCount", "recentAccuracy", "recentAttempts"]) assert.match(worker, new RegExp(`\\b${field}\\b`));
  for (const field of ["id", "unitId", "unitCode", "mode", "questionCount", "answeredCount", "correctCount", "accuracy", "startedAt", "completedAt", "durationSeconds"]) assert.match(worker, new RegExp(`\\b${field}:`));
  assert.match(worker, /attemptCount: summary\?\.attempt_count/);
  assert.match(worker, /topics: topics\.results/);
  assert.match(worker, /mistakes: mistakes\.results/);
});

test("students can clear only their finished quiz statistics while preserving an active test", () => {
  assert.match(worker, /async function clearProgress\(env: QuizEnv, user: QuizUser \| null/);
  assert.match(worker, /DELETE FROM quiz_attempt_questions WHERE attempt_id IN \(SELECT id FROM quiz_attempts WHERE user_id=\? AND status<>'active'\)/);
  assert.match(worker, /DELETE FROM quiz_attempts WHERE user_id=\? AND status<>'active'/);
  assert.match(worker, /quiz_progress_cleared/);
  assert.match(worker, /request\.method === "DELETE"/);
  assert.match(quizHub, /fetch\("\/api\/quizzes\/progress", \{ method: "DELETE" \}\)/);
  assert.match(quizHub, /Limpar estatísticas/);
  assert.match(quizHub, /Um teste em curso será mantido/);
});

test("abandoning a quiz asks only the direct confirmation question", () => {
  assert.match(quizHub, /title="Queres desistir do teste\?" description=""/);
  assert.doesNotMatch(quizHub, /O progresso desta tentativa será encerrado/);
  assert.doesNotMatch(quizHub, /As respostas dadas nesta tentativa deixam de poder ser alteradas/);
});

test("students can open a responsive personal statistics dashboard from the quiz catalogue", () => {
  assert.match(quizHub, /As minhas estatísticas/);
  assert.match(quizHub, /fetch\("\/api\/quizzes\/progress"/);
  assert.match(quizHub, /function StatisticsView/);
  for (const label of ["Perguntas vistas", "Respostas certas", "Testes com ≥50%", "Últimos 10 testes", "Desempenho por tema", "Tempo de testes"]) assert.match(quizHub, new RegExp(label));
  assert.match(quizHubStyles, /\.statisticsGrid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(quizHubStyles, /\.readinessCard,[\s\S]*border-top:\s*var\(--surface-header-accent-size\) solid var\(--surface-header-accent\)/);
  assert.match(quizHubStyles, /@media \(max-width: 720px\)[\s\S]*\.statisticsGrid\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
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
