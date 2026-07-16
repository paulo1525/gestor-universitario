import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentCsv } from "../lib/student-csv.ts";

test("importa CSV seguro com as duas colunas permitidas", () => {
  assert.deepEqual(parseStudentCsv('nome,n_mecanografico\n"Ana, Silva",202512345\nBruno Sousa,202512346'), [
    { nome: "Ana, Silva", n_mecanografico: "202512345" },
    { nome: "Bruno Sousa", n_mecanografico: "202512346" },
  ]);
});

test("recusa colunas extra, números inválidos e duplicados", () => {
  assert.throws(() => parseStudentCsv("nome,n_mecanografico,email\nAna Silva,202512345,a@b.pt"), /apenas as colunas/);
  assert.throws(() => parseStudentCsv("nome;n_mecanografico\nAna Silva;123"), /9 algarismos/);
  assert.throws(() => parseStudentCsv("nome,n_mecanografico\nAna Silva,202512345\nBruno Sousa,202512345"), /duplicados/);
});
