import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const digest = value => createHash("sha256").update(value).digest("hex");
const code = value => /^(AT|AP)[1-9]\d*$/.test(value);
const jsonDescription = row => { try { return JSON.parse(row.description || "{}"); } catch { return {}; } };

export function validateCurriculumPlan(plan, bytes) {
  if (plan?.schemaVersion !== 1 || plan.source_sha256 !== digest(bytes)) throw new Error("Curricular baseline checksum mismatch");
  const source = JSON.parse(bytes);
  if (!Array.isArray(plan.assignments) || plan.assignments.length !== source.length || !Array.isArray(plan.groups) || !plan.groups.length) throw new Error("Incomplete curricular coverage");
  const ids = new Set(), indices = new Set(), topics = new Set();
  for (const group of plan.groups) {
    if (!group.code || !group.title || !group.topic_id || topics.has(group.topic_id) || !Array.isArray(group.indices) || !group.indices.length || !Array.isArray(group.lesson_codes) || !group.lesson_codes.every(code) || !Number.isInteger(group.count) || group.count < 0) throw new Error("Invalid specific lesson group");
    topics.add(group.topic_id);
    for (const index of group.indices) {
      if (!Number.isInteger(index) || index < 0 || indices.has(index)) throw new Error("Overlapping specific lesson groups");
      indices.add(index);
    }
  }
  for (const assignment of plan.assignments) {
    const group = plan.groups.find(group => group.indices.includes(assignment.target_topic_index));
    if (!/^Q\d{4}$/.test(assignment.final_id) || ids.has(assignment.final_id) || !assignment.canonical_id || !group || !code(assignment.primary_lesson) || !group.lesson_codes.includes(assignment.primary_lesson)) throw new Error("Invalid question lesson assignment");
    ids.add(assignment.final_id);
    if (assignment.decision === "pendente" || assignment.reviewed !== true || typeof assignment.provisional !== "boolean" || !assignment.justification?.trim() || !assignment.references?.length || !Array.isArray(assignment.associated_lessons)) throw new Error("Unresolved curricular assignment");
    for (const ref of assignment.references) {
      if (!ref.file || !Number.isInteger(ref.pdf_page) || ref.pdf_page < 1 || !ref.supports?.trim() || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error("Missing curricular evidence");
    }
    if (assignment.display_repair && (assignment.display_repair.source_checked !== true || !assignment.display_repair.prompt?.trim() || !assignment.display_repair.expected_prompt?.startsWith(assignment.display_repair.prompt) || !assignment.display_repair.source_question || !assignment.display_repair.fragment_file)) throw new Error("Unverified transcription partition");
  }
  return source;
}

// The plan contains reviewed decisions. This function never classifies by keywords.
export function reclassifyNeuroCompendium(tables, source, plan, now = Date.now()) {
  const updated = structuredClone(tables), canonical = structuredClone(source);
  const sourceById = new Map(canonical.map(q => [q.final_id, q]));
  if (sourceById.size !== canonical.length || new Set(canonical.map(q => q.id)).size !== canonical.length || plan.assignments.length !== canonical.length || new Set(plan.assignments.map(a => a.final_id)).size !== canonical.length) throw new Error("Incomplete or duplicate question coverage");
  const anchor = updated.quiz_topics.find(t => t.id === "quiz-topic-neuro-ap1");
  if (!anchor?.curricular_unit_id) throw new Error("Missing Neuroanatomia unit");
  const unit = anchor.curricular_unit_id, groupByIndex = new Map();
  const counts = new Map(), updatedRows = new Set();
  let moved = 0, published = 0;
  for (const group of plan.groups) {
    const topic = updated.quiz_topics.find(t => t.id === group.topic_id && t.curricular_unit_id === unit);
    if (!topic || updatedRows.has(topic.id)) throw new Error("Missing or duplicated persistent lesson identity");
    updatedRows.add(topic.id);
    for (const index of group.indices) {
      if (groupByIndex.has(index)) throw new Error("Overlapping lesson groups");
      groupByIndex.set(index, group);
    }
    const metadata = { ...jsonDescription(topic), compendiumEdition: plan.date, compendiumGroup: plan.groups.indexOf(group), lessonCode: group.code, topicIndices: group.indices, assignmentPolicy: "specific_lesson_first", curricularReview: plan.date };
    Object.assign(topic, { title: `${group.code} — ${group.title}`, description: JSON.stringify(metadata), sort_order: plan.groups.indexOf(group) + 1, status: "published", archived_at: null, archived_by: null, updated_at: now });
    const bank = updated.question_bank_topics.find(t => t.id === topic.id);
    if (!bank || bank.curricular_unit_id !== unit) throw new Error("Missing persistent bank lesson identity");
    Object.assign(bank, { title: topic.title, description: topic.description, sort_order: topic.sort_order, chapter_number: String(topic.sort_order), status: "published", archived_at: null, archived_by: null, updated_at: now });
  }
  for (const assignment of plan.assignments) {
    const q = sourceById.get(assignment.final_id), group = groupByIndex.get(assignment.target_topic_index);
    if (!q || q.id !== assignment.canonical_id || q.topic_index !== assignment.expected_topic_index || q.aula_codigo !== assignment.expected_lesson_code || !group || assignment.reviewed !== true || assignment.decision === "pendente") throw new Error("Stale or unresolved curricular decision: " + assignment.final_id);
    const expectedPrompt = q.text_display;
    if (assignment.display_repair) {
      const repair = assignment.display_repair;
      if (repair.source_checked !== true || repair.expected_prompt !== expectedPrompt || !repair.prompt?.trim() || !expectedPrompt.startsWith(repair.prompt)) throw new Error("Stale or unverified transcription partition");
      q.transcription_history = [...(q.transcription_history || []), { date: plan.date, previous_text_display: expectedPrompt, source_question: repair.source_question, fragment_file: repair.fragment_file, reason: "Separação de duas questões originais coladas na extração" }];
      q.text_display = repair.prompt;
    }
    const old = { topic_index: q.topic_index, tema: q.tema, aula_codigo: q.aula_codigo, aula_confianca: q.aula_confianca };
    const curriculum = { date: plan.date, primary_lesson: assignment.primary_lesson, associated_lessons: structuredClone(assignment.associated_lessons), provisional: assignment.provisional, justification: assignment.justification, references: structuredClone(assignment.references), method: "Revisão individual do enunciado; prioridade à aula específica", history: [...(q.curricular_assignment?.history || []), old] };
    if (q.topic_index !== assignment.target_topic_index) moved++;
    Object.assign(q, { topic_index: assignment.target_topic_index, tema: assignment.target_title, aula_codigo: assignment.primary_lesson, aula_principal: assignment.primary_lesson, aulas_associadas: structuredClone(assignment.associated_lessons), aula_confianca: assignment.provisional ? "associação específica provisória apoiada no plano curricular" : "associação específica conferida nos sumários atuais", curricular_assignment: curriculum });
    if (q.exclude_from_compendium) continue;
    published++;
    counts.set(group.topic_id, (counts.get(group.topic_id) || 0) + 1);
    for (const table of ["quiz_questions", "question_bank_items"]) {
      const matches = updated[table].filter(row => row.compendium?.finalId === q.final_id && row.curricular_unit_id === unit);
      if (matches.length !== 1 || matches[0].compendium.sourceId !== q.id || matches[0].answer_text !== q.validation.verified_answer || matches[0].prompt !== expectedPrompt) throw new Error("Canonical/app identity mismatch: " + q.final_id);
      const row = matches[0];
      row.topic_id = group.topic_id; row.updated_at = now; row.compendium.curriculum = structuredClone(curriculum);
      if (assignment.display_repair) {
        row.prompt = q.text_display;
        row.compendium.transcriptionReview = { date: plan.date, sourceQuestion: assignment.display_repair.source_question, separatedFragmentQuestion: "22", originalPreserved: true };
      }
      if (table === "question_bank_items") {
        row.source_subtopic = q.tema;
        row.sort_order = plan.groups.indexOf(group) * 10000 + counts.get(group.topic_id);
      }
    }
  }
  for (const group of plan.groups) if ((counts.get(group.topic_id) || 0) !== group.count) throw new Error("Specific lesson coverage mismatch");
  const bankSource = updated.question_bank_sources.find(s => s.id === "compendium-source-neuro" && s.curricular_unit_id === unit);
  if (!bankSource) throw new Error("Missing compendium source");
  const coverage = (() => { try { return JSON.parse(bankSource.coverage_json || "{}"); } catch { return {}; } })();
  Object.assign(bankSource, { label: `Neuroanatomia — Compêndio ${plan.date}`, revision_label: plan.date, updated_at: now, coverage_json: JSON.stringify({ ...coverage, groups: plan.groups.map(g => ({ code: g.code, count: g.count })), qualifiedSolutions: canonical.filter(q => !q.exclude_from_compendium && q.validation.status === "com_ressalvas").length, curricularReview: { date: plan.date, policy: "specific_lesson_first", reviewed: canonical.length, provisional: plan.assignments.filter(a => a.provisional).length }, scientificReview: "validation_status_preserved" }) });
  return { tables: updated, source: canonical, report: { reviewed: canonical.length, moved, published, excluded: canonical.length - published, lessonGroups: plan.groups.length, provisional: plan.assignments.filter(a => a.provisional).length } };
}

async function main() {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const arg = name => process.argv.includes(name) && process.argv[process.argv.indexOf(name) + 1];
  const privatePath = name => {
    const value = arg(name); if (!value) throw new Error("Missing " + name);
    const resolved = path.resolve(value), relative = path.relative(root, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Keep plaintext outside the repository");
    return resolved;
  };
  const content = privatePath("--content"), questions = privatePath("--questions"), planPath = privatePath("--plan");
  const bytes = await readFile(questions), plan = JSON.parse(await readFile(planPath, "utf8")), source = validateCurriculumPlan(plan, bytes);
  const sources = new Map();
  for (const assignment of plan.assignments) for (const ref of assignment.references) {
    if (!sources.has(ref.file)) sources.set(ref.file, digest(await readFile(ref.file)));
    if (sources.get(ref.file) !== ref.sha256) throw new Error("Curricular source changed");
  }
  const transferPath = path.join(content, "transfer.json"), transfer = JSON.parse(await readFile(transferPath, "utf8"));
  const files = [];
  for (const file of transfer.files) {
    if (path.basename(file.filename) !== file.filename) throw new Error("Invalid transfer filename");
    if (file.key.startsWith("quiz-content/v1/media/")) continue;
    const buffer = await readFile(path.join(content, file.filename));
    if (digest(buffer) !== file.sha256 || buffer.length !== file.bytes) throw new Error("Private content checksum mismatch");
    files.push({ file, data: JSON.parse(buffer) });
  }
  const manifest = files.find(f => f.file.key.endsWith("/manifest.json"));
  if (!manifest) throw new Error("Missing content manifest");
  const chunks = files.filter(f => f !== manifest);
  const tables = { quiz_topics: manifest.data.topics, quiz_questions: chunks.flatMap(f => f.data.questions), quiz_question_options: chunks.flatMap(f => f.data.options), question_bank_items: chunks.filter(f => /bank-\d+\.json$/.test(f.file.key)).flatMap(f => f.data.bankQuestions), question_bank_topics: chunks.flatMap(f => f.data.bankTopics), question_bank_sources: chunks.flatMap(f => f.data.bankSources) };
  const result = reclassifyNeuroCompendium(tables, source, plan);
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ ...result.report, dryRun: true })); return; }
  const originalRows = new Map([...tables.quiz_questions, ...tables.question_bank_items, ...tables.question_bank_topics, ...tables.question_bank_sources].map(row => [row.id, row]));
  const updatedRows = new Map([...result.tables.quiz_questions, ...result.tables.question_bank_items, ...result.tables.question_bank_topics, ...result.tables.question_bank_sources].map(row => [row.id, row]));
  const prepared = [];
  manifest.data.topics = result.tables.quiz_topics;
  prepared.push(manifest);
  for (const chunk of chunks) {
    let changed = false;
    for (const field of ["questions", "bankQuestions", "bankTopics", "bankSources"]) {
      if (field === "bankQuestions" && !/bank-\d+\.json$/.test(chunk.file.key)) continue;
      chunk.data[field] = chunk.data[field].map(row => {
        const replacement = updatedRows.get(row.id);
        if (replacement && JSON.stringify(replacement) !== JSON.stringify(originalRows.get(row.id))) { changed = true; return replacement; }
        return row;
      });
    }
    if (changed) prepared.push(chunk);
  }
  await writeFile(path.join(content, "canonical-before-curricular-review.json"), bytes, { flag: "wx" });
  await writeFile(questions, JSON.stringify(result.source, null, 2) + "\n");
  for (const chunk of prepared) {
    const buffer = Buffer.from(JSON.stringify(chunk.data));
    await writeFile(path.join(content, chunk.file.filename), buffer);
    chunk.file.bytes = buffer.length; chunk.file.sha256 = digest(buffer);
  }
  transfer.requiresIndexRebuild = true;
  await writeFile(transferPath, JSON.stringify(transfer, null, 2));
  const report = { ...result.report, changedFiles: prepared.length, canonical_before_sha256: digest(bytes), canonical_after_sha256: digest(await readFile(questions)), plan_sha256: digest(await readFile(planPath)), published: false };
  await writeFile(path.join(content, "curricular-review-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
