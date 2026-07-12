export type TestPersona="admin"|"stay"|"move-a"|"move-b";
export const TEST_PERSONAS=[
 {id:"admin" as const,name:"Administrador de teste",role:"admin" as const,classId:null,email:"admin.teste@up.pt"},
 {id:"stay" as const,name:"Ana Martins",role:"student" as const,classId:1,email:"up202600001@up.pt"},
 {id:"move-a" as const,name:"Bruno Costa",role:"student" as const,classId:2,email:"up202600002@up.pt"},
 {id:"move-b" as const,name:"Carla Sousa",role:"student" as const,classId:4,email:"up202600003@up.pt"},
];
type TestStudent={id:string;full_name:string;student_number:string;class_id:number;student_decision:string|null};
type TestState={version:number;windows:Array<{group:number;classes:string;openAt:string;closeAt:string}>;decisions:Record<string,number[]>;proposalStatus:string|null;roster?:TestStudent[]};
const defaults:TestState={version:2,windows:[{group:1,classes:"1–2",openAt:"2026-07-15T08:00:00.000Z",closeAt:"2026-07-17T19:00:00.000Z"},{group:2,classes:"3–5",openAt:"2026-07-16T08:00:00.000Z",closeAt:"2026-07-18T19:00:00.000Z"}],decisions:{stay:[],"move-a":[1,3],"move-b":[5,3],"t1-move":[2,4],"t2-move":[3,1],"t3-move":[4,5],"t4-move":[2,5],"t5-move":[1,3]},proposalStatus:null};
const roster=[
 {id:"stay",full_name:"Ana Martins",student_number:"202600001",class_id:1,student_decision:"stay"},
 {id:"t1-stay-2",full_name:"Beatriz Lopes",student_number:"202600004",class_id:1,student_decision:"stay"},
 {id:"t1-move",full_name:"Gonçalo Neves",student_number:"202600005",class_id:1,student_decision:"move"},
 {id:"t1-pending",full_name:"Joana Ferreira",student_number:"202600006",class_id:1,student_decision:null},
 {id:"t1-stay-3",full_name:"Luís Correia",student_number:"202600007",class_id:1,student_decision:"stay"},
 {id:"move-a",full_name:"Bruno Costa",student_number:"202600002",class_id:2,student_decision:"move"},
 {id:"t2-stay-1",full_name:"Mariana Alves",student_number:"202600008",class_id:2,student_decision:"stay"},
 {id:"t2-move",full_name:"Nuno Carvalho",student_number:"202600009",class_id:2,student_decision:"move"},
 {id:"t2-pending",full_name:"Rita Faria",student_number:"202600010",class_id:2,student_decision:null},
 {id:"t2-stay-2",full_name:"Tiago Ramos",student_number:"202600011",class_id:2,student_decision:"stay"},
 {id:"t3-stay-1",full_name:"Diana Ribeiro",student_number:"202600012",class_id:3,student_decision:"stay"},
 {id:"t3-move",full_name:"Eduardo Lima",student_number:"202600013",class_id:3,student_decision:"move"},
 {id:"t3-stay-2",full_name:"Filipa Melo",student_number:"202600014",class_id:3,student_decision:"stay"},
 {id:"t3-pending",full_name:"Henrique Sousa",student_number:"202600015",class_id:3,student_decision:null},
 {id:"t3-stay-3",full_name:"Inês Rocha",student_number:"202600016",class_id:3,student_decision:"stay"},
 {id:"move-b",full_name:"Carla Sousa",student_number:"202600003",class_id:4,student_decision:"move"},
 {id:"t4-stay-1",full_name:"Leonor Pinto",student_number:"202600017",class_id:4,student_decision:"stay"},
 {id:"t4-move",full_name:"Miguel Cardoso",student_number:"202600018",class_id:4,student_decision:"move"},
 {id:"t4-pending",full_name:"Patrícia Gomes",student_number:"202600019",class_id:4,student_decision:null},
 {id:"t4-stay-2",full_name:"Rodrigo Cunha",student_number:"202600020",class_id:4,student_decision:"stay"},
 {id:"t5-stay-1",full_name:"Sofia Matos",student_number:"202600021",class_id:5,student_decision:"stay"},
 {id:"t5-move",full_name:"Tomás Vieira",student_number:"202600022",class_id:5,student_decision:"move"},
 {id:"t5-stay-2",full_name:"Vera Monteiro",student_number:"202600023",class_id:5,student_decision:"stay"},
 {id:"t5-pending",full_name:"Afonso Leal",student_number:"202600024",class_id:5,student_decision:null},
 {id:"t5-stay-3",full_name:"Catarina Reis",student_number:"202600025",class_id:5,student_decision:"stay"},
];
let installed=false,realFetch:typeof fetch|null=null;
export function testModeEnabled(){return typeof window!=="undefined"&&localStorage.getItem("gu-test-mode")==="1"}
export function testPersona(){return (typeof window!=="undefined"?localStorage.getItem("gu-test-persona"):null) as TestPersona||"admin"}
export function setTestMode(active:boolean){if(active){localStorage.setItem("gu-test-mode","1");localStorage.setItem("gu-test-persona","admin");if(!localStorage.getItem("gu-test-state"))localStorage.setItem("gu-test-state",JSON.stringify(defaults))}else{localStorage.removeItem("gu-test-mode");localStorage.removeItem("gu-test-persona")}window.dispatchEvent(new Event("gu-test-mode"))}
export function setTestPersona(persona:TestPersona){localStorage.setItem("gu-test-persona",persona);window.location.assign("/")}
function state():TestState{try{const saved=JSON.parse(localStorage.getItem("gu-test-state")||"");return saved.version===defaults.version?{...defaults,...saved}:structuredClone(defaults)}catch{return structuredClone(defaults)}}
function saveState(next:TestState){localStorage.setItem("gu-test-state",JSON.stringify(next))}
function reply(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}})}
function studentShape(row:typeof roster[number]){return {id:row.id,nome:row.full_name,numero:row.student_number,preferencia:row.student_decision==="move"?"Mudar":row.student_decision==="stay"?"Ficar":"A aguardar decisão",isSelf:row.id===testPersona(),destinations:state().decisions[row.id]||[]}}
async function mock(input:RequestInfo|URL,init?:RequestInit):Promise<Response|null>{const raw=typeof input==="string"?input:input instanceof URL?input.pathname:input.url,url=new URL(raw,location.origin),path=url.pathname,method=(init?.method||"GET").toUpperCase(),s=state(),r=s.roster||roster,persona=TEST_PERSONAS.find(item=>item.id===testPersona())||TEST_PERSONAS[0];
 if(path==="/api/config")return reply({maintenanceMode:false,closeAt:"2020-01-01T00:00:00.000Z",serverNow:Date.now(),testMode:true});
 if(path==="/api/admin/users"&&method==="GET")return reply({users:TEST_PERSONAS.map(item=>({id:item.id,email:item.email,full_name:item.name,role:item.role,admin_override:item.role==="admin"?1:0,class_representative:0,represented_class:null,status:"active",status_reason:null,status_until:null,commission_position:item.role==="admin"?"principal_admin":null,commission_department:item.role==="admin"?"management":null,email_verified_at:Date.now(),last_login_at:Date.now(),created_at:Date.now(),updated_at:Date.now()})),positions:[{code:"principal_admin",label:"Administrador Principal",authority_level:"supreme",rank:1}],departments:[{code:"management",label:"Gestão",rank:1}]});
 if(path==="/api/admin/users"&&method==="PATCH")return reply({ok:true});
 if(path==="/api/admin/audit"&&method==="GET")return reply({entries:[]});
 if(path==="/api/admin/class-tickets"&&["GET","PATCH","DELETE"].includes(method))return reply(method==="GET"?{tickets:[]}: {ok:true});
 if(path==="/api/admin/settings"&&method==="GET")return reply({maintenanceMode:false,maintenanceMessage:"",preferenceWindows:s.windows,testMode:true});
 if(path==="/api/admin/settings"&&method==="PUT"){const body=JSON.parse(String(init?.body||"{}"));if(body.section==="preference_windows")s.windows=body.windows.map((item:{openAt:string;closeAt:string},i:number)=>({...item,group:i+1,classes:i?"3–5":"1–2"}));saveState(s);return reply({ok:true})}
 if(path==="/api/classes"&&method==="GET")return reply({classes:Array.from({length:5},(_,i)=>({id:i+1,status:i===4?"draft":"submitted",submitted_at:i===4?null:Date.now(),representative:"Comissão de Curso",students:r.filter(row=>row.class_id===i+1).length,stays:r.filter(row=>row.class_id===i+1&&row.student_decision==="stay").length,moves:r.filter(row=>row.class_id===i+1&&row.student_decision==="move").length}))});
 const detail=path.match(/^\/api\/classes\/(\d+)$/);if(detail&&method==="GET"){const id=Number(detail[1]);return reply({class:{id,status:id===5?"draft":"submitted"},students:r.filter(row=>row.class_id===id).map(studentShape),permissions:{edit:persona.role==="admin"},settings:{}})}
 const classSave=path.match(/^\/api\/classes\/(\d+)\/save$/);if(classSave&&method==="PUT"){const classId=Number(classSave[1]),body=JSON.parse(String(init?.body||"{}")),students=Array.isArray(body.students)?body.students:[];s.roster=[...r.filter(row=>row.class_id!==classId),...students.map((student:{id?:string;fullName:string;studentNumber:string})=>{const existing=r.find(row=>row.student_number===student.studentNumber);return {id:existing?.id||student.id||crypto.randomUUID(),full_name:student.fullName,student_number:student.studentNumber,class_id:classId,student_decision:existing?.student_decision||null}})];saveState(s);return reply({ok:true})}
 if(path==="/api/student/destinations"&&method==="GET"){const row=r.find(item=>item.id===persona.id);if(!row)return reply({error:"Perfil sem estudante."},403);const window=s.windows[row.class_id<=2?0:1];return reply({student:{classId:row.class_id,notes:"",destinations:s.decisions[row.id]||[]},activeClasses:[1,2,3,4,5],settings:{preferencesOpenAt:window.openAt,preferencesCloseAt:window.closeAt,groupLabel:`Turmas ${window.classes}`},serverNow:Date.now()})}
 if(path==="/api/student/destinations"&&method==="PUT"){const body=JSON.parse(String(init?.body||"{}"));s.decisions[persona.id]=body.destinations||[];saveState(s);return reply({ok:true})}
 if(path==="/api/admin/distribution-check")return reply({ready:true,checkedAt:Date.now(),summary:{classes:5,students:r.length,blockers:0,warnings:0,automaticStays:r.filter(row=>!row.student_decision).length,exceptionalPending:0,invalidReferences:0},issues:[]});
 if(path==="/api/admin/placements"&&method==="GET")return reply({students:r.map(row=>({...row,preference_source:row.student_decision?"student":"automatic",preference_admin_reason:null,notes:null,considerations:"[]",exception_points:0,exception_reviewed_at:null,exception_review_reason:null,additional_info_validation:null,additional_info_validation_note:null,distribution_result:null})),destinations:Object.entries(s.decisions).flatMap(([id,values])=>values.map((destination_class,rank)=>({student_id:id,destination_class,rank:rank+1})))});
 if(path==="/api/admin/placements"&&method==="PUT"){const body=JSON.parse(String(init?.body||"{}")),id=String(body.studentId||"");s.decisions[id]=Array.isArray(body.destinations)?body.destinations:[];s.roster=r.map(row=>row.id===id?{...row,student_decision:s.decisions[id].length?"move":"stay"}:row);s.proposalStatus=null;saveState(s);return reply({ok:true})}
 if(path==="/api/admin/export-validation"&&method==="GET"){const header="Nome\tNúmero mecanográfico\tTurma atual\tDecisão\tPreferências\n",rows=r.map(row=>`${row.full_name}\t${row.student_number}\tTurma ${row.class_id}\t${row.student_decision||"Sem decisão"}\t${(s.decisions[row.id]||[]).map(id=>`Turma ${id}`).join(" → ")}`).join("\n");return new Response(`\ufeff${header}${rows}`,{headers:{"content-type":"application/vnd.ms-excel; charset=utf-8","content-disposition":"attachment; filename=colocacoes-ambiente-teste.xls"}})}
 if(path==="/api/admin/distribution-proposals"&&method==="GET"){const results=r.map(row=>{const preferred=s.decisions[row.id]?.[0],moves=Boolean(row.student_decision==="move"&&preferred);return {studentId:row.id,originClass:row.class_id,destinationClass:moves?preferred:row.class_id,rank:moves?1:null,status:moves?"moved":"stayed_by_choice",points:0,manualReview:false}});return reply({proposals:s.proposalStatus?[{id:"test-proposal",status:s.proposalStatus,result_snapshot:JSON.stringify(results),created_at:Date.now()}]:[]})}
 if(/^\/api\/admin\/distribution-proposals\//.test(path)&&method==="POST"){const action=path.split("/").pop();if(action!=="calculate"&&!s.proposalStatus)return reply({error:"Calcula primeiro uma proposta."},409);s.proposalStatus=action==="calculate"?"draft":action==="approve"?"approved":action==="apply"?"applied":action==="publish"?"published":action==="rollback"?null:s.proposalStatus;saveState(s);return reply({ok:true,status:s.proposalStatus})}
 return null}
export function installTestApi(){if(installed||typeof window==="undefined")return;installed=true;realFetch=window.fetch.bind(window);window.fetch=async(input,init)=>testModeEnabled()?(await mock(input,init))||realFetch!(input,init):realFetch!(input,init)}
