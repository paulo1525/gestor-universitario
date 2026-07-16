import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const activeDistributionMigration=readFileSync(new URL("../migrations/0019_single_active_distribution.sql",import.meta.url),"utf8");
const specialStatusMigration=readFileSync(new URL("../migrations/0025_special_student_status.sql",import.meta.url),"utf8");

function section(start,end){
 const from=worker.indexOf(start),to=worker.indexOf(end,from+start.length);
 assert.notEqual(from,-1,`Secção em falta: ${start}`);
 assert.notEqual(to,-1,`Limite em falta: ${end}`);
 return worker.slice(from,to);
}

const classes=section("async function handleClassesV2","async function handleClasses(");
const ownDestinations=section("async function handleOwnDestinations","async function handlePublicClassesPdf");
const distributionCheck=section("type DistributionCheckIssue","const DISTRIBUTION_ENGINE_VERSION");
const distributionInputs=section("async function distributionInputs","async function handleDistributionProposals");
const proposals=section("async function handleDistributionProposals","async function handleAdminAudit");
const placements=section("async function handlePlacementWorkbench","function xlsxXml");
const routes=section("async function routeApi","export default");

test("tickets desativados não são criados nem bloqueiam o verificador",()=>{
 assert.match(classes,/if\(action==="tickets"\)return json\(\{error:"A funcionalidade de tickets está temporariamente desativada\."\},404\)/);
 assert.doesNotMatch(distributionCheck,/class_tickets|openTickets|PEDIDO_PENDENTE/);
 assert.match(routes,/pathname==="\/api\/admin\/class-tickets".*temporariamente desativada/);
});

test("preferências só mudam fora de uma distribuição ativa e invalidam propostas antigas",()=>{
 assert.match(ownDestinations,/student\.status==="published"/);
 assert.match(ownDestinations,/status='published' OR \(status='applied' AND published_at IS NULL\)/);
 assert.match(ownDestinations,/status IN \('draft','approved'\)/);
 assert.match(proposals,/if\(action==="calculate"\).*status='published' OR \(status='applied' AND published_at IS NULL\)/s);
 assert.match(proposals,/status='applied' AND published_at IS NOT NULL/);
});

test("a funcionalidade nominal de colegas foi removida das APIs",()=>{
 assert.doesNotMatch(routes,/\/api\/student\/search|handleStudentSearch/);
 assert.doesNotMatch(placements,/student_friend_preferences|references:/);
});

test("editor administrativo limpa preferências e pontos ao manter e valida turmas ativas",()=>{
 assert.match(placements,/reviewStatus=decision==="stay"\?null/);
 assert.match(placements,/validationTypes=decision==="stay"\|\|reviewStatus==="invalid"\?\[\]/);
 assert.match(placements,/decision==="move"\?rawDestinations:\[\]/);
 assert.match(placements,/decision==="move"&&!destinations\.length/);
 assert.match(placements,/activeClasses:classes\.results\.map\(row=>row\.id\)/);
 assert.match(placements,/const activeClasses=new Set/);
 assert.match(placements,/destinations\.some\(value=>!activeClasses\.has\(value\)\)/);
 assert.match(placements,/status='published' OR \(status='applied' AND published_at IS NULL\)/);
});

test("formulário do estudante grava uma decisão explícita e nunca conserva destinos ao ficar",()=>{
 assert.match(ownDestinations,/decision!=="stay"&&decision!=="move"/);
 assert.match(ownDestinations,/const destinations=decision==="move"\?rawDestinations:\[\]/);
 assert.doesNotMatch(ownDestinations,/student_friend_preferences|support_class|friend_group_code/);
 assert.match(ownDestinations,/submittedAt:student\.decision_at/);
 assert.match(ownDestinations,/return json\(\{ok:true,submittedAt:now\}\)/);
 assert.match(distributionCheck,/ownDestinations=student\.student_decision==="move"\?/);
 assert.doesNotMatch(distributionCheck,/student\?\.student_decision==="move"/);
 assert.match(ownDestinations,/special_status/);
 assert.match(ownDestinations,/Alunos com estatutos especiais não podem preencher, ainda, o formulário de preferências/);
 assert.match(ownDestinations,/canSubmitPreferences:false/);
});

