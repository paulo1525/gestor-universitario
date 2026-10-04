/** Study progress, not a prediction of a grade. Repeat answers do not increase coverage. */
export function quizReadiness(summary, totalQuestions) {
  const seen = Math.max(0, Number(summary.uniqueQuestionCount) || 0);
  const coverage = totalQuestions > 0 ? Math.min(1, seen / totalQuestions) : 0;
  if (!summary.completedCount || !seen) return { score: null, coverage, mastery: null, recent: null };
  const mastery = Math.min(1, Math.max(0, Number(summary.latestCorrectCount) || 0) / seen);
  const recent = summary.recentAccuracy == null ? mastery : Math.min(1, Math.max(0, summary.recentAccuracy));
  return { score: Math.round(100 * coverage * (.6 * mastery + .4 * recent)), coverage, mastery, recent };
}
