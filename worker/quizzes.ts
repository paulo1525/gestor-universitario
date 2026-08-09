/// <reference types="@cloudflare/workers-types" />

import { richTextPlainText, sanitizeRichTextHtml } from "../lib/announcement-content";

export type QuizUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  actorId?: string;
};

type QuizEnv = { DB: D1Database };
type ModuleChecker = (key: string) => Promise<boolean>;
type Row = Record<string, unknown>;
type QuizMode = "quick" | "exam" | "topic" | "unseen" | "mistakes";
type Difficulty = "easy" | "medium" | "hard";
type QuizOption = { id: string; text: string; position: number };
type ParsedOption = QuizOption & { isCorrect: boolean };
type QuizCommentReplyTo = { id: string; authorName: string; authorRole: string; isAdmin: boolean };
type PublicQuizComment = { id: string; questionId: string; parentCommentId: string | null; parentId: string | null; replyTo: QuizCommentReplyTo | null; body: string; status: "published"; authorName: string; authorRole: string; isAdmin: boolean; createdAt: number; updatedAt: number };
type PublicQuizCommentThread = PublicQuizComment & { replies: PublicQuizCommentThread[] };

const MAX_IMPORT_ROWS = 100;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MIN_TEST_QUESTIONS = 10;
const MAX_TEST_QUESTIONS = 50;
const ADMIN_QUESTION_PAGE_SIZES = new Set([10, 25, 50]);
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function unauthenticated(): Response { return json({ error: "Sessão inválida." }, 401); }
function forbidden(): Response { return json({ error: "Acesso reservado a administradores." }, 403); }
function disabled(): Response { return json({ error: "Este módulo está temporariamente desativado.", code: "MODULE_DISABLED" }, 404); }
function row(value: unknown): Row { return value as Row; }
function actor(user: QuizUser): string { return user.actorId || user.id; }
function isAdmin(user: QuizUser | null): user is QuizUser { return Boolean(user && user.role === "admin"); }

async function bodyJson(request: Request): Promise<Row | null> {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
  } catch { return null; }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function longText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function has(object: Row, key: string): boolean { return Object.prototype.hasOwnProperty.call(object, key); }

function optionalDifficulty(value: unknown): Difficulty | null {
  const normalized = text(value, 20).toLocaleLowerCase("pt-PT");
  if (["easy", "fácil", "facil"].includes(normalized)) return "easy";
  if (["medium", "média", "media", "médio", "medio"].includes(normalized)) return "medium";
  if (["hard", "dificil", "difícil"].includes(normalized)) return "hard";
  return null;
}

function normalizeStatus(value: unknown, fallback = "draft"): "draft" | "published" | "archived" | null {
  const candidate = text(value, 20) || fallback;
  return candidate === "draft" || candidate === "published" || candidate === "archived" ? candidate : null;
}

function readImage(value: unknown): { value: string | null } | { error: string } {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value !== "string") return { error: "A imagem da pergunta é inválida." };
  const imageUrl = value.trim();
  if (imageUrl.startsWith("/") && !imageUrl.startsWith("//") && !imageUrl.includes("\\") && imageUrl.length <= 1000) return { value: imageUrl };
  const match = imageUrl.match(IMAGE_DATA_URL);
  if (!match || Math.floor(match[2].length * 3 / 4) > MAX_IMAGE_BYTES) return { error: "A imagem deve ser um caminho interno ou data:image JPEG, PNG ou WebP até 1 MiB." };
  return { value: imageUrl };
}

function parseStoredOptions(value: unknown): QuizOption[] {
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((option, index) => ({
      id: typeof option?.id === "string" ? option.id : "",
      text: typeof option?.text === "string" ? option.text : "",
      position: Number.isInteger(option?.position) ? option.position : index + 1,
    })).filter((option) => option.id && option.text);
  } catch { return []; }
}

function correctIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) return value;
  const input = text(value, 12).toUpperCase();
  if (/^[0-3]$/.test(input)) return Number(input);
  if (/^[1-4]$/.test(input)) return Number(input) - 1;
  if (/^[A-D]$/.test(input)) return input.charCodeAt(0) - 65;
  return null;
}

function questionInput(source: Row): { prompt: string; explanation: string; difficulty: Difficulty | null; image: { value: string | null } | { error: string }; options: Array<{ text: string; isCorrect: boolean }> | null; unitId: string; topicId: string } {
  const rawOptions = Array.isArray(source.options) ? source.options : Array.isArray(source.answers) ? source.answers : null;
  const explicitIndex = correctIndex(source.correctOptionIndex ?? source.correctOption ?? source.correctAnswer);
  const options = rawOptions ? rawOptions.map((option, index) => {
    const item = record(option);
    const optionText = item ? text(item.text ?? item.label ?? item.value, 1000) : text(option, 1000);
    return { text: optionText, isCorrect: Boolean(item?.isCorrect ?? item?.correct) || explicitIndex === index };
  }) : null;
  return {
    prompt: sanitizeRichTextHtml(longText(source.prompt ?? source.question ?? source.statement, 6000)),
    explanation: sanitizeRichTextHtml(longText(source.explanation ?? source.explicacao, 8000)),
    difficulty: optionalDifficulty(source.difficulty),
    image: readImage(source.imageUrl ?? source.image ?? source.imageDataUrl),
    options,
    unitId: text(source.curricularUnitId ?? source.unitId, 100),
    topicId: text(source.topicId ?? source.themeId, 100),
  };
}

function validateQuestion(input: ReturnType<typeof questionInput>, requireOptions = true): string | null {
  if (richTextPlainText(input.prompt).length < 3) return "A pergunta deve ter pelo menos 3 caracteres.";
  if (!input.difficulty) return "A dificuldade deve ser fácil, média ou difícil.";
  if ("error" in input.image) return input.image.error;
  if (requireOptions) {
    if (!input.options || input.options.length < 2 || input.options.length > 4 || input.options.some((option) => option.text.length === 0)) return "Cada pergunta deve ter entre 2 e 4 opções preenchidas.";
    if (input.options.filter((option) => option.isCorrect).length !== 1) return "Cada pergunta deve ter exatamente uma opção correta.";
  }
  return null;
}

async function audit(env: QuizEnv, user: QuizUser, action: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,?,?,?)")
    .bind(actor(user), action, JSON.stringify(details), Date.now()).run();
}

async function activeUnit(env: QuizEnv, unitId: string): Promise<Row | null> {
  return env.DB.prepare("SELECT id,code,name,ects,study_year,semester FROM curricular_units WHERE id=? AND active=1").bind(unitId).first<Row>();
}

async function activeTopic(env: QuizEnv, topicId: string): Promise<Row | null> {
  return env.DB.prepare("SELECT id,curricular_unit_id,title,description,status,sort_order,deleted_at FROM quiz_topics WHERE id=? AND deleted_at IS NULL").bind(topicId).first<Row>();
}

function topicDto(item: Row) {
  return {
    id: item.id, unitId: item.curricular_unit_id, title: item.title, name: item.title, description: item.description,
    status: item.status, sortOrder: item.sort_order, questionCount: item.question_count ?? 0,
    publishedAt: item.published_at, archivedAt: item.archived_at, deletedAt: item.deleted_at,
    createdAt: item.created_at, updatedAt: item.updated_at,
  };
}

function questionDto(item: Row, options: QuizOption[], includeAnswer = false) {
  return {
    id: item.id, unitId: item.curricular_unit_id, topicId: item.topic_id, prompt: item.prompt, question: item.prompt,
    imageUrl: item.image_url, explanation: includeAnswer ? item.explanation : undefined, difficulty: item.difficulty,
    status: item.status, options,
    correctOptionId: includeAnswer ? item.correct_option_id : undefined,
    publishedAt: item.published_at, archivedAt: item.archived_at, deletedAt: item.deleted_at,
    createdAt: item.created_at, updatedAt: item.updated_at,
  };
}

