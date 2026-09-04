import { isShortAnswerMatch } from "@/lib/short-answer-match.mjs";

type Row = Record<string, unknown>;
type LearningUser = { id: string; role: string; actorId?: string };
type LearningEnv = { DB: D1Database };
type ModuleChecker = (key: string) => Promise<boolean>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function bodyJson(request: Request): Promise<Row | null> {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
  } catch {
    return null;
  }
}

function unauthenticated(): Response { return json({ error: "Sessão inválida." }, 401); }
function disabled(): Response { return json({ error: "A aprendizagem interativa está temporariamente desativada.", code: "MODULE_DISABLED" }, 404); }

function moduleDto(item: Row) {
  return {
    id: String(item.id),
    unitId: String(item.curricular_unit_id),
    unitCode: String(item.unit_code || "UC"),
    unitName: String(item.unit_name || "Unidade curricular"),
    topicId: item.quiz_topic_id ? String(item.quiz_topic_id) : null,
    title: String(item.title),
    summary: String(item.summary || ""),
    estimatedMinutes: Number(item.estimated_minutes || 0),
    stepCount: Number(item.step_count || 0),
    exerciseCount: Number(item.exercise_count || 0),
    progress: item.attempt_id ? {
      attemptId: String(item.attempt_id),
      status: String(item.attempt_status || "active"),
      currentStepPosition: Number(item.current_step_position || 1),
      correctCount: Number(item.correct_count || 0),
      answeredCount: Number(item.answered_count || 0),
    } : null,
  };
}

async function catalogue(env: LearningEnv, user: LearningUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.learning")) return disabled();
  const result = await env.DB.prepare(`
    SELECT lm.*,cu.code AS unit_code,cu.name AS unit_name,
      (SELECT COUNT(*) FROM learning_steps ls WHERE ls.module_id=lm.id) AS step_count,
      (SELECT COUNT(*) FROM learning_steps ls WHERE ls.module_id=lm.id AND ls.step_type='exercise') AS exercise_count,
      la.id AS attempt_id,la.status AS attempt_status,la.current_step_position,
      (SELECT COUNT(*) FROM learning_step_responses lr WHERE lr.attempt_id=la.id) AS answered_count,
      (SELECT COALESCE(SUM(CASE WHEN lr.is_correct=1 THEN 1 ELSE 0 END),0) FROM learning_step_responses lr WHERE lr.attempt_id=la.id) AS correct_count
    FROM learning_modules lm
    JOIN curricular_units cu ON cu.id=lm.curricular_unit_id AND cu.active=1
    LEFT JOIN learning_attempts la ON la.id=(
      SELECT recent.id FROM learning_attempts recent
      WHERE recent.user_id=? AND recent.module_id=lm.id
      ORDER BY CASE recent.status WHEN 'active' THEN 0 ELSE 1 END,recent.updated_at DESC LIMIT 1
    )
    WHERE lm.status='published'
    ORDER BY cu.study_year,cu.semester,lm.sort_order,lm.title COLLATE NOCASE
  `).bind(user.id).all();
  return json({ modules: result.results.map((item) => moduleDto(item as Row)) });
}

async function moduleRecord(env: LearningEnv, moduleId: string): Promise<Row | null> {
  return env.DB.prepare(`
    SELECT lm.*,cu.code AS unit_code,cu.name AS unit_name
    FROM learning_modules lm
    JOIN curricular_units cu ON cu.id=lm.curricular_unit_id AND cu.active=1
    WHERE lm.id=? AND lm.status='published'
  `).bind(moduleId).first<Row>();
}

async function attemptRecord(env: LearningEnv, user: LearningUser, attemptId: string): Promise<Row | null> {
  return env.DB.prepare(`
    SELECT la.* FROM learning_attempts la
    JOIN learning_modules lm ON lm.id=la.module_id AND lm.status='published'
    WHERE la.id=? AND la.user_id=?
  `).bind(attemptId, user.id).first<Row>();
}

