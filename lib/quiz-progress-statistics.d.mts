export type QuizProgressPayload = {
  summary?: Record<string, unknown>;
  topics?: unknown[];
  [key: string]: unknown;
};

export declare function completedQuizStatistics<T extends QuizProgressPayload>(payload: T): T;