function commentThreads(comments: PublicQuizComment[]): PublicQuizCommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, { ...comment, replies: [] as PublicQuizCommentThread[] }]));
  const threads: PublicQuizCommentThread[] = [];
  for (const comment of comments) {
    const node = byId.get(comment.id);
    if (!node) continue;
    const parent = comment.parentCommentId ? byId.get(comment.parentCommentId) : null;
    if (parent) parent.replies.push(node);
    else threads.push(node);
  }
  return threads;
}

async function optionsForQuestions(env: QuizEnv, questionIds: string[]): Promise<Map<string, ParsedOption[]>> {
  const output = new Map<string, ParsedOption[]>();
  if (!questionIds.length) return output;
  const placeholders = questionIds.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT id,question_id,option_text,position,is_correct FROM quiz_question_options WHERE question_id IN (${placeholders}) ORDER BY question_id,position`).bind(...questionIds).all();
  for (const item of result.results.map(row)) {
    const questionId = String(item.question_id);
    const values = output.get(questionId) || [];
    values.push({ id: String(item.id), text: String(item.option_text), position: Number(item.position), isCorrect: Number(item.is_correct) === 1 });
    output.set(questionId, values);
  }
  return output;
}

async function catalog(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
  const [unitsResult, topicsResult, recommendation] = await Promise.all([
    env.DB.prepare("SELECT cu.id,cu.code,cu.name,cu.ects,cu.study_year,cu.semester,COUNT(q.id) AS question_count FROM curricular_units cu JOIN quiz_questions q ON q.curricular_unit_id=cu.id AND q.status='published' AND q.deleted_at IS NULL JOIN quiz_topics t ON t.id=q.topic_id AND t.status='published' AND t.deleted_at IS NULL WHERE cu.active=1 GROUP BY cu.id ORDER BY cu.study_year,cu.semester,cu.name COLLATE NOCASE").all(),
    env.DB.prepare("SELECT t.*,cu.code AS unit_code,cu.name AS unit_name,COUNT(q.id) AS question_count FROM quiz_topics t JOIN curricular_units cu ON cu.id=t.curricular_unit_id JOIN quiz_questions q ON q.topic_id=t.id AND q.status='published' AND q.deleted_at IS NULL WHERE cu.active=1 AND t.status='published' AND t.deleted_at IS NULL GROUP BY t.id ORDER BY cu.study_year,cu.semester,t.sort_order,t.title COLLATE NOCASE").all(),
    enabled("quizzes.progress").then(async (progressEnabled) => progressEnabled ? env.DB.prepare("SELECT t.id,t.title,t.curricular_unit_id,cu.code AS unit_code,cu.name AS unit_name,COUNT(aq.question_id) AS attempted_count,SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id JOIN quiz_topics t ON t.id=aq.topic_id JOIN curricular_units cu ON cu.id=aq.curricular_unit_id WHERE a.user_id=? AND a.status='completed' AND aq.is_correct IS NOT NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1 GROUP BY t.id HAVING COUNT(aq.question_id)>0 ORDER BY (1.0 * SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) / COUNT(aq.question_id)) ASC, COUNT(aq.question_id) DESC LIMIT 1").bind(user.id).first<Row>() : null),
  ]);
  const units = unitsResult.results.map((item) => ({ id: item.id, code: item.code, name: item.name, ects: item.ects, year: item.study_year, semester: item.semester, questionCount: item.question_count }));
  const topics = topicsResult.results.map((item) => ({ ...topicDto(row(item)), unitCode: item.unit_code, unitName: item.unit_name }));
  return json({ units, topics, themes: topics, recommendedTopic: recommendation ? { id: recommendation.id, title: recommendation.title, unitId: recommendation.curricular_unit_id, unitCode: recommendation.unit_code, unitName: recommendation.unit_name, attemptedCount: recommendation.attempted_count, correctCount: recommendation.correct_count } : null });
}

async function publicQuestion(env: QuizEnv, user: QuizUser | null, id: string, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const question = await env.DB.prepare("SELECT q.*,NULL AS correct_option_id FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE q.id=? AND q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1").bind(id).first<Row>();
  if (!question) return json({ error: "Pergunta não encontrada." }, 404);
  const options = await optionsForQuestions(env, [id]);
  return json({ question: questionDto(question, (options.get(id) || []).map((option) => ({ id: option.id, text: option.text, position: option.position }))) });
}

function modeFrom(value: unknown, rawDifficulty: unknown): { mode: QuizMode | null; difficulty: Difficulty | null } {
  const input = text(value, 30).toLocaleLowerCase("pt-PT");
  const aliases: Record<string, QuizMode> = { quick: "quick", exam: "exam", topic: "topic", thematic: "topic", unseen: "unseen", new: "unseen", new_questions: "unseen", mistakes: "mistakes", wrong: "mistakes", erradas: "mistakes" };
  const mode = aliases[input] || null;
  return { mode, difficulty: optionalDifficulty(rawDifficulty) };
}

function attemptQuestionDto(item: Row, reveal: boolean) {
  const options = parseStoredOptions(item.options_json);
  return {
    id: item.question_id, questionId: item.question_id, position: item.position, prompt: item.prompt, question: item.prompt,
    imageUrl: item.image_url, difficulty: item.difficulty, topicId: item.topic_id, unitId: item.curricular_unit_id,
    options, selectedOptionId: item.selected_option_id,
    correctOptionId: reveal ? item.correct_option_id : undefined,
    correct: reveal && item.is_correct !== null && item.is_correct !== undefined ? Number(item.is_correct) === 1 : undefined,
    explanation: reveal ? item.explanation : undefined,
    answeredAt: item.answered_at,
  };
}

function attemptDto(item: Row) {
  let config: Row = {};
  try {
    const parsed = JSON.parse(String(item.config_json || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed as Row;
  } catch { /* A configuração é sempre escrita pelo Worker; ignora dados legados inválidos. */ }
  return {
    id: item.id, mode: item.mode, status: item.status, unitId: item.curricular_unit_id, topicId: item.topic_id,
    topicIds: Array.isArray(config.topicIds) ? config.topicIds.filter((id): id is string => typeof id === "string") : item.topic_id ? [item.topic_id] : [],
    difficulty: item.difficulty_filter, questionCount: item.question_count, answeredCount: item.answered_count,
    correctCount: item.correct_count, durationSeconds: item.duration_seconds, expiresAt: item.expires_at,
    startedAt: item.started_at, completedAt: item.completed_at,
    createdAt: item.created_at, updatedAt: item.updated_at,
  };
}

async function attemptDetail(env: QuizEnv, attempt: Row): Promise<Row> {
  const questions = await env.DB.prepare("SELECT * FROM quiz_attempt_questions WHERE attempt_id=? ORDER BY position").bind(attempt.id).all();
  const isExam = attempt.mode === "exam";
  return { ...attemptDto(attempt), questions: questions.results.map((item) => attemptQuestionDto(row(item), attempt.status !== "active" || !isExam)) };
}

async function completeAttempt(env: QuizEnv, user: QuizUser, attempt: Row): Promise<Row> {
  if (attempt.status !== "active") return attempt;
  const totals = await env.DB.prepare("SELECT COUNT(selected_option_id) AS answered_count,COALESCE(SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END),0) AS correct_count FROM quiz_attempt_questions WHERE attempt_id=?").bind(attempt.id).first<Row>();
  const now = Date.now();
  await env.DB.prepare("UPDATE quiz_attempts SET status='completed',answered_count=?,correct_count=?,completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=? AND user_id=? AND status='active'")
    .bind(totals?.answered_count || 0, totals?.correct_count || 0, now, now, attempt.id, user.id).run();
  return (await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attempt.id, user.id).first<Row>()) || attempt;
}

async function enforceAttemptExpiry(env: QuizEnv, user: QuizUser, attempt: Row): Promise<Row> {
  return attempt.status === "active" && typeof attempt.expires_at === "number" && attempt.expires_at <= Date.now() ? completeAttempt(env, user, attempt) : attempt;
}

async function createAttempt(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const { mode, difficulty } = modeFrom(body.mode, body.difficulty);
  const unitId = text(body.curricularUnitId ?? body.unitId, 100);
  const requestedTopicIds = Array.isArray(body.topicIds) ? body.topicIds.map((id) => text(id, 100)).filter(Boolean) : [];
  const singleTopicId = text(body.topicId ?? body.themeId, 100);
  const topicIds = [...new Set([...requestedTopicIds, ...(singleTopicId ? [singleTopicId] : [])])];
  const topicId = topicIds.length === 1 ? topicIds[0] : null;
  const requestedCount = Number(body.questionCount ?? body.count ?? MIN_TEST_QUESTIONS);
  if (!mode || !Number.isInteger(requestedCount) || requestedCount < MIN_TEST_QUESTIONS || requestedCount > MAX_TEST_QUESTIONS) {
    return json({ error: `O teste deve ter entre ${MIN_TEST_QUESTIONS} e ${MAX_TEST_QUESTIONS} perguntas.`, code: "invalid_question_count", minimum: MIN_TEST_QUESTIONS, maximum: MAX_TEST_QUESTIONS }, 400);
  }
  const durationSeconds = requestedCount * 60;
  if (mode === "topic" && !topicIds.length) return json({ error: "Escolha pelo menos um tema para o teste temático." }, 400);
  if (unitId && !await activeUnit(env, unitId)) return json({ error: "Unidade curricular inválida." }, 400);
  const selectedTopics = await Promise.all(topicIds.map((id) => activeTopic(env, id)));
  if (selectedTopics.some((topic) => !topic || (unitId && topic.curricular_unit_id !== unitId))) return json({ error: "Um ou mais temas são inválidos para a unidade curricular selecionada." }, 400);
  const topicClause = topicIds.length ? ` AND q.topic_id IN (${topicIds.map(() => "?").join(",")})` : "";
  const baseSql = " FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1 AND (?='' OR q.curricular_unit_id=?)" + topicClause + " AND (?='' OR q.difficulty=?)";
  const baseBinds: unknown[] = [unitId, unitId, ...topicIds, difficulty || "", difficulty || ""];
  const selectionSql = mode === "unseen"
    ? " AND NOT EXISTS (SELECT 1 FROM quiz_attempt_questions seen JOIN quiz_attempts seen_attempt ON seen_attempt.id=seen.attempt_id WHERE seen_attempt.user_id=? AND seen.question_id=q.id AND seen.selected_option_id IS NOT NULL)"
    : mode === "mistakes"
      ? " AND (SELECT COUNT(*) FROM quiz_attempt_questions mistaken JOIN quiz_attempts mistaken_attempt ON mistaken_attempt.id=mistaken.attempt_id WHERE mistaken_attempt.user_id=? AND mistaken.question_id=q.id AND mistaken.is_correct=0) > (SELECT COUNT(*) FROM quiz_attempt_questions corrected JOIN quiz_attempts corrected_attempt ON corrected_attempt.id=corrected.attempt_id WHERE corrected_attempt.user_id=? AND corrected.question_id=q.id AND corrected.is_correct=1)"
      : "";
  const selectionBinds: unknown[] = mode === "unseen" ? [user.id] : mode === "mistakes" ? [user.id, user.id] : [];
  const candidates = await env.DB.prepare("SELECT q.*" + baseSql + selectionSql + " ORDER BY RANDOM() LIMIT ?")
    .bind(...baseBinds, ...selectionBinds, requestedCount).all();
  if (mode === "mistakes" && candidates.results.length < requestedCount) return json({ error: "Não há perguntas erradas pessoais suficientes para este teste.", code: "not_enough_mistakes", available: candidates.results.length, required: requestedCount }, 409);
  if (mode === "unseen" && !candidates.results.length) {
    const total = await env.DB.prepare("SELECT COUNT(*) AS total" + baseSql).bind(...baseBinds).first<Row>();
    if (Number(total?.total || 0) > 0) return json({ error: "Já respondeu a todas as perguntas elegíveis.", code: "all_questions_seen", available: 0, total: total?.total || 0 }, 409);
  }
  if (!candidates.results.length) return json({ error: "Não existem perguntas publicadas para esta seleção." }, 404);
  if (candidates.results.length < requestedCount) return json({ error: "Não existem perguntas suficientes para preparar este teste.", code: "not_enough_questions", available: candidates.results.length, required: requestedCount }, 409);
  const candidateIds = candidates.results.map((item) => String(item.id));
  const optionsByQuestion = await optionsForQuestions(env, candidateIds);
  const snapshots: Array<{ question: Row; options: ParsedOption[] }> = [];
  for (const item of candidates.results.map(row)) {
    const options = optionsByQuestion.get(String(item.id)) || [];
    if (options.length >= 2 && options.length <= 4 && options.filter((option) => option.isCorrect).length === 1) snapshots.push({ question: item, options });
  }
  if (snapshots.length < requestedCount) return json({ error: "Não existem perguntas válidas suficientes para preparar este teste.", code: "not_enough_questions", available: snapshots.length, required: requestedCount }, 409);
  const now = Date.now(), attemptId = crypto.randomUUID(), expiresAt = durationSeconds ? now + durationSeconds * 1000 : null;
  const configJson = JSON.stringify({ topicIds, requestedCount, difficulty, durationSeconds });
  const statements: D1PreparedStatement[] = [env.DB.prepare("INSERT INTO quiz_attempts (id,user_id,mode,curricular_unit_id,topic_id,difficulty_filter,status,question_count,started_at,created_at,updated_at,config_json,duration_seconds,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(attemptId, user.id, mode, unitId || null, topicId, difficulty, "active", snapshots.length, now, now, now, configJson, durationSeconds, expiresAt)];
  snapshots.forEach(({ question, options }, index) => {
    const correct = options.find((option) => option.isCorrect)!;
    statements.push(env.DB.prepare("INSERT INTO quiz_attempt_questions (attempt_id,question_id,curricular_unit_id,topic_id,position,prompt,image_url,explanation,difficulty,options_json,correct_option_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(attemptId, question.id, question.curricular_unit_id, question.topic_id, index + 1, question.prompt, question.image_url, question.explanation, question.difficulty, JSON.stringify(options.map((option) => ({ id: option.id, text: option.text, position: option.position }))), correct.id));
  });
  await env.DB.batch(statements);
  const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  return json({ attempt: attempt ? await attemptDetail(env, attempt) : null }, 201);
}

async function getAttempts(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, id?: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled(id ? "quizzes.practice" : "quizzes.progress")) return disabled();
  if (id) {
    const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(id, user.id).first<Row>();
    return attempt ? json({ attempt: await attemptDetail(env, await enforceAttemptExpiry(env, user, attempt)) }) : json({ error: "Tentativa não encontrada." }, 404);
  }
  const result = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE user_id=? ORDER BY started_at DESC LIMIT 100").bind(user.id).all();
  const attempts = await Promise.all(result.results.map((item) => enforceAttemptExpiry(env, user, row(item))));
  return json({ attempts: attempts.map((item) => attemptDto(item)) });
}

async function answerAttempt(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const questionId = text(body.questionId, 100), optionId = text(body.optionId ?? body.answerId ?? body.selectedOptionId, 100);
  if (!questionId || !optionId) return json({ error: "Resposta inválida." }, 400);
  const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  if (!attempt) return json({ error: "Tentativa não encontrada." }, 404);
  const activeAttempt = await enforceAttemptExpiry(env, user, attempt);
  if (activeAttempt.status !== "active") return json({ error: "O tempo desta tentativa terminou.", code: "attempt_expired" }, 409);
  const question = await env.DB.prepare("SELECT * FROM quiz_attempt_questions WHERE attempt_id=? AND question_id=?").bind(attemptId, questionId).first<Row>();
  if (!question || !parseStoredOptions(question.options_json).some((option) => option.id === optionId)) return json({ error: "A opção não pertence a esta pergunta." }, 400);
  if (activeAttempt.mode !== "exam" && question.selected_option_id !== null) return json({ error: "A resposta já recebeu feedback e não pode ser alterada.", code: "answer_locked" }, 409);
  const correct = optionId === question.correct_option_id ? 1 : 0, now = Date.now();
  await env.DB.prepare("UPDATE quiz_attempt_questions SET selected_option_id=?,is_correct=?,answered_at=? WHERE attempt_id=? AND question_id=?").bind(optionId, correct, now, attemptId, questionId).run();
  const totals = await env.DB.prepare("SELECT COUNT(selected_option_id) AS answered_count,COALESCE(SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END),0) AS correct_count FROM quiz_attempt_questions WHERE attempt_id=?").bind(attemptId).first<Row>();
  await env.DB.prepare("UPDATE quiz_attempts SET answered_count=?,correct_count=?,updated_at=? WHERE id=? AND user_id=?").bind(totals?.answered_count || 0, totals?.correct_count || 0, now, attemptId, user.id).run();
  const answer: Row = { questionId, selectedOptionId: optionId };
  if (activeAttempt.mode !== "exam") answer.correct = correct === 1;
  return json(activeAttempt.mode !== "exam" ? { answer, question: { id: questionId, correctOptionId: question.correct_option_id, explanation: question.explanation } } : { answer });
}

async function finishAttempt(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  if (!attempt) return json({ error: "Tentativa não encontrada." }, 404);
  const completed = await completeAttempt(env, user, attempt);
  return json({ attempt: await attemptDetail(env, completed) });
}

async function abandonAttempt(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  if (!attempt) return json({ error: "Tentativa não encontrada." }, 404);
  if (attempt.status === "completed") return json({ error: "Este teste já foi concluído.", code: "attempt_completed" }, 409);
  if (attempt.status === "active") {
    const now = Date.now();
    await env.DB.prepare("UPDATE quiz_attempts SET status='abandoned',updated_at=? WHERE id=? AND user_id=? AND status='active'").bind(now, attemptId, user.id).run();
  }
  const abandoned = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  return json({ attempt: abandoned ? await attemptDetail(env, abandoned) : null });
}

async function progress(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.progress")) return disabled();
  const [summary, topics, mistakes, recentAttemptsResult] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) AS attempt_count,
      COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) AS completed_count,
      COALESCE(SUM(answered_count),0) AS answered_count,
      COALESCE(SUM(correct_count),0) AS correct_count,
      COALESCE(SUM(CASE WHEN status='completed' THEN CAST(MAX(COALESCE(completed_at,started_at)-started_at,0)/1000 AS INTEGER) ELSE 0 END),0) AS total_duration_seconds,
      AVG(CASE WHEN status='completed' THEN CAST(MAX(COALESCE(completed_at,started_at)-started_at,0)/1000 AS INTEGER) END) AS average_duration_seconds,
      COALESCE(SUM(CASE WHEN status='completed' AND correct_count*2>=question_count THEN 1 ELSE 0 END),0) AS passed_count,
      (SELECT COUNT(DISTINCT aq.question_id)
       FROM quiz_attempt_questions aq
       JOIN quiz_attempts completed ON completed.id=aq.attempt_id
       WHERE completed.user_id=? AND completed.status='completed' AND aq.selected_option_id IS NOT NULL) AS unique_question_count
      FROM quiz_attempts
      WHERE user_id=?`).bind(user.id, user.id).first<Row>(),
    env.DB.prepare("SELECT aq.topic_id,t.title,aq.curricular_unit_id,cu.code AS unit_code,COUNT(aq.question_id) AS answered_count,SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id LEFT JOIN quiz_topics t ON t.id=aq.topic_id LEFT JOIN curricular_units cu ON cu.id=aq.curricular_unit_id WHERE a.user_id=? AND a.status='completed' AND aq.is_correct IS NOT NULL GROUP BY aq.topic_id ORDER BY (1.0 * SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) / COUNT(aq.question_id)) ASC, answered_count DESC").bind(user.id).all(),
    env.DB.prepare("SELECT q.id,q.prompt,q.image_url,q.difficulty,t.id AS topic_id,t.title AS topic_title,cu.id AS unit_id,cu.code AS unit_code,MAX(aq.answered_at) AS last_answered_at FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id JOIN quiz_questions q ON q.id=aq.question_id JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE a.user_id=? AND aq.is_correct=0 AND q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL GROUP BY q.id ORDER BY last_answered_at DESC LIMIT 50").bind(user.id).all(),
    env.DB.prepare(`SELECT
      a.id,
      a.curricular_unit_id AS unit_id,
      cu.code AS unit_code,
      a.mode,
      a.question_count,
      a.answered_count,
      a.correct_count,
      a.started_at,
      a.completed_at,
      CAST(MAX(COALESCE(a.completed_at,a.started_at)-a.started_at,0)/1000 AS INTEGER) AS actual_duration_seconds
      FROM quiz_attempts a
      LEFT JOIN curricular_units cu ON cu.id=a.curricular_unit_id
      WHERE a.user_id=? AND a.status='completed'
      ORDER BY a.completed_at DESC,a.started_at DESC
      LIMIT 10`).bind(user.id).all(),
  ]);
  const totalAnswered = Number(summary?.answered_count || 0), totalCorrect = Number(summary?.correct_count || 0);
  const recentAttempts = recentAttemptsResult.results.map((item) => {
    const answeredCount = Number(item.answered_count || 0), correctCount = Number(item.correct_count || 0);
    return { id: item.id, unitId: item.unit_id, unitCode: item.unit_code, mode: item.mode, questionCount: Number(item.question_count || 0), answeredCount, correctCount, accuracy: answeredCount ? correctCount / answeredCount : null, startedAt: item.started_at, completedAt: item.completed_at, durationSeconds: Number(item.actual_duration_seconds || 0) };
  });
  const recentAnswered = recentAttempts.reduce((total, attempt) => total + attempt.answeredCount, 0);
  const recentCorrect = recentAttempts.reduce((total, attempt) => total + attempt.correctCount, 0);
  return json({ summary: { attemptCount: summary?.attempt_count || 0, completedCount: summary?.completed_count || 0, answeredCount: totalAnswered, correctCount: totalCorrect, accuracy: totalAnswered ? totalCorrect / totalAnswered : null, uniqueQuestionCount: Number(summary?.unique_question_count || 0), totalDurationSeconds: Number(summary?.total_duration_seconds || 0), averageDurationSeconds: summary?.average_duration_seconds === null || summary?.average_duration_seconds === undefined ? null : Math.round(Number(summary.average_duration_seconds)), passedCount: Number(summary?.passed_count || 0), recentAccuracy: recentAnswered ? recentCorrect / recentAnswered : null }, recentAttempts, topics: topics.results.map((item) => ({ topicId: item.topic_id, title: item.title, unitId: item.curricular_unit_id, unitCode: item.unit_code, answeredCount: item.answered_count, correctCount: item.correct_count, accuracy: Number(item.answered_count) ? Number(item.correct_count) / Number(item.answered_count) : null })), mistakes: mistakes.results.map((item) => ({ id: item.id, prompt: item.prompt, imageUrl: item.image_url, difficulty: item.difficulty, topicId: item.topic_id, topicTitle: item.topic_title, unitId: item.unit_id, unitCode: item.unit_code, lastAnsweredAt: item.last_answered_at })) });
}

