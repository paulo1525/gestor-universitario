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
