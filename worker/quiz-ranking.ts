/// <reference types="@cloudflare/workers-types" />

import { normaliseRankingName, quizGameProfile, rankRows, rankingPeriodStart, suggestedRankingName, type RankingPeriod } from "../lib/quiz-gamification.mjs";
import type { QuizUser } from "./quizzes";

type RankingEnv = { DB: D1Database };
type Row = Record<string, unknown>;

const LEADERBOARD_SIZE = 50;
const PROFILE_ATTEMPT_LIMIT = 5000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function bodyJson(request: Request): Promise<Row | null> {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
  } catch { return null; }
}

async function audit(env: RankingEnv, user: QuizUser, action: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,?,?,?)")
    .bind(user.actorId || user.id, action, JSON.stringify(details), Date.now()).run();
}

export function isQuizRankingPath(path: string): boolean {
  return path === "/api/quiz-profile" || path === "/api/quiz-ranking" || path === "/api/quiz-ranking/membership";
}

async function profile(env: RankingEnv, user: QuizUser): Promise<Response> {
  const result = await env.DB.prepare("SELECT completed_at,question_count,correct_count FROM quiz_attempts WHERE user_id=? AND status='completed' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT ?")
    .bind(user.id, PROFILE_ATTEMPT_LIMIT).all<Row>();
  const attempts = result.results.map((item) => ({ completedAt: Number(item.completed_at), questionCount: Number(item.question_count), correctCount: Number(item.correct_count) }));
  return json({ profile: quizGameProfile(attempts) });
}

async function leaderboard(env: RankingEnv, user: QuizUser, url: URL): Promise<Response> {
  const requested = url.searchParams.get("period");
  const period: RankingPeriod = requested === "month" || requested === "all" ? requested : "week";
  const unitId = (url.searchParams.get("unitId") || "").trim().slice(0, 100) || null;
  const since = rankingPeriodStart(period);
  // Members only: a student who never joined is not counted, listed or revealed.
  const result = await env.DB.prepare(`SELECT m.user_id,m.display_name,m.joined_at,COUNT(a.id) AS passed_count,MAX(a.completed_at) AS last_pass_at
    FROM quiz_ranking_members m
    LEFT JOIN quiz_attempts a ON a.user_id=m.user_id AND a.status='completed' AND a.question_count>0 AND a.correct_count*4>=a.question_count*3
      AND (? IS NULL OR a.completed_at>=?) AND (? IS NULL OR a.curricular_unit_id=?)
    GROUP BY m.user_id
    ORDER BY passed_count DESC,last_pass_at ASC,m.joined_at ASC`).bind(since, since, unitId, unitId).all<Row>();
  const moderator = user.role === "admin";
  const ranked = rankRows(result.results.map((item) => ({ userId: String(item.user_id), displayName: String(item.display_name), passedCount: Number(item.passed_count || 0) })));
  const mine = ranked.find((item) => item.userId === user.id) ?? null;
  const visible = ranked.filter((item) => item.passedCount > 0).slice(0, LEADERBOARD_SIZE);
  const entry = (item: (typeof ranked)[number]) => ({ rank: item.rank, displayName: item.displayName, passedCount: item.passedCount, isMe: item.userId === user.id, ...(moderator ? { memberId: item.userId } : {}) });
  return json({
    period,
    unitId,
    since,
    participantCount: ranked.length,
    leaderboard: visible.map(entry),
    me: { member: Boolean(mine), displayName: mine?.displayName ?? null, suggestedName: suggestedRankingName(user.fullName), rank: mine && mine.passedCount > 0 ? mine.rank : null, passedCount: mine?.passedCount ?? 0 },
    canModerate: moderator,
  });
}

async function joinRanking(request: Request, env: RankingEnv, user: QuizUser): Promise<Response> {
  const body = await bodyJson(request);
  const displayName = normaliseRankingName(body?.displayName);
  if (!displayName) return json({ error: "Escolhe um nome com 3 a 24 letras, números, espaços ou . _ -", code: "invalid_name" }, 400);
  const taken = await env.DB.prepare("SELECT user_id FROM quiz_ranking_members WHERE display_name=? COLLATE NOCASE AND user_id<>?").bind(displayName, user.id).first<Row>();
  if (taken) return json({ error: "Esse nome já está a ser usado no ranking.", code: "name_taken" }, 409);
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT display_name FROM quiz_ranking_members WHERE user_id=?").bind(user.id).first<Row>();
  try {
    await env.DB.prepare("INSERT INTO quiz_ranking_members (user_id,display_name,joined_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at")
      .bind(user.id, displayName, now, now).run();
  } catch {
    return json({ error: "Esse nome já está a ser usado no ranking.", code: "name_taken" }, 409);
  }
  await audit(env, user, existing ? "quiz_ranking_renamed" : "quiz_ranking_joined", { displayName, previousName: existing?.display_name ?? null });
  return json({ ok: true, displayName });
}

async function leaveRanking(env: RankingEnv, user: QuizUser, url: URL): Promise<Response> {
  const target = (url.searchParams.get("userId") || "").trim().slice(0, 100);
  if (target && target !== user.id && user.role !== "admin") return json({ error: "Acesso reservado a administradores." }, 403);
  const userId = target || user.id;
  const member = await env.DB.prepare("SELECT display_name FROM quiz_ranking_members WHERE user_id=?").bind(userId).first<Row>();
  if (!member) return json({ ok: true });
  await env.DB.prepare("DELETE FROM quiz_ranking_members WHERE user_id=?").bind(userId).run();
  await audit(env, user, userId === user.id ? "quiz_ranking_left" : "quiz_ranking_member_removed", { userId, displayName: member.display_name });
  return json({ ok: true });
}

export async function handleQuizRankingRoute(request: Request, env: RankingEnv, url: URL, user: QuizUser): Promise<Response> {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (path === "/api/quiz-profile" && request.method === "GET") return profile(env, user);
  if (path === "/api/quiz-ranking" && request.method === "GET") return leaderboard(env, user, url);
  if (path === "/api/quiz-ranking/membership" && request.method === "PUT") return joinRanking(request, env, user);
  if (path === "/api/quiz-ranking/membership" && request.method === "DELETE") return leaveRanking(env, user, url);
  return json({ error: "Operação não suportada." }, 405);
}
