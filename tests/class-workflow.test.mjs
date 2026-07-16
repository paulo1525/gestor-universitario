import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const detail=readFileSync(new URL("../components/turma-detail.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../components/turmas-dashboard.tsx",import.meta.url),"utf8");
const authGuard=readFileSync(new URL("../components/auth-guard.tsx",import.meta.url),"utf8");
const notFound=readFileSync(new URL("../app/not-found.tsx",import.meta.url),"utf8");
const resetMigration=readFileSync(new URL("../migrations/0007_password_reset.sql",import.meta.url),"utf8");
const phasedMigration=readFileSync(new URL("../migrations/0015_cc_rosters_and_group_windows.sql",import.meta.url),"utf8");
const testMode=readFileSync(new URL("../lib/test-mode.ts",import.meta.url),"utf8");
const preferences=readFileSync(new URL("../components/student-preference-panel.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../components/admin-control.tsx",import.meta.url),"utf8");
const placements=readFileSync(new URL("../components/placement-workbench.tsx",import.meta.url),"utf8");
const preflight=readFileSync(new URL("../components/distribution-preflight.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../components/app-shell.tsx",import.meta.url),"utf8");
const placementTablePage=readFileSync(new URL("../app/admin/colocacoes/tabela/page.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("estudantes comuns consultam as turmas sem ver decisões individuais",()=>{
  assert.match(worker,/const readOnlyStudent = !canManageAll\(user\) && !user\.preview/);
  assert.match(worker,/const canReadBaseClasses = request\.method === "GET"/);
  assert.match(worker,/preferencia:readOnlyStudent \? "A aguardar decisão"/);
  assert.match(dashboard,/classes\.dashboard\.baseClasses/);
  assert.match(dashboard,/showDecisions = !preferenceOnly && !placementsPublished/);
  assert.match(dashboard,/showDecisions && <th>\{t\("classes\.dashboard\.decisions"\)\}<\/th>/);
  assert.match(detail,/hideDecisions/);
});

