/** Gamification rules for practice tests. Pure functions: shared by the worker, the UI and the tests. */

export const QUIZ_TIME_ZONE = "Europe/Lisbon";
export const RANKING_THRESHOLD = 0.75;
export const DAILY_GOAL = 3;
export const XP_PER_CORRECT = 10;
export const XP_PASS_BONUS = 50;
export const XP_PERFECT_BONUS = 50;
export const RANKING_PERIODS = ["week", "month", "all"];

const LEVEL_TITLES = ["Caloiro", "Aprendiz", "Estudante aplicado", "Monitor", "Interno", "Residente", "Especialista", "Assistente", "Professor", "Catedrático", "Lenda"];
const DAY_MS = 86400000;

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: QUIZ_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFormatter = new Intl.DateTimeFormat("en-US", { timeZone: QUIZ_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });

/** Calendar day (YYYY-MM-DD) in Lisbon, so a streak follows the student's day and not UTC. */
export function quizDayKey(timestamp) {
  return dayFormatter.format(new Date(timestamp));
}

function zoneOffsetMs(timestamp) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/** UTC timestamp of local midnight for a Lisbon calendar date. */
export function zonedMidnight(year, month, day) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - zoneOffsetMs(guess);
  return guess - zoneOffsetMs(first);
}

function shiftDay(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Start of the ranking period: Monday 00:00 for the week, day 1 for the month, null for all time. */
export function rankingPeriodStart(period, now = Date.now()) {
  if (period !== "week" && period !== "month") return null;
  const [year, month, day] = quizDayKey(now).split("-").map(Number);
  if (period === "month") return zonedMidnight(year, month, 1);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(year, month - 1, day) - weekday * DAY_MS);
  return zonedMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

export function isRankingPass(correctCount, questionCount) {
  const total = Number(questionCount) || 0;
  return total > 0 && (Number(correctCount) || 0) * 4 >= total * 3;
}

export function attemptXp(correctCount, questionCount) {
  const correct = Math.max(0, Number(correctCount) || 0), total = Math.max(0, Number(questionCount) || 0);
  return correct * XP_PER_CORRECT + (isRankingPass(correct, total) ? XP_PASS_BONUS : 0) + (total > 0 && correct >= total ? XP_PERFECT_BONUS : 0);
}

/** Level L starts at 100·L·(L−1)/2 XP: each level costs 100 XP more than the previous one. */
export function quizLevel(xp) {
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (50 * (level + 1) * level <= safe) level += 1;
  const start = 50 * level * (level - 1), next = 50 * (level + 1) * level;
  return { level, title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1], xp: safe, levelStartXp: start, nextLevelXp: next, progress: (safe - start) / (next - start) };
}

const BADGES = [
  { id: "first", title: "Primeiro passo", description: "Concluir o primeiro teste.", test: (s) => s.completedCount >= 1 },
  { id: "pass", title: "Na mouche", description: "Um teste com 75% ou mais.", test: (s) => s.passedTotal >= 1 },
  { id: "perfect", title: "Perfeição", description: "Um teste com 100%.", test: (s) => s.perfectCount >= 1 },
  { id: "marathon", title: "Maratona", description: "Concluir um teste de 50 perguntas.", test: (s) => s.longestTest >= 50 },
  { id: "goal", title: "Objetivo cumprido", description: `${DAILY_GOAL} testes no mesmo dia.`, test: (s) => s.bestDay >= DAILY_GOAL },
  { id: "streak3", title: "Em chamas", description: "3 dias seguidos a praticar.", test: (s) => s.bestStreakDays >= 3 },
  { id: "streak7", title: "Semana perfeita", description: "7 dias seguidos a praticar.", test: (s) => s.bestStreakDays >= 7 },
  { id: "pass25", title: "Imparável", description: "25 testes com 75% ou mais.", test: (s) => s.passedTotal >= 25 },
  { id: "pass100", title: "Centenário", description: "100 testes com 75% ou mais.", test: (s) => s.passedTotal >= 100 },
];

/**
 * Summarises completed attempts ({ completedAt, questionCount, correctCount }) into the student's game profile.
 * A streak stays alive until the end of the day after the last practice.
 */
export function quizGameProfile(attempts, now = Date.now()) {
  const today = quizDayKey(now), yesterday = shiftDay(today, -1), weekStart = rankingPeriodStart("week", now);
  const perDay = new Map();
  let xp = 0, passedTotal = 0, passedThisWeek = 0, perfectCount = 0, longestTest = 0, completedCount = 0;
  for (const attempt of attempts) {
    const completedAt = Number(attempt.completedAt);
    if (!Number.isFinite(completedAt) || completedAt <= 0) continue;
    const correct = Number(attempt.correctCount) || 0, total = Number(attempt.questionCount) || 0;
    completedCount += 1;
    xp += attemptXp(correct, total);
    longestTest = Math.max(longestTest, total);
    if (total > 0 && correct >= total) perfectCount += 1;
    if (isRankingPass(correct, total)) { passedTotal += 1; if (weekStart !== null && completedAt >= weekStart) passedThisWeek += 1; }
    const key = quizDayKey(completedAt);
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  const days = [...perDay.keys()].sort();
  let bestStreakDays = 0, run = 0, previous = "";
  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    bestStreakDays = Math.max(bestStreakDays, run);
    previous = day;
  }
  let streakDays = 0;
  let cursor = perDay.has(today) ? today : perDay.has(yesterday) ? yesterday : "";
  while (cursor && perDay.has(cursor)) { streakDays += 1; cursor = shiftDay(cursor, -1); }
  const todayCompleted = perDay.get(today) || 0;
  const bestDay = Math.max(0, ...perDay.values());
  const stats = { completedCount, passedTotal, perfectCount, longestTest, bestDay, bestStreakDays };
  return {
    ...quizLevel(xp),
    streakDays,
    bestStreakDays,
    practisedToday: todayCompleted > 0,
    todayCompleted,
    dailyGoal: DAILY_GOAL,
    completedCount,
    passedTotal,
    passedThisWeek,
    badges: BADGES.map((badge) => ({ id: badge.id, title: badge.title, description: badge.description, earned: badge.test(stats) })),
  };
}

/** Public alias for the opt-in ranking: 3–24 letters, digits, spaces and . _ - (never an email). */
export function normaliseRankingName(value) {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,22}[\p{L}\p{N}._-]$/u.test(name) ? name : null;
}

/** Suggestion shown before joining: first name and initial of the last name. */
export function suggestedRankingName(fullName) {
  const parts = String(fullName || "").normalize("NFC").trim().split(/\s+/).filter(Boolean).map((part) => part.replace(/[^\p{L}\p{N}._-]/gu, "")).filter(Boolean);
  const suggestion = parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0] || "";
  return normaliseRankingName(suggestion.slice(0, 24)) ?? "";
}

/** Competition ranking (1, 1, 3): equal counts share a position. */
export function rankRows(rows) {
  let previousCount = null, previousRank = 0;
  return rows.map((row, index) => {
    const rank = row.passedCount === previousCount ? previousRank : index + 1;
    previousCount = row.passedCount;
    previousRank = rank;
    return { ...row, rank };
  });
}
