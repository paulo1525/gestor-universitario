type SetupTopic = { id: string; name: string; assessmentPart: 1 | 2 | null };
type AnkiCardType = "all" | "label_image" | "short_answer";
type SourceCounts = { id: "compendium" | "anki"; questionCount: number; multipleChoiceCount: number; shortAnswerCount: number; platformMistakeCount: number; labelImageCount?: number | null; textQuestionCount?: number | null; labelImagePlatformMistakeCount?: number | null; textQuestionPlatformMistakeCount?: number | null };
type SourceTopic = { source?: "compendium" | "anki"; questionCount?: number; multipleChoiceCount?: number; shortAnswerCount?: number; labelImageCount?: number | null; textQuestionCount?: number | null; labelImagePlatformMistakeCount?: number | null; textQuestionPlatformMistakeCount?: number | null };
export function quizSourceSelection<T extends { questionCount: number; multipleChoiceCount: number; shortAnswerCount: number; platformMistakeCount: number; topics: Array<SourceTopic>; sources?: SourceCounts[] }>(unit: T | null, source: "compendium" | "anki", ankiCardType?: AnkiCardType): T | null;
export function quizTopicSelection<T extends SetupTopic>(unitCode: string | undefined, topics: T[], assessmentPart: 1 | 2, selectedIds: string[]): {
  topics: T[];
  selectedIds: string[];
  activeTopics: T[];
  requestTopicIds: string[];
  restricted: boolean;
};
