const SECONDS_PER_QUESTION = 60;
const MINIMUM_QUIZ_DURATION_SECONDS = 5 * SECONDS_PER_QUESTION;

function questionCountFor(attempt) {
  const candidate = Number(attempt.questionCount ?? attempt.question_count ?? (Array.isArray(attempt.questions) ? attempt.questions.length : NaN));
  return Number.isInteger(candidate) && candidate > 0 ? candidate : 5;
}

/** Reject legacy/invalid short timers while preserving longer configured sessions. */
export function normaliseQuizDurationSeconds(durationSeconds, questionCount = 5) {
  const count = Number(questionCount);
  const minimum = Math.max(MINIMUM_QUIZ_DURATION_SECONDS, Number.isInteger(count) && count > 0 ? count * SECONDS_PER_QUESTION : MINIMUM_QUIZ_DURATION_SECONDS);
  const configured = Number(durationSeconds);
  return Number.isFinite(configured) && configured >= minimum ? configured : minimum;
}

function epochMilliseconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (!text) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : NaN;
  }
  return Date.parse(text);
}

/** Use the server deadline, so throttled background tabs cannot extend a session. */
export function remainingQuizSeconds(attempt, now = Date.now()) {
  if (attempt.timed === false) return null;
  if (attempt.timerPaused) return Number.isFinite(attempt.pausedRemainingSeconds) ? Math.max(0, attempt.pausedRemainingSeconds) : null;
  const startedAt = epochMilliseconds(attempt.startedAt ?? attempt.started_at);
  const durationSeconds = normaliseQuizDurationSeconds(attempt.durationSeconds ?? attempt.duration_seconds, questionCountFor(attempt));
  const derivedDeadline = Number.isFinite(startedAt) ? startedAt + durationSeconds * 1000 : NaN;
  const reportedDeadline = epochMilliseconds(attempt.endsAt ?? attempt.ends_at ?? attempt.expiresAt ?? attempt.expires_at);
  // A malformed legacy deadline must not turn a valid five-minute attempt into a 30-second one.
  const deadline = Number.isFinite(derivedDeadline) && Number.isFinite(reportedDeadline) ? Math.max(derivedDeadline, reportedDeadline) :
    Number.isFinite(reportedDeadline) ? reportedDeadline : derivedDeadline;
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
