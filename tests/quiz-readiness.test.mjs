import assert from 'node:assert/strict';
import test from 'node:test';
import { quizReadiness } from '../lib/quiz-readiness.mjs';
test('preparação exige cobertura, domínio das perguntas e bons resultados recentes',()=>{
  const base={completedCount:5,uniqueQuestionCount:100,latestCorrectCount:100,recentAccuracy:1};
  assert.equal(quizReadiness(base,100).score,100);
  assert.equal(quizReadiness({...base,recentAccuracy:0},100).score,60);
  assert.equal(quizReadiness({...base,latestCorrectCount:0},100).score,40);
  assert.equal(quizReadiness({...base,uniqueQuestionCount:10,latestCorrectCount:10},100).score,10);
  assert.equal(quizReadiness({...base,completedCount:0},100).score,null);
  assert.equal(quizReadiness({...base,uniqueQuestionCount:0},100).score,null);
});
