import test from "node:test";
import assert from "node:assert/strict";
import {buildPublicClassesPdf} from "../lib/public-classes-pdf.mjs";

test("PDF público inclui apenas identificação e turma final, com paginação válida",()=>{
  const students=Array.from({length:30},(_,index)=>({classId:1,fullName:`Estudante ${index+1}`,studentNumber:String(202500001+index)}));
  students.push({classId:2,fullName:"Álvaro Coração",studentNumber:"202500099"});
  students.push({classId:2,fullName:"Nome Extremamente Comprido Para Confirmar Que Nunca Entra Na Coluna Do Número Mecanográfico",studentNumber:"202500100"});
  const pdf=buildPublicClassesPdf({classes:[1,2],students,publishedAt:"13/07/2026, 14:30"}),source=new TextDecoder("latin1").decode(pdf);
  assert.match(source,/^%PDF-1\.4/);
  assert.match(source,/\/Type \/Pages .*\/Count 3/);
  assert.match(source,/Turma 1 - continuação/);
  assert.match(source,/Álvaro Coração/);
  assert.match(source,/Nome Extremamente Comprido Para Confirmar Que Nunca.../);
  assert.match(source,/Inclui apenas nome, número mecanográfico e turma final publicada/);
  assert.doesNotMatch(source,/pontua|justifica|preferência|notes|audit/i);
  assert.match(source,/startxref\n\d+\n%%EOF/);
});
