import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptXp, isRankingPass, normaliseRankingName, quizDayKey, quizGameProfile, quizLevel, rankRows, rankingPeriodStart, suggestedRankingName } from '../lib/quiz-gamification.mjs';

const at = (iso) => Date.parse(iso);

test('o ranking conta apenas testes com 75% ou mais', () => {
  assert.equal(isRankingPass(15, 20), true);
  assert.equal(isRankingPass(14, 20), false);
  assert.equal(isRankingPass(4, 5), true);
  assert.equal(isRankingPass(3, 5), false);
  assert.equal(isRankingPass(0, 0), false);
});

test('XP recompensa respostas certas, testes aprovados e testes perfeitos', () => {
  assert.equal(attemptXp(3, 5), 30);
  assert.equal(attemptXp(4, 5), 90);
  assert.equal(attemptXp(5, 5), 150);
});

test('cada nível custa mais 100 XP do que o anterior', () => {
  assert.equal(quizLevel(0).level, 1);
  assert.equal(quizLevel(99).level, 1);
  assert.equal(quizLevel(100).level, 2);
  assert.equal(quizLevel(299).level, 2);
  assert.equal(quizLevel(300).level, 3);
  assert.equal(quizLevel(150).progress, 0.25);
});

test('os dias e os períodos seguem a hora de Lisboa', () => {
  assert.equal(quizDayKey(at('2026-07-01T23:30:00Z')), '2026-07-02');
  assert.equal(quizDayKey(at('2026-12-01T23:30:00Z')), '2026-12-01');
  // Quarta-feira, 8 de julho de 2026 → segunda-feira, 6 de julho, 00:00 em Lisboa (UTC+1).
  assert.equal(rankingPeriodStart('week', at('2026-07-08T12:00:00Z')), at('2026-07-05T23:00:00Z'));
  assert.equal(rankingPeriodStart('month', at('2026-12-15T12:00:00Z')), at('2026-12-01T00:00:00Z'));
  assert.equal(rankingPeriodStart('all'), null);
});

test('a sequência de dias continua viva até ao fim do dia seguinte', () => {
  const now = at('2026-10-06T10:00:00Z');
  const attempts = [
    { completedAt: at('2026-10-03T10:00:00Z'), questionCount: 10, correctCount: 8 },
    { completedAt: at('2026-10-04T10:00:00Z'), questionCount: 10, correctCount: 5 },
    { completedAt: at('2026-10-05T10:00:00Z'), questionCount: 10, correctCount: 10 },
  ];
  const profile = quizGameProfile(attempts, now);
  assert.equal(profile.streakDays, 3);
  assert.equal(profile.bestStreakDays, 3);
  assert.equal(profile.practisedToday, false);
  assert.equal(profile.passedTotal, 2);
  assert.equal(profile.badges.find((badge) => badge.id === 'streak3').earned, true);
  assert.equal(quizGameProfile(attempts, at('2026-10-07T10:00:00Z')).streakDays, 0);
});

test('o nome no ranking é validado e nunca aceita emails', () => {
  assert.equal(normaliseRankingName('  Ana   S. '), 'Ana S.');
  assert.equal(normaliseRankingName('ana@up.pt'), null);
  assert.equal(normaliseRankingName('ab'), null);
  assert.equal(suggestedRankingName('Maria Fictícia Teste'), 'Maria T.');
  assert.equal(suggestedRankingName(''), '');
});

test('empates partilham a mesma posição', () => {
  assert.deepEqual(rankRows([{ passedCount: 5 }, { passedCount: 5 }, { passedCount: 2 }]).map((row) => row.rank), [1, 1, 3]);
});
