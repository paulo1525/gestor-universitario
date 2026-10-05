import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const stableId = (kind, key) => `compendium-${kind}-neuro-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
const html = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("\n", "<br>");
const paragraph = (label, value) => value ? `<p><strong>${label}</strong><br>${html(value)}</p>` : "";
const edition = "2026-09-29";
const curriculum = topic => { try { return JSON.parse(topic.description || "{}"); } catch { return {}; } };

// Content-only update: no student records or historical question/option IDs are removed.
export function updateNeuroCompendium(tables, source, groups, now = Date.now()) {
  const unitId = tables.quiz_topics.find(t => t.id === "quiz-topic-neuro-ap1")?.curricular_unit_id;
  if (!unitId) throw new Error("Existing Neuroanatomia unit not found");
  const included = source.filter(q => !q.exclude_from_compendium);
  if (groups.length !== 17 || included.length !== 1164 || source.length - included.length !== 10 || included.filter(q => q.validation?.status === "com_ressalvas").length !== 283)
    throw new Error("This update requires the complete final 29/09/2026 edition");
  if (new Set(source.map(q => q.final_id)).size !== source.length || new Set(source.map(q => q.id)).size !== source.length)
    throw new Error("Duplicate source identifiers");
  const byIndex = new Map();
  const topics = tables.quiz_topics.filter(t => t.curricular_unit_id === unitId);
  const bankTopics = tables.question_bank_topics.filter(t => t.curricular_unit_id === unitId);
  const actor = topics.find(t => t.id === "quiz-topic-neuro-ap1").updated_by;
  // Reuse the existing lesson identity where possible; retire redundant themes.
  const topicTitles = ["AP1", "Ontogenia do sistema nervoso", "Medula espinhal e meninges raquidianas", "Bolbo raquidiano e protuberância", "Nervos cranianos: componentes funcionais e via olfativa", "Nervos trigémio e facial", "Nervos IX, X, XI e XII; espaços craniofaciais", "Cerebelo", "Telencéfalo: configuração externa", "Telencéfalo: configuração interna", "Subtálamo e núcleos da base", "Vascularização, meninges e sistema ventricular", "Órbita e nervos oculomotores", "Ouvido e vias acústica e vestibular", "Sistema nervoso autónomo", "Vias aferentes", "Vias eferentes"];
  const groupTopics = groups.map((group, i) => {
    const old = i === 0 ? topics.find(t => t.id === "quiz-topic-neuro-ap1") : topics.find(t => t.title === topicTitles[i] || curriculum(t).compendiumGroup === i);
    if (!old) throw new Error("Existing lesson identity missing: " + group.code);
    const topic = { ...old, title: `${group.code} — ${group.title}`, description: JSON.stringify({ compendiumEdition: edition, compendiumGroup: i, lessonCode: group.code, topicIndices: group.indices }), sort_order: i + 1, status: "published", archived_at: null, archived_by: null, updated_at: now };
    for (const index of group.indices) {
      if (byIndex.has(index)) throw new Error("Overlapping lesson groups");
      byIndex.set(index, topic);
    }
    const bankTopic = bankTopics.find(t => t.id === topic.id) || { ...topic, source_id: "compendium-source-neuro" };
    Object.assign(bankTopic, { title: topic.title, sort_order: i + 1, chapter_number: String(i + 1), updated_at: now });
    if (!bankTopics.some(t => t.id === bankTopic.id)) tables.question_bank_topics.push(bankTopic);
    return topic;
  });
  for (const q of included) {
    if (!byIndex.has(q.topic_index) || q.tipo !== "Resposta aberta" || q.options?.length || !q.text_display?.trim() || !q.validation?.verified_answer?.trim() || !["confirmada", "corrigida", "com_ressalvas"].includes(q.validation.status))
      throw new Error("Incomplete or non-canonical question: " + q.final_id);
  }
  for (const topic of topics) {
    const updated = groupTopics.find(t => t.id === topic.id);
    if (updated) Object.assign(topic, updated);
    else if (topic.status === "published") Object.assign(topic, { status: "archived", archived_at: now, archived_by: actor, updated_at: now });
  }
  const quizById = new Map(tables.quiz_questions.map(q => [q.id, q]));
  const bankById = new Map(tables.question_bank_items.map(q => [q.id, q]));
  const activeIds = new Set(included.map(q => stableId("quiz", q.final_id)));
  const activeBankIds = new Set(included.map(q => stableId("question", q.final_id)));
  for (const q of tables.quiz_questions) if (q.curricular_unit_id === unitId && !activeIds.has(q.id) && q.status === "published") Object.assign(q, { status: "archived", archived_at: now, archived_by: actor, updated_at: now });
  for (const q of tables.question_bank_items) if (q.curricular_unit_id === unitId && !activeBankIds.has(q.id) && q.status !== "archived") Object.assign(q, { status: "archived", updated_at: now });
  const counters = new Map();
  for (const q of included) {
    const topic = byIndex.get(q.topic_index), id = stableId("quiz", q.final_id), bankId = stableId("question", q.final_id);
    counters.set(topic.id, (counters.get(topic.id) || 0) + 1);
    const v = q.validation;
    const stateLabel = { confirmada: "confirmada", corrigida: "corrigida", com_ressalvas: "com ressalvas" }[v.status];
    const provenance = q.occurrences.map(o => `${o.source_title} · ${o.year || "ano não indicado"} · ${o.section || o.assessment || ""} · n.º ${o.original_number || "s/n"} · PDF p. ${(o.pdf_pages || [o.pdf_page]).filter(p => p != null).join(", ")}`).join("\n");
    const references = (v.references || []).map(r => [r.title || r.source_title, r.edition && `${r.edition} ed.`, r.chapter, r.pdf_page && `PDF p. ${r.pdf_page}`, r.printed_page && `p. ${r.printed_page}`, r.supports].filter(Boolean).join(" · ")).join("\n");
    const explanation = paragraph(`Conclusão bibliográfica registada · ${stateLabel}`, v.verified_answer) + paragraph("Ressalva", v.note) + paragraph("Referências", references) + paragraph("Fonte do enunciado · " + q.final_id, provenance) + paragraph("Nota editorial", q.editorial_note);
    const metadata = { edition, finalId: q.final_id, sourceId: q.id, validation: structuredClone(v), occurrences: structuredClone(q.occurrences), editorialNote: q.editorial_note || "" };
    const identity = { curricular_unit_id: unitId, created_by: actor, updated_by: actor, created_at: now, updated_at: now, deleted_at: null };
    const old = quizById.get(id);
    const question = { ...identity, ...old, id, topic_id: topic.id, prompt: q.text_display, answer_text: v.verified_answer, explanation, response_type: "short_answer", difficulty: old?.difficulty || "medium", status: "published", published_at: old?.published_at || now, published_by: actor, archived_at: null, archived_by: null, updated_at: now, compendium: metadata, question_images_json: "[]", solution_images_json: "[]", image_url: null };
    if (old) Object.assign(old, question); else tables.quiz_questions.push(question);
    const oldBank = bankById.get(bankId);
    const bank = { ...identity, ...oldBank, id: bankId, topic_id: topic.id, source_id: "compendium-source-neuro", external_key: q.final_id, prompt: q.text_display, answer_text: v.verified_answer, answer_indicated: "", options_text: "", response_type: "short_answer", source_original: provenance, anatomical_justification: explanation, source_subtopic: q.tema, source_question: q.final_id, source_page: String(q.occurrences[0]?.pdf_page || ""), status: "published", validation_state: "VALIDADO", confidence: "ALTO", review_note: "", sort_order: groups.findIndex(g => g.indices.includes(q.topic_index)) * 10000 + counters.get(topic.id), updated_at: now, compendium: metadata, image_url: "", question_images_json: "[]", solution_images_json: "[]" };
    if (oldBank) Object.assign(oldBank, bank); else tables.question_bank_items.push(bank);
  }
  for (const [i, group] of groups.entries()) if (counters.get(groupTopics[i].id) !== group.count) throw new Error("PDF coverage mismatch: " + group.code);
  const bankSource = tables.question_bank_sources.find(s => s.id === "compendium-source-neuro");
  if (!bankSource) throw new Error("Compendium source identity missing");
  Object.assign(bankSource, { label: "Neuroanatomia — Compêndio final de 29/09/2026", revision_label: edition, published_count: 1164, review_count: 0, verification_status: "verified_with_qualifications", updated_at: now, coverage_json: JSON.stringify({ groups: groups.map(g => ({ code: g.code, count: g.count })), excluded: source.filter(q => q.exclude_from_compendium).map(q => q.final_id), qualifiedSolutions: 283 }) });
  for (const s of tables.question_bank_sources) if (s.curricular_unit_id === unitId && s.id !== bankSource.id) Object.assign(s, { published_count: 0, verification_status: "archived" });
  return { questions: 1164, qualifiedSolutions: 283, excluded: 10, topics: 17, preservedExistingQuestions: included.filter(q => quizById.has(stableId("quiz", q.final_id))).length };
}

async function main() {
  const arg = name => process.argv[process.argv.indexOf(name) + 1];
  if (!["--source", "--content", "--groups"].every(name => process.argv.includes(name))) throw new Error("Use --source questoes.json --groups groups.json --content private-export");
  const content = path.resolve(arg("--content"));
  const repository = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const relative = path.relative(repository, content);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Plaintext must remain outside the repository");
  const transfer = JSON.parse(await readFile(path.join(content, "transfer.json"), "utf8"));
  const files = await Promise.all(transfer.files.map(async f => ({ file: f, data: JSON.parse(await readFile(path.join(content, f.filename), "utf8")) })));
  const manifest = files.find(f => f.file.key.endsWith("/manifest.json")).data;
  const chunks = files.filter(f => !f.file.key.endsWith("/manifest.json"));
  const tables = { quiz_topics: manifest.topics, quiz_questions: chunks.flatMap(f => f.data.questions), quiz_question_options: chunks.flatMap(f => f.data.options), question_bank_items: chunks.filter(f => /bank-\d+\.json$/.test(f.file.key)).flatMap(f => f.data.bankQuestions), question_bank_topics: chunks.flatMap(f => f.data.bankTopics), question_bank_sources: chunks.flatMap(f => f.data.bankSources) };
  const report = updateNeuroCompendium(tables, JSON.parse(await readFile(arg("--source"), "utf8")), JSON.parse(await readFile(arg("--groups"), "utf8")));
  // Repack distributes these records into bounded chunks. Keep all input file names intact.
  for (const f of chunks) { f.data.questions = []; f.data.options = []; if (/bank-\d+\.json$/.test(f.file.key)) f.data.bankQuestions = []; f.data.bankTopics = []; f.data.bankSources = []; }
  const quiz = chunks.find(f => /quiz-\d+\.json$/.test(f.file.key)).data;
  quiz.questions = tables.quiz_questions; quiz.options = tables.quiz_question_options;
  const bank = chunks.find(f => /bank-\d+\.json$/.test(f.file.key)).data;
  bank.bankQuestions = tables.question_bank_items;
  const bankIndex = chunks.find(f => /bank-index\.json$/.test(f.file.key)).data;
  bankIndex.bankTopics = tables.question_bank_topics; bankIndex.bankSources = tables.question_bank_sources;
  for (const f of files) await writeFile(path.join(content, f.file.filename), JSON.stringify(f.data));
  console.log(JSON.stringify(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
