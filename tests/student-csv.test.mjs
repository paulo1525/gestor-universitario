import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentCsv } from "../lib/student-csv.ts";

test("importa CSV global com turma e os quatro códigos de estatuto", () => {
  assert.deepEqual(parseStudentCsv('turma,nome,n_mecanografico,codigo_estatuto\n1,"Ana, Silva",202512345,N\n2,Bruno Sousa,202512346,TE\n3,Carla Alves,202512347,A\n4,Diogo Melo,202512348,O'), [
    { turma: 1, nome: "Ana, Silva", n_mecanografico: "202512345", codigo_estatuto: "N", specialStatus: "none" },
    { turma: 2, nome: "Bruno Sousa", n_mecanografico: "202512346", codigo_estatuto: "TE", specialStatus: "worker_student" },
    { turma: 3, nome: "Carla Alves", n_mecanografico: "202512347", codigo_estatuto: "A", specialStatus: "athlete" },
    { turma: 4, nome: "Diogo Melo", n_mecanografico: "202512348", codigo_estatuto: "O", specialStatus: "other" },
  ]);
});

test("aceita cabeçalhos reordenados e ponto e vírgula", () => {
  assert.equal(parseStudentCsv("codigo_estatuto;n_mecanografico;nome;turma\nte;202512345;Ana Silva;20")[0].specialStatus, "worker_student");
});

test("recusa colunas extra, turma, estatuto e números inválidos ou duplicados", () => {
  assert.throws(() => parseStudentCsv("turma,nome,n_mecanografico,codigo_estatuto,email\n1,Ana Silva,202512345,N,a@b.pt"), /apenas as colunas/);
  assert.throws(() => parseStudentCsv("turma;nome;n_mecanografico;codigo_estatuto\n1;Ana Silva;123;N"), /9 algarismos/);
  assert.throws(() => parseStudentCsv("turma,nome,n_mecanografico,codigo_estatuto\n21,Ana Silva,202512345,N"), /turma entre 1 e 20/);
  assert.throws(() => parseStudentCsv("turma,nome,n_mecanografico,codigo_estatuto\n1,Ana Silva,202512345,X"), /N, TE, A ou O/);
  assert.throws(() => parseStudentCsv("turma,nome,n_mecanografico,codigo_estatuto\n1,Ana Silva,202512345,N\n2,Bruno Sousa,202512345,TE"), /duplicados/);
});
