import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const detail=readFileSync(new URL("../components/turma-detail.tsx",import.meta.url),"utf8");
const verifier=readFileSync(new URL("../components/distribution-check.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../components/turmas-dashboard.tsx",import.meta.url),"utf8");
const authGuard=readFileSync(new URL("../components/auth-guard.tsx",import.meta.url),"utf8");
const notFound=readFileSync(new URL("../app/not-found.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/0006_class_workflow_performance.sql",import.meta.url),"utf8");
const resetMigration=readFileSync(new URL("../migrations/0007_password_reset.sql",import.meta.url),"utf8");

test("estudantes comuns consultam as turmas sem ver decisões individuais",()=>{
  assert.match(worker,/const readOnlyStudent = user\.role === "student" && !user\.classRepresentative && !user\.preview/);
  assert.match(worker,/const canReadBaseClasses = request\.method === "GET"/);
  assert.match(worker,/preferencia:readOnlyStudent \? "A aguardar decisão"/);
  assert.match(dashboard,/Turmas base/);
  assert.match(dashboard,/!preferenceOnly && <th>Decisões dos estudantes<\/th>/);
  assert.match(detail,/Consulta da turma base/);
});

test("acesso inválido mostra aviso e volta ao início",()=>{
  assert.match(authGuard,/Sem permissão para visualizar esta página/);
  assert.match(authGuard,/setTimeout\(\(\)=>router\.replace\("\/"\),3000\)/);
  assert.match(authGuard,/requireAdmin/);
  assert.match(notFound,/AccessDenied/);
});

test("o esquema não é inicializado no caminho dos pedidos",()=>{
  assert.doesNotMatch(worker,/await ensureOperationalSchema\(/);
  assert.match(worker,/gerido exclusivamente pelas migrações D1/);
});

test("detalhe e verificador carregam destinos em lote",()=>{
  assert.match(worker,/LEFT JOIN student_destinations/);
  assert.match(worker,/handleDistributionCheckV2/);
  assert.match(worker,/COUNT\(d\.student_id\) destination_count/);
});

test("o validador oferece um Excel completo e formatado",()=>{
  assert.match(worker,/handleValidationExport/);
  assert.match(worker,/\/api\/admin\/export-validation/);
  assert.match(worker,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(worker,/filename="validador-distribuicao-.*\.xlsx/);
  assert.match(worker,/xlsxZip/);
  assert.match(worker,/Situações a considerar/);
  assert.match(worker,/Colegas indicados \(por ordem\)/);
  assert.match(verifier,/\/api\/admin\/export-validation/);
  assert.match(verifier,/Exportar Excel completo/);
});

test("rascunho usa debounce, versão e cancelamento",()=>{
  assert.match(detail,/setTimeout\(\(\) => void save\(rows, step\), 900\)/);
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
  assert.match(worker,/now<Date\.parse\(settings\.preferencesOpenAt\)/);
  assert.match(worker,/now>=Date\.parse\(settings\.preferencesCloseAt\)/);
});

test("sem decisão do estudante a distribuição mantém a turma antiga",()=>{
  assert.match(worker,/student_decision==="move"/);
  assert.match(worker,/studentDecision/);
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
