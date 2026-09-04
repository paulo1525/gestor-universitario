import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completedQuizStatistics } from "../lib/quiz-progress-statistics.mjs";

const progressRoute = await readFile(new URL("../app/api/quizzes/progress/route.ts", import.meta.url), "utf8");

test("cleared quiz history does not keep accuracy from an active attempt", () => {
  const payload = completedQuizStatistics({
    summary: {
      attemptCount: 1,
      completedCount: 0,
      answeredCount: 4,
      correctCount: 3,
      accuracy: 0.75,
      uniqueQuestionCount: 0,
    },
    topics: [],
    recentAttempts: [],
  });

  assert.equal(payload.summary.attemptCount, 0);
  assert.equal(payload.summary.answeredCount, 0);
  assert.equal(payload.summary.correctCount, 0);
  assert.equal(payload.summary.accuracy, null);
  assert.equal(payload.summary.uniqueQuestionCount, 0);
});

test("quiz summary is rebuilt only from completed-attempt topic statistics", () => {
  const payload = completedQuizStatistics({
    summary: { attemptCount: 3, completedCount: 2, answeredCount: 13, correctCount: 9, accuracy: 9 / 13 },
    topics: [
      { topicId: "a", answeredCount: 5, correctCount: 4 },
      { topicId: "b", answered_count: 4, correct_count: 3 },
    ],
  });

  assert.equal(payload.summary.attemptCount, 2);
  assert.equal(payload.summary.answeredCount, 9);
  assert.equal(payload.summary.correctCount, 7);
  assert.equal(payload.summary.accuracy, 7 / 9);
});

test("the exact progress route preserves DELETE while normalizing GET", () => {
  assert.match(progressRoute, /completedQuizStatistics\(payload\)/);
  assert.match(progressRoute, /export \{ getProgress as GET, workerResponse as DELETE \}/);
});