async function detail(env: LearningEnv, user: LearningUser, attempt: Row): Promise<Response> {
  const learningModule = await moduleRecord(env, String(attempt.module_id));
  if (!learningModule) return json({ error: "Percurso de aprendizagem não encontrado." }, 404);
  const [stepsResult, responsesResult] = await Promise.all([
    env.DB.prepare(`
      SELECT ls.*,q.prompt,q.image_url,q.explanation,q.difficulty
      FROM learning_steps ls
      LEFT JOIN quiz_questions q ON q.id=ls.question_id AND q.status='published' AND q.deleted_at IS NULL
      WHERE ls.module_id=? ORDER BY ls.position
    `).bind(learningModule.id).all(),
    env.DB.prepare("SELECT * FROM learning_step_responses WHERE attempt_id=? ORDER BY created_at").bind(attempt.id).all(),
  ]);
  const responses = new Map(responsesResult.results.map((item) => [String(item.step_id), item as Row]));
  const questionIds = stepsResult.results.map((item) => item.question_id ? String(item.question_id) : "").filter(Boolean);
  const options = new Map<string, Array<{ id: string; text: string; position: number; correct: boolean }>>();
  if (questionIds.length) {
    const placeholders = questionIds.map(() => "?").join(",");
    const optionResult = await env.DB.prepare(`SELECT id,question_id,option_text,position,is_correct FROM quiz_question_options WHERE question_id IN (${placeholders}) ORDER BY question_id,position`).bind(...questionIds).all();
    for (const item of optionResult.results) {
      const questionId = String(item.question_id), values = options.get(questionId) || [];
      values.push({ id: String(item.id), text: String(item.option_text), position: Number(item.position), correct: Number(item.is_correct) === 1 });
      options.set(questionId, values);
    }
  }
  const steps = stepsResult.results.map((raw) => {
    const item = raw as Row;
    const response = responses.get(String(item.id));
    const choices = item.question_id ? options.get(String(item.question_id)) || [] : [];
    const correctChoice = choices.find((choice) => choice.correct);
    const expectedAnswer = String(item.expected_answer || correctChoice?.text || "");
    return {
      id: String(item.id),
      position: Number(item.position),
      type: String(item.step_type),
      title: String(item.title),
      content: String(item.content_html || ""),
      answerFormat: item.answer_format ? String(item.answer_format) : null,
      question: item.question_id ? {
        id: String(item.question_id),
        prompt: String(item.prompt || ""),
        imageUrl: item.image_url ? String(item.image_url) : null,
        difficulty: String(item.difficulty || "medium"),
        options: choices.map(({ id, text: optionText, position }) => ({ id, text: optionText, position })),
      } : null,
      response: response ? {
        selectedOptionId: response.selected_option_id ? String(response.selected_option_id) : null,
        answerText: response.answer_text ? String(response.answer_text) : null,
        correct: Number(response.is_correct) === 1,
        correctOptionId: correctChoice?.id || null,
        correctAnswer: expectedAnswer,
        explanation: String(item.explanation || ""),
      } : null,
    };
  });
  const answeredCount = responsesResult.results.length;
  const correctCount = responsesResult.results.filter((item) => Number(item.is_correct) === 1).length;
  return json({
    module: { ...moduleDto(learningModule), stepCount: steps.length, exerciseCount: steps.filter((step) => step.type === "exercise").length },
    attempt: {
      id: String(attempt.id),
      moduleId: String(attempt.module_id),
      status: String(attempt.status),
      currentStepPosition: Number(attempt.current_step_position),
      startedAt: Number(attempt.started_at),
      completedAt: attempt.completed_at ? Number(attempt.completed_at) : null,
      answeredCount,
      correctCount,
    },
    steps,
  });
}

