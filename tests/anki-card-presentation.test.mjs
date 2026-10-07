import test from "node:test";
import assert from "node:assert/strict";
import { ankiCardPresentation } from "../lib/anki-card-presentation.mjs";
import { isShortAnswerMatch } from "../lib/short-answer-match.mjs";

const header = "<div>Neuroanatomia::Legendar::AP1::08 Tema visual</div>";
const prompt = "<div>Identifica a estrutura n.º 9.</div>";
test("separates deck metadata, prompt, answer and source in existing snapshots", () => {
  const card = ankiCardPresentation(header + prompt + "<div></div>", header + prompt + "<div></div><div><div>RESPOSTA</div>Estrutura exemplo</div><div>Atlas, p. 25; n.º 9.</div>");
  assert.deepEqual(card, { subject: "Tema visual", prompt, hint: "", answer: "<div>Estrutura exemplo</div>", explanation: "", reference: "<div>Atlas, p. 25; n.º 9.</div>" });
});
test("keeps hints separate and preserves nested answer and explanation formatting", () => {
  const answer = "<ul><li>Primeiro</li><li><strong>Segundo</strong></li></ul>";
  const explanation = "<div><p>Explicação</p><ul><li>Detalhe</li></ul></div>";
  const card = ankiCardPresentation(header + prompt + "Ver pista<div>Pista</div>", header + prompt + `<div><div>RESPOSTA</div>${answer}</div>Ver explicação e fonte${explanation}<div>Fonte</div>`);
  assert.equal(card.hint, "<div>Pista</div>");
  assert.equal(card.answer, `<div>${answer}</div>`);
  assert.equal(card.explanation, explanation);
  assert.equal(card.reference, "<div>Fonte</div>");
});
test("written answers are compared without repeated prompt and bibliography", () => {
  const card = ankiCardPresentation(header + prompt, header + prompt + "<div><div>RESPOSTA</div>Articulações fibrosas</div><div>Atlas, p. 558.</div>");
  assert.equal(isShortAnswerMatch("Articulações fibrosas", card.answer.replace(/<[^>]+>/g, "")), true);
});
test("unknown templates and compendium content are preserved verbatim", () => {
  for (const imported of [true, false]) {
    const card = ankiCardPresentation("<p>Pergunta</p>", "<p>Resposta com fonte</p>", imported);
    assert.equal(card.prompt, "<p>Pergunta</p>");
    assert.equal(card.answer, "<p>Resposta com fonte</p>");
  }
});
test("cleans the front before a hidden answer has been revealed", () => {
  const card = ankiCardPresentation(header + prompt, "Resposta indisponível");
  assert.equal(card.subject, "Tema visual");
  assert.equal(card.prompt, prompt);
  assert.equal(card.answer, "Resposta indisponível");
});