test("snapshot preserva manual_review e retirar publicação preserva colocações",()=>{
 assert.match(distributionInputs,/class_id,manual_review,preference/);
 assert.match(distributionInputs,/manualReview:Boolean\(row\.manual_review\)/);
 assert.match(proposals,/placementsPreserved:true/);
 assert.doesNotMatch(proposals.slice(proposals.indexOf('if(action==="rollback")'),proposals.indexOf('if(action==="publish")')),/UPDATE class_students SET class_id/);
});

test("publicar e retirar publicação usam transições condicionais",()=>{
 assert.match(proposals,/status='applied'.*WHERE id=\? AND status='published'/s);
 assert.match(proposals,/status='published'.*WHERE id=\? AND status='applied'/s);
 assert.match(proposals,/if\(!transition\?\.meta\.changes\)/);
 assert.match(proposals,/distribution_unpublished/);
 assert.match(proposals,/O estado da proposta mudou durante a publicação/);
});

test("cada cálculo usa e persiste uma seed aleatória para desempates auditáveis",()=>{
 assert.match(proposals,/seed=crypto\.randomUUID\(\)/);
 assert.match(proposals,/calculateDistribution\(input\.students,\{seed,maxDifference:3,classIds:input\.classIds\}\)/);
 assert.match(proposals,/INSERT INTO distribution_proposals \(id,seed,status,input_snapshot,result_snapshot,input_hash,engine_version,created_by,created_at\)/);
 assert.match(proposals,/JSON\.stringify\(\{proposalId:id,seed,inputHash:input\.hash/);
});

test("pré-validação inclui turmas vazias e dry-run no mesmo snapshot do cálculo",()=>{
 assert.match(distributionCheck,/code:"TURMA_VAZIA"/);
 assert.doesNotMatch(distributionCheck,/TURMA_NAO_SUBMETIDA|ainda não foi submetida/);
 assert.match(distributionCheck,/code:"JANELAS_PREFERENCIAS_ABERTAS"/);
 assert.match(distributionCheck,/settings\.preferenceWindows\.some/);
 assert.match(distributionCheck,/new Map\(classes\.results\.map\(row=>\[row\.id,0\]\)\)/);
 assert.doesNotMatch(distributionCheck,/code:"REFERENCIA_SEM_PONTO"/);
 assert.match(distributionCheck,/calculateDistribution\(input\.students,\{seed:`preflight:/);
 assert.match(proposals,/const input=evaluation\.input/);
 assert.match(distributionInputs,/classes:classRows\.results/);
});

test("informação adicional pode ser revista sem atribuir pontos",()=>{
 assert.match(placements,/reviewed=Boolean\(validationTypes\.length\|\|reviewStatus\)/);
 assert.match(placements,/reviewed\?now:null,reviewed\?actorId:null/);
});

test("override aceita snapshots atuais e legacy, preserva a origem e remove sorteio manual",()=>{
 assert.match(proposals,/classes\?:Array<\{id:number\}>;classIds\?:number\[\]/);
 assert.match(proposals,/parsedInput\.classIds\?\.length\?parsedInput\.classIds:\(parsedInput\.classes\|\|\[\]\)/);
 assert.match(proposals,/result\.randomized=false/);
 assert.match(proposals,/previous_class=distribution_manual_overrides\.previous_class/);
});

test("aprovação e aplicação são idempotentes e validam o snapshot integral",()=>{
 assert.match(proposals,/alreadyApproved:true/);
 assert.match(proposals,/WHERE id=\? AND status='draft'/);
 assert.match(proposals,/results\.length!==current\.students\.length/);
 assert.match(proposals,/resultIds\.size!==results\.length/);
 assert.match(proposals,/status IN \('applied','published'\) AND invalidated_at IS NULL/);
 assert.match(proposals,/WHERE id=\? AND status='approved'/);
 assert.match(proposals,/alreadyApplied:true/);
 assert.ok(proposals.indexOf('if(action==="apply"&&proposal.status==="applied")')<proposals.indexOf("const current=await distributionInputs"));
 assert.match(proposals,/typeof result\.manualReview!=="boolean"/);
 assert.match(proposals,/EXISTS \(SELECT 1 FROM distribution_proposals WHERE id=\? AND status='approved' AND invalidated_at IS NULL\)/);
 assert.match(proposals,/WHERE id=\? AND status='approved' AND invalidated_at IS NULL/);
});

test("importação CSV administrativa é aditiva, auditada e bloqueia conflitos",()=>{
 assert.match(classes,/pathname==="\/api\/classes\/import"/);
 assert.match(classes,/codigo_estatuto N, TE, A ou O/);
 assert.match(classes,/class_csv_imported/);
 assert.match(classes,/classes_csv_imported/);
 assert.match(classes,/já está associado à Turma/);
 assert.match(classes,/Existe uma distribuição aplicada.*antes de importar estudantes/);
 assert.match(classes,/UPDATE classes SET status='submitted'/);
 assert.match(classes,/special_status,created_by/);
});

test("estatutos especiais são validados, limpos e excluídos do algoritmo",()=>{
 assert.match(specialStatusMigration,/DEFAULT 'none'/);
 assert.match(specialStatusMigration,/worker_student.*athlete.*other/s);
 assert.match(distributionInputs,/special_status='none'/);
 assert.match(distributionCheck,/eligibleStudents=students\.results\.filter\(student=>student\.special_status==="none"\)/);
 assert.match(classes,/DELETE FROM student_destinations.*special_status<>'none'/);
 assert.match(classes,/nextEligibleIds/);
 assert.match(placements,/special_status='none'/);
});

test("revisões manuais só podem ser fechadas no rascunho",()=>{
 assert.match(proposals,/if\(action==="review"\)\{if\(proposal\.status!=="draft"\)/);
});

test("uma nova revisão após despublicar só conserva preferências melhores do que a turma atual",()=>{
 assert.match(distributionCheck,/function destinationsPreferredToCurrent/);
 assert.match(distributionCheck,/currentIndex>=0\?destinations\.slice\(0,currentIndex\)/);
 assert.match(distributionCheck,/destinationsPreferredToCurrent\(destinationsById\.get\(student\.id\)\|\|\[\],student\.class_id\)/);
 assert.match(distributionInputs,/preferredDestinations=row\.student_decision==="move"\?destinationsPreferredToCurrent/);
 assert.match(distributionInputs,/row\.student_decision==="move"&&preferredDestinations\.length\?"move"/);
});

test("a D1 impede duas distribuições ativas em concorrência",()=>{
 assert.match(activeDistributionMigration,/CREATE UNIQUE INDEX idx_distribution_single_active/);
 assert.match(activeDistributionMigration,/invalidated_at IS NULL/);
 assert.match(activeDistributionMigration,/status IN \('applied', 'published'\)/);
});

test("correções de pautas publicadas preservam IDs canónicos e rejeitam snapshots inválidos",()=>{
 assert.match(classes,/pauta publicada tem um snapshot inválido/);
 assert.match(classes,/knownStudents\.results\.find\(previous=>previous\.student_number===student\.studentNumber\)\?\.id/);
 assert.match(classes,/new Set\(publishedResults\.map\(result=>result\.studentId\)\)\.size!==publishedResults\.length/);
 assert.match(classes,/UPDATE distribution_proposals SET result_snapshot=\? WHERE id=\? AND status='published' AND result_snapshot=\?/);
 assert.match(classes,/classTransitionIndex=writes\.length/);
 assert.match(classes,/A pauta foi alterada por outro administrador/);
});
