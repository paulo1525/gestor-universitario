import test from "node:test";
import assert from "node:assert/strict";
import {calculateDistribution} from "../lib/distribution-engine.mjs";

const student=(id,classId,destinations=[],preference=destinations.length?"move":"stay",notes="")=>({id,classId,destinations,preference,notes});
function balanced(extra=[]){const rows=[];for(let c=1;c<=20;c++)for(let i=0;i<2;i++)rows.push(student(`base-${c}-${i}`,c));return [...rows,...extra]}

test("nenhuma mudança possível mantém a origem",()=>{const rows=balanced([student("lotado-1",2),student("lotado-2",2),student("lotado-3",2),student("x",1,[2])]);const result=calculateDistribution(rows,{seed:"a"}).find(r=>r.studentId==="x");assert.equal(result.destinationClass,1)});
test("sem conta ou decisão submetida permanece na turma de origem",()=>{const rows=balanced([{...student("x",1,[2]),studentDecision:null}]);const result=calculateDistribution(rows,{seed:"sem-decisao"}).find(r=>r.studentId==="x");assert.equal(result.destinationClass,1);assert.equal(result.status,"stayed_by_choice")});
test("vaga simples atribui uma preferência",()=>{const rows=balanced();rows.splice(rows.findIndex(r=>r.classId===2),1);rows.push(student("x",1,[2]));const result=calculateDistribution(rows,{seed:"b"}).find(r=>r.studentId==="x");assert.equal(result.destinationClass,2)});
test("permuta direta e ciclo de três turmas",()=>{const rows=balanced([student("a",1,[2]),student("b",2,[3]),student("c",3,[1])]);const result=calculateDistribution(rows,{seed:"c"});assert.deepEqual(result.filter(r=>["a","b","c"].includes(r.studentId)).map(r=>r.destinationClass).sort(),[1,2,3])});
test("notas exigem revisão quando a primeira preferência falha",()=>{const rows=balanced([student("lotado-a",2),student("lotado-b",2),student("lotado-c",2),student("x",1,[2],"move","Situação excecional")]);assert.deepEqual(calculateDistribution(rows,{seed:"fixo"}),calculateDistribution(rows,{seed:"fixo"}));assert.equal(calculateDistribution(rows,{seed:"fixo"}).find(r=>r.studentId==="x").manualReview,true)});
test("ambiente com cinco turmas ignora turmas inativas",()=>{const rows=[];for(let c=1;c<=5;c++)for(let i=0;i<10;i++)rows.push(student(`local-${c}-${i}`,c,i%4===0?[c===5?1:c+1]:[]));const result=calculateDistribution(rows,{seed:"cinco",classIds:[1,2,3,4,5]});assert.equal(result.length,50);assert.ok(result.every(row=>row.destinationClass>=1&&row.destinationClass<=5))});
test("integração e exceção somam apenas os pontos administrativos auditáveis",()=>{const rows=balanced();rows.splice(rows.findIndex(row=>row.classId===2),1);rows.push({...student("pontos",1,[2]),integrationPoints:2,exceptionPoints:3,basePoints:5});const result=calculateDistribution(rows,{seed:"pontos"}).find(row=>row.studentId==="pontos");assert.equal(result.points,5);assert.deepEqual(result.pointBreakdown,{integration:2,exception:3})});

function priorityFixture(pointsA=0,pointsB=0){
 const rows=[];
 for(let classId=1;classId<=3;classId+=1)for(let index=0;index<2;index+=1)rows.push({...student(`priority-${classId}-${index}`,classId),studentDecision:"stay"});
 rows.push({...student("candidate-a",1,[2]),studentDecision:"move",basePoints:pointsA});
 rows.push({...student("candidate-b",3,[2]),studentDecision:"move",basePoints:pointsB});
 return rows;
}

function priorityWinner(seed,pointsA=0,pointsB=0){
 const result=calculateDistribution(priorityFixture(pointsA,pointsB),{seed,classIds:[1,2,3],maxDifference:1});
 return {winner:result.find(row=>["candidate-a","candidate-b"].includes(row.studentId)&&row.destinationClass===2),result};
}