async function start(request: Request, env: LearningEnv, user: LearningUser | null, enabled: ModuleChecker, moduleId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.learning")) return disabled();
  if (request.method !== "POST") return json({ error: "Operação não suportada." }, 405);
  const learningModule = await moduleRecord(env, moduleId);
  if (!learningModule) return json({ error: "Percurso de aprendizagem não encontrado." }, 404);
  let attempt = await env.DB.prepare("SELECT * FROM learning_attempts WHERE user_id=? AND module_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1").bind(user.id, moduleId).first<Row>();
  if (!attempt) {
    const now = Date.now(), id = crypto.randomUUID();
    try {
      await env.DB.prepare("INSERT INTO learning_attempts (id,user_id,module_id,status,current_step_position,started_at,created_at,updated_at) VALUES (?,?,?,'active',1,?,?,?)").bind(id, user.id, moduleId, now, now, now).run();
      attempt = await env.DB.prepare("SELECT * FROM learning_attempts WHERE id=? AND user_id=?").bind(id, user.id).first<Row>();
    } catch {
      attempt = await env.DB.prepare("SELECT * FROM learning_attempts WHERE user_id=? AND module_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1").bind(user.id, moduleId).first<Row>();
    }
  }
  return attempt ? detail(env, user, attempt) : json({ error: "Não foi possível iniciar o percurso." }, 500);
}

async function getAttempt(env: LearningEnv, user: LearningUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.learning")) return disabled();
  const attempt = await attemptRecord(env, user, attemptId);
  return attempt ? detail(env, user, attempt) : json({ error: "Sessão de aprendizagem não encontrada." }, 404);
}

async function respond(request: Request, env: LearningEnv, user: LearningUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.learning")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const attempt = await attemptRecord(env, user, attemptId);
  if (!attempt) return json({ error: "Sessão de aprendizagem não encontrada." }, 404);
  if (attempt.status !== "active") return json({ error: "Este percurso já foi concluído.", code: "attempt_completed" }, 409);
  const stepId = text(body.stepId, 100);
  const step = await env.DB.prepare(`
    SELECT ls.*,q.explanation FROM learning_steps ls
    JOIN quiz_questions q ON q.id=ls.question_id AND q.status='published' AND q.deleted_at IS NULL
    WHERE ls.id=? AND ls.module_id=? AND ls.step_type='exercise'
  `).bind(stepId, attempt.module_id).first<Row>();
  if (!step || Number(step.position) !== Number(attempt.current_step_position)) return json({ error: "Este exercício não é o passo atual." }, 409);
  const previous = await env.DB.prepare("SELECT id FROM learning_step_responses WHERE attempt_id=? AND step_id=?").bind(attemptId, stepId).first();
  if (previous) return json({ error: "Este exercício já foi corrigido.", code: "response_locked" }, 409);
  const optionsResult = await env.DB.prepare("SELECT id,option_text,is_correct FROM quiz_question_options WHERE question_id=? ORDER BY position").bind(step.question_id).all();
  const options = optionsResult.results.map((item) => ({ id: String(item.id), text: String(item.option_text), correct: Number(item.is_correct) === 1 }));
  const correctOption = options.find((option) => option.correct);
  if (!correctOption) return json({ error: "O exercício não tem uma resposta configurada." }, 409);
  const answerFormat = String(step.answer_format);
  const selectedOptionId = text(body.selectedOptionId, 100);
  const answerText = text(body.answerText, 1000);
  if (answerFormat === "multiple_choice" && !options.some((option) => option.id === selectedOptionId)) return json({ error: "Seleciona uma opção válida." }, 400);
  if (answerFormat === "short_answer" && !answerText) return json({ error: "Escreve uma resposta antes de verificar." }, 400);
  const expectedAnswer = text(step.expected_answer, 1000) || correctOption.text;
  const correct = answerFormat === "multiple_choice" ? selectedOptionId === correctOption.id : isShortAnswerMatch(answerText, expectedAnswer);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO learning_step_responses (id,attempt_id,step_id,selected_option_id,answer_text,is_correct,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), attemptId, stepId, answerFormat === "multiple_choice" ? selectedOptionId : null, answerFormat === "short_answer" ? answerText : null, correct ? 1 : 0, now, now).run();
  await env.DB.prepare("UPDATE learning_attempts SET updated_at=? WHERE id=? AND user_id=?").bind(now, attemptId, user.id).run();
  return json({ response: { selectedOptionId: selectedOptionId || null, answerText: answerText || null, correct, correctOptionId: correctOption.id, correctAnswer: expectedAnswer, explanation: String(step.explanation || "") } });
}

