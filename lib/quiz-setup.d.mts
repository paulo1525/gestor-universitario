type SetupTopic = { id: string; name: string; assessmentPart: 1 | 2 | null };
type SourceCounts = { id: "compendium" | "anki"; questionCount: number; multipleChoiceCount: number; shortAnswerCount: number; platformMistakeCount: number };
export function quizSourceSelection<T extends { questionCount: number; multipleChoiceCount: number; shortAnswerCount: number; platformMistakeCount: number; topics: Array<{ source?: "compendium" | "anki" }>; sources?: SourceCounts[] }>(unit: T | null, source: "compendium" | "anki"): T | null;
export function quizTopicSelection<T extends SetupTopic>(unitCode: string | undefined, topics: T[], assessmentPart: 1 | 2, selectedIds: string[]): {
  topics: T[];
  selectedIds: string[];
  activeTopics: T[];
  requestTopicIds: string[];
  restricted: boolean;
};
