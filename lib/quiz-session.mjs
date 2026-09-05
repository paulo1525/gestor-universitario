/** Use the server deadline, so throttled background tabs cannot extend a session. */
export function remainingQuizSeconds(attempt, now = Date.now()) {
  if (attempt.timed === false) return null;
  if (attempt.timerPaused) return Number.isFinite(attempt.pausedRemainingSeconds) ? Math.max(0, attempt.pausedRemainingSeconds) : null;
  const deadline = attempt.endsAt ? Date.parse(attempt.endsAt) :
    attempt.startedAt && Number.isFinite(attempt.durationSeconds) ? Date.parse(attempt.startedAt) + attempt.durationSeconds * 1000 : NaN;
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export function quizReviewState(question, answer) {
  if (!answer?.selectedOptionId) return 'unanswered';
  const correct = answer.correct ?? (Boolean(question.correctOptionId) && answer.selectedOptionId === question.correctOptionId);
  return correct ? 'correct' : 'incorrect';
}

/** Skip the current question, wrap once and preserve the original order. */
export function nextUnansweredIndex(questions, answers, currentIndex) {
  const answered = new Set(answers.filter((answer) => answer.selectedOptionId).map((answer) => answer.questionId));
  for (let offset = 1; offset <= questions.length; offset += 1) {
    const index = (currentIndex + offset) % questions.length;
    if (!answered.has(questions[index].id)) return index;
  }
  return -1;
}
