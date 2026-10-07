/// <reference types="@cloudflare/workers-types" />

import { richTextPlainText, sanitizeRichTextHtml } from "../lib/announcement-content";
import { QuizContentStore, QuizContentError, createQuizContentExport, type QuizContentEnv } from "./quiz-content-store";

export type QuizUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  actorId?: string;
};

type QuizEnv = QuizContentEnv & { content?: QuizContentStore | null };
type ModuleChecker = (key: string) => Promise<boolean>;
type Row = Record<string, unknown>;
type QuizMode = "quick" | "exam" | "topic" | "unseen" | "mistakes";
type Difficulty = "easy" | "medium" | "hard";
type QuizOption = { id: string; text: string; position: number };
type ParsedOption = QuizOption & { isCorrect: boolean };
type QuestionBankResponseType = "short_answer" | "multiple_choice" | "case";
type QuestionBankOption = { id: string; label: string; text: string; position: number; isCorrect: boolean };
type QuizCommentReplyTo = { id: string; authorName: string; authorRole: string; isAdmin: boolean };
type PublicQuizComment = { id: string; questionId: string; parentCommentId: string | null; parentId: string | null; replyTo: QuizCommentReplyTo | null; body: string; status: "published"; pinned: boolean; canPin: boolean; authorName: string; authorRole: string; isAdmin: boolean; createdAt: number; updatedAt: number };
type PublicQuizCommentThread = PublicQuizComment & { replies: PublicQuizCommentThread[] };

const MAX_IMPORT_ROWS = 100;
const MAX_IMAGE_BYTES = 1024 * 1024;
const SECONDS_PER_QUESTION = 60;
const MINIMUM_TIMED_DURATION_SECONDS = 5 * SECONDS_PER_QUESTION;
const TEST_QUESTION_COUNTS = new Set([5, 10, 15, 30, 50]);
const DEFAULT_TEST_QUESTION_COUNT = 5;
const ADMIN_QUESTION_PAGE_SIZES = new Set([10, 25, 50]);
const QUESTION_BANK_PAGE_SIZES = new Set([10, 20, 50, 100, 200]);
const QUESTION_BANK_MAX_EXPORT_ROWS = 2000;
const QUESTION_BANK_CANONICAL_COLUMNS = [
  "ID_Unico", "Capitulo_Numero", "Capitulo_Nome", "Subtema", "Ano_Letivo", "Tipo_Avaliacao", "Epoca",
  "Numero_Pergunta", "Fonte_Original", "Pagina", "Enunciado", "Opcoes_Resposta", "Resposta_Indicada_Drive",
  "Resposta_Validada", "Estado_Validacao", "Aviso_Erro_Discrepancia", "Justificacao_Anatomica_FMUP", "Grau_Confianca",
] as const;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

type QuizSource = "compendium" | "anki";

export function quizSourceForId(id: unknown): QuizSource {
  return String(id).startsWith("anki-neuro-") ? "anki" : "compendium";
}

function sourceCounts(topics: Row[], platform: Row[] = []) {
  return (["compendium", "anki"] as const).map(id => {
    const rows = topics.filter(topic => quizSourceForId(topic.id) === id);
    return {
      id, label: id === "anki" ? "Ankis" : "Perguntas do compêndio",
      questionCount: rows.reduce((sum, topic) => sum + Number(topic.question_count || 0), 0),
      multipleChoiceCount: rows.reduce((sum, topic) => sum + Number(topic.multiple_choice_count || 0), 0),
      shortAnswerCount: rows.reduce((sum, topic) => sum + Number(topic.short_answer_count || 0), 0),
      platformMistakeCount: platform.filter(item => item.source === id).reduce((sum, item) => sum + Number(item.eligible_count || 0), 0),
    };
  });
}

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

function questionBankOptions(questionId: string, responseType: string, value: unknown, indicatedAnswer: unknown): QuestionBankOption[] | null {
  if (responseType !== "multiple_choice" || typeof value !== "string") return null;
  const source = value.trim();
  if (!source) return null;
  const matches = [...source.matchAll(/(?:^|\n)\s*([A-Ea-e])\s*[).:\-]\s*([\s\S]*?)(?=\n\s*[A-Ea-e]\s*[).:\-]\s*|$)/g)]
    .map((match, index) => ({ label: match[1].toLowerCase(), text: match[2].trim(), position: index + 1 }))
    .filter((option) => option.text.length > 0);
  if (matches.length < 2) return null;
  const indicated = typeof indicatedAnswer === "string" ? indicatedAnswer.trim() : "";
  const letter = indicated.match(/^\s*([A-Ea-e])\s*[).:\-]/)?.[1]?.toLowerCase() || "";
  const indicatedText = indicated.replace(/^\s*[A-Ea-e]\s*[).:\-]\s*/i, "").trim().toLocaleLowerCase("pt-PT");
  return matches.map((option) => ({
    id: `${questionId}-option-${option.position}`,
    label: option.label,
    text: option.text,
    position: option.position,
    isCorrect: Boolean((letter && option.label === letter) || (indicatedText && option.text.toLocaleLowerCase("pt-PT") === indicatedText)),
  }));
}

function questionBankCanonicalRow(item: Row, topic: { chapterNumber: string; title: string }, options: QuestionBankOption[] | null, includeSolutions: boolean) {
  const answer = String(item.answer_text || "").trim();
  const indicatedAnswer = String(item.answer_indicated || "").trim();
  const prompt = String(item.prompt || "");
  const optionsText = options?.map((option) => `${option.label}) ${option.text}`).join("\n") || null;
  return {
    ID_Unico: String(item.external_key || item.id || ""),
    Capitulo_Numero: topic.chapterNumber,
    Capitulo_Nome: topic.title,
    Subtema: String(item.source_subtopic || ""),
    Ano_Letivo: String(item.source_academic_year || ""),
    Tipo_Avaliacao: String(item.source_assessment || ""),
    Epoca: String(item.source_session || ""),
    Numero_Pergunta: String(item.source_question || ""),
    Fonte_Original: String(item.source_original || ""),
    Pagina: String(item.source_page || ""),
    Enunciado: prompt,
    Opcoes_Resposta: optionsText,
    Resposta_Indicada_Drive: includeSolutions ? indicatedAnswer : null,
    Resposta_Validada: includeSolutions ? answer : null,
    Estado_Validacao: String(item.validation_state || ""),
    Aviso_Erro_Discrepancia: String(item.review_note || ""),
    Justificacao_Anatomica_FMUP: String(item.anatomical_justification || ""),
    Grau_Confianca: String(item.confidence || ""),
  };
}

