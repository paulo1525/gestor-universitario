import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import initSqlJs from "sql.js/dist/sql-asm.js";

async function compile(path, require = () => { throw new Error("Unexpected dependency"); }) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  new Function("module", "exports", "require", code)(compiled, compiled.exports, require);
  return compiled.exports;
}

const richText = await compile("../lib/announcement-content.ts");
const { handleQuizRoute } = await compile("../worker/quizzes.ts", (path) => {
  assert.equal(path, "../lib/announcement-content");
  return richText;
});
const SQL = await initSqlJs();
const user = { id: "student-test", email: "student@example.test", fullName: "Estudante fictício", role: "student" };
const sheetColumns = [
  "ID_Unico", "Capitulo_Numero", "Capitulo_Nome", "Subtema", "Ano_Letivo", "Tipo_Avaliacao", "Epoca",
  "Numero_Pergunta", "Fonte_Original", "Pagina", "Enunciado", "Opcoes_Resposta", "Resposta_Indicada_Drive",
  "Resposta_Validada", "Estado_Validacao", "Aviso_Erro_Discrepancia", "Justificacao_Anatomica_FMUP", "Grau_Confianca",
];

function fixture() {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE curricular_units (id TEXT PRIMARY KEY,code TEXT,name TEXT,ects REAL,study_year INTEGER,semester INTEGER,active INTEGER);
    CREATE TABLE question_bank_topics (id TEXT PRIMARY KEY,curricular_unit_id TEXT,title TEXT,chapter_number TEXT,sort_order INTEGER);
    CREATE TABLE question_bank_sources (id TEXT PRIMARY KEY,curricular_unit_id TEXT,label TEXT,source_kind TEXT,revision_label TEXT,source_row_count INTEGER,imported_count INTEGER,published_count INTEGER,review_count INTEGER,coverage_json TEXT,verification_status TEXT,updated_at INTEGER);
    CREATE TABLE question_bank_items (
      id TEXT PRIMARY KEY,curricular_unit_id TEXT,topic_id TEXT,source_id TEXT,external_key TEXT,prompt TEXT,
      options_text TEXT,answer_indicated TEXT,answer_text TEXT,source_original TEXT,anatomical_justification TEXT,
      response_type TEXT,source_subtopic TEXT,source_academic_year TEXT,source_page TEXT,source_question TEXT,
      source_assessment TEXT,source_session TEXT,validation_state TEXT,confidence TEXT,status TEXT,review_note TEXT,image_url TEXT,sort_order INTEGER
    );
    INSERT INTO curricular_units VALUES ('unit-neuro','NEURO','Neuroanatomia',6,2,1,1);
    INSERT INTO question_bank_topics VALUES ('topic-2','unit-neuro','Ontogenia','2',1);
    INSERT INTO question_bank_sources VALUES ('source-neuro','unit-neuro','Fonte canónica','google_sheet','2026-09',1370,1207,890,317,'{"columns":18}','review',1);
    INSERT INTO question_bank_items VALUES
      ('q-short','unit-neuro','topic-2','source-neuro','ROW-SHORT','Defina o tubo neural','N/A (Pergunta de Desenvolvimento)','Tubo neural','Tubo neural','', '', 'short_answer','Tema 2','2025/2026','Página 1','Pergunta 1','Exame','Normal','VALIDADO','ALTO','published','','',1),
      ('q-mc','unit-neuro','topic-2','source-neuro','ROW-MC','Qual é a opção correta?','a) Placa neural\nb) Crista neural','a) Placa neural','Placa neural','','','multiple_choice','Tema 2','2025/2026','Página 2','Pergunta 2','Frequência','Normal','VALIDADO','ALTO','published','','',2),
      ('q-placeholder','unit-neuro','topic-2','source-neuro','ROW-REVIEW','Escolha a opção indicada','Opções de resposta A a E','a) desconhecida','Resposta pendente','','','multiple_choice','Tema 2','2025/2026','Página 3','Pergunta 3','Frequência','Normal','VALIDADO','ALTO','review','Formato de escolha múltipla sem opções estruturadas; requer revisão.', '',3),
      ('q-warning','unit-neuro','topic-2','source-neuro','ROW-WARNING','Enunciado truncado','N/A (Pergunta de Desenvolvimento)','resposta','resposta','','','short_answer','Tema 2','2025/2026','Página 4','Pergunta 4','Exame','Normal','VALIDADO','ALTO','published','Enunciado aparenta estar truncado; requer revisão.', '',4);
  `);
  const env = { DB: { prepare(sql) {
    let bindings = [];
    const execute = () => {
      const statement = db.prepare(sql);
      try {
        statement.bind(bindings);
        const rows = [];
        while (statement.step()) rows.push(statement.getAsObject());
        return rows;
      } finally { statement.free(); }
    };
    return { bind(...values) { bindings = values; return this; }, async first() { return execute()[0] ?? null; }, async all() { return { results: execute() }; } };
  } } };
  return { db, env };
}

async function get(fixtureValue, query) {
  const url = new URL(`https://example.test/api/question-bank?unitId=unit-neuro&${query}`);
  return handleQuizRoute(new Request(url), fixtureValue.env, url, user, async () => true);
}

test("a API publica apenas registos moderados e devolve opções reais", async () => {
  const f = fixture();
  try {
    const response = await get(f, "export=1&pageSize=2000");
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.pagination.total, 2);
    assert.equal(payload.pagination.from, 1);
    assert.equal(payload.pagination.to, 2);
    assert.equal(payload.export.complete, true);
    assert.deepEqual(payload.export.columns, sheetColumns);
    const short = payload.questions.find((question) => question.id === "q-short");
    const multipleChoice = payload.questions.find((question) => question.id === "q-mc");
    assert.equal(short.options, null);
    assert.equal(short.sheet.Opcoes_Resposta, null);
    assert.equal(Array.isArray(multipleChoice.options), true);
    assert.deepEqual(multipleChoice.options.map((option) => option.text), ["Placa neural", "Crista neural"]);
    assert.equal(multipleChoice.options.filter((option) => option.isCorrect).length, 1);
    assert.deepEqual(Object.keys(short.sheet), sheetColumns);
    assert.equal(payload.capabilities.realOptions, true);
  } finally { f.db.close(); }
});

test("os filtros da Sheet aplicam-se ao total e a exportação", async () => {
  const f = fixture();
  try {
    const byPage = await (await get(f, "sourcePage=P%C3%A1gina+2")).json();
    assert.equal(byPage.pagination.total, 1);
    assert.equal(byPage.questions[0].id, "q-mc");
    const byType = await (await get(f, "responseType=multiple_choice")).json();
    assert.equal(byType.pagination.total, 1);
    const withoutSolutions = await (await get(f, "solutionFilter=without")).json();
    assert.equal(withoutSolutions.pagination.total, 0);
    const invalid = await get(f, "solutionFilter=unknown");
    assert.equal(invalid.status, 400);
  } finally { f.db.close(); }
});
