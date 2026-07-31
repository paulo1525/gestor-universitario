import test from "node:test";
import assert from "node:assert/strict";
import {previewDistributionOverride} from "../lib/distribution-override.mjs";

const result=(studentId,originClass,destinationClass)=>({studentId,originClass,destinationClass,rank:null,status:originClass===destinationClass?"fallback":"moved",manualReview:false,randomized:false});
const student={id:"target",classId:17,studentDecision:"move",destinations:[8,10]};

test("manual override previews both class sizes without mutating the proposal",()=>{
 const results=[result("target",17,17),result("ten",10,10),result("eight-a",8,8),result("eight-b",8,8)];
 const original=structuredClone(results),preview=previewDistributionOverride({results,classIds:[8,10,17],student,studentId:"target",destinationClass:10,allowedDifference:1});
 assert.deepEqual(results,original);
 assert.equal(preview.previousClass,17);
 assert.deepEqual(preview.beforeCounts,{8:2,10:1,17:1});
 assert.deepEqual(preview.afterCounts,{8:2,10:2,17:0});
 assert.equal(preview.beforeDifference,1);
 assert.equal(preview.afterDifference,2);
 assert.equal(preview.requiresImbalanceException,true);
 assert.deepEqual(preview.nextResults.find(item=>item.studentId==="target"),{...result("target",17,17),destinationClass:10,rank:2,status:"moved",manualReview:false,randomized:false,manualOverride:true});
});

test("manual override at the configured limit remains a normal audited change",()=>{
 const results=[result("target",17,17),result("ten",10,10),result("eight-a",8,8),result("eight-b",8,8)];
 const preview=previewDistributionOverride({results,classIds:[8,10,17],student,studentId:"target",destinationClass:10,allowedDifference:2});
 assert.equal(preview.afterDifference,2);
 assert.equal(preview.requiresImbalanceException,false);
});

test("returning a mover to the origin clears rank and marks fallback",()=>{
 const results=[result("target",17,10),result("ten",10,10)];
 const preview=previewDistributionOverride({results,classIds:[10,17],student,studentId:"target",destinationClass:17,allowedDifference:3}),target=preview.nextResults.find(item=>item.studentId==="target");
 assert.equal(target.rank,null);
 assert.equal(target.status,"fallback");
 assert.equal(target.manualOverride,true);
});