function record(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function has(object: Row, key: string): boolean { return Object.prototype.hasOwnProperty.call(object, key); }

function optionalDifficulty(value: unknown): Difficulty | null {
  const normalized = text(value, 20).toLocaleLowerCase("pt-PT");
  if (["easy", "fácil", "facil"].includes(normalized)) return "easy";
  if (["medium", "média", "media", "médio", "medio", "normal", "normais"].includes(normalized)) return "medium";
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

function storedImageUrls(value: unknown, fallback?: unknown): string[] {
  let images: unknown = [];
  try { images = JSON.parse(String(value || "[]")); } catch { /* legacy records */ }
  const urls = Array.isArray(images) ? images.filter((url): url is string => typeof url === "string" && "value" in readImage(url) && Boolean(url)) : [];
  return urls.length ? urls : typeof fallback === "string" && fallback ? [fallback] : [];
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
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4) return value;
  const input = text(value, 12).toUpperCase();
  if (/^[0-4]$/.test(input)) return Number(input);
  if (/^[1-5]$/.test(input)) return Number(input) - 1;
  if (/^[A-E]$/.test(input)) return input.charCodeAt(0) - 65;
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
  if (!input.difficulty) return "A dificuldade deve ser fácil, normal ou difícil.";
  if ("error" in input.image) return input.image.error;
  if (requireOptions) {
    if (!input.options || input.options.length < 2 || input.options.length > 5 || input.options.some((option) => option.text.length === 0)) return "Cada pergunta deve ter entre 2 e 5 opções preenchidas.";
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
  if (env.content) return env.content.topic(topicId);
  return env.DB.prepare("SELECT id,curricular_unit_id,title,description,status,sort_order,deleted_at FROM quiz_topics WHERE id=? AND deleted_at IS NULL").bind(topicId).first<Row>();
}

// One latest response per student: repeated attempts cannot inflate a public ranking.
const PLATFORM_STATS_SQL = `SELECT question_id,COUNT(*) AS participants,SUM(CASE WHEN is_correct=0 THEN 1 ELSE 0 END) AS wrong_count FROM (
  SELECT aq.question_id,aq.is_correct,ROW_NUMBER() OVER (PARTITION BY aq.question_id,a.user_id ORDER BY aq.answered_at DESC,aq.attempt_id DESC) AS position
  FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id WHERE aq.is_correct IS NOT NULL AND aq.selected_option_id IS NOT NULL AND a.status='completed'
) WHERE position=1 GROUP BY question_id HAVING COUNT(*)>=20 AND SUM(CASE WHEN is_correct=0 THEN 1 ELSE 0 END)>=5`;

/** Round-robin quotas across lessons; shuffle within each lesson in SQL first. */
export function balancedLessonQuestions(candidates: Row[], count: number): Row[] {
  const groups = new Map<string, Row[]>();
  for (const question of candidates) {
    const key = String(question.topic_id);
    const group = groups.get(key) || [];
    group.push(question); groups.set(key, group);
  }
  const result: Row[] = [];
  while (result.length < count) {
    let added = false;
    for (const group of groups.values()) {
      const question = group.shift();
      if (question) { result.push(question); added = true; }
      if (result.length === count) break;
    }
    if (!added) break;
  }
  return result;
}

function topicDto(item: Row) {
  let curriculum: Row = {};
  try { curriculum = record(JSON.parse(String(item.description || "{}"))) ?? {}; } catch { /* Ordinary topic description. */ }
  return {
    source: quizSourceForId(item.id), id: item.id, unitId: item.curricular_unit_id, title: item.title, name: item.title, description: item.description,
    status: item.status, sortOrder: item.sort_order, questionCount: item.question_count ?? 0, multipleChoiceCount: item.multiple_choice_count ?? 0, shortAnswerCount: item.short_answer_count ?? 0,
    publishedAt: item.published_at, archivedAt: item.archived_at, deletedAt: item.deleted_at,
    createdAt: item.created_at, updatedAt: item.updated_at,
    assessmentPart: curriculum.assessmentPart === 1 || curriculum.assessmentPart === 2 ? curriculum.assessmentPart : null,
  };
}

function questionDto(item: Row, options: QuizOption[], includeAnswer = false) {
  return {
    id: item.id, unitId: item.curricular_unit_id, topicId: item.topic_id, prompt: item.prompt, question: item.prompt,
    responseType: item.response_type || "multiple_choice", answerText: includeAnswer ? item.answer_text : undefined, imageUrl: item.image_url, imageUrls: storedImageUrls(item.question_images_json, item.image_url), solutionImageUrls: includeAnswer ? storedImageUrls(item.solution_images_json) : undefined, explanation: includeAnswer ? item.explanation : undefined, difficulty: item.difficulty,
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
  if (env.content) return env.content.options(questionIds);
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
  if (env.content) return contentCatalog(env, user, enabled);
  const [unitsResult, topicsResult, recommendation, platformResult] = await Promise.all([
    env.DB.prepare("SELECT cu.id,cu.code,cu.name,cu.ects,cu.study_year,cu.semester,COUNT(q.id) AS question_count,SUM(CASE WHEN q.response_type='multiple_choice' THEN 1 ELSE 0 END) AS multiple_choice_count,SUM(CASE WHEN q.response_type<>'multiple_choice' THEN 1 ELSE 0 END) AS short_answer_count FROM curricular_units cu JOIN quiz_questions q ON q.curricular_unit_id=cu.id AND q.status='published' AND q.deleted_at IS NULL JOIN quiz_topics t ON t.id=q.topic_id AND t.status='published' AND t.deleted_at IS NULL WHERE cu.active=1 GROUP BY cu.id ORDER BY cu.study_year,cu.semester,cu.name COLLATE NOCASE").all(),
    env.DB.prepare("SELECT t.*,cu.code AS unit_code,cu.name AS unit_name,COUNT(q.id) AS question_count,SUM(CASE WHEN q.response_type='multiple_choice' THEN 1 ELSE 0 END) AS multiple_choice_count,SUM(CASE WHEN q.response_type<>'multiple_choice' THEN 1 ELSE 0 END) AS short_answer_count FROM quiz_topics t JOIN curricular_units cu ON cu.id=t.curricular_unit_id JOIN quiz_questions q ON q.topic_id=t.id AND q.status='published' AND q.deleted_at IS NULL WHERE cu.active=1 AND t.status='published' AND t.deleted_at IS NULL GROUP BY t.id ORDER BY cu.study_year,cu.semester,t.sort_order,t.title COLLATE NOCASE").all(),
    enabled("quizzes.progress").then(async (progressEnabled) => progressEnabled ? env.DB.prepare("SELECT t.id,t.title,t.curricular_unit_id,cu.code AS unit_code,cu.name AS unit_name,COUNT(aq.question_id) AS attempted_count,SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id JOIN quiz_topics t ON t.id=aq.topic_id JOIN curricular_units cu ON cu.id=aq.curricular_unit_id WHERE a.user_id=? AND a.status='completed' AND aq.is_correct IS NOT NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1 GROUP BY t.id HAVING COUNT(aq.question_id)>0 ORDER BY (1.0 * SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) / COUNT(aq.question_id)) ASC, COUNT(aq.question_id) DESC LIMIT 1").bind(user.id).first<Row>() : null),
    env.DB.prepare(`SELECT q.curricular_unit_id,CASE WHEN q.id GLOB 'anki-neuro-*' THEN 'anki' ELSE 'compendium' END AS source,COUNT(*) AS eligible_count FROM quiz_questions q JOIN (${PLATFORM_STATS_SQL}) ps ON ps.question_id=q.id WHERE q.status='published' AND q.deleted_at IS NULL GROUP BY q.curricular_unit_id,source`).all(),
  ]);
  const units = unitsResult.results.map((item) => ({ id: item.id, code: item.code, name: item.name, ects: item.ects, year: item.study_year, semester: item.semester, questionCount: item.question_count, multipleChoiceCount: item.multiple_choice_count, shortAnswerCount: item.short_answer_count, platformMistakeCount: platformResult.results.filter(stats => stats.curricular_unit_id === item.id).reduce((sum, stats) => sum + Number(stats.eligible_count || 0), 0), sources: sourceCounts(topicsResult.results.filter(topic => topic.curricular_unit_id === item.id), platformResult.results.filter(stats => stats.curricular_unit_id === item.id)) }));
  const topics = topicsResult.results.map((item) => ({ ...topicDto(row(item)), unitCode: item.unit_code, unitName: item.unit_name }));
  return json({ units, topics, themes: topics, recommendedTopic: recommendation ? { id: recommendation.id, title: recommendation.title, unitId: recommendation.curricular_unit_id, unitCode: recommendation.unit_code, unitName: recommendation.unit_name, attemptedCount: recommendation.attempted_count, correctCount: recommendation.correct_count } : null });
}

async function questionBankCatalog(request: Request, env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);

  const unitId = text(url.searchParams.get("unitId"), 100);
  if (!unitId) return json({ error: "Indique a unidade curricular." }, 400);
  const unit = await activeUnit(env, unitId);
  if (!unit) return json({ error: "A unidade curricular não foi encontrada." }, 404);

  const sourceId = text(url.searchParams.get("sourceId"), 100);
  const topicId = text(url.searchParams.get("topicId"), 100);
  const subtopic = text(url.searchParams.get("subtopic"), 180);
  const academicYear = text(url.searchParams.get("academicYear"), 100);
  const assessment = text(url.searchParams.get("assessment"), 180);
  const session = text(url.searchParams.get("session"), 180);
  const pageFilter = text(url.searchParams.get("sourcePage"), 180);
  const responseType = text(url.searchParams.get("responseType"), 30);
  const imageFilter = text(url.searchParams.get("images"), 20).toLocaleLowerCase("pt-PT");
  const solutionFilter = (text(url.searchParams.get("solutionFilter"), 20).toLocaleLowerCase("pt-PT") || "all");
  const exportMode = url.searchParams.get("export") === "1";
  const includeSolutions = url.searchParams.get("solutions") !== "without";
  const query = text(url.searchParams.get("query") ?? url.searchParams.get("search"), 160);
  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const requestedPageSize = Number.parseInt(url.searchParams.get("pageSize") || (exportMode ? String(QUESTION_BANK_MAX_EXPORT_ROWS) : "10"), 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const pageSize = exportMode ? Math.min(Math.max(requestedPageSize, 1), QUESTION_BANK_MAX_EXPORT_ROWS) : QUESTION_BANK_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 10;
  if (responseType && !["short_answer", "multiple_choice", "case"].includes(responseType)) return json({ error: "Tipo de pergunta inválido." }, 400);
  if (imageFilter && !["all", "with", "without"].includes(imageFilter)) return json({ error: "Filtro de imagens inválido." }, 400);
  if (!["all", "with", "without"].includes(solutionFilter)) return json({ error: "Filtro de soluções inválido." }, 400);
  const publishedPredicate = "q.status='published' AND q.validation_state='VALIDADO' AND q.confidence='ALTO' AND trim(q.review_note)='' AND (q.response_type<>'multiple_choice' OR (lower(q.options_text) LIKE '%a)%' AND lower(q.options_text) LIKE '%b)%'))";
  const where = ["q.curricular_unit_id=?", "cu.active=1", publishedPredicate];
  const bindings: (string | number)[] = [unitId];
  if (sourceId) { where.push("q.source_id=?"); bindings.push(sourceId); }
  if (topicId) { where.push("q.topic_id=?"); bindings.push(topicId); }
  if (subtopic) { where.push("q.source_subtopic=?"); bindings.push(subtopic); }
  if (academicYear) { where.push("q.source_academic_year=?"); bindings.push(academicYear); }
  if (assessment) { where.push("q.source_assessment=?"); bindings.push(assessment); }
  if (session) { where.push("q.source_session=?"); bindings.push(session); }
  if (pageFilter) { where.push("q.source_page=?"); bindings.push(pageFilter); }
  if (responseType) { where.push("q.response_type=?"); bindings.push(responseType); }
  if (imageFilter === "with") where.push("q.image_url<>''");
  if (imageFilter === "without") where.push("q.image_url=''");
  if (solutionFilter === "with") where.push("trim(q.answer_text)<>'' AND lower(trim(q.answer_text))<>'resolução validada fmup.'");
  if (solutionFilter === "without") where.push("(trim(q.answer_text)='' OR lower(trim(q.answer_text))='resolução validada fmup.')");
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(q.prompt LIKE ? ESCAPE '\\' COLLATE NOCASE OR t.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR q.source_subtopic LIKE ? ESCAPE '\\' COLLATE NOCASE OR q.source_question LIKE ? ESCAPE '\\' COLLATE NOCASE OR q.source_assessment LIKE ? ESCAPE '\\' COLLATE NOCASE OR q.source_session LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  const whereSql = ` WHERE ${where.join(" AND ")}`;
  const fromSql = " FROM question_bank_items q JOIN question_bank_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id";
  try {
    const contentRows = env.content ? contentBankResults(await env.content.shard(unitId), {sourceId,topicId,subtopic,academicYear,assessment,session,pageFilter,responseType,imageFilter,solutionFilter,query}) : null;
    const count = contentRows ? {total: contentRows.selected.length} : await env.DB.prepare(`SELECT COUNT(*) AS total${fromSql}${whereSql}`).bind(...bindings).first<Row>();
    const total = Number(count?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const offset = (effectivePage - 1) * pageSize;
    const bankSelected = contentRows ? await env.content!.bankQuestions(unitId,contentRows.selected.slice(offset,offset+pageSize)) : null;
    const bankTopics=contentRows?new Map(contentRows.topics.map(t=>[t.id,t])):null;
    const [topicsResult, questionsResult, sourceRows, facetRows] = contentRows ? [
      {results:contentRows.topics}, {results:bankSelected!.map(q=>({...q,topic_title:bankTopics!.get(q.topic_id)?.title,chapter_number:bankTopics!.get(q.topic_id)?.chapter_number}))}, {results:contentRows.sources}, {results:contentRows.all},
    ] : await Promise.all([
      env.DB.prepare(`SELECT t.id,t.title,t.chapter_number,COUNT(q.id) AS question_count FROM question_bank_topics t LEFT JOIN question_bank_items q ON q.topic_id=t.id AND ${publishedPredicate} WHERE t.curricular_unit_id=? GROUP BY t.id ORDER BY t.sort_order,t.title COLLATE NOCASE`).bind(unitId).all(),
      env.DB.prepare(`SELECT q.id,q.external_key,q.prompt,q.options_text,q.answer_indicated,q.answer_text,q.response_type,q.image_url,q.question_images_json,q.solution_images_json,q.source_subtopic,q.source_academic_year,q.source_page,q.source_question,q.source_assessment,q.source_session,q.source_original,q.anatomical_justification,q.validation_state,q.review_note,q.confidence,t.id AS topic_id,t.title AS topic_title,t.chapter_number${fromSql}${whereSql} ORDER BY q.sort_order,q.id LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all(),
      env.DB.prepare("SELECT id,label,source_kind,revision_label,source_row_count,imported_count,published_count,review_count,coverage_json,verification_status FROM question_bank_sources WHERE curricular_unit_id=? ORDER BY updated_at DESC").bind(unitId).all(),
      env.DB.prepare(`SELECT q.source_id,q.source_subtopic,q.source_academic_year,q.source_assessment,q.source_session,q.source_page,q.response_type,q.image_url,q.answer_text,t.id AS topic_id,t.title AS topic_title,t.chapter_number FROM question_bank_items q JOIN question_bank_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE q.curricular_unit_id=? AND cu.active=1 AND ${publishedPredicate}`).bind(unitId).all(),
    ]);
    const topics = topicsResult.results.map((rawItem) => {
      const item = row(rawItem);
      return {
        id: String(item.id),
        title: String(item.title),
        chapterNumber: String(item.chapter_number),
        questionCount: Number(item.question_count || 0),
      };
    });
    const questions = questionsResult.results.map((rawItem) => {
      const item = row(rawItem);
      const id = String(item.id);
      const topic = { id: String(item.topic_id), title: String(item.topic_title), chapterNumber: String(item.chapter_number) };
      const options = questionBankOptions(id, String(item.response_type), item.options_text, item.answer_indicated);
      const answer = String(item.answer_text || "").trim();
      const indicatedAnswer = String(item.answer_indicated || "").trim();
      return {
        id,
        prompt: String(item.prompt),
        options,
        answer: includeSolutions ? answer : null,
        indicatedAnswer: includeSolutions ? indicatedAnswer : null,
        hasSolution: Boolean(answer && answer.toLocaleLowerCase("pt-PT") !== "resolução validada fmup."),
        hasOptions: Boolean(options?.length),
        hasImage: Boolean(String(item.image_url || "").trim()),
        responseType: String(item.response_type) as QuestionBankResponseType,
        imageUrl: String(item.image_url || "") || null,
        imageUrls: storedImageUrls(item.question_images_json, item.image_url),
        solutionImageUrls: includeSolutions ? storedImageUrls(item.solution_images_json) : [],
        topic,
        source: {
          subtopic: String(item.source_subtopic || ""),
          academicYear: String(item.source_academic_year || ""),
          page: String(item.source_page || ""),
          question: String(item.source_question || ""),
          assessment: String(item.source_assessment || ""),
          session: String(item.source_session || ""),
          original: String(item.source_original || ""),
          indicatedAnswer: includeSolutions ? indicatedAnswer : null,
          validatedAnswer: includeSolutions ? answer : null,
          validationState: String(item.validation_state || ""),
          warning: String(item.review_note || ""),
          justification: String(item.anatomical_justification || ""),
          confidence: String(item.confidence || ""),
        },
        sheet: questionBankCanonicalRow(item, topic, options, includeSolutions),
      };
    });
    const facet = (field: string) => [...new Set(facetRows.results.map((item) => String(row(item)[field] || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-PT"));
    const source = sourceRows.results.map((rawItem) => {
      const sourceRow = row(rawItem);
      let coverage: unknown = null;
      try { coverage = sourceRow.coverage_json ? JSON.parse(String(sourceRow.coverage_json)) : null; } catch { coverage = null; }
      return { id: String(sourceRow.id), label: sourceRow.label, kind: sourceRow.source_kind, revision: sourceRow.revision_label, verificationStatus: sourceRow.verification_status, sourceRowCount: Number(sourceRow.source_row_count || 0), importedCount: Number(sourceRow.imported_count || 0), publishedCount: Number(sourceRow.published_count || 0), reviewCount: Number(sourceRow.review_count || 0), coverage };
    });
    const imageCounts = facetRows.results.reduce<{ with: number; without: number }>((counts, item) => { const key = String(row(item).image_url || "").trim() ? "with" : "without"; counts[key] += 1; return counts; }, { with: 0, without: 0 });
    const solutionCounts = facetRows.results.reduce<{ with: number; without: number }>((counts, item) => { const key = String(row(item).answer_text || "").trim() && String(row(item).answer_text || "").toLocaleLowerCase("pt-PT") !== "resolução validada fmup." ? "with" : "without"; counts[key] += 1; return counts; }, { with: 0, without: 0 });
    const realOptionsCount = questions.reduce((count, question) => count + (question.options?.length || 0), 0);
    return json({
      unit: { id: String(unit.id), code: String(unit.code), name: String(unit.name) },
      topics,
      questions,
      pagination: { page: effectivePage, pageSize, total, totalPages, from: total ? offset + 1 : 0, to: Math.min(offset + questions.length, total) },
      source: source[0] || null,
      sources: source,
      facets: { topics, subtopics: facet("source_subtopic"), academicYears: facet("source_academic_year"), assessments: facet("source_assessment"), sessions: facet("source_session"), pages: facet("source_page"), responseTypes: facet("response_type"), images: imageCounts, solutions: solutionCounts },
      capabilities: {
        filters: { source: true, topic: true, subtopic: true, academicYear: true, assessment: true, session: true, sourcePage: true, responseType: true, images: imageCounts.with > 0, solutions: true, query: true },
        realOptions: realOptionsCount > 0,
        export: { complete: exportMode && questions.length === total, columns: QUESTION_BANK_CANONICAL_COLUMNS },
      },
      export: { requested: exportMode, includeSolutions, total, complete: exportMode && questions.length === total, columns: QUESTION_BANK_CANONICAL_COLUMNS },
      filters: { unitId, sourceId, topicId, subtopic, academicYear, assessment, session, sourcePage: pageFilter, responseType, images: imageFilter || "all", solutionFilter, includeSolutions, query },
    });
  } catch {
    return json({ error: "O banco de questões ainda não está disponível.", code: "QUESTION_BANK_UNAVAILABLE" }, 503);
  }
}

async function exportQuiz(env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const { mode, difficulty } = modeFrom(url.searchParams.get("mode") || "quick", url.searchParams.get("difficulty"));
  const unitId = text(url.searchParams.get("unitId"), 100);
  const requestedCount = Number(url.searchParams.get("count") || DEFAULT_TEST_QUESTION_COUNT);
  const topicIds = [...new Set([
    ...url.searchParams.getAll("topicId"),
    ...(url.searchParams.get("topicIds") || "").split(","),
  ].map((id) => text(id, 100)).filter(Boolean))].slice(0, 30);
  if (!mode || !Number.isInteger(requestedCount) || !TEST_QUESTION_COUNTS.has(requestedCount)) return json({ error: "Escolha 5, 10, 15, 30 ou 50 perguntas.", code: "invalid_question_count", allowed: [...TEST_QUESTION_COUNTS] }, 400);
  if (!unitId || !await activeUnit(env, unitId)) return json({ error: "Escolha uma unidade curricular válida." }, 400);
  if (mode === "topic" && !topicIds.length) return json({ error: "Escolha pelo menos um tema para exportar." }, 400);
  const selectedTopics = await Promise.all(topicIds.map((id) => activeTopic(env, id)));
  if (selectedTopics.some((topic) => !topic || topic.curricular_unit_id !== unitId)) return json({ error: "Um ou mais temas são inválidos para a unidade curricular selecionada." }, 400);

  const topicClause = topicIds.length ? ` AND q.topic_id IN (${topicIds.map(() => "?").join(",")})` : "";
  const baseSql = " FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1 AND q.curricular_unit_id=?" + topicClause + " AND (?='' OR q.difficulty=?)" + " AND q.response_type='multiple_choice'";
  const baseBinds: unknown[] = [unitId, ...topicIds, difficulty || "", difficulty || ""];
  const selectionSql = mode === "unseen"
    ? " AND NOT EXISTS (SELECT 1 FROM quiz_attempt_questions seen JOIN quiz_attempts seen_attempt ON seen_attempt.id=seen.attempt_id WHERE seen_attempt.user_id=? AND seen.question_id=q.id AND seen.selected_option_id IS NOT NULL)"
    : mode === "mistakes"
      ? " AND (SELECT COUNT(*) FROM quiz_attempt_questions mistaken JOIN quiz_attempts mistaken_attempt ON mistaken_attempt.id=mistaken.attempt_id WHERE mistaken_attempt.user_id=? AND mistaken.question_id=q.id AND mistaken.is_correct=0) > (SELECT COUNT(*) FROM quiz_attempt_questions corrected JOIN quiz_attempts corrected_attempt ON corrected_attempt.id=corrected.attempt_id WHERE corrected_attempt.user_id=? AND corrected.question_id=q.id AND corrected.is_correct=1)"
      : "";
  const selectionBinds: unknown[] = mode === "unseen" ? [user.id] : mode === "mistakes" ? [user.id, user.id] : [];
  const candidates = env.content ? await contentCandidates(env,user,unitId,topicIds,difficulty,"multiple_choice",mode,requestedCount) : await env.DB.prepare("SELECT q.*,t.title AS topic_title,cu.code AS unit_code,cu.name AS unit_name" + baseSql + selectionSql + " ORDER BY RANDOM() LIMIT ?")
    .bind(...baseBinds, ...selectionBinds, requestedCount).all();
  if (candidates.results.length < requestedCount) return json({ error: "Não existem perguntas suficientes para criar este ficheiro Anki.", code: "not_enough_questions", available: candidates.results.length, required: requestedCount }, 409);
  const optionMap = await optionsForQuestions(env, candidates.results.map((item) => String(item.id)));
  const questions = candidates.results.map((item) => {
    const options = optionMap.get(String(item.id)) || [];
    const correct = options.find((option) => option.isCorrect);
    return {
      id: item.id,
      unitId: item.curricular_unit_id,
      topicId: item.topic_id,
      topicTitle: item.topic_title,
      prompt: item.prompt,
      imageUrl: item.image_url,
      imageUrls: storedImageUrls(item.question_images_json, item.image_url),
      solutionImageUrls: storedImageUrls(item.solution_images_json),
      explanation: item.explanation,
      difficulty: item.difficulty,
      options: options.map((option) => ({ id: option.id, text: option.text, position: option.position })),
      correctOptionId: correct?.id || null,
    };
  }).filter((question) => question.options.length >= 2 && question.options.length <= 5 && question.correctOptionId);
  if (questions.length < requestedCount) return json({ error: "Algumas perguntas não têm opções válidas para exportação.", code: "invalid_questions", available: questions.length, required: requestedCount }, 409);
  const first = candidates.results[0];
  return json({
    deck: { name: `${first.unit_code} · ${first.unit_name}`, unitId, unitCode: first.unit_code, unitName: first.unit_name, mode, questionCount: requestedCount },
    questions,
  });
}

async function publicQuestion(env: QuizEnv, user: QuizUser | null, id: string, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  if (env.content) {
    const found = await env.content.question(id);
    if (!found || !publishedContent(env).some(q=>q.id===id) || !await activeUnit(env,String(found.curricular_unit_id))) return json({error:"Pergunta não encontrada."},404);
    const options=await optionsForQuestions(env,[id]);
    return json({question:questionDto(found,(options.get(id)||[]).map(o=>({id:o.id,text:o.text,position:o.position})))});
  }
  const question = await env.DB.prepare("SELECT q.*,NULL AS correct_option_id FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE q.id=? AND q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1").bind(id).first<Row>();
  if (!question) return json({ error: "Pergunta não encontrada." }, 404);
  const options = await optionsForQuestions(env, [id]);
  return json({ question: questionDto(question, (options.get(id) || []).map((option) => ({ id: option.id, text: option.text, position: option.position }))) });
}

function modeFrom(value: unknown, rawDifficulty: unknown): { mode: QuizMode | null; difficulty: Difficulty | null } {
  const input = text(value, 30).toLocaleLowerCase("pt-PT");
  const aliases: Record<string, QuizMode> = { quick: "quick", exam: "exam", frequency: "exam", platform_mistakes: "quick", topic: "topic", thematic: "topic", unseen: "unseen", new: "unseen", new_questions: "unseen", mistakes: "mistakes", wrong: "mistakes", erradas: "mistakes" };
  const mode = aliases[input] || null;
  return { mode, difficulty: optionalDifficulty(rawDifficulty) };
}

function attemptQuestionDto(item: Row, reveal: boolean, completed: boolean) {
  const options = parseStoredOptions(item.options_json);
  return {
    id: item.question_id, questionId: item.question_id, position: item.position, prompt: item.prompt, question: item.prompt,
    imageUrl: item.image_url, imageUrls: storedImageUrls(item.question_images_json, item.image_url), solutionImageUrls: reveal && (completed || item.selected_option_id) ? storedImageUrls(item.solution_images_json) : undefined, difficulty: item.difficulty, topicId: item.topic_id, topic: item.topic_title || "Tema geral", unitId: item.curricular_unit_id,
    options, selectedOptionId: item.selected_option_id,
    correctOptionId: reveal ? item.correct_option_id : undefined,
    correct: reveal && item.is_correct !== null && item.is_correct !== undefined ? Number(item.is_correct) === 1 : undefined,
    explanation: reveal ? item.explanation : undefined,
    answeredAt: item.answered_at, seenBefore: Number(item.seen_before) === 1,
  };
}

function minimumAttemptDurationSeconds(attempt: Row): number {
  const questionCount = Number(attempt.question_count);
  return Math.max(MINIMUM_TIMED_DURATION_SECONDS, Number.isInteger(questionCount) && questionCount > 0 ? questionCount * SECONDS_PER_QUESTION : MINIMUM_TIMED_DURATION_SECONDS);
}

function effectiveAttemptDurationSeconds(attempt: Row): number | null {
  if (attempt.duration_seconds === null || attempt.duration_seconds === undefined) return null;
  const configured = Number(attempt.duration_seconds);
  const minimum = minimumAttemptDurationSeconds(attempt);
  return Number.isFinite(configured) && configured >= minimum ? configured : minimum;
}

function attemptDto(item: Row) {
  let config: Row = {};
  try {
    const parsed = JSON.parse(String(item.config_json || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed as Row;
  } catch { /* A configuração é sempre escrita pelo Worker; ignora dados legados inválidos. */ }
  const durationSeconds = effectiveAttemptDurationSeconds(item);
  const startedAt = Number(item.started_at);
  const expiresAt = item.expires_at === null || item.expires_at === undefined ? NaN : Number(item.expires_at);
  const minimumDeadline = durationSeconds !== null && Number.isFinite(startedAt) ? startedAt + durationSeconds * 1000 : NaN;
  return {
    id: item.id, mode: config.objective === "frequency" || config.objective === "platform_mistakes" ? config.objective : item.mode, status: item.status, unitId: item.curricular_unit_id, topicId: item.topic_id,
    assessmentPart: config.assessmentPart === 2 ? 2 : 1,
    topicIds: Array.isArray(config.topicIds) ? config.topicIds.filter((id): id is string => typeof id === "string") : item.topic_id ? [item.topic_id] : [],
    source: config.source === "anki" ? "anki" : "compendium",
    answerFormat: config.answerFormat === "short_answer" ? "short_answer" : "multiple_choice",
    shortAnswerMode: config.shortAnswerMode === "reveal_and_self_assess" ? "reveal_and_self_assess" : "type_and_check",
    difficulty: item.difficulty_filter, questionCount: item.question_count, answeredCount: item.answered_count,
    timed: durationSeconds !== null,
    timerPaused: config.timerPaused === true || config.timerPaused === 1,
    pauseReason: config.pauseReason === "manual" ? "manual" : "automatic",
    pausedRemainingSeconds: typeof config.pausedRemainingMs === "number" ? Math.ceil(config.pausedRemainingMs / 1000) : null,
    correctCount: item.correct_count, durationSeconds, expiresAt: Number.isFinite(expiresAt) && Number.isFinite(minimumDeadline) && item.status === "active" ? Math.max(expiresAt, minimumDeadline) : item.expires_at,
    startedAt: item.started_at, completedAt: item.completed_at,
    createdAt: item.created_at, updatedAt: item.updated_at,
  };
}

async function repairAttemptTimer(env: QuizEnv, user: QuizUser, attempt: Row): Promise<Row> {
  if (attempt.status !== "active" || attempt.duration_seconds === null || attempt.duration_seconds === undefined) return attempt;
  const configured = Number(attempt.duration_seconds);
  const minimum = minimumAttemptDurationSeconds(attempt);
  const startedAt = Number(attempt.started_at);
  if (!Number.isFinite(configured) || configured >= minimum || !Number.isFinite(startedAt)) return attempt;
  const expectedExpiresAt = startedAt + minimum * 1000;
  const now = Date.now();
  await env.DB.prepare("UPDATE quiz_attempts SET duration_seconds=?,expires_at=CASE WHEN expires_at IS NULL THEN NULL ELSE MAX(expires_at,?) END,config_json=json_set(config_json,'$.durationSeconds',?),updated_at=? WHERE id=? AND user_id=? AND status='active' AND duration_seconds IS NOT NULL AND duration_seconds<?")
    .bind(minimum, expectedExpiresAt, minimum, now, attempt.id, user.id, minimum).run();
  return (await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attempt.id, user.id).first<Row>()) || attempt;
}

async function attemptDetail(env: QuizEnv, attempt: Row): Promise<Row> {
  const questions = await env.DB.prepare("SELECT aq.*,t.title AS topic_title FROM quiz_attempt_questions aq LEFT JOIN quiz_topics t ON t.id=aq.topic_id WHERE aq.attempt_id=? ORDER BY aq.position").bind(attempt.id).all();
  const isExam = attempt.mode === "exam";
  return { ...attemptDto(attempt), questions: questions.results.map((item) => attemptQuestionDto(row(item), attempt.status !== "active" || !isExam, attempt.status !== "active")) };
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
  const repaired = await repairAttemptTimer(env, user, attempt);
  return repaired.status === "active" && typeof repaired.expires_at === "number" && repaired.expires_at <= Date.now() ? completeAttempt(env, user, repaired) : repaired;
}

async function createAttempt(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const { mode, difficulty } = modeFrom(body.mode, body.difficulty);
  const unitId = text(body.curricularUnitId ?? body.unitId, 100);
  if (body.source !== undefined && body.source !== "anki" && body.source !== "compendium") return json({ error: "Origem das perguntas inválida." }, 400);
  const source: QuizSource = body.source === "anki" ? "anki" : "compendium";
  const frequency = body.mode === "frequency";
  const platformMistakes = body.mode === "platform_mistakes";
  const assessmentPart = body.assessmentPart === 2 ? 2 : 1;
  const requestedTopicIds = Array.isArray(body.topicIds) ? body.topicIds.map((id) => text(id, 100)).filter(Boolean) : [];
  const singleTopicId = text(body.topicId ?? body.themeId, 100);
  let topicIds = [...new Set([...requestedTopicIds, ...(singleTopicId ? [singleTopicId] : [])])];
  const unit = unitId ? await activeUnit(env, unitId) : null;
  if (source === "anki" && unit?.code !== "NEURO") return json({ error: "Os Ankis estão disponíveis para Neuroanatomia." }, 400);
  if (frequency) {
    if (unit?.code !== "FIS1") return json({ error: "A simulação de frequência está disponível apenas para Fisiologia I." }, 400);
    const lessons = env.content ? {results:env.content.manifest.topics.filter(t=>t.curricular_unit_id===unitId&&t.status==='published'&&t.deleted_at==null).filter(t=>{try{return JSON.parse(String(t.description)).assessmentPart===assessmentPart;}catch{return false;}}).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||String(a.id).localeCompare(String(b.id)))} : await env.DB.prepare("SELECT id FROM quiz_topics WHERE curricular_unit_id=? AND status='published' AND deleted_at IS NULL AND json_valid(description) AND json_extract(description,'$.assessmentPart')=? ORDER BY sort_order,id").bind(unitId, assessmentPart).all();
    topicIds = lessons.results.map((lesson) => String(lesson.id));
    if (!topicIds.length) return json({ error: "As aulas desta frequência ainda não estão disponíveis." }, 409);
  }
  const topicId = topicIds.length === 1 ? topicIds[0] : null;
  const requestedCount = frequency ? 50 : Number(body.questionCount ?? body.count ?? DEFAULT_TEST_QUESTION_COUNT);
  if (!mode || !Number.isInteger(requestedCount) || !TEST_QUESTION_COUNTS.has(requestedCount)) {
    return json({ error: "Escolha 5, 10, 15, 30 ou 50 perguntas.", code: "invalid_question_count", allowed: [...TEST_QUESTION_COUNTS] }, 400);
  }
  const durationSeconds = body.timed === false ? null : frequency ? 3600 : requestedCount * SECONDS_PER_QUESTION;
  if (mode === "topic" && !topicIds.length) return json({ error: "Escolha pelo menos um tema para o teste temático." }, 400);
  if (unitId && !unit) return json({ error: "Unidade curricular inválida." }, 400);
  const selectedTopics = await Promise.all(topicIds.map((id) => activeTopic(env, id)));
  if (selectedTopics.some((topic) => !topic || (unitId && topic.curricular_unit_id !== unitId))) return json({ error: "Um ou mais temas são inválidos para a unidade curricular selecionada." }, 400);
  if (selectedTopics.some(topic => topic && quizSourceForId(topic.id) !== source)) return json({ error: "As aulas não pertencem à origem escolhida." }, 400);
  const answerFormat = mode !== "exam" && body.answerFormat === "short_answer" ? "short_answer" : "multiple_choice";
  const topicClause = topicIds.length ? ` AND q.topic_id IN (${topicIds.map(() => "?").join(",")})` : "";
  const responseTypeClause = answerFormat === "short_answer" ? " AND q.response_type<>'multiple_choice'" : " AND q.response_type='multiple_choice'";
  const baseSql = " FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL AND cu.active=1 AND (?='' OR q.curricular_unit_id=?)" + topicClause + " AND (?='' OR q.difficulty=?)" + responseTypeClause + (source === "anki" ? " AND q.id GLOB 'anki-neuro-*'" : " AND q.id NOT GLOB 'anki-neuro-*'");
  const baseBinds: unknown[] = [unitId, unitId, ...topicIds, difficulty || "", difficulty || ""];
  const selectionSql = mode === "unseen"
    ? " AND NOT EXISTS (SELECT 1 FROM quiz_attempt_questions seen JOIN quiz_attempts seen_attempt ON seen_attempt.id=seen.attempt_id WHERE seen_attempt.user_id=? AND seen.question_id=q.id AND seen.selected_option_id IS NOT NULL)"
    : mode === "mistakes"
      ? " AND (SELECT COUNT(*) FROM quiz_attempt_questions mistaken JOIN quiz_attempts mistaken_attempt ON mistaken_attempt.id=mistaken.attempt_id WHERE mistaken_attempt.user_id=? AND mistaken.question_id=q.id AND mistaken.is_correct=0) > (SELECT COUNT(*) FROM quiz_attempt_questions corrected JOIN quiz_attempts corrected_attempt ON corrected_attempt.id=corrected.attempt_id WHERE corrected_attempt.user_id=? AND corrected.question_id=q.id AND corrected.is_correct=1)"
      : "";
  const selectionBinds: unknown[] = mode === "unseen" ? [user.id] : mode === "mistakes" ? [user.id, user.id] : [];
  const platformClause = platformMistakes ? ` AND q.id IN (SELECT question_id FROM (${PLATFORM_STATS_SQL}))` : "";
  const order = platformMistakes ? ` ORDER BY (SELECT 1.0*ps.wrong_count/ps.participants FROM (${PLATFORM_STATS_SQL}) ps WHERE ps.question_id=q.id) DESC,q.id` : frequency ? " ORDER BY t.sort_order,q.topic_id,RANDOM()" : " ORDER BY RANDOM()";
  const candidates = env.content ? await contentCandidates(env,user,unitId,topicIds,difficulty,answerFormat,mode,frequency?2000:requestedCount,frequency,platformMistakes,source) : await env.DB.prepare("SELECT q.*" + baseSql + selectionSql + platformClause + order + " LIMIT ?")
    .bind(...baseBinds, ...selectionBinds, frequency ? 2000 : requestedCount).all();
  if (frequency) candidates.results = balancedLessonQuestions(candidates.results.map(row), requestedCount);
  if (platformMistakes && candidates.results.length < requestedCount) return json({ error: "Ainda não há perguntas com respostas suficientes de estudantes distintos para esta seleção.", code: "not_enough_questions", available: candidates.results.length, required: requestedCount }, 409);
  if (mode === "mistakes" && candidates.results.length < requestedCount) return json({ error: "Não há perguntas erradas pessoais suficientes para este teste.", code: "not_enough_mistakes", available: candidates.results.length, required: requestedCount }, 409);
  if (mode === "unseen" && !candidates.results.length) {
    const total = env.content ? {total:(await contentCandidateMetadata(env,unitId,topicIds,difficulty,answerFormat,source)).eligible.length} : await env.DB.prepare("SELECT COUNT(*) AS total" + baseSql).bind(...baseBinds).first<Row>();
    if (Number(total?.total || 0) > 0) return json({ error: "Já respondeu a todas as perguntas elegíveis.", code: "all_questions_seen", available: 0, total: total?.total || 0 }, 409);
  }
  if (!candidates.results.length) return json({ error: "Não existem perguntas publicadas para esta seleção." }, 404);
  if (candidates.results.length < requestedCount) return json({ error: "Não existem perguntas suficientes para preparar este teste.", code: "not_enough_questions", available: candidates.results.length, required: requestedCount }, 409);
  const candidateIds = candidates.results.map((item) => String(item.id));
  const optionsByQuestion = await optionsForQuestions(env, candidateIds);
  const snapshots: Array<{ question: Row; options: ParsedOption[] }> = [];
  for (const item of candidates.results.map(row)) {
    const options = answerFormat === "short_answer" && String(item.answer_text || "").trim()
      ? [{ id: `${item.id}-self-correct`, text: String(item.answer_text), position: 1, isCorrect: true }, { id: `${item.id}-self-review`, text: "A rever", position: 2, isCorrect: false }]
      : optionsByQuestion.get(String(item.id)) || [];
    if (options.length >= 2 && options.length <= 5 && options.filter((option) => option.isCorrect).length === 1) snapshots.push({ question: item, options });
  }
  if (snapshots.length < requestedCount) return json({ error: "Não existem perguntas válidas suficientes para preparar este teste.", code: "not_enough_questions", available: snapshots.length, required: requestedCount }, 409);
  const now = Date.now(), attemptId = crypto.randomUUID(), expiresAt = durationSeconds ? now + durationSeconds * 1000 : null;

  const shortAnswerMode = body.shortAnswerMode === "reveal_and_self_assess" ? "reveal_and_self_assess" : "type_and_check";
  const configJson = JSON.stringify({ source, topicIds, requestedCount, difficulty, durationSeconds, answerFormat, shortAnswerMode, objective: frequency ? "frequency" : platformMistakes ? "platform_mistakes" : null, assessmentPart: frequency ? assessmentPart : null, timerPaused: false, pausedTotalMs: 0 });
  const statements: D1PreparedStatement[] = [env.DB.prepare("INSERT INTO quiz_attempts (id,user_id,mode,curricular_unit_id,topic_id,difficulty_filter,status,question_count,started_at,created_at,updated_at,config_json,duration_seconds,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(attemptId, user.id, mode, unitId || null, topicId, difficulty, "active", snapshots.length, now, now, now, configJson, durationSeconds, expiresAt)];
  if(env.content) {
    // Preserve historical foreign keys for IDs added in future GitHub releases.
    // These registry rows contain no question text, solutions or answer options.
    const topicSet=new Set(snapshots.map(item=>item.question.topic_id));
    const topics=env.content.manifest.topics.filter(topic=>topicSet.has(topic.id)).map(topic=>({id:topic.id,unitId:topic.curricular_unit_id,title:topic.title}));
    const identities=snapshots.map(({question})=>({id:question.id,unitId:question.curricular_unit_id,topicId:question.topic_id,difficulty:question.difficulty}));
    statements.unshift(
      env.DB.prepare("INSERT OR IGNORE INTO quiz_topics(id,curricular_unit_id,title,status,created_by,updated_by,created_at,updated_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.unitId'),json_extract(value,'$.title'),'published',?,?,?,? FROM json_each(?)").bind(user.id,user.id,now,now,JSON.stringify(topics)),
      env.DB.prepare("INSERT OR IGNORE INTO quiz_questions(id,curricular_unit_id,topic_id,prompt,explanation,difficulty,status,created_by,updated_by,created_at,updated_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.unitId'),json_extract(value,'$.topicId'),'','',json_extract(value,'$.difficulty'),'published',?,?,?,? FROM json_each(?)").bind(user.id,user.id,now,now,JSON.stringify(identities)),
    );
  }
  snapshots.forEach(({ question, options }, index) => {
    const correct = options.find((option) => option.isCorrect)!;
    statements.push(env.DB.prepare("INSERT INTO quiz_attempt_questions (attempt_id,question_id,curricular_unit_id,topic_id,position,prompt,image_url,explanation,difficulty,options_json,correct_option_id,question_images_json,solution_images_json,seen_before) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,EXISTS(SELECT 1 FROM quiz_attempt_questions seen JOIN quiz_attempts a ON a.id=seen.attempt_id WHERE a.user_id=? AND seen.question_id=? AND seen.selected_option_id IS NOT NULL))")
      .bind(attemptId, question.id, question.curricular_unit_id, question.topic_id, index + 1, question.prompt, question.image_url, question.explanation, question.difficulty, JSON.stringify(options.map((option) => ({ id: option.id, text: option.text, position: option.position }))), correct.id, question.question_images_json || "[]", question.solution_images_json || "[]", user.id, question.id));
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
  const timing = attemptDto(activeAttempt);
  if (timing.timerPaused) return json({ error: "Retoma o cronómetro antes de responder.", code: "timer_paused" }, 409);
  const question = await env.DB.prepare("SELECT * FROM quiz_attempt_questions WHERE attempt_id=? AND question_id=?").bind(attemptId, questionId).first<Row>();
  if (!question || !parseStoredOptions(question.options_json).some((option) => option.id === optionId)) return json({ error: "A opção não pertence a esta pergunta." }, 400);
  if (activeAttempt.mode !== "exam" && question.selected_option_id !== null && question.selected_option_id !== optionId) return json({ error: "A resposta já recebeu feedback e não pode ser alterada.", code: "answer_locked" }, 409);
  const correct = optionId === question.correct_option_id ? 1 : 0, now = Date.now();
  // A retry of the same answer is safe; a competing answer cannot replace practice feedback.
  const write = await env.DB.prepare("UPDATE quiz_attempt_questions SET selected_option_id=?,is_correct=?,answered_at=COALESCE(answered_at,?) WHERE attempt_id=? AND question_id=? AND (?='exam' OR selected_option_id IS NULL OR selected_option_id=?) AND EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.id=attempt_id AND a.user_id=? AND a.status='active' AND COALESCE(json_extract(a.config_json,'$.timerPaused'),0)=0 AND (a.expires_at IS NULL OR a.expires_at>?))").bind(optionId, correct, now, attemptId, questionId, activeAttempt.mode, optionId, user.id, now).run();
  if (!write.meta.changes) return json({ error: "A sessão terminou ou a pergunta já foi respondida. Reabre a sessão para atualizar o estado.", code: "answer_locked" }, 409);
  const totals = await env.DB.prepare("SELECT COUNT(selected_option_id) AS answered_count,COALESCE(SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END),0) AS correct_count FROM quiz_attempt_questions WHERE attempt_id=?").bind(attemptId).first<Row>();
  await env.DB.prepare("UPDATE quiz_attempts SET answered_count=?,correct_count=?,updated_at=? WHERE id=? AND user_id=?").bind(totals?.answered_count || 0, totals?.correct_count || 0, now, attemptId, user.id).run();
  const answer: Row = { questionId, selectedOptionId: optionId };
  if (activeAttempt.mode !== "exam") answer.correct = correct === 1;
  return json(activeAttempt.mode !== "exam" ? { answer, question: { id: questionId, correctOptionId: question.correct_option_id, explanation: question.explanation, solutionImageUrls: storedImageUrls(question.solution_images_json) } } : { answer });
}

async function updateAttemptTimer(request: Request, env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const body = await bodyJson(request);
  if (!body || !["pause", "resume"].includes(String(body.action))) return json({ error: "Ação do cronómetro inválida." }, 400);
  const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  if (!attempt) return json({ error: "Tentativa não encontrada." }, 404);
  const active = await enforceAttemptExpiry(env, user, attempt);
  if (active.status !== "active" || active.duration_seconds === null) return json({ attempt: await attemptDetail(env, active) });
  const now = Date.now();
  const reason = body.reason === "manual" ? "manual" : "automatic";
  if (body.action === "pause") {
    // The deadline and remaining time change together; duplicate pause requests cannot reset time.
    await env.DB.prepare("UPDATE quiz_attempts SET config_json=json_set(config_json,'$.timerPaused',json('true'),'$.pauseReason',?,'$.pausedRemainingMs',MAX(0,expires_at-?),'$.pausedAt',?),expires_at=NULL,updated_at=? WHERE id=? AND user_id=? AND status='active' AND duration_seconds IS NOT NULL AND expires_at>?")
      .bind(reason, now, now, now, attemptId, user.id, now).run();
    if (reason === "manual") await env.DB.prepare("UPDATE quiz_attempts SET config_json=json_set(config_json,'$.pauseReason','manual') WHERE id=? AND user_id=? AND status='active' AND json_extract(config_json,'$.timerPaused')=1").bind(attemptId, user.id).run();
  } else {
    // Returning to a tab must never cancel a pause explicitly chosen by the student.
    await env.DB.prepare("UPDATE quiz_attempts SET expires_at=?+MAX(0,COALESCE(json_extract(config_json,'$.pausedRemainingMs'),0)),config_json=json_set(config_json,'$.timerPaused',json('false'),'$.pausedTotalMs',COALESCE(json_extract(config_json,'$.pausedTotalMs'),0)+MAX(0,?-COALESCE(json_extract(config_json,'$.pausedAt'),?))),updated_at=? WHERE id=? AND user_id=? AND status='active' AND duration_seconds IS NOT NULL AND json_extract(config_json,'$.timerPaused')=1 AND (?='manual' OR json_extract(config_json,'$.pauseReason')='automatic')")
      .bind(now, now, now, now, attemptId, user.id, reason).run();
  }
  const updated = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  return json({ attempt: await attemptDetail(env, await enforceAttemptExpiry(env, user, updated || active)) });
}

async function finishAttempt(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  const attempt = await env.DB.prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?").bind(attemptId, user.id).first<Row>();
  if (!attempt) return json({ error: "Tentativa não encontrada." }, 404);
  const active = await enforceAttemptExpiry(env, user, attempt);
  const completed = await completeAttempt(env, user, active);
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

async function progress(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, url: URL): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.progress")) return disabled();
  const unitId = text(url.searchParams.get("unitId"), 100) || null;
  if (unitId && !await activeUnit(env, unitId)) return json({ error: "Disciplina inválida." }, 400);
  const contentIds=env.content?JSON.stringify(publishedContent(env).filter(q=>!unitId||q.curricular_unit_id===unitId).map(q=>q.id)):null;
  const [summary, topics, mistakes, recentAttemptsResult, masteryResult] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) AS attempt_count,
      COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) AS completed_count,
      COALESCE(SUM(CASE WHEN status='completed' THEN answered_count ELSE 0 END),0) AS answered_count,
      COALESCE(SUM(CASE WHEN status='completed' THEN correct_count ELSE 0 END),0) AS correct_count,
      COALESCE(SUM(CASE WHEN status='completed' THEN CAST(MAX(COALESCE(completed_at,started_at)-started_at-COALESCE(json_extract(config_json,'$.pausedTotalMs'),0)-CASE WHEN json_extract(config_json,'$.timerPaused')=1 THEN MAX(COALESCE(completed_at,started_at)-COALESCE(json_extract(config_json,'$.pausedAt'),completed_at),0) ELSE 0 END,0)/1000 AS INTEGER) ELSE 0 END),0) AS total_duration_seconds,
      AVG(CASE WHEN status='completed' THEN CAST(MAX(COALESCE(completed_at,started_at)-started_at-COALESCE(json_extract(config_json,'$.pausedTotalMs'),0)-CASE WHEN json_extract(config_json,'$.timerPaused')=1 THEN MAX(COALESCE(completed_at,started_at)-COALESCE(json_extract(config_json,'$.pausedAt'),completed_at),0) ELSE 0 END,0)/1000 AS INTEGER) END) AS average_duration_seconds,
      COALESCE(SUM(CASE WHEN status='completed' AND correct_count*2>=question_count THEN 1 ELSE 0 END),0) AS passed_count,
      (SELECT COUNT(DISTINCT aq.question_id)
       FROM quiz_attempt_questions aq
       JOIN quiz_attempts completed ON completed.id=aq.attempt_id
       WHERE completed.user_id=? AND (? IS NULL OR completed.curricular_unit_id=?) AND completed.status='completed' AND aq.selected_option_id IS NOT NULL) AS unique_question_count
      FROM quiz_attempts
      WHERE user_id=? AND (? IS NULL OR curricular_unit_id=?)`).bind(user.id, unitId, unitId, user.id, unitId, unitId).first<Row>(),
    env.DB.prepare("SELECT aq.topic_id,t.title,aq.curricular_unit_id,cu.code AS unit_code,COUNT(aq.question_id) AS answered_count,SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id LEFT JOIN quiz_topics t ON t.id=aq.topic_id LEFT JOIN curricular_units cu ON cu.id=aq.curricular_unit_id WHERE a.user_id=? AND (? IS NULL OR a.curricular_unit_id=?) AND a.status='completed' AND aq.is_correct IS NOT NULL GROUP BY aq.topic_id ORDER BY (1.0 * SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) / COUNT(aq.question_id)) ASC, answered_count DESC").bind(user.id, unitId, unitId).all(),
    contentIds ? env.DB.prepare("SELECT aq.question_id AS id,aq.prompt,aq.image_url,aq.difficulty,aq.topic_id,t.title AS topic_title,aq.curricular_unit_id AS unit_id,cu.code AS unit_code,MAX(aq.answered_at) AS last_answered_at FROM quiz_attempts a JOIN quiz_attempt_questions aq ON aq.attempt_id=a.id LEFT JOIN quiz_topics t ON t.id=aq.topic_id LEFT JOIN curricular_units cu ON cu.id=aq.curricular_unit_id WHERE a.user_id=? AND (? IS NULL OR a.curricular_unit_id=?) AND aq.is_correct=0 AND aq.question_id IN(SELECT value FROM json_each(?)) GROUP BY aq.question_id ORDER BY last_answered_at DESC LIMIT 50").bind(user.id,unitId,unitId,contentIds).all() : env.DB.prepare("SELECT q.id,q.prompt,q.image_url,q.difficulty,t.id AS topic_id,t.title AS topic_title,cu.id AS unit_id,cu.code AS unit_code,MAX(aq.answered_at) AS last_answered_at FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id JOIN quiz_questions q ON q.id=aq.question_id JOIN quiz_topics t ON t.id=q.topic_id JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE a.user_id=? AND (? IS NULL OR a.curricular_unit_id=?) AND aq.is_correct=0 AND q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL GROUP BY q.id ORDER BY last_answered_at DESC LIMIT 50").bind(user.id, unitId, unitId).all(),
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
      CAST(MAX(COALESCE(a.completed_at,a.started_at)-a.started_at-COALESCE(json_extract(a.config_json,'$.pausedTotalMs'),0)-CASE WHEN json_extract(a.config_json,'$.timerPaused')=1 THEN MAX(COALESCE(a.completed_at,a.started_at)-COALESCE(json_extract(a.config_json,'$.pausedAt'),a.completed_at),0) ELSE 0 END,0)/1000 AS INTEGER) AS actual_duration_seconds
      FROM quiz_attempts a
      LEFT JOIN curricular_units cu ON cu.id=a.curricular_unit_id
      WHERE a.user_id=? AND (? IS NULL OR a.curricular_unit_id=?) AND a.status='completed'
      ORDER BY a.completed_at DESC,a.started_at DESC
      LIMIT 10`).bind(user.id, unitId, unitId).all(),
    contentIds ? env.DB.prepare("SELECT COUNT(*) AS seen_count,SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM (SELECT aq.question_id,aq.is_correct,ROW_NUMBER() OVER(PARTITION BY aq.question_id ORDER BY aq.answered_at DESC,a.started_at DESC,a.id DESC) AS latest FROM quiz_attempts a JOIN quiz_attempt_questions aq ON aq.attempt_id=a.id WHERE a.user_id=? AND (? IS NULL OR a.curricular_unit_id=?) AND a.status='completed' AND aq.selected_option_id IS NOT NULL AND aq.is_correct IS NOT NULL AND aq.question_id IN(SELECT value FROM json_each(?))) WHERE latest=1").bind(user.id,unitId,unitId,contentIds).first<Row>() : env.DB.prepare(`SELECT COUNT(*) AS seen_count,SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM (
      SELECT aq.question_id,aq.is_correct,ROW_NUMBER() OVER (PARTITION BY aq.question_id ORDER BY aq.answered_at DESC,a.started_at DESC,a.id DESC) AS latest
      FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id JOIN quiz_questions q ON q.id=aq.question_id
      WHERE a.user_id=? AND (? IS NULL OR a.curricular_unit_id=?) AND a.status='completed' AND aq.selected_option_id IS NOT NULL AND aq.is_correct IS NOT NULL AND q.status='published' AND q.deleted_at IS NULL
    ) WHERE latest=1`).bind(user.id,unitId,unitId).first<Row>(),
  ]);
  const totalAnswered = Number(summary?.answered_count || 0), totalCorrect = Number(summary?.correct_count || 0);
  const recentAttempts = recentAttemptsResult.results.map((item) => {
    const answeredCount = Number(item.answered_count || 0), correctCount = Number(item.correct_count || 0);
    return { id: item.id, unitId: item.unit_id, unitCode: item.unit_code, mode: item.mode, questionCount: Number(item.question_count || 0), answeredCount, correctCount, accuracy: Number(item.question_count) ? correctCount / Number(item.question_count) : null, startedAt: item.started_at, completedAt: item.completed_at, durationSeconds: Number(item.actual_duration_seconds || 0) };
  });
  const recentAnswered = recentAttempts.reduce((total, attempt) => total + attempt.questionCount, 0);
  const recentCorrect = recentAttempts.reduce((total, attempt) => total + attempt.correctCount, 0);
  return json({ summary: { attemptCount: summary?.attempt_count || 0, completedCount: summary?.completed_count || 0, answeredCount: totalAnswered, correctCount: totalCorrect, accuracy: totalAnswered ? totalCorrect / totalAnswered : null, uniqueQuestionCount: Number(masteryResult?.seen_count || 0), latestCorrectCount: Number(masteryResult?.correct_count || 0), totalDurationSeconds: Number(summary?.total_duration_seconds || 0), averageDurationSeconds: summary?.average_duration_seconds === null || summary?.average_duration_seconds === undefined ? null : Math.round(Number(summary.average_duration_seconds)), passedCount: Number(summary?.passed_count || 0), recentAccuracy: recentAnswered ? recentCorrect / recentAnswered : null }, recentAttempts, topics: topics.results.map((item) => ({ topicId: item.topic_id, title: item.title, unitId: item.curricular_unit_id, unitCode: item.unit_code, answeredCount: item.answered_count, correctCount: item.correct_count, accuracy: Number(item.answered_count) ? Number(item.correct_count) / Number(item.answered_count) : null })), mistakes: mistakes.results.map((item) => ({ id: item.id, prompt: item.prompt, imageUrl: item.image_url, difficulty: item.difficulty, topicId: item.topic_id, topicTitle: item.topic_title, unitId: item.unit_id, unitCode: item.unit_code, lastAnsweredAt: item.last_answered_at })) });
}

async function clearProgress(env: QuizEnv, user: QuizUser | null, enabled: ModuleChecker, url: URL): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.progress")) return disabled();
  const unitId = text(url.searchParams.get("unitId"), 100) || null;
  if (unitId && !await activeUnit(env, unitId)) return json({ error: "Disciplina inválida." }, 400);
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM quiz_attempt_questions WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id=? AND (? IS NULL OR curricular_unit_id=?) AND status<>'active')").bind(user.id, unitId, unitId),
    env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id=? AND (? IS NULL OR curricular_unit_id=?) AND status<>'active'").bind(user.id, unitId, unitId),
  ]);
  const deletedAttempts = Number(results[1]?.meta.changes || 0);
  await audit(env, user, "quiz_progress_cleared", { deletedAttempts, unitId });
  return json({ ok: true, deletedAttempts });
}

async function publicComments(request: Request, env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker, pathQuestionId?: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.practice")) return disabled();
  if (request.method === "GET") {
    const questionId = pathQuestionId || text(url.searchParams.get("questionId"), 100);
    if (!questionId) return json({ error: "Indique a pergunta." }, 400);
    const result = await env.DB.prepare("SELECT c.id,c.question_id,c.parent_comment_id,c.body,c.created_at,c.updated_at,c.pinned_at,u.full_name AS author_name,u.role AS author_role,p.id AS parent_id,pu.full_name AS parent_author_name,pu.role AS parent_author_role FROM quiz_comments c JOIN users u ON u.id=c.author_user_id LEFT JOIN quiz_comments p ON p.id=c.parent_comment_id AND p.question_id=c.question_id AND p.deleted_at IS NULL LEFT JOIN users pu ON pu.id=p.author_user_id WHERE c.question_id=? AND c.deleted_at IS NULL AND c.status='published' ORDER BY c.pinned_at DESC,c.created_at ASC,c.id ASC").bind(questionId).all();
    const comments: PublicQuizComment[] = result.results.map((item) => {
      const parentCommentId = item.parent_comment_id ? String(item.parent_comment_id) : null;
      const parentId = item.parent_id ? String(item.parent_id) : null;
      const authorRole = String(item.author_role);
      const parentAuthorRole = String(item.parent_author_role || "");
      return { id: String(item.id), questionId: String(item.question_id), parentCommentId, parentId, replyTo: parentId ? { id: parentId, authorName: String(item.parent_author_name), authorRole: parentAuthorRole, isAdmin: parentAuthorRole === "admin" } : null, body: String(item.body), status: "published", pinned: item.pinned_at != null, canPin: isAdmin(user), authorName: String(item.author_name), authorRole, isAdmin: authorRole === "admin", createdAt: Number(item.created_at), updatedAt: Number(item.updated_at) };
    });
    return json({ comments, threads: commentThreads(comments) });
  }
  if (request.method === "PATCH") {
    if (!isAdmin(user)) return forbidden();
    const body = await bodyJson(request);
    const id = text(body?.id,100);
    if (typeof body?.pinned !== "boolean") return json({error:"Indique se pretende afixar o comentário."},400);
    const comment = await env.DB.prepare("SELECT id,question_id FROM quiz_comments WHERE id=? AND deleted_at IS NULL AND status='published'").bind(id).first<Row>();
    if (!comment || pathQuestionId && comment.question_id !== pathQuestionId) return json({error:"Comentário não encontrado."},404);
    await env.DB.prepare("UPDATE quiz_comments SET pinned_at=?,updated_at=? WHERE id=?").bind(body.pinned ? Date.now() : null,Date.now(),id).run();
    await audit(env,user,"quiz_comment_pinned",{id,questionId:comment.question_id,pinned:body.pinned});
    return json({ok:true});
  }
  if (request.method !== "POST") return json({ error: "Operação não suportada." }, 405);
  const body = await bodyJson(request);
  const questionId = pathQuestionId || text(body?.questionId, 100);
  const message = sanitizeRichTextHtml(longText(body?.body ?? body?.comment, 5000));
  const messageLength = richTextPlainText(message).length;
  const parentCommentId = text(body?.parentCommentId ?? body?.parentId ?? body?.replyToCommentId, 100);
  if (!questionId || messageLength < 2 || messageLength > 1200) return json({ error: "O comentário deve ter entre 2 e 1200 caracteres." }, 400);
  const question = env.content ? publishedContent(env).find(q=>q.id===questionId) : await env.DB.prepare("SELECT q.id FROM quiz_questions q JOIN quiz_topics t ON t.id=q.topic_id WHERE q.id=? AND q.status='published' AND q.deleted_at IS NULL AND t.status='published' AND t.deleted_at IS NULL").bind(questionId).first();
  if (!question) return json({ error: "A pergunta não está disponível para comentários." }, 404);
  const parent = parentCommentId ? await env.DB.prepare("SELECT c.id,u.full_name AS author_name,u.role AS author_role FROM quiz_comments c JOIN users u ON u.id=c.author_user_id WHERE c.id=? AND c.question_id=? AND c.status='published' AND c.deleted_at IS NULL").bind(parentCommentId, questionId).first<Row>() : null;
  if (parentCommentId && !parent) return json({ error: "A resposta tem de referir um comentário publicado desta pergunta." }, 400);
  const now = Date.now(), id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO quiz_comments (id,question_id,parent_comment_id,author_user_id,body,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)").bind(id, questionId, parentCommentId || null, user.id, message, now, now).run();
  const authorRole = user.role;
  const replyTo = parent ? { id: String(parent.id), authorName: String(parent.author_name), authorRole: String(parent.author_role), isAdmin: parent.author_role === "admin" } : null;
  return json({ comment: { id, questionId, parentCommentId: parentCommentId || null, parentId: parentCommentId || null, replyTo, body: message, status: "published", pinned: false, canPin: isAdmin(user), authorName: user.fullName, authorRole, isAdmin: authorRole === "admin", createdAt: now, updatedAt: now } }, 201);
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
  const topicsPromise = env.DB.prepare("SELECT t.*,cu.code AS unit_code,cu.name AS unit_name,COUNT(q.id) AS question_count,SUM(CASE WHEN q.response_type='multiple_choice' THEN 1 ELSE 0 END) AS multiple_choice_count,SUM(CASE WHEN q.response_type<>'multiple_choice' THEN 1 ELSE 0 END) AS short_answer_count FROM quiz_topics t JOIN curricular_units cu ON cu.id=t.curricular_unit_id LEFT JOIN quiz_questions q ON q.topic_id=t.id AND q.deleted_at IS NULL WHERE (?=1 OR t.deleted_at IS NULL) GROUP BY t.id ORDER BY cu.study_year,cu.semester,t.sort_order,t.title COLLATE NOCASE LIMIT 2000").bind(includeDeleted ? 1 : 0).all();
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
    env.content ? {results:env.content.manifest.topics.filter(t=>t.deleted_at==null)} : env.DB.prepare("SELECT id,curricular_unit_id,title,status FROM quiz_topics WHERE deleted_at IS NULL").all(),
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
  const current = id ? env.content ? await env.content.question(id) : await env.DB.prepare("SELECT * FROM quiz_questions WHERE id=? AND deleted_at IS NULL").bind(id).first<Row>() : null;
  if (!current || current.deleted_at != null) return json({ error: "Pergunta não encontrada." }, 404);
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
  if (imageProvided && imageUrl !== current.image_url) {
    const images = storedImageUrls(current.question_images_json, current.image_url);
    const remaining = images.filter(url => url !== current.image_url && url !== imageUrl);
    statements.push(env.DB.prepare("UPDATE quiz_questions SET question_images_json=? WHERE id=?").bind(JSON.stringify(imageUrl ? [imageUrl,...remaining] : remaining),id));
  }
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
  if (path === "/api/admin/quizzes/content-export") return true;
  return path === "/api/quizzes" || path === "/api/question-bank" || path === "/api/quizzes/export" || /^\/api\/quizzes\/[^/]+$/.test(path) || /^\/api\/quizzes\/[^/]+\/comments$/.test(path) || path === "/api/quiz-attempts" || /^\/api\/quiz-attempts\/[^/]+$/.test(path) || /^\/api\/quiz-attempts\/[^/]+\/(answers|finish|abandon|timer)$/.test(path) || path === "/api/quiz-progress" || path === "/api/quizzes/progress" || path === "/api/quiz-comments" || path === "/api/admin/quizzes" || path === "/api/admin/quizzes/bulk" || path === "/api/admin/quizzes/import" || path === "/api/admin/quizzes/comments" || path === "/api/admin/quiz-comments";
}

async function dispatchQuizRoute(request: Request, env: QuizEnv, url: URL, user: QuizUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes")) return disabled();
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
  if (path === "/api/question-bank") return questionBankCatalog(request, env, url, user, enabled);
  if (path === "/api/quizzes" && request.method === "GET") return catalog(request, env, user, enabled);
  if (path === "/api/quizzes/export") return request.method === "GET" ? exportQuiz(env, url, user, enabled) : json({ error: "Operação não suportada." }, 405);
  if (path === "/api/quiz-progress" || path === "/api/quizzes/progress") {
    if (request.method === "GET") return progress(env, user, enabled, url);
    if (request.method === "DELETE") return clearProgress(env, user, enabled, url);
    return json({ error: "Operação não suportada." }, 405);
  }
  if (path === "/api/quiz-attempts") {
    if (request.method === "POST") return createAttempt(request, env, user, enabled);
    if (request.method === "GET") return getAttempts(env, user, enabled);
  }
  const attemptAction = path.match(/^\/api\/quiz-attempts\/([^/]+)\/(answers|finish|abandon|timer)$/);
  if (attemptAction) {
    if (attemptAction[2] === "timer" && request.method === "POST") return updateAttemptTimer(request, env, user, enabled, attemptAction[1]);
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

export async function handleQuizRoute(
  request: Request,
  env: QuizEnv,
  url: URL,
  user: QuizUser | null,
  enabled: ModuleChecker,
): Promise<Response> {
  if (!user) return unauthenticated();
  if (!(await enabled("quizzes"))) return disabled();
  const path = url.pathname.replace(/\/+$/, "");
  if (path.startsWith("/api/admin/") && !isAdmin(user)) return forbidden();
  if (path === "/api/admin/quizzes/content-export") {
    if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
    if (!(await enabled("quizzes.management"))) return disabled();
    if (env.QUIZ_CONTENT_STORAGE !== "files") return json({ error: "O catálogo não usa ficheiros privados." }, 409);
    try {
      const offset = Number(url.searchParams.get("offset") || "0");
      const response = await createQuizContentExport(env, undefined, offset);
      await audit(env, user, "quiz_content_exported", { format: "private-backup", includesArchived: true, offset });
      return response;
    } catch (error) {
      if (error instanceof QuizContentError) return json({ error: error.message, code: error.code }, error.status);
      throw error;
    }
  }
  if (env.QUIZ_CONTENT_STORAGE === "files" && path.startsWith("/api/admin/")) {
    return json(
      {
        error:
          "As perguntas são atualizadas nos ficheiros da aplicação e publicadas pelo GitHub.",
        code: "QUIZ_CONTENT_READ_ONLY",
      },
      405,
    );
  }
  const needsContent =
    path === "/api/question-bank" ||
    path === "/api/quizzes" ||
    path === "/api/quizzes/export" ||
    (path === "/api/quiz-attempts" && request.method === "POST") ||
    path === "/api/quizzes/progress" ||
    path === "/api/quiz-progress" ||
    (path.startsWith("/api/admin/quizzes") && !path.endsWith("/comments")) ||
    /^\/api\/quizzes\/[^/]+$/.test(path) ||
    ((path === "/api/quiz-comments" || path.endsWith("/comments")) &&
      request.method === "POST");
  const moduleKey = path.startsWith("/api/admin/")
    ? "quizzes.management"
    : path.endsWith("progress") || path === "/api/quiz-progress"
      ? "quizzes.progress"
      : "quizzes.practice";
  if (!(await enabled(moduleKey))) return disabled();
  try {
    const content = needsContent ? await QuizContentStore.open(env) : null;
    return await dispatchQuizRoute(
      request,
      { ...env, content },
      url,
      user,
      enabled,
    );
  } catch (error) {
    if (error instanceof QuizContentError)
      return json({ error: error.message, code: error.code }, error.status);
    throw error;
  }
}

function publishedContent(env: QuizEnv, units?: Set<string>): Row[] {
  const topics = new Set(
    env
      .content!.manifest.topics.filter(
        (t) => t.status === "published" && t.deleted_at == null,
      )
      .map((t) => t.id),
  );
  return env.content!.manifest.questions.filter(
    (q) =>
      q.status === "published" &&
      q.deleted_at == null &&
      topics.has(q.topic_id) &&
      (!units || units.has(String(q.curricular_unit_id))),
  );
}

function contentTopicRows(
  env: QuizEnv,
  units: Row[],
  includeDeleted = false,
  published = false,
): Row[] {
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const counts = new Map<
    unknown,
    {
      question_count: number;
      multiple_choice_count: number;
      short_answer_count: number;
    }
  >();
  for (const q of env.content!.manifest.questions) {
    if (q.deleted_at != null || (published && q.status !== "published"))
      continue;
    const c = counts.get(q.topic_id) || {
      question_count: 0,
      multiple_choice_count: 0,
      short_answer_count: 0,
    };
    c.question_count++;
    if (q.response_type === "multiple_choice") c.multiple_choice_count++;
    else c.short_answer_count++;
    counts.set(q.topic_id, c);
  }
  return env
    .content!.manifest.topics.filter(
      (t) =>
        unitMap.has(t.curricular_unit_id) &&
        (includeDeleted || t.deleted_at == null) &&
        (!published || (t.status === "published" && counts.has(t.id))),
    )
    .map<Row>((t) => ({
      ...t,
      unit_code: unitMap.get(t.curricular_unit_id)!.code,
      unit_name: unitMap.get(t.curricular_unit_id)!.name,
      ...(counts.get(t.id) || {
        question_count: 0,
        multiple_choice_count: 0,
        short_answer_count: 0,
      }),
    }))
    .sort(
      (a, b) =>
        Number(unitMap.get(a.curricular_unit_id)!.study_year) -
          Number(unitMap.get(b.curricular_unit_id)!.study_year) ||
        Number(unitMap.get(a.curricular_unit_id)!.semester) -
          Number(unitMap.get(b.curricular_unit_id)!.semester) ||
        Number(a.sort_order) - Number(b.sort_order) ||
        String(a.title).localeCompare(String(b.title), "pt-PT"),
    );
}

async function contentCatalog(
  env: QuizEnv,
  user: QuizUser,
  enabled: ModuleChecker,
): Promise<Response> {
  const [unitsResult, stats, recommendation] = await Promise.all([
    env.DB.prepare(
      "SELECT id,code,name,ects,study_year,semester FROM curricular_units WHERE active=1 ORDER BY study_year,semester,name COLLATE NOCASE",
    ).all<Row>(),
    env.DB.prepare(PLATFORM_STATS_SQL).all<Row>(),
    enabled("quizzes.progress").then((on) =>
      on
        ? env.DB.prepare(
            "SELECT aq.topic_id,COUNT(*) AS attempted_count,SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) AS correct_count FROM quiz_attempt_questions aq JOIN quiz_attempts a ON a.id=aq.attempt_id WHERE a.user_id=? AND a.status='completed' AND aq.is_correct IS NOT NULL GROUP BY aq.topic_id ORDER BY 1.0*SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END)/COUNT(*) ASC,COUNT(*) DESC",
          )
            .bind(user.id)
            .all<Row>()
        : { results: [] as Row[] },
    ),
  ]);
  const unitRows = unitsResult.results;
  const questions = publishedContent(
    env,
    new Set(unitRows.map((u) => String(u.id))),
  );
  const platformIds = new Set(stats.results.map((s) => s.question_id));
  const totals = new Map<
    unknown,
    { count: number; mc: number; short: number; platform: number }
  >();
  for (const q of questions) {
    const c = totals.get(q.curricular_unit_id) || {
      count: 0,
      mc: 0,
      short: 0,
      platform: 0,
    };
    c.count++;
    if (q.response_type === "multiple_choice") c.mc++;
    else c.short++;
    if (platformIds.has(q.id)) c.platform++;
    totals.set(q.curricular_unit_id, c);
  }
  const catalogTopics = contentTopicRows(env, unitRows, false, true);
  const units = unitRows
    .filter((u) => totals.has(u.id))
    .map((u) => {
      const c = totals.get(u.id)!;
      return {
        id: u.id,
        code: u.code,
        name: u.name,
        ects: u.ects,
        year: u.study_year,
        semester: u.semester,
        questionCount: c.count,
        multipleChoiceCount: c.mc,
        shortAnswerCount: c.short,
        platformMistakeCount: c.platform,
        sources: sourceCounts(catalogTopics.filter(topic => topic.curricular_unit_id === u.id), questions.filter(q => q.curricular_unit_id === u.id && platformIds.has(q.id)).map(q => ({ source: quizSourceForId(q.id), eligible_count: 1 }))),
      };
    });
  const topics = catalogTopics.map((t) => ({
    ...topicDto(t),
    unitCode: t.unit_code,
    unitName: t.unit_name,
  }));
  const recommended = recommendation.results.find((r) =>
    topics.some((t) => t.id === r.topic_id),
  );
  const topic =
    recommended && topics.find((t) => t.id === recommended.topic_id);
  return json({
    units,
    topics,
    themes: topics,
    recommendedTopic:
      topic && recommended
        ? {
            id: topic.id,
            title: topic.title,
            unitId: topic.unitId,
            unitCode: topic.unitCode,
            unitName: topic.unitName,
            attemptedCount: recommended.attempted_count,
            correctCount: recommended.correct_count,
          }
        : null,
  });
}

async function contentCandidateMetadata(
  env: QuizEnv,
  unitId: string,
  topicIds: string[],
  difficulty: Difficulty | null,
  responseType: string,
  source?: QuizSource,
) {
  const units = await env.DB.prepare(
    "SELECT id,code,name FROM curricular_units WHERE active=1",
  ).all<Row>();
  const eligible = publishedContent(
    env,
    new Set(units.results.map((u) => String(u.id))),
  ).filter(
    (q) =>
      (!source || quizSourceForId(q.id) === source) &&
      (!unitId || q.curricular_unit_id === unitId) &&
      (!topicIds.length || topicIds.includes(String(q.topic_id))) &&
      (!difficulty || q.difficulty === difficulty) &&
      (responseType === "multiple_choice"
        ? q.response_type === "multiple_choice"
        : q.response_type !== "multiple_choice"),
  );
  return { units, eligible };
}

async function contentCandidates(
  env: QuizEnv,
  user: QuizUser,
  unitId: string,
  topicIds: string[],
  difficulty: Difficulty | null,
  responseType: string,
  mode: QuizMode,
  count: number,
  frequency = false,
  platform = false,
  source?: QuizSource,
): Promise<{ results: Row[] }> {
  const candidates = await contentCandidateMetadata(
      env,
      unitId,
      topicIds,
      difficulty,
      responseType,
      source,
    ),
    units = candidates.units;
  let eligible = candidates.eligible;
  if (mode === "unseen" || mode === "mistakes") {
    const history = await env.DB.prepare(
      "SELECT aq.question_id,COUNT(aq.selected_option_id) AS seen_count,SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) AS correct_count,SUM(CASE WHEN aq.is_correct=0 THEN 1 ELSE 0 END) AS wrong_count FROM quiz_attempts a JOIN quiz_attempt_questions aq ON aq.attempt_id=a.id WHERE a.user_id=? GROUP BY aq.question_id",
    )
      .bind(user.id)
      .all<Row>();
    const byId = new Map(history.results.map((r) => [r.question_id, r]));
    eligible = eligible.filter((q) => {
      const h = byId.get(q.id);
      return mode === "unseen"
        ? !Number(h?.seen_count)
        : Number(h?.wrong_count) > Number(h?.correct_count);
    });
  }
  let platformStats = new Map<unknown, Row>();
  if (platform) {
    const result = await env.DB.prepare(PLATFORM_STATS_SQL).all<Row>();
    platformStats = new Map(result.results.map((r) => [r.question_id, r]));
    eligible = eligible.filter((q) => platformStats.has(q.id));
  }
  // Fisher-Yates selects from the eligible IDs; SQL no longer scans and sorts all questions.
  eligible = [...eligible];
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  if (platform)
    eligible.sort(
      (a, b) =>
        Number(platformStats.get(b.id)!.wrong_count) /
          Number(platformStats.get(b.id)!.participants) -
          Number(platformStats.get(a.id)!.wrong_count) /
            Number(platformStats.get(a.id)!.participants) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const topics = new Map(env.content!.manifest.topics.map((t) => [t.id, t]));
  if (frequency)
    eligible.sort(
      (a, b) =>
        Number(topics.get(a.topic_id)?.sort_order) -
          Number(topics.get(b.topic_id)?.sort_order) ||
        String(a.topic_id).localeCompare(String(b.topic_id)),
    );
  const picked = eligible.slice(0, count);
  const rows = await env.content!.questionsByIds(
    picked.map((q) => String(q.id)),
  );
  const byId = new Map(rows.map((q) => [q.id, q]));
  const unitById = new Map(units.results.map((u) => [u.id, u]));
  return {
    results: picked.map((q) => ({
      ...byId.get(q.id)!,
      topic_title: topics.get(q.topic_id)?.title,
      unit_code: unitById.get(q.curricular_unit_id)?.code,
      unit_name: unitById.get(q.curricular_unit_id)?.name,
    })),
  };
}

function contentBankResults(
  shard: Awaited<ReturnType<QuizContentStore["shard"]>>,
  filters: Record<string, string>,
): { all: Row[]; selected: Row[]; topics: Row[]; sources: Row[] } {
  const byTopic = new Map(shard.bankTopics.map((t) => [t.id, t]));
  const all = shard.bankQuestions
    .filter(
      (q) =>
        (q.eligible === true ||
          (q.eligible == null &&
            q.status === "published" &&
            q.validation_state === "VALIDADO" &&
            q.confidence === "ALTO" &&
            !String(q.review_note || "").trim() &&
            (q.response_type !== "multiple_choice" ||
              (String(q.options_text).toLowerCase().includes("a)") &&
                String(q.options_text).toLowerCase().includes("b)"))))) &&
        byTopic.has(q.topic_id),
    )
    .map<Row>((q) => ({
      ...q,
      topic_title: byTopic.get(q.topic_id)!.title,
      chapter_number: byTopic.get(q.topic_id)!.chapter_number,
    }));
  const selected = all
    .filter(
      (q) =>
        Object.entries({
          sourceId: "source_id",
          topicId: "topic_id",
          subtopic: "source_subtopic",
          academicYear: "source_academic_year",
          assessment: "source_assessment",
          session: "source_session",
          pageFilter: "source_page",
          responseType: "response_type",
        }).every(
          ([filter, field]) => !filters[filter] || q[field] === filters[filter],
        ) &&
        (!filters.imageFilter ||
          filters.imageFilter === "all" ||
          Boolean(String(q.image_url || "")) ===
            (filters.imageFilter === "with")) &&
        (filters.solutionFilter === "all" ||
          Boolean(
            String(q.answer_text || "").trim() &&
              String(q.answer_text).trim().toLowerCase() !==
                "resolução validada fmup.",
          ) ===
            (filters.solutionFilter === "with")) &&
        (!filters.query ||
          [
            "prompt",
            "topic_title",
            "source_subtopic",
            "source_question",
            "source_assessment",
            "source_session",
          ].some((field) =>
            String(q[field] || "")
              .toLocaleLowerCase("pt-PT")
              .includes(filters.query.toLocaleLowerCase("pt-PT")),
          )),
    )
    .sort(
      (a, b) =>
        Number(a.sort_order) - Number(b.sort_order) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const counts = new Map<unknown, number>();
  for (const q of all)
    counts.set(q.topic_id, (counts.get(q.topic_id) || 0) + 1);
  return {
    all,
    selected,
    topics: shard.bankTopics
      .map<Row>((t) => ({ ...t, question_count: counts.get(t.id) || 0 }))
      .sort(
        (a, b) =>
          Number(a.sort_order) - Number(b.sort_order) ||
          String(a.title).localeCompare(String(b.title), "pt-PT"),
      ),
    sources: [...shard.bankSources].sort(
      (a, b) => Number(b.updated_at) - Number(a.updated_at),
    ),
  };
}