async function publicComments(request: Request, env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker, pathQuestionId?: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  if (request.method === "GET") {
    const questionId = pathQuestionId || text(url.searchParams.get("questionId"), 100);
    if (!questionId) return json({ error: "Indique a pergunta." }, 400);
    const result = await env.DB.prepare("SELECT c.id,c.question_id,c.parent_comment_id,c.body,c.created_at,c.updated_at,u.full_name AS author_name,u.role AS author_role,p.id AS parent_id,pu.full_name AS parent_author_name,pu.role AS parent_author_role FROM quiz_comments c JOIN users u ON u.id=c.author_user_id LEFT JOIN quiz_comments p ON p.id=c.parent_comment_id AND p.question_id=c.question_id AND p.deleted_at IS NULL LEFT JOIN users pu ON pu.id=p.author_user_id WHERE c.question_id=? AND c.deleted_at IS NULL AND c.status='published' ORDER BY c.created_at ASC,c.id ASC").bind(questionId).all();
    const comments: PublicQuizComment[] = result.results.map((item) => {
      const parentCommentId = item.parent_comment_id ? String(item.parent_comment_id) : null;
      const parentId = item.parent_id ? String(item.parent_id) : null;
      const authorRole = String(item.author_role);
      const parentAuthorRole = String(item.parent_author_role || "");
      return { id: String(item.id), questionId: String(item.question_id), parentCommentId, parentId, replyTo: parentId ? { id: parentId, authorName: String(item.parent_author_name), authorRole: parentAuthorRole, isAdmin: parentAuthorRole === "admin" } : null, body: String(item.body), status: "published", authorName: String(item.author_name), authorRole, isAdmin: authorRole === "admin", createdAt: Number(item.created_at), updatedAt: Number(item.updated_at) };
    });
    return json({ comments, threads: commentThreads(comments) });
  }
  if (request.method !== "POST") return json({ error: "Operação não suportada." }, 405);
  const body = await bodyJson(request);
  const questionId = pathQuestionId || text(body?.questionId, 100);
  const message = sanitizeRichTextHtml(longText(body?.body ?? body?.comment, 5000));
  const messageLength = richTextPlainText(message).length;
  const parentCommentId = text(body?.parentCommentId ?? body?.parentId ?? body?.replyToCommentId, 100);
  if (!questionId || messageLength < 2 || messageLength > 1200) return json({ error: "O comentário deve ter entre 2 e 1200 caracteres." }, 400);
  const question = await env.DB.prepare("SELECT q.id FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id WHERE q.id=? AND q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL").bind(questionId).first();
  if (!question) return json({ error: "A pergunta não está disponível para comentários." }, 404);
  const parent = parentCommentId ? await env.DB.prepare("SELECT c.id,u.full_name AS author_name,u.role AS author_role FROM quiz_comments c JOIN users u ON u.id=c.author_user_id WHERE c.id=? AND c.question_id=? AND c.status='published' AND c.deleted_at IS NULL").bind(parentCommentId, questionId).first<Row>() : null;
  if (parentCommentId && !parent) return json({ error: "A resposta tem de referir um comentário publicado desta pergunta." }, 400);
  const now = Date.now(), id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO quiz_comments (id,question_id,parent_comment_id,author_user_id,body,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)").bind(id, questionId, parentCommentId || null, user.id, message, now, now).run();
  const authorRole = user.role;
  const replyTo = parent ? { id: String(parent.id), authorName: String(parent.author_name), authorRole: String(parent.author_role), isAdmin: parent.author_role === "admin" } : null;
  return json({ comment: { id, questionId, parentCommentId: parentCommentId || null, parentId: parentCommentId || null, replyTo, body: message, status: "published", authorName: user.fullName, authorRole, isAdmin: authorRole === "admin", createdAt: now, updatedAt: now } }, 201);
}

