type SessionClock = { timed?: boolean; timerPaused?: boolean; pausedRemainingSeconds?: number | null; endsAt?: string | number | null; ends_at?: string | number | null; expiresAt?: string | number | null; expires_at?: string | number | null; startedAt?: string | number | null; started_at?: string | number | null; durationSeconds?: number | null; duration_seconds?: number | null; questionCount?: number | null; question_count?: number | null; questions?: unknown[] };
type ReviewQuestion = { id: string; correctOptionId?: string | null };
type ReviewAnswer = { questionId: string; selectedOptionId: string; correct?: boolean | null };
export function normaliseQuizDurationSeconds(durationSeconds: number | null | undefined, questionCount?: number | null): number;
export function remainingQuizSeconds(attempt: SessionClock, now?: number): number | null;
export function quizReviewState(question: ReviewQuestion, answer?: ReviewAnswer): 'correct' | 'incorrect' | 'unanswered';
export function nextUnansweredIndex(questions: ReviewQuestion[], answers: ReviewAnswer[], currentIndex: number): number;
