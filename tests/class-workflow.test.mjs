import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const detail=readFileSync(new URL("../components/turma-detail.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/0006_class_workflow_performance.sql",import.meta.url),"utf8");
const resetMigration=readFileSync(new URL("../migrations/0007_password_reset.sql",import.meta.url),"utf8");

test("o esquema não é inicializado no caminho dos pedidos",()=>{
  assert.doesNotMatch(worker,/await ensureOperationalSchema\(/);
  assert.match(worker,/gerido exclusivamente pelas migrações D1/);
});

test("detalhe e verificador carregam destinos em lote",()=>{
  assert.match(worker,/LEFT JOIN student_destinations/);
  assert.match(worker,/handleDistributionCheckV2/);
  assert.match(worker,/COUNT\(d\.student_id\) destination_count/);
});

test("rascunho usa debounce, versão e cancelamento",()=>{
  assert.match(detail,/setTimeout\(\(\)=>void save\(rows,step\),900\)/);
  assert.match(detail,/AbortController/);
  assert.match(worker,/revision<=klass\.draft_revision/);
  assert.match(migration,/PRIMARY KEY \(class_id, revision\)/);
});

test("submissão e aprovação são idempotentes",()=>{
  assert.match(worker,/alreadySubmitted:true/);
  assert.match(worker,/alreadyExecuted:true/);
  assert.match(worker,/status<>'executed'/);
});

test("permissões e prazo são validados no servidor",()=>{
  assert.match(worker,/canEditClass\(user,classId\)/);
  assert.match(worker,/Date\.now\(\) < Date\.parse\(settings\.closeAt\)/);
  assert.match(worker,/now<Date\.parse\(settings\.closeAt\)/);
});

test("o exemplo de número mecanográfico é neutro",()=>{
  assert.match(detail,/placeholder="202500000"/);
  assert.doesNotMatch(detail,/placeholder="202507850"/);
});

test("reposição de palavra-passe expira, limita tentativas e revoga sessões",()=>{
  assert.match(resetMigration,/expires_at/);
  assert.match(worker,/reset\.attempts>=6/);
  assert.match(worker,/DELETE FROM sessions WHERE user_id=\?/);
  assert.match(worker,/password_reset/);
});