async function adminCatalog(request: Request, env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
  if (!await enabled("quizzes.management")) return disabled();
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
  const unitId = text(url.searchParams.get("unitId"), 100);
  const topicId = text(url.searchParams.get("topicId") ?? url.searchParams.get("themeId"), 100);
  const statusParam = text(url.searchParams.get("status"), 20).toLocaleLowerCase("pt-PT");
  const status = statusParam && statusParam !== "all" ? normalizeStatus(statusParam, "") : null;
  const query = text(url.searchParams.get("query") ?? url.searchParams.get("search"), 120);
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";
  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const requestedPageSize = Number.parseInt(url.searchParams.get("pageSize") || "25", 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const pageSize = ADMIN_QUESTION_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 25;
  if (statusParam && statusParam !== "all" && !status) return json({ error: "Estado de pergunta inválido." }, 400);

  const where = includeDeleted ? [] : ["q.deleted_at IS NULL"];
  const bindings: (string | number)[] = [];
  if (unitId) { where.push("q.curricular_unit_id=?"); bindings.push(unitId); }
  if (topicId) { where.push("q.topic_id=?"); bindings.push(topicId); }
  if (status) { where.push("q.status=?"); bindings.push(status); }
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(q.prompt LIKE ? ESCAPE '\\' COLLATE NOCASE OR t.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR cu.code LIKE ? ESCAPE '\\' COLLATE NOCASE OR cu.name LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    bindings.push(pattern, pattern, pattern, pattern);
  }
  const fromSql = " FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id";
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const unitsPromise = env.DB.prepare("SELECT id,code,name,ects,study_year,semester FROM curricular_units WHERE active=1 ORDER BY study_year,semester,name COLLATE NOCASE").all();
  const topicsPromise = env.DB.prepare("SELECT t.*,cu.code AS unit_code,cu.name AS unit_name,COUNT(q.id) AS question_count FROM quiz_topics t JOIN curricular_units cu ON cu.id=t.curricular_unit_id LEFT JOIN quiz_questions q ON q.topic_id=t.id AND q.deleted_at IS NULL WHERE (?=1 OR t.deleted_at IS NULL) GROUP BY t.id ORDER BY cu.study_year,cu.semester,t.sort_order,t.title COLLATE NOCASE LIMIT 2000").bind(includeDeleted ? 1 : 0).all();
  const importsPromise = env.DB.prepare("SELECT i.*,cu.code AS unit_code,cu.name AS unit_name,u.full_name AS imported_by_name FROM quiz_imports i LEFT JOIN curricular_units cu ON cu.id=i.curricular_unit_id JOIN users u ON u.id=i.imported_by ORDER BY i.created_at DESC LIMIT 100").all();
  const auditHistoryPromise = env.DB.prepare("SELECT a.id,a.action,a.details,a.created_at,u.full_name AS actor_name FROM admin_audit_log a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.action LIKE 'quiz_%' ORDER BY a.created_at DESC LIMIT 100").all();
  const [units, topics, questionCount, imports, auditHistory] = await Promise.all([
    unitsPromise,
    topicsPromise,
    env.DB.prepare(`SELECT COUNT(*) AS total${fromSql}${whereSql}`).bind(...bindings).first<Row>(),
    importsPromise,
    auditHistoryPromise,
  ]);
  const total = Number(questionCount?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const offset = (effectivePage - 1) * pageSize;
  const questions = await env.DB.prepare(`SELECT q.*,NULL AS correct_option_id,t.title AS topic_title,cu.code AS unit_code,cu.name AS unit_name${fromSql}${whereSql} ORDER BY q.updated_at DESC,q.id ASC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all();
  const optionMap = await optionsForQuestions(env, questions.results.map((item) => String(item.id)));
  const mappedTopics = topics.results.map((item) => ({ ...topicDto(row(item)), unitCode: item.unit_code, unitName: item.unit_name }));
  const mappedQuestions = questions.results.map((item) => {
    const options = optionMap.get(String(item.id)) || [];
    const correct = options.find((option) => option.isCorrect)?.id || null;
    return { ...questionDto({ ...row(item), correct_option_id: correct }, options.map((option) => ({ id: option.id, text: option.text, position: option.position })), true), topicTitle: item.topic_title, unitCode: item.unit_code, unitName: item.unit_name };
  });
  const importHistory = imports.results.map((item) => ({ id: item.id, filename: item.filename, unitId: item.curricular_unit_id, unitCode: item.unit_code, unitName: item.unit_name, rowCount: item.row_count, topicsCreated: item.topics_created, questionsCreated: item.questions_created, importedBy: item.imported_by_name, createdAt: item.created_at }));
  const history = auditHistory.results.map((item) => ({ id: item.id, action: item.action, details: item.details, actorName: item.actor_name, createdAt: item.created_at }));
  return json({ units: units.results.map((item) => ({ id: item.id, code: item.code, name: item.name, ects: item.ects, year: item.study_year, semester: item.semester })), topics: mappedTopics, themes: mappedTopics, questions: mappedQuestions, pagination: { page: effectivePage, pageSize, total, totalPages, from: total ? offset + 1 : 0, to: Math.min(offset + mappedQuestions.length, total) }, filters: { unitId, topicId, status: status || "all", query }, comments: [], commentModeration: { enabled: false }, imports: importHistory, history, activity: history });
}

async function createTopic(env: QuizEnv, user: QuizUser, source: Row): Promise<Response> {
  const unitId = text(source.curricularUnitId ?? source.unitId, 100), title = text(source.title ?? source.name ?? source.theme, 180), description = longText(source.description, 2000), status = normalizeStatus(source.status);
  const sortOrder = Number(source.sortOrder ?? source.order ?? 0);
  if (!unitId || !title || !status || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000 || !await activeUnit(env, unitId)) return json({ error: "Dados do tema inválidos." }, 400);
  const id = crypto.randomUUID(), now = Date.now();
  try {
    await env.DB.prepare("INSERT INTO quiz_topics (id,curricular_unit_id,title,description,status,sort_order,published_at,published_by,archived_at,archived_by,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, unitId, title, description, status, sortOrder, status === "published" ? now : null, status === "published" ? actor(user) : null, status === "archived" ? now : null, status === "archived" ? actor(user) : null, actor(user), actor(user), now, now).run();
  } catch { return json({ error: "Já existe um tema com este nome nesta unidade curricular." }, 409); }
  await audit(env, user, "quiz_topic_created", { id, unitId, status });
  return json({ topic: { id, unitId, title, name: title, description, status, sortOrder, createdAt: now, updatedAt: now } }, 201);
}

async function createQuestion(env: QuizEnv, user: QuizUser, source: Row): Promise<Response> {
  const input = questionInput(source), error = validateQuestion(input);
  if (error || !input.unitId || !input.topicId || !input.options || !input.difficulty || "error" in input.image) return json({ error: error || "Dados da pergunta inválidos." }, 400);
  const topic = await activeTopic(env, input.topicId);
  if (!topic || topic.curricular_unit_id !== input.unitId || !await activeUnit(env, input.unitId)) return json({ error: "Tema ou unidade curricular inválidos." }, 400);
  const status = normalizeStatus(source.status);
  if (!status) return json({ error: "Estado da pergunta inválido." }, 400);
  const id = crypto.randomUUID(), now = Date.now(), imageUrl = input.image.value;
  const statements: D1PreparedStatement[] = [env.DB.prepare("INSERT INTO quiz_questions (id,curricular_unit_id,topic_id,prompt,image_url,explanation,difficulty,status,published_at,published_by,archived_at,archived_by,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, input.unitId, input.topicId, input.prompt, imageUrl, input.explanation, input.difficulty, status, status === "published" ? now : null, status === "published" ? actor(user) : null, status === "archived" ? now : null, status === "archived" ? actor(user) : null, actor(user), actor(user), now, now)];
  input.options.forEach((option, index) => statements.push(env.DB.prepare("INSERT INTO quiz_question_options (id,question_id,option_text,position,is_correct) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, option.text, index + 1, option.isCorrect ? 1 : 0)));
  await env.DB.batch(statements);
  await audit(env, user, "quiz_question_created", { id, unitId: input.unitId, topicId: input.topicId, status });
  return json({ question: { id, unitId: input.unitId, topicId: input.topicId, prompt: input.prompt, imageUrl, explanation: input.explanation, difficulty: input.difficulty, status } }, 201);
}

async function importQuestions(env: QuizEnv, user: QuizUser, rowsValue: unknown, filenameValue: unknown): Promise<Response> {
  if (!Array.isArray(rowsValue) || !rowsValue.length || rowsValue.length > MAX_IMPORT_ROWS) return json({ error: `A importação deve conter entre 1 e ${MAX_IMPORT_ROWS} perguntas.` }, 400);
  const [unitRows, topicRows] = await Promise.all([
    env.DB.prepare("SELECT id,code FROM curricular_units WHERE active=1").all(),
    env.DB.prepare("SELECT id,curricular_unit_id,title,status FROM quiz_topics WHERE deleted_at IS NULL").all(),
  ]);
  const unitsById = new Map(unitRows.results.map((item) => [String(item.id), item]));
  const unitsByCode = new Map(unitRows.results.map((item) => [String(item.code).toLocaleUpperCase("pt-PT"), item]));
  const topicByKey = new Map(topicRows.results.map((item) => [`${item.curricular_unit_id}\u0000${String(item.title).toLocaleLowerCase("pt-PT")}`, item]));
  const createdTopics = new Map<string, { id: string; unitId: string; title: string; status: "draft" | "published" | "archived" }>();
  const prepared: Array<{ row: number; input: ReturnType<typeof questionInput>; unitId: string; topicId: string; status: "draft" | "published" | "archived" }> = [];
  const errors: Array<{ row: number; message: string }> = [];
  rowsValue.forEach((value, index) => {
    const source = record(value);
    const rowNumber = Number(source?.row) || index + 1;
    if (!source) { errors.push({ row: rowNumber, message: "A linha não é um objeto JSON válido." }); return; }
    const input = questionInput({ ...source, unitId: source.unitId ?? source.curricularUnitId, topicId: source.topicId });
    const unit = input.unitId ? unitsById.get(input.unitId) : unitsByCode.get(text(source.unitCode ?? source.unit_code, 60).toLocaleUpperCase("pt-PT"));
    const theme = text(source.theme ?? source.topic ?? source.topicTitle, 180);
    const status = normalizeStatus(source.status);
    const questionError = validateQuestion(input);
    if (!unit) errors.push({ row: rowNumber, message: "A unidade curricular não foi encontrada ou não está ativa." });
    if (!input.topicId && !theme) errors.push({ row: rowNumber, message: "Indique o tema da pergunta." });
    if (questionError || !status) errors.push({ row: rowNumber, message: questionError || "Estado da pergunta inválido." });
    if (!unit || (!input.topicId && !theme) || questionError || !status) return;
    let topicId = input.topicId;
    if (topicId) {
      const topic = topicRows.results.find((item) => item.id === topicId);
      if (!topic || topic.curricular_unit_id !== unit.id) { errors.push({ row: rowNumber, message: "O tema não pertence à unidade curricular indicada." }); return; }
    } else {
      const key = `${unit.id}\u0000${theme.toLocaleLowerCase("pt-PT")}`;
      const existing = topicByKey.get(key) || createdTopics.get(key);
      if (existing) topicId = String(existing.id);
      else {
        topicId = crypto.randomUUID();
        createdTopics.set(key, { id: topicId, unitId: String(unit.id), title: theme, status });
      }
    }
    prepared.push({ row: rowNumber, input: { ...input, unitId: String(unit.id), topicId }, unitId: String(unit.id), topicId, status });
  });
  if (errors.length) return json({ error: "A importação contém linhas inválidas.", errors }, 400);
  const now = Date.now(), statements: D1PreparedStatement[] = [];
  for (const topic of createdTopics.values()) statements.push(env.DB.prepare("INSERT INTO quiz_topics (id,curricular_unit_id,title,status,published_at,published_by,archived_at,archived_by,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(topic.id, topic.unitId, topic.title, topic.status, topic.status === "published" ? now : null, topic.status === "published" ? actor(user) : null, topic.status === "archived" ? now : null, topic.status === "archived" ? actor(user) : null, actor(user), actor(user), now, now));
  for (const item of prepared) {
    const id = crypto.randomUUID(), imageUrl = "value" in item.input.image ? item.input.image.value : null;
    statements.push(env.DB.prepare("INSERT INTO quiz_questions (id,curricular_unit_id,topic_id,prompt,image_url,explanation,difficulty,status,published_at,published_by,archived_at,archived_by,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, item.unitId, item.topicId, item.input.prompt, imageUrl, item.input.explanation, item.input.difficulty, item.status, item.status === "published" ? now : null, item.status === "published" ? actor(user) : null, item.status === "archived" ? now : null, item.status === "archived" ? actor(user) : null, actor(user), actor(user), now, now));
    item.input.options!.forEach((option, index) => statements.push(env.DB.prepare("INSERT INTO quiz_question_options (id,question_id,option_text,position,is_correct) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, option.text, index + 1, option.isCorrect ? 1 : 0)));
  }
  const importedUnitIds = [...new Set(prepared.map((item) => item.unitId))];
  const filename = text(filenameValue, 180) || "importacao-perguntas.csv";
  const importId = crypto.randomUUID();
  statements.push(env.DB.prepare("INSERT INTO quiz_imports (id,filename,curricular_unit_id,row_count,topics_created,questions_created,imported_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(importId, filename, importedUnitIds.length === 1 ? importedUnitIds[0] : null, prepared.length, createdTopics.size, prepared.length, actor(user), now));
  await env.DB.batch(statements);
  await audit(env, user, "quiz_questions_imported", { importId, filename, count: prepared.length, topicsCreated: createdTopics.size });
  return json({ ok: true, importId, imported: prepared.length, topicsCreated: createdTopics.size }, 201);
}

async function adminCreate(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
  if (!await enabled("quizzes.management")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const action = text(body.action, 40).toLocaleLowerCase("pt-PT");
  if (["create_topic", "create_theme", "createtopic"].includes(action)) return createTopic(env, user, record(body.topic ?? body.theme) || body);
  if (["create_question", "createquestion"].includes(action)) return createQuestion(env, user, record(body.question) || body);
  if (action === "import") return importQuestions(env, user, body.rows ?? body.questions, body.filename ?? body.fileName);
  return json({ error: "Ação de criação inválida." }, 400);
}

async function updateTopic(env: QuizEnv, user: QuizUser, source: Row): Promise<Response> {
  const id = text(source.id ?? source.topicId ?? source.themeId, 100), current = id ? await activeTopic(env, id) : null;
  if (!current) return json({ error: "Tema não encontrado." }, 404);
  const unitId = has(source, "curricularUnitId") || has(source, "unitId") ? text(source.curricularUnitId ?? source.unitId, 100) : String(current.curricular_unit_id);
  const title = has(source, "title") || has(source, "name") || has(source, "theme") ? text(source.title ?? source.name ?? source.theme, 180) : String(current.title);
  const description = has(source, "description") ? longText(source.description, 2000) : String(current.description || "");
  const status = has(source, "status") ? normalizeStatus(source.status) : normalizeStatus(current.status);
  const sortOrder = has(source, "sortOrder") || has(source, "order") ? Number(source.sortOrder ?? source.order) : Number(current.sort_order || 0);
  if (!unitId || !title || !status || !Number.isInteger(sortOrder) || sortOrder < 0 || !await activeUnit(env, unitId)) return json({ error: "Dados do tema inválidos." }, 400);
  const now = Date.now();
  try {
    await env.DB.prepare("UPDATE quiz_topics SET curricular_unit_id=?,title=?,description=?,status=?,sort_order=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,published_by=CASE WHEN ?='published' THEN COALESCE(published_by,?) ELSE published_by END,archived_at=CASE WHEN ?='archived' THEN ? ELSE archived_at END,archived_by=CASE WHEN ?='archived' THEN ? ELSE archived_by END,updated_by=?,updated_at=? WHERE id=? AND deleted_at IS NULL")
      .bind(unitId, title, description, status, sortOrder, status, now, status, actor(user), status, now, status, actor(user), actor(user), now, id).run();
  } catch { return json({ error: "Já existe um tema com este nome nesta unidade curricular." }, 409); }
  await audit(env, user, "quiz_topic_updated", { id, unitId, status });
  return json({ ok: true, id });
}

async function updateQuestion(env: QuizEnv, user: QuizUser, source: Row): Promise<Response> {
  const id = text(source.id ?? source.questionId, 100);
  const current = id ? await env.DB.prepare("SELECT * FROM quiz_questions WHERE id=? AND deleted_at IS NULL").bind(id).first<Row>() : null;
  if (!current) return json({ error: "Pergunta não encontrada." }, 404);
  const input = questionInput(source);
  const hasOptions = has(source, "options") || has(source, "answers");
  const imageProvided = has(source, "imageUrl") || has(source, "image") || has(source, "imageDataUrl");
  const merged = {
    ...input,
    prompt: has(source, "prompt") || has(source, "question") || has(source, "statement") ? input.prompt : String(current.prompt),
    explanation: has(source, "explanation") || has(source, "explicacao") ? input.explanation : String(current.explanation || ""),
    difficulty: has(source, "difficulty") ? input.difficulty : optionalDifficulty(current.difficulty),
    image: imageProvided ? input.image : { value: current.image_url === null ? null : String(current.image_url) },
    unitId: has(source, "curricularUnitId") || has(source, "unitId") ? input.unitId : String(current.curricular_unit_id),
    topicId: has(source, "topicId") || has(source, "themeId") ? input.topicId : String(current.topic_id),
  };
  const error = validateQuestion(merged, hasOptions);
  const status = has(source, "status") ? normalizeStatus(source.status) : normalizeStatus(current.status);
  if (error || !status || !merged.difficulty || !merged.unitId || !merged.topicId || "error" in merged.image) return json({ error: error || "Dados da pergunta inválidos." }, 400);
  const topic = await activeTopic(env, merged.topicId);
  if (!topic || topic.curricular_unit_id !== merged.unitId || !await activeUnit(env, merged.unitId)) return json({ error: "Tema ou unidade curricular inválidos." }, 400);
  const now = Date.now(), imageUrl = merged.image.value;
  const statements: D1PreparedStatement[] = [env.DB.prepare("UPDATE quiz_questions SET curricular_unit_id=?,topic_id=?,prompt=?,image_url=?,explanation=?,difficulty=?,status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,published_by=CASE WHEN ?='published' THEN COALESCE(published_by,?) ELSE published_by END,archived_at=CASE WHEN ?='archived' THEN ? ELSE archived_at END,archived_by=CASE WHEN ?='archived' THEN ? ELSE archived_by END,updated_by=?,updated_at=? WHERE id=? AND deleted_at IS NULL")
    .bind(merged.unitId, merged.topicId, merged.prompt, imageUrl, merged.explanation, merged.difficulty, status, status, now, status, actor(user), status, now, status, actor(user), actor(user), now, id)];
  if (hasOptions && merged.options) {
    statements.push(env.DB.prepare("DELETE FROM quiz_question_options WHERE question_id=?").bind(id));
    merged.options.forEach((option, index) => statements.push(env.DB.prepare("INSERT INTO quiz_question_options (id,question_id,option_text,position,is_correct) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, option.text, index + 1, option.isCorrect ? 1 : 0)));
  }
  await env.DB.batch(statements);
  await audit(env, user, "quiz_question_updated", { id, unitId: merged.unitId, topicId: merged.topicId, status, optionsReplaced: hasOptions });
  return json({ ok: true, id });
}

async function adminUpdate(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
  if (!await enabled("quizzes.management")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const action = text(body.action, 40).toLocaleLowerCase("pt-PT");
  if (["update_topic", "update_theme", "updatetopic"].includes(action)) return updateTopic(env, user, record(body.topic ?? body.theme) || body);
  if (["update_question", "updatequestion"].includes(action)) return updateQuestion(env, user, record(body.question) || body);
  return json({ error: "Ação de atualização inválida." }, 400);
}

async function bulkAction(env: QuizEnv, user: QuizUser, source: Row): Promise<Response> {
  const action = text(source.action, 20), entity = text(source.entity ?? source.type, 20).replace("themes", "topics");
  const ids = Array.isArray(source.ids) ? source.ids.map((id) => text(id, 100)).filter(Boolean).slice(0, 200) : [];
  if (!ids.length || !["publish", "archive", "delete"].includes(action) || !["topics", "topic", "questions", "question"].includes(entity)) return json({ error: "Ação em lote inválida." }, 400);
  const now = Date.now(), placeholders = ids.map(() => "?").join(","), isTopic = entity.startsWith("topic");
  const table = isTopic ? "quiz_topics" : "quiz_questions";
  const statements: D1PreparedStatement[] = [];
  if (action === "publish") statements.push(env.DB.prepare(`UPDATE ${table} SET status='published',published_at=COALESCE(published_at,?),published_by=COALESCE(published_by,?),updated_by=?,updated_at=? WHERE id IN (${placeholders}) AND deleted_at IS NULL`).bind(now, actor(user), actor(user), now, ...ids));
  if (action === "archive") statements.push(env.DB.prepare(`UPDATE ${table} SET status='archived',archived_at=?,archived_by=?,updated_by=?,updated_at=? WHERE id IN (${placeholders}) AND deleted_at IS NULL`).bind(now, actor(user), actor(user), now, ...ids));
  if (action === "delete") statements.push(env.DB.prepare(`UPDATE ${table} SET status='archived',deleted_at=?,deleted_by=?,archived_at=?,archived_by=?,updated_by=?,updated_at=? WHERE id IN (${placeholders}) AND deleted_at IS NULL`).bind(now, actor(user), now, actor(user), actor(user), now, ...ids));
  if (isTopic) {
    const condition = `topic_id IN (${placeholders}) AND deleted_at IS NULL`;
    if (action === "publish") statements.push(env.DB.prepare(`UPDATE quiz_questions SET status='published',published_at=COALESCE(published_at,?),published_by=COALESCE(published_by,?),updated_by=?,updated_at=? WHERE ${condition}`).bind(now, actor(user), actor(user), now, ...ids));
    if (action === "archive") statements.push(env.DB.prepare(`UPDATE quiz_questions SET status='archived',archived_at=?,archived_by=?,updated_by=?,updated_at=? WHERE ${condition}`).bind(now, actor(user), actor(user), now, ...ids));
    if (action === "delete") statements.push(env.DB.prepare(`UPDATE quiz_questions SET status='archived',deleted_at=?,deleted_by=?,archived_at=?,archived_by=?,updated_by=?,updated_at=? WHERE ${condition}`).bind(now, actor(user), now, actor(user), actor(user), now, ...ids));
  }
  const results = await env.DB.batch(statements);
  const changed = results.reduce((count, result) => count + Number(result.meta.changes || 0), 0);
  await audit(env, user, `quiz_${isTopic ? "topics" : "questions"}_${action}d`, { ids, changed });
  return json({ ok: true, changed });
}

async function adminDelete(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
  if (!await enabled("quizzes.management")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const action = text(body.action, 40).toLocaleLowerCase("pt-PT");
  const questionId = text(body.id ?? body.questionId, 100), topicId = text(body.id ?? body.topicId ?? body.themeId, 100);
  if (["delete_question", "deletequestion"].includes(action) || body.entity === "question") return bulkAction(env, user, { action: "delete", entity: "questions", ids: [questionId] });
  if (["delete_topic", "delete_theme", "deletetopic"].includes(action) || body.entity === "topic") return bulkAction(env, user, { action: "delete", entity: "topics", ids: [topicId] });
  return json({ error: "Ação de eliminação inválida." }, 400);
}

function adminCommentsDisabled(user: QuizUser | null): Response {
  if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
  return json({ error: "A moderação administrativa de comentários de testes foi desativada. Os comentários são publicados imediatamente.", code: "QUIZ_COMMENT_MODERATION_DISABLED" }, 410);
}

export function isQuizPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === "/api/quizzes" || /^\/api\/quizzes\/[^/]+$/.test(path) || /^\/api\/quizzes\/[^/]+\/comments$/.test(path) || path === "/api/quiz-attempts" || /^\/api\/quiz-attempts\/[^/]+$/.test(path) || /^\/api\/quiz-attempts\/[^/]+\/(answers|finish|abandon)$/.test(path) || path === "/api/quiz-progress" || path === "/api/quizzes/progress" || path === "/api/quiz-comments" || path === "/api/admin/quizzes" || path === "/api/admin/quizzes/bulk" || path === "/api/admin/quizzes/import" || path === "/api/admin/quizzes/comments" || path === "/api/admin/quiz-comments";
}

export async function handleQuizRoute(request: Request, env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (path === "/api/admin/quizzes" && request.method === "GET") return adminCatalog(request, env, url, user, enabled);
  if (path === "/api/admin/quizzes" && request.method === "POST") return adminCreate(request, env, user, enabled);
  if (path === "/api/admin/quizzes" && request.method === "PATCH") return adminUpdate(request, env, user, enabled);
  if (path === "/api/admin/quizzes" && request.method === "DELETE") return adminDelete(request, env, user, enabled);
  if (path === "/api/admin/quizzes/import" && request.method === "POST") {
    if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
    if (!await enabled("quizzes.management")) return disabled();
    const body = await bodyJson(request); return body ? importQuestions(env, user, body.rows ?? body.questions, body.filename ?? body.fileName) : json({ error: "Pedido JSON inválido." }, 400);
  }
  if (path === "/api/admin/quizzes/bulk" && request.method === "POST") {
    if (!isAdmin(user)) return user ? forbidden() : unauthenticated();
    if (!await enabled("quizzes.management")) return disabled();
    const body = await bodyJson(request); return body ? bulkAction(env, user, body) : json({ error: "Pedido JSON inválido." }, 400);
  }
  if (path === "/api/admin/quiz-comments" || path === "/api/admin/quizzes/comments") return adminCommentsDisabled(user);
  if (path === "/api/quizzes" && request.method === "GET") return catalog(request, env, user, enabled);
  if (path === "/api/quiz-progress" || path === "/api/quizzes/progress") return request.method === "GET" ? progress(env, user, enabled) : json({ error: "Operação não suportada." }, 405);
  if (path === "/api/quiz-attempts") {
    if (request.method === "POST") return createAttempt(request, env, user, enabled);
    if (request.method === "GET") return getAttempts(env, user, enabled);
  }
  const attemptAction = path.match(/^\/api\/quiz-attempts\/([^/]+)\/(answers|finish|abandon)$/);
  if (attemptAction) {
    if (attemptAction[2] === "answers" && request.method === "PUT") return answerAttempt(request, env, user, enabled, attemptAction[1]);
    if (attemptAction[2] === "finish" && request.method === "POST") return finishAttempt(env, user, enabled, attemptAction[1]);
    if (attemptAction[2] === "abandon" && request.method === "POST") return abandonAttempt(env, user, enabled, attemptAction[1]);
    return json({ error: "Operação não suportada." }, 405);
  }
  const attemptId = path.match(/^\/api\/quiz-attempts\/([^/]+)$/);
  if (attemptId) return request.method === "GET" ? getAttempts(env, user, enabled, attemptId[1]) : json({ error: "Operação não suportada." }, 405);
  if (path === "/api/quiz-comments") return publicComments(request, env, url, user, enabled);
  const questionComments = path.match(/^\/api\/quizzes\/([^/]+)\/comments$/);
  if (questionComments) return publicComments(request, env, url, user, enabled, questionComments[1]);
  const questionId = path.match(/^\/api\/quizzes\/([^/]+)$/);
  if (questionId) return request.method === "GET" ? publicQuestion(env, user, questionId[1], enabled) : json({ error: "Operação não suportada." }, 405);
  return json({ error: "Endpoint não encontrado." }, 404);
}
