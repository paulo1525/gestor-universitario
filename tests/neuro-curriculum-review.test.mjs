import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareQuizJson } from "../scripts/prepare-quiz-json-storage.mjs";
import { reclassifyNeuroCompendium, validateCurriculumPlan } from "../scripts/reclassify-neuro-compendium.mjs";

function fixture() {
  const source = [0, 1, 2].map(i => ({ id: `source-${i}`, final_id: `Q000${i + 1}`, topic_index: i === 2 ? 0 : i, aula_codigo: "AT1 / AP1", text_display: `Enunciado fictício ${i}`, options: [], images: [{ file: "imagem-ficticia.png" }], exclude_from_compendium: i === 2, validation: { verified_answer: `Resposta fictícia ${i}`, status: "com_ressalvas", note: "Preservar ressalva científica" } }));
  const topics = [{ id: "quiz-topic-neuro-ap1", curricular_unit_id: "neuro", title: "Conjunto anterior", status: "published", description: '{}' }, { id: "specific", curricular_unit_id: "neuro", title: "Identidade antiga preservada", status: "archived", description: '{}' }, { id: "anki", curricular_unit_id: "neuro", title: "Anki", status: "published" }, { id: "other", curricular_unit_id: "other", title: "Outra unidade", status: "published" }];
  const rows = source.slice(0, 2).map(q => ({ id: `row-${q.id}`, curricular_unit_id: "neuro", topic_id: "quiz-topic-neuro-ap1", prompt: q.text_display, answer_text: q.validation.verified_answer, explanation: "HTML e imagens preservados", status: "published", compendium: { finalId: q.final_id, sourceId: q.id, validation: q.validation, occurrences: [{ pdf_page: 4 }] }, question_images_json: '["imagem-ficticia.png"]' }));
  const tables = { quiz_topics: topics, quiz_questions: [...rows, { id: "anki-question", curricular_unit_id: "neuro", topic_id: "anki", prompt: "Anki", answer_text: "Verso", status: "published" }, { id: "other-question", curricular_unit_id: "other", topic_id: "other", status: "published" }], quiz_question_options: [{ id: "old-option", question_id: "old-question", option_text: "Opção histórica" }], question_bank_items: rows.map(row => ({ ...structuredClone(row), id: "bank-" + row.id })), question_bank_topics: topics.slice(0, 2).map(topic => ({ ...topic })), question_bank_sources: [{ id: "compendium-source-neuro", curricular_unit_id: "neuro", coverage_json: '{"excluded":["Q0003"]}' }] };
  const groups = [{ code: "AP1", title: "Introdução geral", topic_id: topics[0].id, indices: [0], lesson_codes: ["AP1"], count: 1 }, { code: "AT1 / AP1", title: "Aula específica", topic_id: "specific", indices: [1], lesson_codes: ["AT1", "AP1"], count: 1 }];
  const assignments = source.map((q, i) => ({ final_id: q.final_id, canonical_id: q.id, expected_topic_index: q.topic_index, expected_lesson_code: q.aula_codigo, target_topic_index: i === 0 ? 1 : 0, target_title: i === 0 ? "Específico" : "Geral", primary_lesson: i === 0 ? "AT1" : "AP1", associated_lessons: [], decision: "mover", reviewed: true, provisional: false, justification: "O enunciado requer esta aula específica", references: [{ file: "sumario-ficticio.pdf", pdf_page: 2, supports: "Matéria do enunciado", sha256: "a".repeat(64) }] }));
  const bytes = Buffer.from(JSON.stringify(source));
  const plan = { schemaVersion: 1, date: "2026-10-10", source_sha256: createHash("sha256").update(bytes).digest("hex"), groups, assignments };
  return { source, tables, plan, bytes };
}

test("repacking rebuilds both lesson indexes and refuses stale reviewed exports", async () => {
  const f = fixture();
  f.tables.quiz_question_options = [];
  const reviewed = reclassifyNeuroCompendium(f.tables, f.source, f.plan, 42);
  const packed = prepareQuizJson(reviewed.tables, "review-test", 42);
  assert.equal(packed.manifest.questions.find(q => q.id === f.tables.quiz_questions[0].id).topic_id, "specific");
  const bank = JSON.parse(packed.artifacts.find(a => a.key.includes("neuro/files/bank-index.json")).content);
  assert.equal(bank.bankQuestions.find(q => q.id === f.tables.question_bank_items[0].id).topic_id, "specific");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "curriculum-pack-test-"));
  try {
    await writeFile(path.join(temporary, "transfer.json"), JSON.stringify({ requiresIndexRebuild: true }));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/pack-quiz-content.mjs", import.meta.url)), "--source", temporary], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires --rebuild/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("curricular review separates specific lessons and preserves question identities, answers, images, Anki and exclusions", () => {
  const f = fixture(), original = structuredClone(f);
  assert.deepEqual(validateCurriculumPlan(f.plan, f.bytes), f.source);
  const result = reclassifyNeuroCompendium(f.tables, f.source, f.plan, 42);
  assert.deepEqual(result.report, { reviewed: 3, moved: 2, published: 2, excluded: 1, lessonGroups: 2, provisional: 0 });
  assert.deepEqual(f.tables, original.tables);
  assert.deepEqual(f.source, original.source);
  assert.equal(result.tables.quiz_questions[0].topic_id, "specific");
  assert.equal(result.tables.quiz_questions[1].topic_id, "quiz-topic-neuro-ap1");
  assert.equal(result.tables.quiz_topics[1].status, "published");
  assert.deepEqual(result.tables.quiz_questions.slice(2), f.tables.quiz_questions.slice(2));
  assert.deepEqual(result.tables.quiz_topics.slice(2), f.tables.quiz_topics.slice(2));
  assert.deepEqual(result.tables.quiz_question_options, f.tables.quiz_question_options);
  for (let i = 0; i < 2; i++) {
    const before = f.tables.quiz_questions[i], after = result.tables.quiz_questions[i];
    for (const field of ["id", "prompt", "answer_text", "explanation", "question_images_json"]) assert.deepEqual(after[field], before[field]);
    assert.deepEqual(after.compendium.validation, before.compendium.validation);
    assert.deepEqual(result.source[i].validation, f.source[i].validation);
    assert.deepEqual(result.source[i].images, f.source[i].images);
    assert.deepEqual(result.source[i].options, f.source[i].options);
  }
  assert.equal(result.source[2].exclude_from_compendium, true);
  assert.equal(result.source[0].curricular_assignment.history[0].topic_index, 0);
});

