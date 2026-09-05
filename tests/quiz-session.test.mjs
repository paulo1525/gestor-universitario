import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingQuizSeconds, quizReviewState, nextUnansweredIndex } from '../lib/quiz-session.mjs';

test('o cronómetro recupera o tempo real após suspensão do separador', () => {
  const start = Date.parse('2026-09-05T10:00:00Z');
  const attempt = { startedAt: new Date(start).toISOString(), endsAt: new Date(start + 300000).toISOString(), durationSeconds: 300 };
  assert.equal(remainingQuizSeconds(attempt, start), 300);
  assert.equal(remainingQuizSeconds(attempt, start + 183200), 117);
  assert.equal(remainingQuizSeconds(attempt, start + 900000), 0);
  assert.equal(remainingQuizSeconds({ ...attempt, endsAt: null }, start + 183200), 117);
  assert.equal(remainingQuizSeconds({ endsAt: null, startedAt: null, durationSeconds: null }, start), null);
});

test('a revisão distingue omissões de erros e respeita a correção do servidor', () => {
  const q = { id: 'q', correctOptionId: 'a' };
  assert.equal(quizReviewState(q), 'unanswered');
  assert.equal(quizReviewState(q, { selectedOptionId: '' }), 'unanswered');
  assert.equal(quizReviewState(q, { selectedOptionId: 'a', correct: true }), 'correct');
  assert.equal(quizReviewState(q, { selectedOptionId: 'b', correct: false }), 'incorrect');
  assert.equal(quizReviewState(q, { selectedOptionId: 'a', correct: false }), 'incorrect');
  assert.equal(quizReviewState(q, { selectedOptionId: 'a', correct: null }), 'correct');
  assert.equal(quizReviewState({ id: 'q', correctOptionId: null }, { selectedOptionId: 'a' }), 'incorrect');
});

test('a navegação regressa às omissões sem se prender na última pergunta', () => {
  const questions = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const answers = ['b', 'd'].map((questionId) => ({ questionId, selectedOptionId: '1' }));
  assert.equal(nextUnansweredIndex(questions, answers, 1), 2);
  assert.equal(nextUnansweredIndex(questions, answers, 3), 0);
  assert.equal(nextUnansweredIndex(questions, answers, 2), 0);
  assert.equal(nextUnansweredIndex([], [], 0), -1);
  assert.equal(nextUnansweredIndex(questions, questions.map(({ id }) => ({ questionId: id, selectedOptionId: '1' })), 0), -1);
});

test('o relógio permanece imóvel em pausa e desaparece no modo sem limite', () => {
  const attempt = { timed: true, timerPaused: true, pausedRemainingSeconds: 127, startedAt: '2026-09-05T10:00:00Z', endsAt: null, durationSeconds: 300 };
  assert.equal(remainingQuizSeconds(attempt, Date.parse('2026-09-05T15:00:00Z')), 127);
  assert.equal(remainingQuizSeconds(attempt, Date.parse('2026-09-07T10:00:00Z')), 127);
  assert.equal(remainingQuizSeconds({...attempt,timed:false}), null);
});
