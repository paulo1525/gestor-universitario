import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");

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
 assert.match(ownDestinations,/status IN \('applied','published'\)/);
 assert.match(ownDestinations,/status IN \('draft','approved'\)/);
 assert.match(proposals,/if\(action==="calculate"\).*status IN \('applied','published'\)/s);
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
 assert.match(placements,/status IN \('applied','published'\)/);
});

test("formulário do estudante grava uma decisão explícita e nunca conserva destinos ao ficar",()=>{
 assert.match(ownDestinations,/decision!=="stay"&&decision!=="move"/);
 assert.match(ownDestinations,/const destinations=decision==="move"\?rawDestinations:\[\]/);
 assert.doesNotMatch(ownDestinations,/student_friend_preferences|support_class|friend_group_code/);
 assert.match(ownDestinations,/submittedAt:student\.decision_at/);
 assert.match(ownDestinations,/return json\(\{ok:true,submittedAt:now\}\)/);
 assert.match(distributionCheck,/ownDestinations=student\.student_decision==="move"\?/);
 assert.doesNotMatch(distributionCheck,/student\?\.student_decision==="move"/);
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
