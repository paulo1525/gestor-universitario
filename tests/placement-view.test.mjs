import test from "node:test";
import assert from "node:assert/strict";
import {matchesPlacementFilters,placementOutcome} from "../lib/placement-view.mjs";

const student=(patch={})=>({full_name:"Ana Martins",student_number:"202600001",class_id:1,student_decision:"stay",notes:null,exception_points:0,exception_reviewed_at:null,additional_info_validation:null,...patch});
const empty={query:"",origin:"",destination:"",decision:"",result:"",validation:"",points:"",assignment:""};

test("cores e textos distinguem ficar, preferências e mudança falhada",()=>{
 assert.deepEqual(placementOutcome(student(),{destinationClass:1,rank:null,status:"stayed_by_choice"}),{key:"stay",tone:"green",destinationClass:1,label:"Turma 1 · Fica"});
 assert.equal(placementOutcome(student({student_decision:null}),{destinationClass:1,rank:null,status:"stayed_by_choice"}).tone,"green");
 assert.deepEqual(placementOutcome(student({student_decision:"move"}),{destinationClass:2,rank:1,status:"moved"}),{key:"first",tone:"green",destinationClass:2,label:"Turma 2 · 1.ª preferência"});
 assert.equal(placementOutcome(student({student_decision:"move"}),{destinationClass:3,rank:2,status:"moved"}).tone,"orange");
 assert.deepEqual(placementOutcome(student({student_decision:"move"}),{destinationClass:1,rank:null,status:"fallback"}),{key:"failed",tone:"red",destinationClass:1,label:"Turma 1 · Não conseguiu mudar"});
});

test("pesquisa encontra nome, número, origem, destino e preferências",()=>{
 const row={student:student({student_decision:"move"}),move:{destinationClass:3,rank:2,status:"moved"},destinations:[2,3]};
 for(const query of ["ana","202600001","turma 1","t3","turma 2","2.ª preferência"])assert.equal(matchesPlacementFilters(row,{...empty,query}),true,query);
});

test("múltiplos filtros acumulam por turma, decisão, resultado, validação, pontos e origem",()=>{
 const row={student:student({student_decision:"move",notes:"Caso",exception_points:2}),move:{destinationClass:3,rank:2,status:"moved",manualOverride:true},destinations:[2,3]};
 const filters={...empty,origin:"1",destination:"3",decision:"move",result:"later",validation:"pending",points:"with",assignment:"manual"};
 assert.equal(matchesPlacementFilters(row,filters),true);
 assert.equal(matchesPlacementFilters(row,{...filters,destination:"4"}),false);
 assert.equal(matchesPlacementFilters(row,{...filters,decision:"stay"}),false);
});
