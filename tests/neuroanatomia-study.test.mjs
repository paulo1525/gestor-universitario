import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../lib/study/neuroanatomia-ap1.json", import.meta.url), "utf8"));
const flatten = (topics) => topics.flatMap((topic) => [topic, ...flatten(topic.children)]);
const topics = data.sections.flatMap((section) => flatten(section.topics));
const paragraphs = data.sections.flatMap((section) => [...(section.orientation ?? []), ...flatten(section.topics).flatMap((topic) => topic.paragraphs)]);

test("AP1 retains both syllabus parts and a complete, unique curricular hierarchy", () => {
  assert.deepEqual(data.sections.map((section) => section.id), ["revisoes", "neurocranio"]);
  assert.equal(topics.length, 95);
  assert.equal(new Set(topics.map((topic) => topic.id)).size, 95);
  assert.deepEqual(data.sections.map((section) => section.topics.length), [4, 6]);
  for (const topic of topics) {
    assert.ok(topic.title.trim());
    for (const child of topic.children) assert.equal(child.number.slice(0, child.number.lastIndexOf(".")), topic.number);
    assert.ok(topic.paragraphs.length || topic.children.length, topic.id);
  }
});

test("AP1 translations cover the syllabus with traceable bibliography and complete paragraphs", () => {
  const seen = new Set();
  for (const paragraph of paragraphs) {
    const text = paragraph.parts.map((part) => part.text).join("");
    assert.ok(paragraph.id && !seen.has(paragraph.id), paragraph.id);
    seen.add(paragraph.id);
    assert.equal(paragraph.translation, "pt-PT");
    assert.ok(paragraph.sourceRefs.length > 0, paragraph.id);
    for (const reference of paragraph.sourceRefs) {
      assert.ok(data.edition.sources[reference.source], reference.source);
      assert.ok(reference.pages.length && reference.pages.every(page => Number.isInteger(page) && page > 0));
      assert.ok(reference.heading.trim());
    }
    assert.match(text, /[.!?]$/, paragraph.id);
    assert.doesNotMatch(text, /O Gray|o Gray|sumário curricular|No desenvolvimento detalhado|nesta aula|aulas subsequentes|para a introdução prática/i, paragraph.id);
  }
  const texts = paragraphs.map(p => p.parts.map(part => part.text).join(""));
  assert.equal(new Set(texts).size, texts.length, "Repeated source paragraphs must not appear under multiple headings");
});

test("AP1 highlights resolve complete questions and every figure exists", () => {
  const linked = new Set();
  const usedImages = new Set();
  for (const paragraph of paragraphs) for (const part of paragraph.parts) {
    for (const id of part.questionIds ?? []) {
      assert.ok(data.questions[id], id);
      linked.add(id);
    }
  }
  for (const topic of topics) for (const id of topic.questionIds ?? []) { assert.ok(data.questions[id], id); linked.add(id); }
  assert.equal(linked.size, 69);
  assert.deepEqual([...linked].sort(), Object.keys(data.questions).sort());
  assert.equal(data.questions.q024.prompt, "Por que orifício passa o nervo maxilar? Onde se origina o nervo?");
  for (const topic of topics) for (const id of topic.imageIds) {
    const image = data.images[id];
    assert.ok(image, id);
    assert.ok(image.width > 0 && image.height > 0 && image.alt && image.source);
    assert.ok(existsSync(new URL("../public" + image.src, import.meta.url)), image.src);
    usedImages.add(id);
  }
  assert.equal(usedImages.size, 20);
});

test("question review retains open-response cranium questions and cross-topic AP1 questions", () => {
  for (let n = 1; n <= 50; n++) if (n !== 45) assert.ok(data.questions['q' + String(n).padStart(3, '0')]);
  for (const n of [132, 134, 290, 311, 319, 526, 527, 528, 530, 534, 574, 610, 655, 664]) assert.ok(data.questions['q' + n]);
  for (const id of ["q045", "q206", "q210", "q260"]) assert.equal(data.questions[id], undefined);
  assert.ok(data.questions.q039.answer.includes('Palatino. Lâmina perpendicular'));
  assert.ok(!data.questions.q040.answer.includes('Palatino.'));
  assert.deepEqual(data.questions.q534.answerParts.map(p => p.label), ['a)', 'b)', 'c)']);
  for (const q of Object.values(data.questions)) { assert.ok(q.prompt.trim()); assert.ok(q.answer.trim()); }
});