test("maior pontuação vence uma vaga mesmo quando o sorteio favoreceria o outro estudante",()=>{
 const seed=Array.from({length:500},(_,index)=>`pontos-${index}`).find(value=>priorityWinner(value).winner.studentId==="candidate-b"&&priorityWinner(value,3,1).winner.studentId==="candidate-a");
 assert.ok(seed,"Deve existir uma seed que favoreça o aluno com menos pontos num empate exato.");
 const scored=priorityWinner(seed,3,1);
 assert.equal(scored.winner.studentId,"candidate-a");
 assert.equal(scored.winner.points,3);
 assert.equal(scored.result.find(row=>row.studentId==="candidate-b").destinationClass,3);
});

test("pontuações iguais usam a seed aleatória de forma reproduzível e auditável",()=>{
 const candidates=Array.from({length:500},(_,index)=>`empate-${index}`),firstSeed=candidates[0],first=priorityWinner(firstSeed),otherSeed=candidates.find(value=>priorityWinner(value).winner.studentId!==first.winner.studentId);
 assert.ok(otherSeed,"Seeds diferentes devem conseguir desempatar a vaga para alunos diferentes.");
 const sameFirst=priorityWinner(firstSeed),other=priorityWinner(otherSeed);
 assert.deepEqual(first.result,sameFirst.result);
 assert.notEqual(first.winner.studentId,other.winner.studentId);
 assert.equal(first.result.find(row=>row.studentId==="candidate-a").randomized,true);
 assert.equal(first.result.find(row=>row.studentId==="candidate-b").randomized,true);
});

test("uma distribuição inicialmente desequilibrada pode convergir para uma solução válida",()=>{
 const rows=[];
 for(let index=0;index<10;index+=1)rows.push({...student(`small-${index}`,1),studentDecision:"stay"});
 for(let index=0;index<20;index+=1)rows.push({...student(`large-${index}`,2,index<5?[1]:[]),studentDecision:index<5?"move":"stay"});
 const result=calculateDistribution(rows,{seed:"equilibrar",classIds:[1,2],maxDifference:3}),counts=result.reduce((all,row)=>all.set(row.destinationClass,(all.get(row.destinationClass)||0)+1),new Map());
 assert.deepEqual([counts.get(1),counts.get(2)],[15,15]);
});

test("quando todos obtêm a primeira preferência não é comunicado qualquer sorteio decisivo",()=>{
 const rows=[];for(let classId=1;classId<=5;classId+=1)for(let index=0;index<10;index+=1)rows.push({...student(`first-${classId}-${index}`,classId,index<3?[classId===5?1:classId+1]:[]),studentDecision:index<3?"move":"stay",basePoints:0});
 const result=calculateDistribution(rows,{seed:"sem-sorteio",classIds:[1,2,3,4,5],maxDifference:3});
 assert.equal(result.filter(row=>row.status==="moved").length,15);
 assert.ok(result.filter(row=>row.status==="moved").every(row=>row.rank===1));
 assert.equal(result.filter(row=>row.randomized).length,0);
});

test("otimização global encontra uma solução que o percurso guloso perdia",()=>{
 const rows=[];
 for(let classId=5;classId<=20;classId+=1)for(let index=0;index<3;index+=1)rows.push({...student(`fixed-${classId}-${index}`,classId),studentDecision:"stay"});
 for(let index=0;index<4;index+=1)rows.push({...student(`fixed-3-${index}`,3),studentDecision:"stay"});
 for(let index=0;index<3;index+=1)rows.push({...student(`fixed-4-${index}`,4),studentDecision:"stay"});
 const mover=(id,classId,destinations,basePoints)=>({...student(id,classId,destinations),studentDecision:"move",basePoints});
 rows.push(mover("m0",1,[2,3],4),mover("m1",1,[2,3,4],4),mover("m2",1,[3],3),mover("m3",4,[1,3,2],1),mover("m4",2,[3,1,4],2),mover("m5",1,[2],4),mover("m6",3,[4,1],1),mover("m7",2,[1],3));
 const result=calculateDistribution(rows,{seed:"global",classIds:Array.from({length:20},(_,index)=>index+1),maxDifference:3}),counts=result.reduce((all,row)=>all.set(row.destinationClass,(all.get(row.destinationClass)||0)+1),new Map());
 assert.ok(Math.max(...counts.values())-Math.min(...counts.values())<=3);
 assert.equal(result.length,rows.length);
});
