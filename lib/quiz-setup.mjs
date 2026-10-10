// Keep the visible curriculum, availability and submitted topic filter in sync.
export function quizSourceSelection(unit, source, ankiCardType = "all") {
  if (!unit) return null;
  const selected = unit.sources?.find(item => item.id === source);
  const sourceTopics = unit.topics.filter(topic => (topic.source ?? "compendium") === source);
  const activeAnkiCardType = ["all", "label_image", "short_answer"].includes(ankiCardType) ? ankiCardType : "all";
  const typeCountKey = activeAnkiCardType === "label_image" ? "labelImageCount" : "textQuestionCount";
  const mistakeCountKey = activeAnkiCardType === "label_image" ? "labelImagePlatformMistakeCount" : "textQuestionPlatformMistakeCount";
  const getCount = (item, key) => {
    const count = item?.[key];
    return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
  };
  const sumTopicCount = (key) => {
    const counts = sourceTopics.map((topic) => getCount(topic, key)).filter(count => count !== null);
    return counts.length ? counts.reduce((total, count) => total + count, 0) : 0;
  };
  const getAllCount = (item) => {
    const labelCount = getCount(item, "labelImageCount");
    const textCount = getCount(item, "textQuestionCount");
    return labelCount === null || textCount === null ? null : labelCount + textCount;
  };
  const getAllMistakeCount = (item) => {
    const labelCount = getCount(item, "labelImagePlatformMistakeCount");
    const textCount = getCount(item, "textQuestionPlatformMistakeCount");
    return labelCount === null || textCount === null ? null : labelCount + textCount;
  };
  const withAnkiCount = (topic, count, mistakeCount = null) => ({
    ...topic,
    questionCount: count,
    multipleChoiceCount: 0,
    shortAnswerCount: count,
    ...(mistakeCount === null ? {} : { platformMistakeCount: mistakeCount }),
  });
  let topics = sourceTopics;
  if (source === "anki" && activeAnkiCardType !== "all") {
    // Missing type counts are unknown, not evidence that every Anki card is text.
    topics = sourceTopics
      .map((topic) => ({ topic, count: getCount(topic, typeCountKey) }))
      .filter(({ count }) => count !== null && count > 0)
      .map(({ topic, count }) => withAnkiCount(topic, count, getCount(topic, mistakeCountKey) ?? 0));
  } else if (source === "anki") {
    topics = sourceTopics.map((topic) => {
      const count = getAllCount(topic);
      const mistakeCount = getAllMistakeCount(topic);
      return count === null ? topic : withAnkiCount(topic, count, mistakeCount);
    });
  }

  let questionCount = selected?.questionCount ?? (source === "compendium" ? unit.questionCount : 0);
  let multipleChoiceCount = selected?.multipleChoiceCount ?? (source === "compendium" ? unit.multipleChoiceCount : 0);
  let shortAnswerCount = selected?.shortAnswerCount ?? (source === "compendium" ? unit.shortAnswerCount : 0);
  let platformMistakeCount = selected?.platformMistakeCount ?? (source === "compendium" ? unit.platformMistakeCount : 0);
  if (source === "anki") {
    if (activeAnkiCardType === "all") {
      const sourceAllCount = getAllCount(selected);
      const sourceAllMistakeCount = getAllMistakeCount(selected);
      if (sourceAllCount !== null) {
        questionCount = sourceAllCount;
        shortAnswerCount = sourceAllCount;
        multipleChoiceCount = 0;
      }
      if (sourceAllMistakeCount !== null) platformMistakeCount = sourceAllMistakeCount;
    } else {
      const sourceTypeCount = getCount(selected, typeCountKey);
      const sourceMistakeCount = getCount(selected, mistakeCountKey);
      if (sourceTypeCount !== null) {
        questionCount = sourceTypeCount;
        // Both Anki card types use the typed-answer path; their counts stay separate above.
        shortAnswerCount = sourceTypeCount;
        multipleChoiceCount = 0;
        platformMistakeCount = sourceMistakeCount ?? sumTopicCount(mistakeCountKey);
      } else {
        // Older catalogues lack per-type data, so a filtered view cannot infer eligibility.
        questionCount = sumTopicCount(typeCountKey);
        shortAnswerCount = questionCount;
        multipleChoiceCount = 0;
        platformMistakeCount = sumTopicCount(mistakeCountKey);
      }
    }
  }
  return {
    ...unit,
    questionCount,
    multipleChoiceCount,
    shortAnswerCount,
    platformMistakeCount,
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
