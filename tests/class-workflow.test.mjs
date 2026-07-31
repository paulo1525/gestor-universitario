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
const deferredReviewMigration=readFileSync(new URL("../migrations/0028_additional_info_review_deferred.sql",import.meta.url),"utf8");
const testMode=readFileSync(new URL("../lib/test-mode.ts",import.meta.url),"utf8");
const preferences=readFileSync(new URL("../components/student-preference-panel.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../components/admin-control.tsx",import.meta.url),"utf8");
const maintenancePage=readFileSync(new URL("../app/manutencao/page.tsx",import.meta.url),"utf8");
const csvImport=readFileSync(new URL("../components/class-roster-import.tsx",import.meta.url),"utf8");
const placements=readFileSync(new URL("../components/placement-workbench.tsx",import.meta.url),"utf8");
const preflight=readFileSync(new URL("../components/distribution-preflight.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../components/app-shell.tsx",import.meta.url),"utf8");
const placementTablePage=readFileSync(new URL("../app/admin/colocacoes/tabela/page.tsx",import.meta.url),"utf8");
const scrollLock=readFileSync(new URL("../components/use-scroll-lock.ts",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("estudantes comuns consultam as turmas sem ver decisões individuais",()=>{
  assert.match(worker,/const readOnlyStudent = !canManageAll\(user\) && !user\.preview/);
  assert.match(worker,/const canReadBaseClasses = request\.method === "GET"/);
  assert.match(worker,/const specialStatus=specialStatusesEnabled\?student\.special_status:"none"/);
  assert.match(worker,/preferencia:specialStatus!=="none"\?"Estatuto especial":readOnlyStudent \? "A aguardar decisão"/);
  assert.match(dashboard,/classes\.dashboard\.baseClasses/);
  assert.match(dashboard,/showDecisions = !preferenceOnly && !placementsPublished/);
  assert.match(dashboard,/showDecisions && <th>\{t\("classes\.dashboard\.decisions"\)\}<\/th>/);
  assert.match(detail,/hideDecisions/);
});

test("ambiente de testes substitui a aplicação completa com cinco turmas",()=>{
  assert.match(testMode,/export const TEST_MODE_AVAILABLE=process\.env\.NEXT_PUBLIC_TEST_MODE_AVAILABLE==="1"/);
  assert.match(testMode,/if\(!TEST_MODE_AVAILABLE\)/);
  assert.match(admin,/\{TEST_MODE_AVAILABLE && <section className=\{`panel admin-settings test-mode-setting/);
  assert.match(testMode,/gu-test-mode/);
  assert.match(testMode,/const TEST_MODE_MODULES=/);
  assert.match(testMode,/\{key:"requests",enabled:false,effectiveEnabled:false/);
  assert.match(testMode,/\{key:"dashboard",enabled:false,effectiveEnabled:false/);
  assert.match(testMode,/resolvedModuleKey:"classes",href:"\/turmas"/);
  assert.match(testMode,/path\.startsWith\("\/api\/auth\/"\)\)return null/);
  assert.match(testMode,/path\.startsWith\("\/api\/"\).*funcionalidade não está disponível no ambiente de testes/s);
  assert.match(testMode,/Array\.from\(\{length:5\}/);
  assert.match(testMode,/\/api\/admin\/distribution-check/);
  assert.match(testMode,/\/api\/admin\/placements/);
  assert.match(testMode,/\/api\/admin\/export-validation/);
  assert.match(testMode,/colocacoes-\$\{layout==="classes"\?"por-turma-":""\}ambiente-teste\.xls/);
  assert.match(testMode,/layout==="classes".*Turma \$\{classId\}/s);
  assert.match(testMode,/Excel\.Sheet/);
  assert.match(testMode,/AutoFilter/);
  assert.match(testMode,/FreezePanes/);
  assert.match(testMode,/#F6C945/);
  assert.match(testMode,/s\.proposalStatus=calculation\?"draft"/);
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
  assert.match(worker,/layout==="simple"\?"pautas-simples-turmas-1-20":layout==="classes"\?"pautas-colocacao-por-turma":"auditoria-pautas-colocacao"/);
  assert.match(worker,/new Set\(exportRows\.map\(row=>row\.classId\)\)/);
  assert.match(worker,/name:`Turma \$\{classId\}`/);
  assert.match(worker,/worksheets\/sheet\$\{index\+1\}\.xml/);
  assert.match(worker,/xlsxZip/);
  assert.match(worker,/Critérios validados/);
  assert.doesNotMatch(worker,/Colegas indicados|student_friend_preferences|support_class|friend_group_code/);
  assert.match(worker,/Sorteio decisivo/);
  assert.match(worker,/Seed do sorteio/);
  assert.match(worker,/Hash dos dados de entrada/);
  assert.match(worker,/Alteração manual do destino/);
  assert.match(placements,/\/api\/admin\/export-validation\?layout=\$\{layout\}/);
  assert.match(placements,/Exportar pautas/);
  assert.match(placements,/Excel simples · Turmas 1–20/);
  assert.match(placements,/PDF simples · Turmas 1–20/);
  assert.match(worker,/Array\.from\(\{length:20\},\(_,index\)=>index\+1\)/);
  assert.match(worker,/simpleHeaders=\["Número mecanográfico","Nome completo"\]/);
  assert.match(worker,/\/api\/admin\/export-placements-pdf/);
  assert.match(placements,/Auditoria completa/);
  assert.match(placements,/Auditoria por turma/);
});

test("composição é guardada diretamente e exige todos os campos",()=>{
  assert.match(detail,/\/api\/classes\/\$\{turma\.id\}\/save/);
  assert.match(detail,/!row\.fullName\.trim\(\) \|\| !\/\^\[0-9\]\{9\}\$\/\.test\(row\.studentNumber\)/);
  assert.match(detail,/classes\.detail\.saveContinue/);
  assert.doesNotMatch(detail,/Revisão final|Submeter turma|class-progress/);
  assert.match(worker,/action==="save"/);
  assert.match(worker,/class_roster_saved/);
  assert.match(worker,/UPDATE classes SET status='submitted'/);
  assert.match(detail,/specialStatus: "none"/);
  assert.match(detail,/classes\.common\.status/);
  assert.match(detail,/STUDENT_STATUS_OPTIONS/);
  assert.match(detail,/specialStatusesEnabled && <th>/);
  assert.match(detail,/addPublishedStudent/);
  assert.match(detail,/classes\.detail\.addPublished/);
  assert.match(detail,/isPublished && data\.permissions\.edit && !editingPublished/);
});

test("a importação global aparece antes da lista de turmas e inclui ajuda para IA",()=>{
  assert.match(dashboard,/canImport && <ClassRosterImport onImported=\{load\} \/>.*\{classOverview\}/s);
  assert.doesNotMatch(admin,/parseStudentCsv|Importação de pautas|api\/classes\/.*\/import/);
  assert.match(csvImport,/turma,nome,n_mecanografico,codigo_estatuto/);
  assert.match(csvImport,/exclui completamente qualquer aluno com estatuto Trabalhador-Estudante, Atleta ou Outro/);
  assert.match(csvImport,/"codigo_estatuto" deve ser sempre N/);
  assert.match(csvImport,/nunca para os converter para N/);
  assert.match(csvImport,/navigator\.clipboard\.writeText\(AI_PROMPT\)/);
  assert.match(csvImport,/fetch\("\/api\/classes\/import"/);
  assert.match(csvImport,/classes\.import\.aiHelpAction/);
  assert.doesNotMatch(csvImport,/classes\.import\.formatTitle|classes\.import\.statusesIgnored|STUDENT_STATUS_OPTIONS/);
  assert.doesNotMatch(csvImport,/button--secondary[^>]*>\{t\("classes\.import\.close"\)\}/);
  assert.match(csvImport,/classes\.import\.successWithSkipped/);
  assert.match(csvImport,/classes\.import\.onlySkipped/);
});

test("as notificações ficam acessíveis no topo sem ocupar a navegação lateral",()=>{
  assert.doesNotMatch(shell,/active === "notifications"/);
  assert.match(shell,/topbar-notifications/);
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
  assert.match(placements,/\["draft","approved","applied"\]\.includes\(latest\?\.status\|\|""\)/);
  assert.doesNotMatch(placements,/preflight\?\.ready&&\["draft","approved","applied"\]/);
});

test("desequilíbrio inicial usa o melhor equilíbrio possível sem bloquear a prévia privada",()=>{
  assert.match(worker,/code:"MELHOR_EQUILIBRIO_POSSIVEL"/);
  assert.match(worker,/A regra dos três não é atingível com a composição atual/);
  assert.match(worker,/calculateBestEffortDistribution\(input,seed,objective\)/);
  assert.match(placements,/Maximizar o número de mudanças/);
  assert.match(placements,/Respeitar melhor a ordem das preferências/);
  assert.match(placements,/Calcular proposta privada/);
  assert.match(placements,/Nada fica visível aos estudantes nesta fase/);
  assert.match(testMode,/action==="calculate-exception"/);
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
  assert.match(placements,/Proposta privada/);
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
  assert.match(placements,/apresentados abaixo/);
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
  assert.match(placements,/As pautas estão publicadas/);
  assert.match(placements,/Publicação concluída/);
  assert.match(styles,/placement-operation-status\.is-published/);
  assert.match(placements,/Linhas por página/);
  assert.doesNotMatch(preflight,/placement-preflight__checks/);
});

test("mesa de colocações usa uma hierarquia compacta e controlos progressivos",()=>{
  assert.match(placements,/className="placement-workflow"/);
  assert.match(placements,/<details className="placement-filter-panel"/);
  assert.match(placements,/\{!tableOnly&&runbar\}/);
  assert.match(placements,/DistributionPreflight compact/);
  assert.match(placements,/href="#placement-review-first-case"/);
  assert.match(preflight,/className="preflight-results is-required"/);
  assert.match(preflight,/hasBlockingState \?/);
  assert.match(preflight,/placement-review-first-case/);
  assert.match(preflight,/preflight-results__summary-count/);
  assert.match(styles,/\.placement-command-center__main/);
  assert.match(styles,/\.placement-filter-panel\[open\]/);
  assert.match(styles,/\.preflight-results__summary:focus-visible/);
  assert.match(styles,/\.placement-command-center \.calculate-action > \.button/);
  assert.match(styles,/\.preflight-group > header span/);
});

test("colocações usam uma ação principal compacta e a tabela administrativa",()=>{
  assert.match(preflight,/className="panel__header placement-preflight__header"/);
  assert.match(placements,/className={`panel placement-runbar placement-command-center/);
  assert.match(preferences,/className={`panel student-preferences/);
  assert.match(preferences,/<header className="panel__header">/);
  assert.match(csvImport,/className={`panel__header \$\{styles\.header\}`}/);
  assert.match(dashboard,/className="stats-grid classes-stats"/);
  assert.match(styles,/\.placement-workflow \{[\s\S]*?margin: 0 0 12px/);
  assert.match(styles,/\.placement-workflow > \.placement-preflight \{[\s\S]*?border-radius: var\(--radius-panel\)/);
  assert.match(styles,/\.placement-sheet \{[\s\S]*?box-shadow: var\(--shadow-panel\)/);
  assert.match(styles,/\.student-preferences \{[^}]*margin-bottom:var\(--space-4\)/);
  assert.match(styles,/\.placement-command-center\.is-blocked/);
  assert.match(styles,/\.placement-preflight\.is-compact/);
  assert.match(styles,/@media \(max-width: 820px\) \{[\s\S]*?\.app-shell,[\s\S]*?\.workspace \{[\s\S]*?min-height: 0/);
});

test("aviso de manutenção usa o editor formatado com sanitização e limite visível",()=>{
  assert.match(admin,/import \{ RichTextEditor \}/);
  assert.match(admin,/richTextPlainText\(message\)\.length/);
  assert.match(admin,/<RichTextEditor value=\{message\}/);
  assert.match(admin,/maxLength=\{500\}/);
  assert.match(maintenancePage,/<RichTextContent value=\{message\} className="maintenance-message" \/>/);
  assert.match(worker,/sanitizeAnnouncementHtml\(typeof body\?\.maintenanceMessage/);
  assert.match(worker,/const plainMessage = announcementPlainText\(message\)/);
  assert.match(worker,/plainMessage\.length > 500/);
});

test("ordem de preferências é explícita e a submissão pode ser editada até ao prazo",()=>{
  assert.doesNotMatch(placements,/\.join\(" → "\)/);
  assert.match(placements,/placement-preference-order/);
  assert.match(placements,/\{index\+1\}\.ª<\/b> Turma/);
  assert.match(preferences,/classes\.preferences\.submittedTitle/);
  assert.match(preferences,/classes\.preferences\.edit/);
  assert.match(preferences,/classes\.preferences\.saveVersion/);
  assert.match(preferences,/destinations: decision === "move" \? destinations : \[\]/);
  assert.match(preferences,/classes\.preferences\.specialStatusMessage/);
  assert.match(preferences,/data\.student\.specialStatus !== "none"/);
});

test("colocações mostram só a próxima ação e resumem os pedidos no cabeçalho",()=>{
  assert.match(placements,/studentsStaying=students\.filter\(student=>student\.student_decision==="stay"\)\.length/);
  assert.match(placements,/studentsMoving=students\.filter\(student=>student\.student_decision==="move"\)\.length/);
  assert.match(placements,/Próxima ação/);
  assert.match(placements,/Corrigir os dados que bloqueiam o cálculo/);
  assert.match(placements,/Calcular uma proposta privada/);
  assert.match(placements,/Rever e publicar a proposta/);
  assert.match(placements,/className="placement-summary-strip"/);
  assert.match(placements,/Pedidos recebidos/);
  assert.match(placements,/Sem resposta/);
  assert.doesNotMatch(placements,/placement-overview__|placement-progress|placement-kpis|placement-kpi__/);
  assert.match(styles,/\.placement-command-center__main\s*\{/);
  assert.doesNotMatch(styles,/background: linear-gradient\(135deg, #171714/);
});

test("tabela abre numa nova aba, ocupa o ecrã e mantém o editor administrativo",()=>{
  assert.match(placements,/target="_blank"/);
  assert.match(placements,/rel="noopener noreferrer"/);
  assert.match(placements,/Abrir tabela em ecrã inteiro/);
  assert.match(placements,/tableOnly\?<main className="placement-table-page"/);
  assert.match(placements,/placement-table-page__actions"><div className="placement-action-tools">\{refreshAction\}\{exportAction\}<\/div>\{!published&&!activeDistribution&&objectiveAction\}\{calculateAction\}/);
  assert.match(placements,/recalculation\?"button--secondary":"button--primary"/);
  assert.match(placements,/<Calculator\/>Calcular proposta privada/);
  assert.match(styles,/\.button:disabled \{[^}]*background: #f1f1ee;[^}]*box-shadow: none/);
  assert.match(placements,/placement-heading__actions" aria-label="Ferramentas da página">\{refreshAction\}\{fullScreenAction\}\{exportAction\}/);
  assert.match(styles,/\.placement-table-page \.calculate-action__tooltip\{top:calc\(100% \+ 12px\);bottom:auto/);
  assert.match(styles,/\.placement-sheet>\.placement-table-wrap\{max-height:calc\(100dvh - 330px\);overflow:auto/);
  assert.match(styles,/\.placement-table-page \.placement-sheet>\.placement-table-wrap\{min-height:0;max-height:none;overflow:auto;overscroll-behavior:contain/);
  assert.match(styles,/\.placement-sheet>\.placement-table-wrap,\.placement-table-page \.placement-sheet>\.placement-table-wrap\{min-height:0;max-height:none;overflow-x:auto;overflow-y:hidden/);
  assert.match(styles,/\.placement-table-wrap th:nth-child\(1\),\.placement-table-wrap td:nth-child\(1\),\.placement-table-wrap th:nth-child\(2\),\.placement-table-wrap td:nth-child\(2\)\{position:static;left:auto\}/);
  assert.doesNotMatch(styles,/max-height:60dvh/);
  assert.match(styles,/\.placement-table-page>\.placement-sheet\{min-height:0;display:flex;flex:1 1 auto;flex-direction:column\}/);
  assert.match(placements,/selected&&<PlacementEditor/);
  assert.match(placementTablePage,/PlacementWorkbench tableOnly/);
});

test("resultado mostra lotações antes e depois e filtros avançados persistem sem guardar pesquisas",()=>{
  assert.match(placements,/Resultado · lotação depois da proposta/);
  assert.match(placements,/Origem · Turma/);
  assert.match(placements,/Destino · Turma/);
  assert.match(placements,/originBefore/);
  assert.match(placements,/destinationBefore/);
  assert.match(placements,/projectedClassCounts/);
  assert.match(placements,/gu-placement-filters-v1/);
  assert.match(placements,/persistentFilterKeys=\["origin","destination","decision","result","validation","points","assignment"\]/);
  assert.match(placements,/query:""/);
  assert.match(placements,/SameSite=Strict/);
  assert.match(placements,/Max-Age=7776000/);
  assert.match(styles,/\.placement-result-capacity\s*\{/);
});

test("editor bloqueia o fundo e a confirmação de publicação é estruturada",()=>{
  assert.match(placements,/useScrollLock\(Boolean\(selectedId\|\|confirmPublish\|\|confirmRollback\|\|confirmImbalance\)\)/);
  assert.match(placements,/className="placement-drawer__body"/);
  assert.match(placements,/<\/div>\s*<section className="placement-drawer-actions"/);
  assert.match(scrollLock,/let activeLocks = 0/);
  assert.match(scrollLock,/function lockPageScroll\(fixBody: boolean\)/);
  assert.match(scrollLock,/body\.style\.position = "fixed"/);
  assert.match(scrollLock,/Math\.min\(lockedScrollY, maxScrollY\)/);
  assert.match(scrollLock,/window\.requestAnimationFrame/);
  assert.match(styles,/html\.app-scroll-locked, body\.app-scroll-locked \{ overflow: hidden !important; overscroll-behavior: none !important; \}/);
  assert.match(styles,/\.placement-drawer-backdrop\{height:auto;min-height:0;touch-action:none\}/);
  assert.match(styles,/\.placement-drawer>\.placement-drawer-actions\{position:relative;bottom:auto;flex:0 0 auto/);
  assert.match(styles,/\.nav-list\s*\{[^}]*overscroll-behavior-y:\s*contain/);
  assert.match(styles,/\.empty-state\s*\{\s*margin:\s*0;\s*padding:\s*30px/);
  assert.match(placements,/placement-drawer__close/);
  assert.match(placements,/publish-confirmation__steps/);
  assert.match(placements,/Aprovar e publicar agora/);
});

test("gestão de utilizadores adapta filtros e registos ao ecrã mobile",()=>{
  assert.match(admin,/data-label=\{t\("admin\.control\.user"\)\}/);
  assert.match(admin,/data-label=\{t\("admin\.control\.actions"\)\}/);
  assert.match(styles,/\.admin-users \.search-field,[\s\S]*?flex:\s*0 0 auto/);
  assert.match(styles,/\.admin-table-wrap tbody tr\s*\{[\s\S]*?height:\s*auto !important[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/);
  assert.match(styles,/\.admin-table-wrap tbody tr\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(styles,/\.admin-table-wrap tbody td:last-child\s*\{[\s\S]*?min-height:\s*0 !important[\s\S]*?display:\s*flex[\s\S]*?padding-bottom:\s*14px/);
  assert.match(styles,/\.admin-table-wrap \.admin-row-actions\s*\{[\s\S]*?position:\s*static !important[\s\S]*?min-height:\s*44px/);
  assert.match(styles,/\.admin-table-wrap \.admin-row-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*44px/);
  assert.match(styles,/\.admin-table-wrap \.admin-save-user\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles,/content:\s*attr\(data-label\)/);
  assert.match(styles,/html \{[^}]*overscroll-behavior-y:\s*none/);
});

test("histórico e altura global ficam contidos no ecrã mobile",()=>{
  assert.match(styles,/\.app-shell \{ min-height: 100dvh; \}/);
  assert.doesNotMatch(styles,/\.app-shell \{ min-height: 100vh; \}/);
  assert.match(styles,/\.audit-row__action > div \{ min-width: 0; \}/);
  assert.match(styles,/\.audit-row \{ grid-template-columns: minmax\(0, 1fr\) auto; grid-template-rows: auto auto auto;[^}]*overflow: hidden/);
  assert.match(styles,/\.audit-row__action \{ grid-column: 1 \/ -1; grid-row: 1; \}/);
  assert.match(styles,/\.audit-row__action strong \{ overflow: visible; white-space: normal; overflow-wrap: anywhere/);
  assert.match(styles,/\.audit-row__button \{ grid-column: 2; grid-row: 2 \/ span 2; align-self: center; \}/);
});

test("justificação é condicional, critérios são cumulativos e o aluno recebe histórico",()=>{
  assert.match(placements,/reasonRequired=preferenceChanged\|\|otherSelected\|\|manualDestinationChanged/);
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
  assert.match(preflight,/classDataLabel\(locale,\s*"preflightGroup",\s*code\)/);
  assert.match(styles,/\.panel__header\s*>\s*\.panel-tools\s*\{[^}]*margin-left:\s*auto/);
  assert.match(styles,/\.topbar-global-search\{[^}]*margin-left:auto;margin-right:0/);
  assert.match(styles,/\.test-mode-control\{position:relative;margin-left:0\}/);
  assert.match(styles,/@media\(max-width:900px\).*\.test-mode-control\{margin-left:auto\}/s);
});

test("a CC pode adiar a validação sem bloquear a simulação, mas não a publicação",()=>{
  assert.match(deferredReviewMigration,/additional_info_review_deferred INTEGER NOT NULL DEFAULT 0/);
  assert.match(placements,/Validar posteriormente/);
  assert.match(placements,/Permite simular, mas bloqueia a publicação definitiva/);
  assert.match(worker,/severity:"warning",code:"INFORMACAO_VALIDAR_POSTERIORMENTE"/);
  assert.match(worker,/action==="publish"[\s\S]*additional_info_review_deferred=1/);
  assert.match(worker,/action==="approve"[\s\S]*additional_info_review_deferred=1/);
  assert.match(worker,/reviewDeferred=decision==="move"&&requestedReviewStatus==="deferred"/);
  assert.match(placements,/additionalInfoStatus!=="invalid"\?validationTypes:\[\]/);
  assert.match(placements,/if\(status==="invalid"\)\{setValidationTypes\(\[\]\);setCustomPoints\(0\)\}/);
  assert.doesNotMatch(worker,/reviewStatus==="invalid"\|\|reviewDeferred\?\[\]/);
  assert.match(worker,/additional_info_review_deferred=0/);
  assert.match(styles,/\.additional-info-review button\.is-deferred/);
  assert.match(styles,/\.placement-drawer\{[^}]*scrollbar-gutter:auto/);
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
