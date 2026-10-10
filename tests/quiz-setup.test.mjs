import test from "node:test";
import assert from "node:assert/strict";
import { quizTopicSelection, quizSourceSelection } from "../lib/quiz-setup.mjs";

const topics = [
  { id: "first", name: "T1 · Aula de teste", assessmentPart: 1, multipleChoiceCount: 15 },
  { id: "second", name: "T2 · Outra aula de teste", assessmentPart: 2, multipleChoiceCount: 30 },
  { id: "unassigned", name: "Sem correspondência curricular confirmada", assessmentPart: null, multipleChoiceCount: 2 },
];

test("mudar de origem limita aulas e contagens sem alterar o catálogo original", () => {
  const unit = { questionCount: 12, multipleChoiceCount: 7, shortAnswerCount: 5, platformMistakeCount: 3,
    topics: [{ id: "comp", source: "compendium" }, { id: "anki", source: "anki" }],
    sources: [{ id: "compendium", questionCount: 7, multipleChoiceCount: 7, shortAnswerCount: 0, platformMistakeCount: 3 }, { id: "anki", questionCount: 5, multipleChoiceCount: 0, shortAnswerCount: 5, platformMistakeCount: 0 }],
  };
  const result = quizSourceSelection(unit, "anki");
  assert.equal(result.shortAnswerCount, 5);
  assert.equal(result.multipleChoiceCount, 0);
  assert.equal(result.platformMistakeCount, 0);
  assert.deepEqual(result.topics.map(topic => topic.id), ["anki"]);
  assert.equal(unit.questionCount, 12);
  assert.equal(unit.topics.length, 2);
  assert.equal(quizSourceSelection(null, "anki"), null);
});

test("um catálogo antigo preserva o compêndio sem inventar cartões Anki", () => {
  const legacy = { questionCount: 7, multipleChoiceCount: 7, shortAnswerCount: 0, platformMistakeCount: 0, topics: [{ id: "legacy" }] };
  assert.equal(quizSourceSelection(legacy, "compendium").questionCount, 7);
  assert.equal(quizSourceSelection(legacy, "anki").questionCount, 0);
  assert.deepEqual(quizSourceSelection(legacy, "anki").topics, []);
});

test("Anki card-type selection filters lesson availability and aggregate counts", () => {
  const unit = {
    questionCount: 99, multipleChoiceCount: 0, shortAnswerCount: 99, platformMistakeCount: 0,
    topics: [
      { id: "comp", source: "compendium", questionCount: 7, shortAnswerCount: 2 },
      { id: "mixed", source: "anki", questionCount: 5, shortAnswerCount: 5, labelImageCount: 2, textQuestionCount: 3, labelImagePlatformMistakeCount: 1, textQuestionPlatformMistakeCount: 2 },
      { id: "labels", source: "anki", questionCount: 4, shortAnswerCount: 4, labelImageCount: 4, textQuestionCount: 0, labelImagePlatformMistakeCount: 2, textQuestionPlatformMistakeCount: 0 },
      { id: "text", source: "anki", questionCount: 6, shortAnswerCount: 6, labelImageCount: 0, textQuestionCount: 6, labelImagePlatformMistakeCount: 0, textQuestionPlatformMistakeCount: 3 },
      { id: "empty", source: "anki", questionCount: 0, shortAnswerCount: 0, labelImageCount: 0, textQuestionCount: 0, labelImagePlatformMistakeCount: 0, textQuestionPlatformMistakeCount: 0 },
    ],
    sources: [
      { id: "compendium", questionCount: 7, multipleChoiceCount: 5, shortAnswerCount: 2, platformMistakeCount: 0, labelImageCount: null, textQuestionCount: null },
      { id: "anki", questionCount: 15, multipleChoiceCount: 0, shortAnswerCount: 15, platformMistakeCount: 9, labelImageCount: 6, textQuestionCount: 9, labelImagePlatformMistakeCount: 3, textQuestionPlatformMistakeCount: 6 },
    ],
  };

  const labels = quizSourceSelection(unit, "anki", "label_image");
  assert.equal(labels.questionCount, 6);
  assert.equal(labels.shortAnswerCount, 6);
  assert.equal(labels.multipleChoiceCount, 0);
  assert.equal(labels.platformMistakeCount, 3);
  assert.deepEqual(labels.topics.map(topic => topic.id), ["mixed", "labels"]);
  assert.deepEqual(labels.topics.map(topic => topic.questionCount), [2, 4]);
  assert.equal(labels.topics[0].shortAnswerCount, 2);

  const text = quizSourceSelection(unit, "anki", "short_answer");
  assert.equal(text.questionCount, 9);
  assert.equal(text.platformMistakeCount, 6);
  assert.deepEqual(text.topics.map(topic => topic.id), ["mixed", "text"]);
  assert.deepEqual(text.topics.map(topic => topic.questionCount), [3, 6]);

  const all = quizSourceSelection(unit, "anki");
  assert.equal(all.questionCount, 15);
  assert.equal(all.platformMistakeCount, 9);
  assert.deepEqual(all.topics.map(topic => topic.id), ["mixed", "labels", "text", "empty"]);
  assert.deepEqual(all.topics.map(topic => topic.questionCount), [5, 4, 6, 0]);

  const compendium = quizSourceSelection(unit, "compendium", "label_image");
  assert.equal(compendium.questionCount, 7);
  assert.deepEqual(compendium.topics.map(topic => topic.id), ["comp"]);
  assert.equal(unit.topics.length, 5, "selection does not mutate the source unit");
});