async function advance(request: Request, env: LearningEnv, user: LearningUser | null, enabled: ModuleChecker, attemptId: string): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("quizzes.learning")) return disabled();
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  const attempt = await attemptRecord(env, user, attemptId);
  if (!attempt) return json({ error: "Sessão de aprendizagem não encontrada." }, 404);
  if (attempt.status !== "active") return detail(env, user, attempt);
  const stepId = text(body.stepId, 100);
  const step = await env.DB.prepare("SELECT id,position,step_type FROM learning_steps WHERE id=? AND module_id=?").bind(stepId, attempt.module_id).first<Row>();
  if (!step || Number(step.position) !== Number(attempt.current_step_position)) return json({ error: "Este passo já não está ativo." }, 409);
  if (step.step_type === "exercise") {
    const response = await env.DB.prepare("SELECT id FROM learning_step_responses WHERE attempt_id=? AND step_id=?").bind(attemptId, stepId).first();
    if (!response) return json({ error: "Responde ao exercício antes de continuar." }, 409);
  }
  const next = await env.DB.prepare("SELECT position FROM learning_steps WHERE module_id=? AND position>? ORDER BY position LIMIT 1").bind(attempt.module_id, step.position).first<Row>();
  const now = Date.now();
  if (next) {
    await env.DB.prepare("UPDATE learning_attempts SET current_step_position=?,updated_at=? WHERE id=? AND user_id=? AND status='active'").bind(next.position, now, attemptId, user.id).run();
  } else {
    await env.DB.prepare("UPDATE learning_attempts SET status='completed',completed_at=?,updated_at=? WHERE id=? AND user_id=? AND status='active'").bind(now, now, attemptId, user.id).run();
  }
  const updated = await attemptRecord(env, user, attemptId);
  return updated ? detail(env, user, updated) : json({ error: "Não foi possível atualizar o percurso." }, 500);
}

export function isLearningPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === "/api/learning-modules"
    || /^\/api\/learning-modules\/[^/]+\/start$/.test(path)
    || /^\/api\/learning-attempts\/[^/]+$/.test(path)
    || /^\/api\/learning-attempts\/[^/]+\/(responses|advance)$/.test(path);
}

export async function handleLearningRoute(request: Request, env: LearningEnv, url: URL, user: LearningUser | null, enabled: ModuleChecker): Promise<Response> {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (path === "/api/learning-modules") return request.method === "GET" ? catalogue(env, user, enabled) : json({ error: "Operação não suportada." }, 405);
  const startMatch = path.match(/^\/api\/learning-modules\/([^/]+)\/start$/);
  if (startMatch) return start(request, env, user, enabled, startMatch[1]);
  const actionMatch = path.match(/^\/api\/learning-attempts\/([^/]+)\/(responses|advance)$/);
  if (actionMatch) {
    if (actionMatch[2] === "responses" && request.method === "PUT") return respond(request, env, user, enabled, actionMatch[1]);
    if (actionMatch[2] === "advance" && request.method === "POST") return advance(request, env, user, enabled, actionMatch[1]);
    return json({ error: "Operação não suportada." }, 405);
  }
  const attemptMatch = path.match(/^\/api\/learning-attempts\/([^/]+)$/);
  if (attemptMatch) return request.method === "GET" ? getAttempt(env, user, enabled, attemptMatch[1]) : json({ error: "Operação não suportada." }, 405);
  return json({ error: "Endpoint não encontrado." }, 404);
}
