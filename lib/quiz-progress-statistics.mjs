function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function completedQuizStatistics(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!Array.isArray(payload.topics) || !payload.summary || typeof payload.summary !== "object" || Array.isArray(payload.summary)) return payload;

  const totals = payload.topics.reduce((current, topic) => {
    if (!topic || typeof topic !== "object" || Array.isArray(topic)) return current;
    current.answeredCount += finiteNumber(topic.answeredCount ?? topic.answered_count);
    current.correctCount += finiteNumber(topic.correctCount ?? topic.correct_count);
    return current;
  }, { answeredCount: 0, correctCount: 0 });
  const completedCount = finiteNumber(payload.summary.completedCount ?? payload.summary.completed_count);

  return {
    ...payload,
    summary: {
      ...payload.summary,
      attemptCount: completedCount,
      answeredCount: totals.answeredCount,
      correctCount: totals.correctCount,
      accuracy: totals.answeredCount ? totals.correctCount / totals.answeredCount : null,
    },
  };
}
