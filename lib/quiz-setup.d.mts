type SetupTopic = { id: string; name: string; assessmentPart: 1 | 2 | null };
export function quizTopicSelection<T extends SetupTopic>(unitCode: string | undefined, topics: T[], assessmentPart: 1 | 2, selectedIds: string[]): {
  topics: T[];
  selectedIds: string[];
  activeTopics: T[];
  requestTopicIds: string[];
  restricted: boolean;
};
