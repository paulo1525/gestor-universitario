export type QuizCsvDifficulty = "easy" | "medium" | "hard";

export type QuizCsvRow = {
  row: number;
  unitId: string;
  unitCode: string;
  theme: string;
  question: string;
  options: string[];
  correctOption: number | null;
  explanation: string;
  difficulty: QuizCsvDifficulty | null;
  imageUrl: string;
};

export type QuizCsvError = { row: number; field: string; message: string };

export const QUIZ_CSV_HEADERS: string[];
export function parseCsv(text: string, delimiter?: string): string[][];
export function validateQuizCsv(text: string, options?: { units?: Array<{ id: string | number; code?: string }>; selectedUnitId?: string; selectedUnitCode?: string }): {
  rows: QuizCsvRow[];
  validRows: QuizCsvRow[];
  errors: QuizCsvError[];
  headers: string[];
};
export function quizCsvTemplate(): string;
