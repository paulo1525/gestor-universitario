import test from "node:test";
import assert from "node:assert/strict";
import {calculateDistribution} from "../lib/distribution-engine.mjs";

const student=(id,classId,destinations=[],preference=destinations.length?"move":"stay",notes="")=>({id,classId,destinations,preference,notes});
function balanced(extra=[]){const rows=[];for(let c=1;c<=20;c++)for(let i=0;i<2;i++)rows.push(student(`base-${c}-${i}`,c));return [...rows,...extra]}

test("nenhuma mudança possível mantém a origem",()=>{const rows=balanced([student("lotado-1",2),student("lotado-2",2),student("lotado-3",2),student("x",1,[2])]);const result=calculateDistribution(rows,{seed:"a"}).find(r=>r.studentId==="x");assert.equal(result.destinationClass,1)});
test("vaga simples atribui uma preferência",()=>{const rows=balanced();rows.splice(rows.findIndex(r=>r.classId===2),1);rows.push(student("x",1,[2]));const result=calculateDistribution(rows,{seed:"b"}).find(r=>r.studentId==="x");assert.equal(result.destinationClass,2)});
test("permuta direta e ciclo de três turmas",()=>{const rows=balanced([student("a",1,[2]),student("b",2,[3]),student("c",3,[1])]);const result=calculateDistribution(rows,{seed:"c"});assert.deepEqual(result.filter(r=>["a","b","c"].includes(r.studentId)).map(r=>r.destinationClass).sort(),[1,2,3])});
test("notas obrigam a revisão manual e o cálculo é determinístico",()=>{const rows=balanced([student("x",1,[2],"move","Situação excecional")]);assert.deepEqual(calculateDistribution(rows,{seed:"fixo"}),calculateDistribution(rows,{seed:"fixo"}));assert.equal(calculateDistribution(rows,{seed:"fixo"}).find(r=>r.studentId==="x").manualReview,true)});
test("ambiente com cinco turmas ignora turmas inativas",()=>{const rows=[];for(let c=1;c<=5;c++)for(let i=0;i<10;i++)rows.push(student(`local-${c}-${i}`,c,i%4===0?[c===5?1:c+1]:[]));const result=calculateDistribution(rows,{seed:"cinco",classIds:[1,2,3,4,5]});assert.equal(result.length,50);assert.ok(result.every(row=>row.destinationClass>=1&&row.destinationClass<=5))});
test("rede de apoio é favorecida dentro das preferências",()=>{const rows=balanced();rows.push({...student("apoio",1,[3,2]),supportClass:2,considerations:["support_other_choice"]});const result=calculateDistribution(rows,{seed:"apoio"}).find(row=>row.studentId==="apoio");assert.equal(result.destinationClass,2);assert.equal(result.supportMatched,true)});
test("colega indicado favorece a turma respetiva",()=>{const rows=balanced();rows.push({...student("amigo",1,[3,2]),friendPreferences:[{friendStudentId:"base-2-0",classId:2,rank:1}]});const result=calculateDistribution(rows,{seed:"amigo"}).find(row=>row.studentId==="amigo");assert.equal(result.destinationClass,2);assert.equal(result.friendMatched,true)});