test("zero and unavailable legacy card-type counts never fall back to guessed text cards", () => {
  const currentEmpty = {
    questionCount: 12, multipleChoiceCount: 0, shortAnswerCount: 12, platformMistakeCount: 0,
    topics: [{ id: "empty", source: "anki", questionCount: 12, shortAnswerCount: 12, labelImageCount: 0, textQuestionCount: 0, labelImagePlatformMistakeCount: 0, textQuestionPlatformMistakeCount: 0 }],
    sources: [{ id: "anki", questionCount: 12, multipleChoiceCount: 0, shortAnswerCount: 12, platformMistakeCount: 0, labelImageCount: 0, textQuestionCount: 0, labelImagePlatformMistakeCount: 0, textQuestionPlatformMistakeCount: 0 }],
  };
  const empty = quizSourceSelection(currentEmpty, "anki", "short_answer");
  assert.equal(empty.questionCount, 0);
  assert.equal(empty.shortAnswerCount, 0);
  assert.deepEqual(empty.topics, []);
  assert.equal(quizSourceSelection(currentEmpty, "anki").questionCount, 0, "explicit zero counts override stale aggregate counts");

  const legacy = {
    questionCount: 12, multipleChoiceCount: 0, shortAnswerCount: 12, platformMistakeCount: 0,
    topics: [{ id: "legacy-anki", source: "anki", questionCount: 12, shortAnswerCount: 12 }],
    sources: [{ id: "anki", questionCount: 12, multipleChoiceCount: 0, shortAnswerCount: 12, platformMistakeCount: 0 }],
  };
  assert.equal(quizSourceSelection(legacy, "anki").questionCount, 12, "all remains backward compatible");
  const unknownTextType = quizSourceSelection(legacy, "anki", "short_answer");
  assert.equal(unknownTextType.questionCount, 0);
  assert.deepEqual(unknownTextType.topics, []);
});

test("all lessons restricts Fisiologia practice to the chosen frequency", () => {
  for (const part of [1, 2]) {
    const result = quizTopicSelection("FIS1", topics, part, []);
    assert.deepEqual(result.requestTopicIds, [part === 1 ? "first" : "second"]);
    assert.deepEqual(result.activeTopics, result.topics);
    assert.equal(result.activeTopics.reduce((sum, topic) => sum + topic.multipleChoiceCount, 0), part === 1 ? 15 : 30);
  }
});

test("stale or hidden selections cannot widen a session to all topics", () => {
  for (const ids of [["first"], ["unassigned"], ["missing"]]) {
    const result = quizTopicSelection("FIS1", topics, 2, ids);
    assert.equal(result.restricted, true);
    assert.deepEqual(result.activeTopics, []);
    assert.deepEqual(result.selectedIds, []);
  }
});

test("removing the placeholder preserves genuine topics without curriculum metadata", () => {
  const other = { id: "other", name: "Tema de teste", assessmentPart: null };
  const result = quizTopicSelection("ANAT2", [...topics, other], 1, []);
  assert.deepEqual(result.requestTopicIds, ["first", "second", "other"]);
  assert.equal(result.topics.some((topic) => topic.id === "unassigned"), false);
});

test("other disciplines retain their full bank unless a topic is selected", () => {
  const known = topics.slice(0, 2);
  assert.equal(quizTopicSelection("NEURO", known, 1, []).restricted, false);
  assert.deepEqual(quizTopicSelection("NEURO", known, 1, ["second"]).requestTopicIds, ["second"]);
});