test("ambiente de testes substitui a aplicação completa com cinco turmas",()=>{
  assert.match(testMode,/gu-test-mode/);
  assert.match(testMode,/Array\.from\(\{length:5\}/);
  assert.match(testMode,/\/api\/admin\/distribution-check/);
  assert.match(testMode,/\/api\/admin\/placements/);
  assert.match(testMode,/\/api\/admin\/export-validation/);
  assert.match(testMode,/colocacoes-ambiente-teste\.xls/);
  assert.match(testMode,/Excel\.Sheet/);
  assert.match(testMode,/AutoFilter/);
  assert.match(testMode,/FreezePanes/);
  assert.match(testMode,/#F6C945/);
  assert.match(testMode,/action==="calculate"\?"draft"/);
  assert.match(testMode,/classes:"1–2"/);
  assert.match(testMode,/classes:"3–5"/);
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
  assert.match(worker,/SELECT student_id,destination_class,rank FROM student_destinations ORDER BY student_id,rank/);
  assert.match(worker,/destinationsById=new Map/);
});

test("o validador oferece um Excel completo e formatado",()=>{
  assert.match(worker,/handleValidationExport/);
  assert.match(worker,/\/api\/admin\/export-validation/);
  assert.match(worker,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(worker,/filename="auditoria-pautas-colocacao-.*\.xlsx/);
  assert.match(worker,/xlsxZip/);
  assert.match(worker,/Critérios validados/);
  assert.doesNotMatch(worker,/Colegas indicados|student_friend_preferences|support_class|friend_group_code/);
  assert.match(worker,/Sorteio decisivo/);
  assert.match(worker,/Seed do sorteio/);
  assert.match(worker,/Hash dos dados de entrada/);
  assert.match(worker,/Alteração manual do destino/);
  assert.match(placements,/\/api\/admin\/export-validation/);
  assert.match(placements,/Exportar Excel/);
});

test("composição é guardada diretamente e exige todos os campos",()=>{
  assert.match(detail,/\/api\/classes\/\$\{turma\.id\}\/save/);
  assert.match(detail,/!row\.fullName\.trim\(\) \|\| !\/\^\[0-9\]\{9\}\$\/\.test\(row\.studentNumber\)/);
  assert.match(detail,/classes\.detail\.saveContinue/);
  assert.doesNotMatch(detail,/Revisão final|Submeter turma|class-progress/);
  assert.match(worker,/action==="save"/);
  assert.match(worker,/class_roster_saved/);
  assert.match(worker,/UPDATE classes SET status='submitted'/);
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
  assert.match(worker,/distribution_unpublished/);
  assert.match(worker,/placementsPreserved:true/);
  assert.match(worker,/UPDATE classes SET status='submitted'.*status='published'/);
  assert.match(detail,/classes\.detail\.composeDescription/);
});

test("aprovação confirma e publica automaticamente",()=>{
  assert.match(placements,/Aprovar e publicar as turmas\?/);
  assert.match(placements,/\["approve","apply","publish"\]/);
  assert.match(placements,/Aprovar e publicar agora/);
});

test("editor lista preferências por ordem e integra o destino final",()=>{
  assert.match(placements,/destinations\.map\(item=>item\.destination_class\)/);
  assert.match(placements,/Decisão e preferências/);
  assert.match(placements,/Manter na Turma/);
  assert.match(placements,/Mudar de turma/);
  assert.match(placements,/Não serão guardadas preferências, informação adicional nem pontos extra/);
  assert.match(placements,/sem preferência/);
  assert.doesNotMatch(placements,/Guardar destino manual/);
  assert.match(worker,/O destino manual tem de ser uma turma ativa/);
});

test("publicação aparece na página inicial",()=>{
  assert.match(dashboard,/classes\.dashboard\.yearClasses/);
  assert.match(dashboard,/published-badge/);
  assert.match(dashboard,/classes\.dashboard\.publishedBadge/);
  assert.match(dashboard,/classes\.dashboard\.pdf/);
  assert.match(dashboard,/placementsPublished && <Link/);
  assert.match(worker,/handlePublicClassesPdf/);
  assert.match(worker,/content-type":"application\/pdf/);
  assert.match(worker,/SELECT class_id,full_name,student_number FROM class_students/);
  assert.doesNotMatch(worker.slice(worker.indexOf("async function handlePublicClassesPdf"),worker.indexOf("async function handleGlobalTickets")),/notes|exception_points|considerations|preference_admin_reason/);
  assert.match(testMode,/s\.proposalStatus==="published"\?"published"/);
});

test("pré-validação não expõe o antigo conceito de referências sem ponto",()=>{
  assert.doesNotMatch(worker,/code:"REFERENCIA_SEM_PONTO"/);
  assert.doesNotMatch(preflight,/REFERENCIA_SEM_PONTO|Referências que não atribuem ponto/);
});

test("pontuação do motor vem apenas dos critérios validados pela administração",()=>{
  assert.doesNotMatch(worker,/friendPreferences:friendsById/);
  assert.match(worker,/basePoints:Number\(row\.exception_points\|\|0\)/);
});

test("tickets ficam ocultos e desativados temporariamente",()=>{
  assert.match(worker,/funcionalidade de tickets está temporariamente desativada/);
  assert.doesNotMatch(shell,/href="\/admin\/pedidos"/);
});

test("menu administrativo segue o fluxo de trabalho",()=>{
  assert.match(shell,/Turmas<\/span>.*Lista de turmas.*Colocações/s);
  assert.match(shell,/Validar, calcular e publicar/);
  assert.doesNotMatch(shell,/href="\/admin\/verificacao"/);
  assert.match(shell,/Utilizadores e calendário/);
  assert.match(shell,/Ações administrativas/);
});

test("o Núcleo dispõe de uma mesa de colocações auditada",()=>{
  assert.match(worker,/handlePlacementWorkbench/);
  assert.match(worker,/student_preferences_admin_updated/);
  assert.match(worker,/distribution_manual_override/);
  assert.match(worker,/INFORMACAO_POR_VALIDAR/);
  assert.match(worker,/preferenceSource:decision\?row\.preference_source:"automatic"/);
  assert.match(placements,/Tem amigos noutra turma/);
  assert.match(placements,/Sofre bullying \/ está mal integrado/);
  assert.match(placements,/statusLabels/);
  assert.match(placements,/Rascunho/);
  assert.match(placements,/AppToast/);
  assert.doesNotMatch(placements,/setTimeout\(\(\)=>setNotice\(""\),1500\)/);
  assert.match(placements,/admin-preference-ranking/);
  assert.match(placements,/ArrowUp/);
  assert.match(placements,/Justificação administrativa/);
  assert.match(placements,/aria-invalid/);
  assert.match(placements,/reasonRef\.current\?\.focus\(\)/);
  assert.match(placements,/reasonRef\.current\?\.select\(\)/);
  const editor=placements.slice(placements.indexOf("function PlacementEditor"));
  const saveBlock=editor.slice(editor.indexOf("const save=async"));
  assert.ok(saveBlock.indexOf("reasonRequired&&!trimmedReason")<saveBlock.indexOf('fetch("/api/admin/placements"'),"a justificação condicional deve bloquear antes do pedido");
});

test("verificador é uma pré-validação integrada e acionável",()=>{
  assert.match(placements,/DistributionPreflight/);
  assert.match(placements,/fetch\("\/api\/admin\/distribution-check"/);
  assert.match(placements,/!preflight\?\.ready/);
  assert.match(placements,/className={`calculate-action/);
  assert.match(placements,/role="tooltip"/);
  assert.match(placements,/apresentados acima/);
  assert.match(placements,/na página principal de Colocações/);
  assert.match(placements,/disabled=\{calculateBlocked\}/);
  assert.match(preflight,/classes\.preflight\.eyebrow/);
  assert.match(preflight,/classes\.preflight\.previewEyebrow/);
  assert.match(preflight,/competition/);
  assert.match(preflight,/classes\.preflight\.maxVacancies/);
  assert.match(preflight,/classes\.preflight\.vacanciesLegend/);
  assert.match(preflight,/classes\.preflight\.collisionColumn/);
  assert.match(preflight,/classes\.preflight\.classes/);
  assert.match(preflight,/classes\.preflight\.tiebreaks/);
  assert.match(worker,/firstChoiceCandidates/);
  assert.match(worker,/candidateCapacity/);
  assert.match(worker,/maximumSize-\(finalSize-placed\)/);
  assert.doesNotMatch(preflight,/Simulação sem gravação|não grava alterações|sem alterar nem gravar/);
  assert.match(preflight,/onReviewStudent/);
  assert.match(preflight,/classes\.preflight\.perPageAria/);
  assert.match(preflight,/classes\.preflight\.priorityAria/);
  assert.match(preflight,/classes\.preflight\.firstCasesPage/);
  assert.match(placements,/preflight&&!activeDistribution/);
  assert.match(placements,/A calcular e analisar a nova proposta/);
  assert.match(placements,/As pautas de colocação estão publicadas/);
  assert.match(placements,/Publicação concluída/);
  assert.match(styles,/placement-operation-status\.is-published/);
  assert.match(placements,/Linhas por página/);
  assert.doesNotMatch(preflight,/placement-preflight__checks/);
});

test("ordem de preferências é explícita e a submissão pode ser editada até ao prazo",()=>{
  assert.doesNotMatch(placements,/\.join\(" → "\)/);
  assert.match(placements,/placement-preference-order/);
  assert.match(placements,/\{index\+1\}\.ª<\/b> Turma/);
  assert.match(preferences,/classes\.preferences\.submittedTitle/);
  assert.match(preferences,/classes\.preferences\.edit/);
  assert.match(preferences,/classes\.preferences\.saveVersion/);
  assert.match(preferences,/destinations: decision === "move" \? destinations : \[\]/);
});

test("tabela abre numa nova aba, ocupa o ecrã e mantém o editor administrativo",()=>{
  assert.match(placements,/target="_blank"/);
  assert.match(placements,/rel="noopener noreferrer"/);
  assert.match(placements,/Abrir tabela em ecrã inteiro/);
  assert.match(placements,/tableOnly\?<main className="placement-table-page"/);
  assert.match(placements,/placement-table-page__actions"><div className="placement-action-tools">\{refreshAction\}\{exportAction\}<\/div>\{calculateAction\}/);
  assert.match(placements,/button button--primary" disabled=\{calculateBlocked\}/);
  assert.match(placements,/placement-runbar__actions"><div className="placement-action-tools">\{refreshAction\}\{fullScreenAction\}\{exportAction\}/);
  assert.match(styles,/\.placement-table-page \.calculate-action__tooltip\{top:calc\(100% \+ 12px\);bottom:auto/);
  assert.match(styles,/\.placement-sheet>\.placement-table-wrap\{max-height:calc\(100dvh - 330px\);overflow:auto/);
  assert.match(styles,/\.placement-table-page \.placement-sheet>\.placement-table-wrap\{min-height:0;max-height:none;overflow-x:auto;overflow-y:hidden/);
  assert.match(placements,/selected&&<PlacementEditor/);
  assert.match(placementTablePage,/PlacementWorkbench tableOnly/);
});

test("editor bloqueia o fundo e a confirmação de publicação é estruturada",()=>{
  assert.match(placements,/classList\.toggle\("placement-scroll-locked",locked\)/);
  assert.match(placements,/style\.removeProperty\("overflow"\)/);
  assert.match(styles,/html\.placement-scroll-locked,body\.placement-scroll-locked\{overflow:hidden!important/);
  assert.match(placements,/placement-drawer__close/);
  assert.match(placements,/publish-confirmation__steps/);
  assert.match(placements,/Aprovar e publicar agora/);
});

test("justificação é condicional, critérios são cumulativos e o aluno recebe histórico",()=>{
  assert.match(placements,/reasonRequired=preferenceChanged\|\|validationChanged\|\|manualDestinationChanged/);
  assert.match(placements,/reasonRequired&&<section/);
  assert.match(placements,/OBRIGATÓRIO/);
  assert.match(placements,/type="checkbox"/);
  assert.match(placements,/Podes selecionar mais do que um critério/);
  assert.match(worker,/student_admin_placement_updated/);
  assert.match(worker,/before:\{decision:student\.student_decision,destinations:previousDestinations,additionalInfoStatus/);
});

test("informação adicional só é classificada ao guardar e sai da pré-validação",()=>{
  assert.match(placements,/Informação válida/);
  assert.match(placements,/Informação inválida/);
  assert.match(placements,/additionalInfoStatus/);
  assert.match(placements,/A seleção só fica registada quando guardares as alterações/);
  assert.match(placements,/event\.key==="Escape"/);
  assert.doesNotMatch(placements,/method:"PATCH"/);
  assert.match(worker,/additional_info_review_status/);
  assert.doesNotMatch(preflight,/Pontuação administrativa inconsistente/);
  assert.doesNotMatch(worker,/code:"PONTOS_INCONSISTENTES"/);
  assert.match(worker,/code:"INFORMACAO_VALIDADA_SEM_PONTOS"/);
  assert.match(worker,/additional_info_review_status==="valid"&&Number\(student\.exception_points\|\|0\)===0/);
  assert.match(preflight,/classDataLabel\(locale,"preflightGroup",code\)/);
  assert.doesNotMatch(preflight,/classId\?t\("classes\.common\.class".*:issue\.code/);
  assert.match(admin,/admin-role--\$\{user\.role\}/);
});

test("a CC gere listas e quatro janelas sem sugerir categorias aos estudantes",()=>{
  assert.match(worker,/function canEditClass\(user: CurrentUser, classId: number\).*canManageAll\(user\)/);
  assert.match(phasedMigration,/preferences_group_4_close_at/);
  assert.match(admin,/admin\.control\.preferenceWindows/);
  assert.match(preferences,/classes\.preferences\.notes/);
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