test("curriculum preflight refuses missing coverage, uncertain decisions and stale identities without mutating inputs", () => {
  for (const mutate of [f => f.plan.assignments.pop(), f => f.plan.assignments[0].canonical_id = "wrong", f => f.plan.assignments[0].expected_topic_index = 9, f => f.plan.assignments[0].decision = "pendente", f => f.tables.question_bank_items.pop(), f => f.tables.quiz_questions[0].answer_text = "Changed", f => f.plan.groups[0].count++]) {
    const f = fixture(); mutate(f);
    const before = JSON.stringify(f);
    assert.throws(() => reclassifyNeuroCompendium(f.tables, f.source, f.plan));
    assert.equal(JSON.stringify(f), before);
  }
});

test("curricular plans require exact source checksum, one principal lesson, evidence and nonoverlapping groups", () => {
  for (const mutate of [f => f.plan.source_sha256 = "b".repeat(64), f => f.plan.assignments[0].primary_lesson = "AT1 / AP1", f => f.plan.assignments[0].references[0].pdf_page = 0, f => f.plan.groups[1].indices = [0], f => f.plan.assignments[0].reviewed = false, f => f.plan.assignments[1] = f.plan.assignments[0]]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateCurriculumPlan(f.plan, f.bytes));
  }
});

test("a source-checked transcription partition keeps the persistent parent and raw original while separating displayed questions", () => {
  const f = fixture();
  f.source[0].text_original = f.source[0].text_display = "Enunciado fictício 0. 22) Outra questão colada.";
  f.tables.quiz_questions[0].prompt = f.tables.question_bank_items[0].prompt = f.source[0].text_display;
  f.plan.assignments[0].display_repair = { expected_prompt: f.source[0].text_display, prompt: "Enunciado fictício 0.", source_checked: true, source_question: "21", fragment_file: "fragmento-privado.json" };
  const result = reclassifyNeuroCompendium(f.tables, f.source, f.plan, 42);
  assert.equal(result.source[0].text_original, f.source[0].text_original);
  assert.equal(result.source[0].text_display, "Enunciado fictício 0.");
  assert.equal(result.source[0].transcription_history[0].previous_text_display, f.source[0].text_display);
  for (const table of ["quiz_questions", "question_bank_items"]) {
    assert.equal(result.tables[table][0].id, f.tables[table][0].id);
    assert.equal(result.tables[table][0].prompt, result.source[0].text_display);
    assert.equal(result.tables[table][0].answer_text, f.tables[table][0].answer_text);
  }
  f.plan.assignments[0].display_repair.prompt = "Texto inventado";
  assert.throws(() => reclassifyNeuroCompendium(f.tables, f.source, f.plan));
});

test("whole lesson grouping reunites AP5 topics and archives the empty split without changing saved identities", () => {
  const f = fixture();
  f.plan.grouping = "whole_curricular_lesson";
  f.plan.groups = [{ code: "AT8 / AP5", title: "Nervos IX–XII e espaços craniofaciais", topic_id: "quiz-topic-neuro-ap1", indices: [0, 1], lesson_codes: ["AT8", "AP5"], count: 2 }];
  for (const a of f.plan.assignments) Object.assign(a, { target_topic_index: 0, primary_lesson: "AP5", associated_lessons: ["AT8"] });
  f.tables.quiz_topics[1].status = f.tables.question_bank_topics[1].status = "published";
  f.tables.quiz_topics[1].description = '{"compendiumGroup":23}';
  f.tables.question_bank_topics[1].description = f.tables.quiz_topics[1].description;
  const result = reclassifyNeuroCompendium(f.tables, f.source, f.plan, 42);
  assert.deepEqual(validateCurriculumPlan(f.plan, f.bytes), f.source);
  assert.ok(result.tables.quiz_questions.slice(0, 2).every(q => q.topic_id === "quiz-topic-neuro-ap1"));
  assert.ok(result.tables.question_bank_items.every(q => q.topic_id === "quiz-topic-neuro-ap1"));
  assert.equal(result.tables.quiz_topics[1].id, "specific");
  assert.equal(result.tables.quiz_topics[1].status, "archived");
  assert.equal(result.tables.quiz_topics[1].archived_at, 42);
  assert.equal(result.tables.question_bank_topics[1].status, "archived");
  assert.equal(result.tables.quiz_topics[2].status, "published");
  f.plan.groups.push({ code: "AP5", title: "Split incorreto", topic_id: "specific", indices: [23], lesson_codes: ["AP5"], count: 0 });
  assert.throws(() => validateCurriculumPlan(f.plan, f.bytes), /cannot be split/);
});
