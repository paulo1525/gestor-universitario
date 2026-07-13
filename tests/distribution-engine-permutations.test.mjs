import test from "node:test";
import assert from "node:assert/strict";
import {calculateDistribution} from "../lib/distribution-engine.mjs";

function generator(seed){
 let state=seed>>>0;
 return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
}

function shuffled(values,random){
 const result=[...values];
 for(let index=result.length-1;index>0;index-=1){const swap=Math.floor(random()*(index+1));[result[index],result[swap]]=[result[swap],result[index]]}
 return result;
}

function normalized(result){
 return result.map(row=>({studentId:row.studentId,destinationClass:row.destinationClass,rank:row.rank,status:row.status,points:row.points,randomized:row.randomized,manualReview:row.manualReview})).sort((a,b)=>a.studentId.localeCompare(b.studentId));
}

function verifyInvariants(students,result,classIds,maxDifference){
 assert.equal(result.length,students.length);
 assert.equal(new Set(result.map(row=>row.studentId)).size,students.length);
 const inputById=new Map(students.map(student=>[student.id,student])),active=new Set(classIds),counts=new Map(classIds.map(classId=>[classId,0]));
 for(const row of result){
  const student=inputById.get(row.studentId),moves=student.studentDecision==="move";
  assert.ok(student);
  assert.ok(active.has(row.destinationClass));
  assert.ok(row.destinationClass===student.classId||student.destinations.includes(row.destinationClass));
  counts.set(row.destinationClass,counts.get(row.destinationClass)+1);
  if(!moves){assert.equal(row.destinationClass,student.classId);assert.equal(row.status,"stayed_by_choice");assert.equal(row.rank,null);assert.equal(row.points,0)}
  else if(row.destinationClass===student.classId){assert.equal(row.status,"fallback");assert.equal(row.rank,null);assert.equal(row.points,0)}
  else{assert.equal(row.status,"moved");assert.equal(row.rank,student.destinations.indexOf(row.destinationClass)+1);assert.equal(row.points,Math.max(0,Number(student.basePoints)||0))}
 }
 const sizes=[...counts.values()];
 assert.ok(Math.max(...sizes)-Math.min(...sizes)<=maxDifference,`Lotação inválida: ${sizes.join(",")}`);
}

function scenario(seed,classCount,perClass){
 const random=generator(seed),classIds=Array.from({length:classCount},(_,index)=>index+101),students=[];
 for(const classId of classIds)for(let index=0;index<perClass;index+=1){
  const id=`s-${seed}-${classId}-${index}`,willMove=random()<0.42;
  const destinations=willMove?shuffled(classIds.filter(value=>value!==classId),random).slice(0,1+Math.floor(random()*Math.min(4,classCount-1))):random()<0.15?[classIds.find(value=>value!==classId)]:[];
  students.push({id,classId,destinations,studentDecision:willMove?"move":random()<0.12?null:"stay",basePoints:Math.floor(random()*6),integrationPoints:random()<0.2?2:0,exceptionPoints:random()<0.15?1:0,notes:random()<0.08?"Situação para revisão":""});
 }
 return {students,classIds};
}

test("centenas de combinações preservam as invariantes e são independentes da ordem de entrada",()=>{
 for(let seed=1;seed<=120;seed+=1){
  const classCount=2+(seed%19),perClass=3+(seed%9),{students,classIds}=scenario(seed,classCount,perClass),options={seed:`permutacao-${seed}`,classIds,maxDifference:3};
  const result=calculateDistribution(students,options),permuted=calculateDistribution(shuffled(students,generator(seed*97)),{...options,classIds:shuffled(classIds,generator(seed*193))});
  verifyInvariants(students,result,classIds,3);
  verifyInvariants(students,permuted,classIds,3);
  assert.deepEqual(normalized(permuted),normalized(result),`A ordem de entrada alterou o cenário ${seed}`);
 }
});

test("vinte turmas e mais de 250 alunos mantêm equilíbrio em várias matrizes concorrentes",()=>{
 for(let seed=500;seed<520;seed+=1){
  const {students,classIds}=scenario(seed,20,14),result=calculateDistribution(students,{seed:`ano-completo-${seed}`,classIds,maxDifference:3});
  verifyInvariants(students,result,classIds,3);
  assert.equal(result.length,280);
  assert.deepEqual(result,calculateDistribution(students,{seed:`ano-completo-${seed}`,classIds,maxDifference:3}));
 }
});

function assignmentQuality(student,destination,classCount){
 const rank=student.destinations.indexOf(destination),points=Math.max(0,Math.min(5,Number(student.basePoints)||0));
 return (rank<0?student.destinations.length:rank)*1_000_000-(rank<0?0:points*Math.max(1,classCount-rank));
}

function bruteForceBest(students,classIds,maxDifference){
 const movers=students.filter(student=>student.studentDecision==="move"),fixed=students.filter(student=>student.studentDecision!=="move"),counts=new Map(classIds.map(classId=>[classId,0]));
 for(const student of fixed)counts.set(student.classId,counts.get(student.classId)+1);
 let best=Infinity;
 function visit(index,cost){
  if(index===movers.length){const sizes=[...counts.values()];if(Math.max(...sizes)-Math.min(...sizes)<=maxDifference)best=Math.min(best,cost);return}
  const student=movers[index],choices=[...new Set([...student.destinations,student.classId])];
  for(const destination of choices){
   counts.set(destination,counts.get(destination)+1);
   visit(index+1,cost+assignmentQuality(student,destination,classIds.length));
   counts.set(destination,counts.get(destination)-1);
  }
 }
 visit(0,0);return best;
}

