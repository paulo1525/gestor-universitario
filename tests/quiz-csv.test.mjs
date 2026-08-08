import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, quizCsvTemplate, validateQuizCsv } from "../lib/quiz-csv.mjs";

const units = [{ id: "anatomia", code: "BIO101" }];

test("valida CSV de perguntas com vírgulas e texto entre aspas", () => {
  const csv = `unit_code,theme,question,option_1,option_2,option_3,option_4,correct_option,explanation,difficulty,image_url\nBIO101,Anatomia,"Qual é, em média, o maior órgão?",Pele,Fígado,Coração,,A,"A pele protege o corpo.",fácil,/imagens/pele.png`;
  const result = validateQuizCsv(csv, { units });
  assert.equal(result.errors.length, 0);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.rows[0].correctOption, 0);
  assert.deepEqual(result.rows[0].options, ["Pele", "Fígado", "Coração"]);
  assert.equal(result.rows[0].difficulty, "easy");
});

test("aceita cabeçalhos em português, separador ponto e vírgula e BOM", () => {
  const csv = "\uFEFFunidade_curricular;tema;pergunta;opção_1;opção_2;resposta_correta;explicação;dificuldade\nBIO101;Histologia;Que tecido reveste a pele?;Epitelial;Muscular;1;É um epitélio.;média";
  const result = validateQuizCsv(csv, { units });
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].difficulty, "medium");
});

test("herda a UC selecionada quando o CSV não traz a coluna da unidade", () => {
  const csv = "theme,question,option_1,option_2,correct_option,explanation,difficulty\nOssos,Que osso forma a testa?,Frontal,Parietal,1,Forma a região anterior do crânio.,média";
  const result = validateQuizCsv(csv, { units, selectedUnitId: "anatomia", selectedUnitCode: "BIO101" });
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].unitId, "anatomia");
  assert.equal(result.rows[0].unitCode, "BIO101");
});

test("assinala cada linha inválida sem descartar a pré-visualização", () => {
  const csv = "unit_code,theme,question,option_1,option_2,correct_option,explanation,difficulty\nDESCONHECIDA,,,A,,3,,impossível";
  const result = validateQuizCsv(csv, { units });
  assert.equal(result.rows.length, 1);
  assert.equal(result.validRows.length, 0);
  assert.ok(result.errors.some((error) => error.field === "unit_code"));
  assert.ok(result.errors.some((error) => error.field === "options"));
  assert.ok(result.errors.some((error) => error.field === "difficulty"));
});

test("rejeita imagens externas porque a aplicação só serve caminhos internos ou data URLs", () => {
  const csv = "unit_code,theme,question,option_1,option_2,correct_option,explanation,difficulty,image_url\nBIO101,Pele,Que órgão protege o corpo?,Pele,Fígado,1,A pele cria uma barreira física.,fácil,https://example.test/pele.png";
  const result = validateQuizCsv(csv, { units });
  assert.ok(result.errors.some((error) => error.field === "image_url"));
});

test("limita data URLs de imagem a 1 MiB para caberem com margem na D1", () => {
  const tooLargeBase64 = "A".repeat(Math.ceil((1024 * 1024 + 1) * 4 / 3));
  const csv = `unit_code,theme,question,option_1,option_2,correct_option,explanation,difficulty,image_url\nBIO101,Pele,Que órgão protege o corpo?,Pele,Fígado,1,A pele cria uma barreira física.,fácil,data:image/png;base64,${tooLargeBase64}`;
  const result = validateQuizCsv(csv, { units });
  assert.ok(result.errors.some((error) => error.field === "image_url"));
});

test("o parser preserva mudanças de linha dentro de uma célula entre aspas", () => {
  assert.deepEqual(parseCsv('a,b\n"uma\nduas",c'), [["a", "b"], ["uma\nduas", "c"]]);
  assert.match(quizCsvTemplate(), /theme,question,option_1/);
  assert.doesNotMatch(quizCsvTemplate().split("\n")[0], /unit_code/);
});
