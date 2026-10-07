// Keep the visible curriculum, availability and submitted topic filter in sync.
export function quizSourceSelection(unit, source) {
  if (!unit) return null;
  const selected = unit.sources?.find(item => item.id === source);
  const topics = unit.topics.filter(topic => (topic.source ?? "compendium") === source);
  return {
    ...unit,
    questionCount: selected?.questionCount ?? (source === "compendium" ? unit.questionCount : 0),
    multipleChoiceCount: selected?.multipleChoiceCount ?? (source === "compendium" ? unit.multipleChoiceCount : 0),
    shortAnswerCount: selected?.shortAnswerCount ?? (source === "compendium" ? unit.shortAnswerCount : 0),
    platformMistakeCount: selected?.platformMistakeCount ?? (source === "compendium" ? unit.platformMistakeCount : 0),
    topics,
  };
}

export function quizTopicSelection(unitCode, topics, assessmentPart, selectedIds) {
  const visibleTopics = topics.filter((topic) =>
    topic.name.trim().toLocaleLowerCase("pt-PT") !== "sem correspondência curricular confirmada"
    && (unitCode !== "FIS1" || topic.assessmentPart === assessmentPart));
  const selection = visibleTopics.filter((topic) => selectedIds.includes(topic.id));
  const restricted = unitCode === "FIS1" || visibleTopics.length !== topics.length || selectedIds.length > 0;
  // A stale selection must never silently widen to the entire question bank.
  const activeTopics = selectedIds.length ? selection : visibleTopics;
  return {
    topics: visibleTopics,
    selectedIds: selection.map((topic) => topic.id),
    activeTopics,
    requestTopicIds: restricted ? activeTopics.map((topic) => topic.id) : [],
    restricted,
  };
}
