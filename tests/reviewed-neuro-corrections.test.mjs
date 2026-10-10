import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { applyReviewedCorrections, validateCorrectionPlan } from "../scripts/apply-reviewed-neuro-corrections.mjs";

const correction = { final_id: "Q0001", canonical_id: "source-1", expected_answer: "original", scientific_sources_checked: true, validation: { status: "corrigida", verified_answer: "revista", note: "conferida", date: "2026-10-10", method: "fonte direta", references: [{ title: "fonte", supports: "evidência", url: "https://example.org/source" }] } };
const source = [{ id: "source-1", final_id: "Q0001", text_original: "enunciado intacto", source_answer: "histórica", options: [], occurrences: [{ source_id: "original-source" }], validation: { verified_answer: "original" } }];
const row = id => ({ id, answer_text: "original", compendium: { sourceId: "source-1", finalId: "Q0001", validation: { verified_answer: "original" } }, question_images_json: '["original-image"]', explanation: '<p>antiga</p><p><strong>Fonte do enunciado · Q0001</strong><br>origem</p>', topic_id: "preserved-topic" });
const chunks = [{ data: { questions: [row("quiz-id")], bankQuestions: [row("bank-id")], options: [{ id: "preserved-option" }] } }];

test("review applies to both representations and preserves history, provenance, images and unrelated fields", () => {
  const before = structuredClone({ source, chunks });
  const result = applyReviewedCorrections(source, chunks, [correction], 123);
  assert.deepEqual({ source, chunks }, before, "preflight must not mutate the input");
  assert.deepEqual(result.counts, { questions: 1, bankQuestions: 1, canonical: 1 });
  assert.equal(result.source[0].source_answer, "histórica");
  assert.equal(result.source[0].validation.review_history[0].verified_answer, "original");
  for (const table of ["questions", "bankQuestions"]) {
    const updated = result.chunks[0].data[table][0];
    assert.equal(updated.answer_text, "revista");
    assert.equal(updated.id, chunks[0].data[table][0].id);
    assert.equal(updated.question_images_json, '["original-image"]');
    assert.equal(updated.topic_id, "preserved-topic");
    assert.match(updated.explanation, /Fonte do enunciado/);
  }
  assert.deepEqual(result.chunks[0].data.options, chunks[0].data.options);
});

test("a stale answer, wrong canonical identity, missing bank item or duplicate prevents all changes", () => {
  const scenarios = [
    { source: source.map(q => ({ ...q, id: "wrong-source" })), chunks },
    { source: source.map(q => ({ ...q, validation: { verified_answer: "newer-review" } })), chunks },
    { source, chunks: [{ data: { questions: [row("quiz")], bankQuestions: [] } }] },
    { source, chunks: [{ data: { questions: [row("quiz"), row("duplicate")], bankQuestions: [row("bank")] } }] },
  ];
  for (const scenario of scenarios) {
    const before = structuredClone(scenario);
    assert.throws(() => applyReviewedCorrections(scenario.source, scenario.chunks, [correction]));
    assert.deepEqual(scenario, before);
  }
});

test("a review plan needs the exact baseline, unique IDs and checked scientific evidence", () => {
  const bytes = Buffer.from(JSON.stringify(source));
  const plan = { schemaVersion: 1, source_sha256: createHash("sha256").update(bytes).digest("hex"), corrections: [correction] };
  assert.deepEqual(validateCorrectionPlan(plan, bytes), source);
  assert.throws(() => validateCorrectionPlan({ ...plan, source_sha256: "changed" }, bytes));
  assert.throws(() => validateCorrectionPlan({ ...plan, corrections: [correction, correction] }, bytes));
  assert.throws(() => validateCorrectionPlan({ ...plan, corrections: [{ ...correction, scientific_sources_checked: false }] }, bytes));
});
