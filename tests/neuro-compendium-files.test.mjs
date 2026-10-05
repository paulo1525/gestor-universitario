import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { updateNeuroCompendium } from "../scripts/update-neuro-compendium.mjs";
import { prepareQuizJson } from "../scripts/prepare-quiz-json-storage.mjs";

const id = (kind, key) => `compendium-${kind}-neuro-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
function fixture() {
  const titles = ["AP1", "Ontogenia do sistema nervoso", "Medula espinhal e meninges raquidianas", "Bolbo raquidiano e protuberância", "Nervos cranianos: componentes funcionais e via olfativa", "Nervos trigémio e facial", "Nervos IX, X, XI e XII; espaços craniofaciais", "Cerebelo", "Telencéfalo: configuração externa", "Telencéfalo: configuração interna", "Subtálamo e núcleos da base", "Vascularização, meninges e sistema ventricular", "Órbita e nervos oculomotores", "Ouvido e vias acústica e vestibular", "Sistema nervoso autónomo", "Vias aferentes", "Vias eferentes"];
  const source = Array.from({length:1174}, (_, i) => ({ id:`source-${i}`, final_id:`Q${String(i + 1).padStart(4,"0")}`, tipo:"Resposta aberta", topic_index:i % 17, text_display:`Enunciado fictício ${i}\na) Subpergunta completa`, options:[], exclude_from_compendium:i >= 1164, validation:{ status:i < 283 ? "com_ressalvas" : "confirmada", verified_answer:`Resposta fictícia ${i}`, note:i < 283 ? `Ressalva integral ${i}: <limite> & condição.` : "", references:[{title:"Fonte fictícia",printed_page:"10"}], origin:"Revisão herdada" }, occurrences:[{source_title:"PDF fictício",pdf_page:10,original_number:String(i),year:"ano não indicado"}], editorial_note:"Nota editorial fictícia", tema:"Subtema" }));
  const groups = titles.map((title, i) => ({code:`AT${i + 1}`, title, indices:[i], count:source.filter(q => !q.exclude_from_compendium && q.topic_index === i).length}));
  const topics = titles.map((title, i) => ({id:i ? `topic-${i}` : "quiz-topic-neuro-ap1", curricular_unit_id:"neuro", title, description:"Descrição livre", status:"published", updated_by:"actor",created_at:1,updated_at:1}));
  const existing = {id:id("quiz",source[0].final_id),curricular_unit_id:"neuro",topic_id:topics[0].id,status:"published",created_at:2,created_by:"original-actor"};
  const legacy = {id:"quiz-neuro-ap1-001",curricular_unit_id:"neuro",topic_id:topics[0].id,status:"published",prompt:"Enunciado antigo"};
  const excluded = {id:id("quiz",source[1164].final_id),curricular_unit_id:"neuro",topic_id:topics[0].id,status:"published"};
  const other = {id:"other",curricular_unit_id:"other-unit",topic_id:"other-topic",status:"published",prompt:"Outra disciplina"};
  const tables = {quiz_topics:[...topics,{id:"other-topic",curricular_unit_id:"other-unit",status:"published"}],quiz_questions:[existing,legacy,excluded,other],quiz_question_options:[{id:"original-option",question_id:legacy.id,option_text:"Opção antiga",is_correct:1}],question_bank_items:[{id:"legacy-bank",curricular_unit_id:"neuro",status:"published"}],question_bank_topics:[],question_bank_sources:[{id:"compendium-source-neuro",curricular_unit_id:"neuro"}]};
  return {tables,source,groups,existing,legacy,other};
}

test("final Neuro edition retains identities, retires AP1, includes qualified solutions and orders lesson sets", () => {
  const f = fixture(), otherBefore = structuredClone(f.other), optionsBefore = structuredClone(f.tables.quiz_question_options);
  const report = updateNeuroCompendium(f.tables,f.source,f.groups,10);
  assert.equal(report.questions,1164); assert.equal(report.preservedExistingQuestions,1);
  assert.equal(f.existing.created_at,2); assert.equal(f.existing.created_by,"original-actor");
  assert.equal(f.legacy.status,"archived"); assert.equal(f.legacy.prompt,"Enunciado antigo");
  assert.deepEqual(f.other,otherBefore); assert.deepEqual(f.tables.quiz_question_options,optionsBefore);
  const active = f.tables.quiz_questions.filter(q=>q.curricular_unit_id==="neuro"&&q.status==="published");
  assert.equal(active.length,1164); assert.ok(active.every(q=>q.response_type==="short_answer"));
  assert.equal(active.filter(q=>q.compendium.validation.status==="com_ressalvas").length,283);
  assert.ok(active[0].explanation.includes("Ressalva integral 0: &lt;limite&gt; &amp; condição."));
  assert.deepEqual(active[0].compendium.validation,f.source[0].validation);
  assert.ok(!active.some(q=>q.compendium.finalId===f.source[1164].final_id));
  const topics = f.tables.quiz_topics.filter(t=>t.curricular_unit_id==="neuro"&&t.status==="published").sort((a,b)=>a.sort_order-b.sort_order);
  assert.deepEqual(topics.map(t=>t.title),f.groups.map(g=>`${g.code} — ${g.title}`));
  for(const topic of topics) assert.equal(active.filter(q=>q.topic_id===topic.id).length,f.groups[topic.sort_order-1].count);
  const priorIds=f.tables.quiz_questions.map(q=>q.id);
  updateNeuroCompendium(f.tables,f.source,f.groups,10);
  assert.deepEqual(f.tables.quiz_questions.map(q=>q.id),priorIds);
  const packed=prepareQuizJson(f.tables,"test",10);
  assert.equal(packed.manifest.questions.filter(q=>q.curricular_unit_id==="neuro"&&q.status==="published").length,1164);
  assert.ok(packed.artifacts.filter(a=>/quiz-\d+\.json$/.test(a.key)).every(a=>JSON.parse(a.content).questions.length<=32));
});

test("reject incomplete editions, missing answers and inconsistent PDF lesson coverage", () => {
  for (const mutate of [f=>f.source.pop(),f=>f.source[0].validation.verified_answer="",f=>f.groups[0].count++,f=>f.source[0].options=["A","B"],f=>f.source[0].topic_index=99,f=>f.source[0].final_id=f.source[1].final_id]) {
    const f=fixture(); mutate(f); assert.throws(()=>updateNeuroCompendium(f.tables,f.source,f.groups,10));
  }
});
