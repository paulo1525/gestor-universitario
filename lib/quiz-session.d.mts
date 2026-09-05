type SessionClock = { timed?: boolean; timerPaused?: boolean; pausedRemainingSeconds?: number | null; endsAt: string | null; startedAt: string | null; durationSeconds: number | null };
type ReviewQuestion = { id: string; correctOptionId?: string | null };
type ReviewAnswer = { questionId: string; selectedOptionId: string; correct?: boolean | null };
export function remainingQuizSeconds(attempt: SessionClock, now?: number): number | null;
export function quizReviewState(question: ReviewQuestion, answer?: ReviewAnswer): 'correct' | 'incorrect' | 'unanswered';
export function nextUnansweredIndex(questions: ReviewQuestion[], answers: ReviewAnswer[], currentIndex: number): number;