test("o resultado global coincide com um oráculo exaustivo em 250 problemas pequenos",()=>{
 for(let seed=800;seed<1050;seed+=1){
  const random=generator(seed),classIds=[1,2,3],students=[];
  for(const classId of classIds)for(let index=0;index<2;index+=1){
   const move=random()<0.72,destinations=move?shuffled(classIds.filter(value=>value!==classId),random).slice(0,1+Math.floor(random()*2)):[];
   students.push({id:`oracle-${seed}-${classId}-${index}`,classId,destinations,studentDecision:move?"move":"stay",basePoints:Math.floor(random()*6)});
  }
  const maxDifference=1+(seed%2),result=calculateDistribution(students,{seed:`oracle-${seed}`,classIds,maxDifference});
  verifyInvariants(students,result,classIds,maxDifference);
  const input=new Map(students.map(student=>[student.id,student])),actual=result.filter(row=>input.get(row.studentId).studentDecision==="move").reduce((total,row)=>total+assignmentQuality(input.get(row.studentId),row.destinationClass,classIds.length),0);
  assert.equal(actual,bruteForceBest(students,classIds,maxDifference),`Ótimo global incorreto no cenário ${seed}`);
 }
});

test("num choque da primeira preferência, a maior pontuação vence mesmo tendo uma alternativa",()=>{
 const fixture=points=>[
  {id:"fixed-1",classId:1,destinations:[],studentDecision:"stay"},
  ...Array.from({length:3},(_,index)=>({id:`fixed-2-${index}`,classId:2,destinations:[],studentDecision:"stay"})),
  {id:"fixed-3",classId:3,destinations:[],studentDecision:"stay"},
  {id:"high",classId:1,destinations:[2,3],studentDecision:"move",basePoints:points},
  {id:"low",classId:3,destinations:[2],studentDecision:"move",basePoints:0}
 ];
 for(let seed=0;seed<100;seed+=1){
  const result=calculateDistribution(fixture(5),{seed:`collision-score-${seed}`,classIds:[1,2,3],maxDifference:3});
  assert.equal(result.find(row=>row.studentId==="high").destinationClass,2);
  assert.equal(result.find(row=>row.studentId==="low").destinationClass,3);
 }
 const winners=new Set();
 for(let seed=0;seed<250;seed+=1){
  const result=calculateDistribution(fixture(0),{seed:`collision-tie-${seed}`,classIds:[1,2,3],maxDifference:3});
  winners.add(result.find(row=>row.destinationClass===2&&["high","low"].includes(row.studentId)).studentId);
  assert.equal(result.find(row=>row.studentId==="high").randomized,true);
  assert.equal(result.find(row=>row.studentId==="low").randomized,true);
 }
 assert.deepEqual([...winners].sort(),["high","low"]);
});

test("pontuação só decide candidatos na mesma preferência e empate exato usa uma seed reproduzível",()=>{
 const fixture=(pointsA,pointsB)=>[
  {id:"fix-1a",classId:1,destinations:[],studentDecision:"stay"},{id:"fix-1b",classId:1,destinations:[],studentDecision:"stay"},{id:"fix-2a",classId:2,destinations:[],studentDecision:"stay"},{id:"fix-2b",classId:2,destinations:[],studentDecision:"stay"},{id:"fix-3a",classId:3,destinations:[],studentDecision:"stay"},{id:"fix-3b",classId:3,destinations:[],studentDecision:"stay"},
  {id:"candidate-a",classId:1,destinations:[2],studentDecision:"move",basePoints:pointsA},{id:"candidate-b",classId:3,destinations:[2],studentDecision:"move",basePoints:pointsB}
 ];
 for(let seed=0;seed<100;seed+=1){
  const scored=calculateDistribution(fixture(5,0),{seed:`score-${seed}`,classIds:[1,2,3],maxDifference:1});
  assert.equal(scored.find(row=>row.studentId==="candidate-a").destinationClass,2);
 }
 const winners=new Set();
 for(let seed=0;seed<100;seed+=1){
  const value=`tie-${seed}`,first=calculateDistribution(fixture(2,2),{seed:value,classIds:[1,2,3],maxDifference:1}),second=calculateDistribution(shuffled(fixture(2,2),generator(seed+1)),{seed:value,classIds:[3,1,2],maxDifference:1});
  assert.deepEqual(normalized(first),normalized(second));
  assert.deepEqual(first,calculateDistribution(fixture(2,2),{seed:value,classIds:[1,2,3],maxDifference:1}));
  winners.add(first.find(row=>row.destinationClass===2&&row.studentId.startsWith("candidate-")).studentId);
  assert.equal(first.filter(row=>row.randomized).length,2);
 }
 assert.deepEqual([...winners].sort(),["candidate-a","candidate-b"]);
});
