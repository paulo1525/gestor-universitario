import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const detail=readFileSync(new URL("../components/turma-detail.tsx",import.meta.url),"utf8");
const verifier=readFileSync(new URL("../components/distribution-check.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../components/turmas-dashboard.tsx",import.meta.url),"utf8");
const authGuard=readFileSync(new URL("../components/auth-guard.tsx",import.meta.url),"utf8");
const notFound=readFileSync(new URL("../app/not-found.tsx",import.meta.url),"utf8");
const resetMigration=readFileSync(new URL("../migrations/0007_password_reset.sql",import.meta.url),"utf8");
const phasedMigration=readFileSync(new URL("../migrations/0015_cc_rosters_and_group_windows.sql",import.meta.url),"utf8");
const testEnvironment=readFileSync(new URL("../components/test-environment.tsx",import.meta.url),"utf8");
const preferences=readFileSync(new URL("../components/student-preference-panel.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../components/admin-control.tsx",import.meta.url),"utf8");
const placements=readFileSync(new URL("../components/placement-workbench.tsx",import.meta.url),"utf8");

test("estudantes comuns consultam as turmas sem ver decisões individuais",()=>{
  assert.match(worker,/const readOnlyStudent = !canManageAll\(user\) && !user\.preview/);
  assert.match(worker,/const canReadBaseClasses = request\.method === "GET"/);
  assert.match(worker,/preferencia:readOnlyStudent \? "A aguardar decisão"/);
  assert.match(dashboard,/Turmas base/);
  assert.match(dashboard,/!preferenceOnly && <th>Decisões dos estudantes<\/th>/);
  assert.match(detail,/hideDecisions/);
});

test("ambiente de testes usa dados fictícios isolados e cinco turmas",()=>{
  assert.match(testEnvironment,/localStorage\.getItem\("gu-test-environment"\)/);
  assert.match(testEnvironment,/Todos os nomes, turmas e resultados desta página são fictícios/);
  assert.match(testEnvironment,/Turmas 1–2 abertas/);
  assert.match(testEnvironment,/Turmas 1–5 abertas/);
  assert.match(testEnvironment,/O período de acesso da tua turma ainda não começou/);
  assert.equal((testEnvironment.match(/representative:/g)||[]).length,5);
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
  assert.match(verifier,/Exportar Excel/);
});

test("composição é guardada diretamente e exige todos os campos",()=>{
  assert.match(detail,/\/api\/classes\/\$\{turma\.id\}\/save/);
  assert.match(detail,/!row\.fullName\.trim\(\)\|\|!\/\^\[0-9\]\{9\}\$\//);
  assert.match(detail,/Guardar e continuar/);
  assert.doesNotMatch(detail,/Revisão final|Submeter turma|class-progress/);
  assert.match(worker,/action==="save"/);
  assert.match(worker,/class_roster_saved/);
});

test("submissão e aprovação são idempotentes",()=>{
  assert.match(worker,/alreadySubmitted:true/);
  assert.match(worker,/alreadyExecuted:true/);
  assert.match(worker,/status<>'executed'/);
});

test("permissões e prazo são validados no servidor",()=>{
  assert.match(worker,/canEditClass\(user,classId\)/);
  assert.match(worker,/Date\.now\(\) < Date\.parse\(settings\.closeAt\)/);
  assert.match(worker,/now<Date\.parse\(window\.openAt\)/);
  assert.match(worker,/now>=Date\.parse\(window\.closeAt\)/);
  assert.match(worker,/gerida exclusivamente pelo Núcleo da CC/);
});

test("sem decisão do estudante a distribuição mantém a turma antiga",()=>{
  assert.match(worker,/student_decision==="move"/);
  assert.match(worker,/studentDecision/);
});

test("propostas protegem ordem, versão, revisão e publicação",()=>{
  assert.match(worker,/student_destinations ORDER BY student_id,rank/);
  assert.match(worker,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(worker,/distribution_result_reviews/);
  assert.match(worker,/Ainda existem \$\{pending\.total\} revisões manuais pendentes/);
  assert.match(worker,/Os dados mudaram depois do cálculo/);
  assert.match(worker,/distribution_published/);
  assert.match(detail,/A decisão é tomada mais tarde por cada estudante/);
});

test("o Núcleo dispõe de uma mesa de colocações auditada",()=>{
  assert.match(worker,/handlePlacementWorkbench/);
  assert.match(worker,/student_preferences_admin_updated/);
  assert.match(worker,/distribution_manual_override/);
  assert.match(worker,/INFORMACAO_POR_VALIDAR/);
  assert.match(worker,/preferenceSource:decision\?row\.preference_source:"automatic"/);
  assert.match(placements,/Tem amigos noutra turma/);
  assert.match(placements,/Sofre bullying \/ está mal integrado/);
});

test("a CC gere listas e quatro janelas sem sugerir categorias aos estudantes",()=>{
  assert.match(worker,/function canEditClass\(user: CurrentUser, _classId: number\).*canManageAll\(user\)/);
  assert.match(phasedMigration,/preferences_group_4_close_at/);
  assert.match(admin,/Janelas de preferências por bloco/);
  assert.match(preferences,/Informação adicional para análise pela CC/);
  assert.doesNotMatch(preferences,/bullying|amigos|Pessoa específica/i);
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
