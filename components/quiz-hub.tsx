"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Flag,
  Lightbulb,
  LoaderCircle,
  Keyboard,
  MessageCircle,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  TimerReset,
  Trash2,
  Trophy,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { isShortAnswerMatch } from "@/lib/short-answer-match.mjs";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ModuleGuard } from "@/components/module-guard";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";
import type { QuizExportPayload } from "@/lib/anki";
import styles from "@/components/quiz-hub.module.css";

type Mode = "quick" | "exam" | "unseen" | "mistakes" | "topic";
type Screen = "catalogue" | "statistics" | "attempt" | "results";
type Notice = { kind: ToastKind; message: string } | null;
type AnswerFormat = "multiple_choice" | "short_answer";
type ShortAnswerMode = "type_and_check" | "reveal_and_self_assess";

type ApiOption = { id: string | number; text?: string; label?: string; content?: string };
type ApiQuestion = {
  id: string | number;
  text?: string;
  prompt?: string;
  question?: string;
  statement?: string;
  imageUrl?: string | null;
  image_url?: string | null;
  imageAlt?: string | null;
  image_alt?: string | null;
  topicId?: string | number | null;
  topic_id?: string | number | null;
  topic?: string | { id?: string | number; name?: string; title?: string } | null;
  options?: ApiOption[];
  correctOptionId?: string | number | null;
  correct_option_id?: string | number | null;
  selectedOptionId?: string | number | null;
  selected_option_id?: string | number | null;
  correct?: boolean | null;
  explanation?: string | null;
};
type Question = {
  id: string;
  text: string;
  imageUrl: string | null;
  imageAlt: string;
  topicId: string | null;
  topic: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string | null;
  explanation: string | null;
};
type ApiTopic = { id: string | number; unitId?: string | number; unit_id?: string | number; curricularUnitId?: string | number; curricular_unit_id?: string | number; name?: string; title?: string; questionCount?: number; question_count?: number };
type Topic = { id: string; unitId: string; name: string; questionCount: number };
type ApiUnit = { id: string | number; name?: string; title?: string; code?: string; questionCount?: number; question_count?: number; topics?: ApiTopic[] };
type Unit = { id: string; name: string; code: string; questionCount: number; topics: Topic[] };
type Answer = { questionId: string; selectedOptionId: string; correct: boolean | null };
type Attempt = {
  id: string;
  unitId: string;
  mode: Mode;
  status: "active" | "finished";
  quizId: string;
  title: string;
  startedAt: string | null;
  endsAt: string | null;
  durationSeconds: number | null;
  questions: Question[];
  answers: Answer[];
  score: number | null;
  totalCorrect: number | null;
};
type ApiComment = { id: string | number; body?: string; text?: string; authorName?: string; author_name?: string; authorRole?: string; author_role?: string; isAdmin?: boolean; is_admin?: boolean; parentCommentId?: string | number | null; parent_comment_id?: string | number | null; replyTo?: { authorName?: string; author_name?: string } | null; createdAt?: string | number; created_at?: string | number; status?: string };
type Comment = { id: string; body: string; authorName: string; authorRole?: string; isAdmin?: boolean; createdAt: string | null; status: string; parentCommentId?: string; replyToName?: string; isLocal?: boolean };

type QuizPreferences = { unitId?: string; mode?: Mode; topicIds?: string[]; questionCount?: number; answerFormat?: AnswerFormat; shortAnswerMode?: ShortAnswerMode };
const QUIZ_QUESTION_COUNTS: readonly number[] = [5, 10, 15, 30, 50];
const DEFAULT_QUESTION_COUNT = QUIZ_QUESTION_COUNTS[0];
type QuizProgress = { attemptId: string; currentIndex: number; expiresAt: string; updatedAt: string };
type QuizStatistics = {
  summary: {
    attemptCount: number;
    completedCount: number;
    answeredCount: number;
    correctCount: number;
    uniqueQuestionCount: number;
    passedCount: number;
    totalDurationSeconds: number;
    averageDurationSeconds: number;
    accuracy: number | null;
    recentAccuracy: number | null;
  };
  topics: Array<{ topicId: string; title: string; unitId: string; unitCode: string; answeredCount: number; correctCount: number; accuracy: number | null }>;
  recentAttempts: Array<{ id: string; unitId: string; unitCode: string; mode: Mode; questionCount: number; answeredCount: number; correctCount: number; accuracy: number | null; startedAt: string | null; completedAt: string | null; durationSeconds: number }>;
};
const QUIZ_PREFERENCES_COOKIE = "gu-quiz-preferences";
const QUIZ_PROGRESS_COOKIE = "gu-quiz-progress";
const EMPTY_TOPICS: Topic[] = [];

const modeCards: Array<{ id: Mode; title: string; description: string; icon: typeof Play }> = [
  { id: "quick", title: "Sessão guiada", description: "Mistura perguntas para consolidar o que já estudaste.", icon: BrainCircuit },
  { id: "unseen", title: "Matéria nova", description: "Descobre conceitos através de perguntas que ainda não viste.", icon: EyeOff },
  { id: "mistakes", title: "Só erros", description: "Recupera perguntas falhadas e corrige confusões recentes.", icon: RotateCcw },
  { id: "topic", title: "Por tópico", description: "Concentra a sessão num ou mais temas da unidade curricular.", icon: BookOpen },
];

function modeTitle(mode: Mode) {
  return mode === "topic" ? "Por tópico" : mode === "unseen" ? "Matéria nova" : mode === "mistakes" ? "Só erros" : mode === "exam" ? "Simulado" : "Sessão guiada";
}

function questionLabel(count: number) {
  return `${count} ${count === 1 ? "pergunta" : "perguntas"}`;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const timestamp = typeof value === "number" || /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function readQuizPreferences(): QuizPreferences {
  if (typeof document === "undefined") return {};
  const encoded = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${QUIZ_PREFERENCES_COOKIE}=`))?.slice(QUIZ_PREFERENCES_COOKIE.length + 1);
  if (!encoded) return {};
  try {
    const saved = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    const mode = typeof saved.mode === "string" && ["quick", "unseen", "topic", "mistakes"].includes(saved.mode) ? saved.mode as Mode : undefined;
    const questionCount = typeof saved.questionCount === "number" && QUIZ_QUESTION_COUNTS.includes(saved.questionCount) ? saved.questionCount : undefined;
    const answerFormat = saved.answerFormat === "short_answer" ? "short_answer" : saved.answerFormat === "multiple_choice" ? "multiple_choice" : undefined;
    const shortAnswerMode = saved.shortAnswerMode === "reveal_and_self_assess" ? "reveal_and_self_assess" : saved.shortAnswerMode === "type_and_check" ? "type_and_check" : undefined;
    return { unitId: typeof saved.unitId === "string" ? saved.unitId.slice(0, 100) : undefined, mode, topicIds: Array.isArray(saved.topicIds) ? saved.topicIds.filter((id): id is string => typeof id === "string").slice(0, 30) : undefined, questionCount, answerFormat, shortAnswerMode };
  } catch { return {}; }
}

function saveQuizPreferences(preferences: QuizPreferences) {
  if (typeof document === "undefined") return;
  const preferredQuestionCount = preferences.questionCount ?? DEFAULT_QUESTION_COUNT;
  const safe = { unitId: preferences.unitId?.slice(0, 100) ?? "", mode: preferences.mode ?? "quick", topicIds: (preferences.topicIds ?? []).slice(0, 30), questionCount: QUIZ_QUESTION_COUNTS.includes(preferredQuestionCount) ? preferredQuestionCount : DEFAULT_QUESTION_COUNT, answerFormat: preferences.answerFormat ?? "multiple_choice", shortAnswerMode: preferences.shortAnswerMode ?? "type_and_check" };
  document.cookie = `${QUIZ_PREFERENCES_COOKIE}=${encodeURIComponent(JSON.stringify(safe))}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

function readQuizProgress(): QuizProgress | null {
  if (typeof document === "undefined") return null;
  const encoded = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${QUIZ_PROGRESS_COOKIE}=`))?.slice(QUIZ_PROGRESS_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    const saved = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    const expiresAt = isoDate(saved.expiresAt);
    if (typeof saved.attemptId !== "string" || !saved.attemptId || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) return null;
    return { attemptId: saved.attemptId.slice(0, 120), currentIndex: Math.max(0, Math.floor(Number(saved.currentIndex) || 0)), expiresAt, updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : new Date().toISOString() };
  } catch { return null; }
}

function saveQuizProgress(attempt: Attempt, currentIndex: number) {
  if (typeof document === "undefined" || !attempt.id || attempt.status !== "active") return;
  const expiresAt = attempt.endsAt ?? new Date(Date.now() + (attempt.durationSeconds ?? attempt.questions.length * 60) * 1000).toISOString();
  const safe: QuizProgress = { attemptId: attempt.id.slice(0, 120), currentIndex: Math.max(0, Math.min(currentIndex, Math.max(0, attempt.questions.length - 1))), expiresAt, updatedAt: new Date().toISOString() };
  const maxAge = Math.max(60, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  document.cookie = `${QUIZ_PROGRESS_COOKIE}=${encodeURIComponent(JSON.stringify(safe))}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

function clearQuizProgress() {
  if (typeof document === "undefined") return;
  document.cookie = `${QUIZ_PROGRESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

function value<T>(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (raw[key] !== undefined && raw[key] !== null) return raw[key] as T;
  return undefined;
}

function normalizeTopic(item: ApiTopic): Topic {
  return { id: String(item.id), unitId: String(item.unitId ?? item.unit_id ?? item.curricularUnitId ?? item.curricular_unit_id ?? ""), name: item.name ?? item.title ?? "Tema", questionCount: Number(item.questionCount ?? item.question_count ?? 0) };
}

function normalizeQuestion(item: ApiQuestion): Question {
  const rawTopic = item.topic;
  const objectTopic = rawTopic && typeof rawTopic === "object" ? rawTopic : null;
  return {
    id: String(item.id),
    text: item.text ?? item.prompt ?? item.question ?? item.statement ?? "Pergunta sem enunciado.",
    imageUrl: item.imageUrl ?? item.image_url ?? null,
    imageAlt: item.imageAlt ?? item.image_alt ?? "Imagem de apoio à pergunta",
    topicId: item.topicId !== undefined || item.topic_id !== undefined ? String(item.topicId ?? item.topic_id) : objectTopic?.id !== undefined ? String(objectTopic.id) : null,
    topic: typeof rawTopic === "string" ? rawTopic : objectTopic?.name ?? objectTopic?.title ?? "Tema geral",
    options: (item.options ?? []).slice(0, 4).map((option) => ({ id: String(option.id), text: option.text ?? option.label ?? option.content ?? "Opção sem texto" })),
    correctOptionId: item.correctOptionId !== undefined || item.correct_option_id !== undefined ? String(item.correctOptionId ?? item.correct_option_id) : null,
    explanation: item.explanation ?? null,
  };
}

function normalizeAnswer(item: Record<string, unknown>): Answer {
  return {
    questionId: String(value<string | number>(item, "questionId", "question_id") ?? ""),
    selectedOptionId: String(value<string | number>(item, "selectedOptionId", "selected_option_id", "optionId", "option_id") ?? ""),
    correct: typeof value<unknown>(item, "correct", "isCorrect", "is_correct") === "boolean" ? Boolean(value<unknown>(item, "correct", "isCorrect", "is_correct")) : null,
  };
}

function normalizeAttempt(raw: Record<string, unknown>, fallbackMode: Mode = "quick"): Attempt {
  const attempt = (raw.attempt && typeof raw.attempt === "object" ? raw.attempt : raw) as Record<string, unknown>;
  const questions = (value<ApiQuestion[]>(attempt, "questions") ?? value<ApiQuestion[]>(raw, "questions") ?? []).map(normalizeQuestion);
  const responseAnswers = (value<Record<string, unknown>[]>(attempt, "answers") ?? value<Record<string, unknown>[]>(raw, "answers") ?? []).map(normalizeAnswer).filter((answer) => answer.questionId);
  const answers = responseAnswers.length ? responseAnswers : questions.map((question, index) => {
    const source = (value<ApiQuestion[]>(attempt, "questions") ?? value<ApiQuestion[]>(raw, "questions") ?? [])[index];
    const selected = source?.selectedOptionId ?? source?.selected_option_id;
    return selected === null || selected === undefined ? null : { questionId: question.id, selectedOptionId: String(selected), correct: typeof source?.correct === "boolean" ? source.correct : null };
  }).filter((answer): answer is Answer => Boolean(answer));
  const rawMode = String(value<string>(attempt, "mode") ?? fallbackMode);
  const rawStartedAt = value<string | number>(attempt, "startedAt", "started_at");
  const rawEndsAt = value<string | number>(attempt, "endsAt", "ends_at", "expiresAt", "expires_at");
  return {
    id: String(value<string | number>(attempt, "id", "attemptId", "attempt_id") ?? ""),
    unitId: String(value<string | number>(attempt, "unitId", "unit_id", "curricularUnitId", "curricular_unit_id") ?? ""),
    mode: (["quick", "unseen", "topic", "mistakes", "exam"].includes(rawMode) ? rawMode : fallbackMode) as Mode,
    status: ["finished", "completed", "abandoned", "expired"].includes(String(value<string>(attempt, "status") ?? "active")) ? "finished" : "active",
    quizId: String(value<string | number>(attempt, "quizId", "quiz_id") ?? ""),
    title: String(value<string>(attempt, "quizTitle", "quiz_title", "title") ?? "Teste"),
    startedAt: isoDate(rawStartedAt),
    endsAt: isoDate(rawEndsAt),
    durationSeconds: Number(value<number>(attempt, "durationSeconds", "duration_seconds") ?? 0) || (questions.length ? questions.length * 60 : null),
    questions,
    answers,
    score: Number(value<number>(attempt, "score", "scorePercent", "score_percent") ?? NaN),
    totalCorrect: Number(value<number>(attempt, "totalCorrect", "total_correct", "correctAnswers", "correct_answers", "correctCount", "correct_count") ?? NaN),
  };
}

function normalizeComment(item: ApiComment): Comment {
  const parentCommentId = item.parentCommentId ?? item.parent_comment_id;
  return { id: String(item.id), body: item.body ?? item.text ?? "", authorName: item.authorName ?? item.author_name ?? "Estudante", authorRole: item.authorRole ?? item.author_role, isAdmin: item.isAdmin ?? item.is_admin, parentCommentId: parentCommentId === null || parentCommentId === undefined ? undefined : String(parentCommentId), replyToName: item.replyTo?.authorName ?? item.replyTo?.author_name, createdAt: item.createdAt ? String(item.createdAt) : item.created_at ? String(item.created_at) : null, status: item.status ?? "published" };
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function humanDate(value: string | null) {
  if (!value) return "agora";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "agora" : new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function humanDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function normaliseStatistics(data: Record<string, unknown>): QuizStatistics {
  const rawSummary = data.summary && typeof data.summary === "object" ? data.summary as Record<string, unknown> : {};
  const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const ratio = (value: unknown) => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.min(1, Number(value)));
  const rawTopics = Array.isArray(data.topics) ? data.topics : [];
  const rawRecent = Array.isArray(data.recentAttempts) ? data.recentAttempts : [];
  return {
    summary: {
      attemptCount: number(rawSummary.attemptCount), completedCount: number(rawSummary.completedCount), answeredCount: number(rawSummary.answeredCount), correctCount: number(rawSummary.correctCount),
      uniqueQuestionCount: number(rawSummary.uniqueQuestionCount), passedCount: number(rawSummary.passedCount), totalDurationSeconds: number(rawSummary.totalDurationSeconds), averageDurationSeconds: number(rawSummary.averageDurationSeconds),
      accuracy: ratio(rawSummary.accuracy), recentAccuracy: ratio(rawSummary.recentAccuracy),
    },
    topics: rawTopics.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).map((item) => ({
      topicId: String(item.topicId ?? ""), title: String(item.title ?? "Tema"), unitId: String(item.unitId ?? ""), unitCode: String(item.unitCode ?? "UC"), answeredCount: number(item.answeredCount), correctCount: number(item.correctCount), accuracy: ratio(item.accuracy),
    })),
    recentAttempts: rawRecent.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).map((item) => ({
      id: String(item.id ?? ""), unitId: String(item.unitId ?? ""), unitCode: String(item.unitCode ?? "UC"), mode: (["quick", "exam", "unseen", "mistakes", "topic"].includes(String(item.mode)) ? String(item.mode) : "quick") as Mode,
      questionCount: number(item.questionCount), answeredCount: number(item.answeredCount), correctCount: number(item.correctCount), accuracy: ratio(item.accuracy), startedAt: isoDate(item.startedAt), completedAt: isoDate(item.completedAt), durationSeconds: number(item.durationSeconds),
    })),
  };
}

function apiError(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" ? data.error : fallback;
}

export function QuizHub() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState(() => readQuizPreferences().unitId ?? "");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(() => readQuizPreferences().topicIds ?? []);
  const [selectedMode, setSelectedMode] = useState<Mode>(() => readQuizPreferences().mode ?? "quick");
  const [abandonConfirmation, setAbandonConfirmation] = useState(false);
  const [clearStatisticsConfirmation, setClearStatisticsConfirmation] = useState(false);
  const [questionCount, setQuestionCount] = useState(() => readQuizPreferences().questionCount ?? DEFAULT_QUESTION_COUNT);
  const [answerFormat, setAnswerFormat] = useState<AnswerFormat>(() => readQuizPreferences().answerFormat ?? "multiple_choice");
  const [shortAnswerMode, setShortAnswerMode] = useState<ShortAnswerMode>(() => readQuizPreferences().shortAnswerMode ?? "type_and_check");
  const [screen, setScreen] = useState<Screen>("catalogue");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [savingQuestionIds, setSavingQuestionIds] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [availability, setAvailability] = useState<{ code: "not_enough_mistakes" | "all_questions_seen" | "not_enough_questions"; available: number; required: number; total: number } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [statistics, setStatistics] = useState<QuizStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [statisticsError, setStatisticsError] = useState("");
  const [clearingStatistics, setClearingStatistics] = useState(false);
  const [exportingAnki, setExportingAnki] = useState(false);
  const attemptRef = useRef<Attempt | null>(null);
  const pendingAnswerSaves = useRef(new Map<string, Promise<void>>());

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const topics = selectedUnit?.topics ?? EMPTY_TOPICS;
  const availableQuestionCount = useMemo(() => {
    if (!selectedUnit) return 0;
    if (selectedTopicIds.length) return topics.filter((topic) => selectedTopicIds.includes(topic.id)).reduce((total, topic) => total + topic.questionCount, 0);
    return selectedUnit.questionCount;
  }, [selectedTopicIds, selectedUnit, topics]);
  const question = attempt?.questions[currentIndex] ?? null;
  const answers = useMemo(() => new Map((attempt?.answers ?? []).map((answer) => [answer.questionId, answer])), [attempt?.answers]);
  const currentAnswer = question ? answers.get(question.id) ?? null : null;
  const answering = question ? savingQuestionIds.includes(question.id) : false;
  const isExam = attempt?.mode === "exam";
  const completedCount = attempt?.answers.filter((answer) => Boolean(answer.selectedOptionId)).length ?? 0;
  const progress = attempt?.questions.length ? Math.round((completedCount / attempt.questions.length) * 100) : 0;
  const correctCount = attempt?.answers.filter((answer) => answer.correct === true).length ?? 0;
  const recommendation = useMemo(() => {
    const incorrect = attempt?.questions.filter((item) => answers.get(item.id)?.correct === false) ?? [];
    const topic = incorrect[0]?.topic;
    return topic ? `O tema «${topic}» merece uma revisão curta antes da próxima tentativa.` : "Mantém o ritmo: alterna testes temáticos e aleatórios para consolidar a matéria.";
  }, [answers, attempt?.questions]);

  useEffect(() => { attemptRef.current = attempt; }, [attempt]);

  const loadCatalogue = useCallback(async () => {
    setCatalogueLoading(true);
    setError("");
    try {
      const response = await fetch("/api/quizzes", { cache: "no-store" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível carregar os testes."));
      const apiTopics = (value<ApiTopic[]>(data, "topics", "themes") ?? []).map(normalizeTopic);
      const apiUnits = (value<ApiUnit[]>(data, "units", "curricularUnits", "curricular_units") ?? []).map((item) => ({
        id: String(item.id),
        name: item.name ?? item.title ?? "Unidade curricular",
        code: item.code ?? "UC",
        questionCount: Number(item.questionCount ?? item.question_count ?? 0),
        topics: (item.topics ?? []).map(normalizeTopic).concat(apiTopics.filter((topic) => topic.unitId === String(item.id))),
      }));
      const nextUnits = apiUnits;
      setUnits(nextUnits);
      setSelectedUnitId((current) => current && nextUnits.some((unit) => unit.id === current) ? current : nextUnits[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os testes.");
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  const loadStatistics = useCallback(async () => {
    setStatisticsLoading(true);
    setStatisticsError("");
    try {
      const response = await fetch("/api/quizzes/progress", { cache: "no-store" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível carregar as tuas estatísticas."));
      setStatistics(normaliseStatistics(data));
    } catch (reason) {
      setStatisticsError(reason instanceof Error ? reason.message : "Não foi possível carregar as tuas estatísticas.");
    } finally {
      setStatisticsLoading(false);
    }
  }, []);

  const clearStatistics = useCallback(async () => {
    if (clearingStatistics) return;
    setClearingStatistics(true);
    try {
      const response = await fetch("/api/quizzes/progress", { method: "DELETE" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível limpar as tuas estatísticas."));
      setClearStatisticsConfirmation(false);
      setNotice({ kind: "success", message: "As tuas estatísticas foram limpas." });
      await Promise.all([loadStatistics(), loadCatalogue()]);
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível limpar as tuas estatísticas." });
    } finally {
      setClearingStatistics(false);
    }
  }, [clearingStatistics, loadCatalogue, loadStatistics]);

  useEffect(() => { void loadCatalogue(); }, [loadCatalogue]);
  useEffect(() => {
    if (!selectedUnit) return;
    setSelectedTopicIds((current) => {
      const valid = current.filter((id) => selectedUnit.topics.some((topic) => topic.id === id));
      return valid.length === current.length ? current : valid;
    });
  }, [selectedUnit]);
  useEffect(() => {
    const supportedCounts = QUIZ_QUESTION_COUNTS.filter((count) => count <= availableQuestionCount);
    setQuestionCount((current) => supportedCounts.includes(current) ? current : supportedCounts.at(-1) ?? DEFAULT_QUESTION_COUNT);
  }, [availableQuestionCount]);
  useEffect(() => { saveQuizPreferences({ unitId: selectedUnitId, mode: selectedMode, topicIds: selectedTopicIds, questionCount, answerFormat, shortAnswerMode }); }, [answerFormat, questionCount, selectedMode, selectedTopicIds, selectedUnitId, shortAnswerMode]);

  const updateAttempt = useCallback((raw: Record<string, unknown>, fallbackMode: Mode) => {
    const next = normalizeAttempt(raw, fallbackMode);
    if (!next.id && attemptRef.current) next.id = attemptRef.current.id;
    if (!next.questions.length && attemptRef.current) next.questions = attemptRef.current.questions;
    if (!next.answers.length && attemptRef.current) next.answers = attemptRef.current.answers;
    setAttempt(next);
    attemptRef.current = next;
    return next;
  }, []);

  useEffect(() => {
    const saved = readQuizProgress();
    if (!saved) { clearQuizProgress(); return; }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/quiz-attempts/${encodeURIComponent(saved.attemptId)}`, { cache: "no-store" });
        if (!response.ok) { clearQuizProgress(); return; }
        const data = await response.json() as Record<string, unknown>;
        const restored = normalizeAttempt(data);
        if (cancelled || restored.status !== "active" || !restored.questions.length || (restored.endsAt && new Date(restored.endsAt).getTime() <= Date.now())) { clearQuizProgress(); return; }
        setAttempt(restored);
        attemptRef.current = restored;
        setCurrentIndex(Math.min(saved.currentIndex, restored.questions.length - 1));
        if (restored.unitId) setSelectedUnitId(restored.unitId);
      } catch { clearQuizProgress(); }
    })();
    return () => { cancelled = true; };
  }, []);

  const startAttempt = useCallback(async () => {
    if (!selectedUnit?.id) {
      setNotice({ kind: "warning", message: "Seleciona uma unidade curricular com perguntas disponíveis." });
      return;
    }
    if (selectedMode === "topic" && !selectedTopicIds.length) {
      setNotice({ kind: "warning", message: "Seleciona pelo menos um tema antes de iniciar o treino temático." });
      return;
    }
    if (availableQuestionCount < DEFAULT_QUESTION_COUNT) {
      setNotice({ kind: "warning", message: "São necessárias pelo menos 5 perguntas disponíveis para iniciar uma sessão." });
      return;
    }
    setLoadingAttempt(true);
    setAvailability(null);
    try {
      const activeTopicIds = selectedTopicIds;
      const response = await fetch("/api/quiz-attempts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unitId: selectedUnit.id, mode: selectedMode, topicId: activeTopicIds[0] ?? null, topicIds: activeTopicIds, questionCount, durationSeconds: questionCount * 60 }) });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        const code = data.code;
        if (code === "not_enough_mistakes" || code === "all_questions_seen" || code === "not_enough_questions") {
          setAvailability({ code, available: Number(data.available ?? 0), required: Number(data.required ?? DEFAULT_QUESTION_COUNT), total: Number(data.total ?? 0) });
          return;
        }
        throw new Error(apiError(data, "Não foi possível iniciar o teste."));
      }
      const next = updateAttempt(data, selectedMode);
      if (!next.questions.length) throw new Error("Esta sessão ainda não tem perguntas disponíveis para este modo.");
      setCurrentIndex(0);
      saveQuizProgress(next, 0);
      setRemaining(next.endsAt ? Math.max(0, Math.ceil((new Date(next.endsAt).getTime() - Date.now()) / 1000)) : next.durationSeconds);
      setShowExplanation(false);
      setCommentsOpen(false);
      setReplyTo(null);
      setScreen("attempt");
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível iniciar o teste." });
    } finally {
      setLoadingAttempt(false);
    }
  }, [availableQuestionCount, questionCount, selectedMode, selectedTopicIds, selectedUnit, updateAttempt]);

  const exportToAnki = useCallback(async () => {
    if (!selectedUnit?.id || exportingAnki) return;
    if (selectedMode === "topic" && !selectedTopicIds.length) {
      setNotice({ kind: "warning", message: "Seleciona pelo menos um tema antes de exportar para o Anki." });
      return;
    }
    if (availableQuestionCount < DEFAULT_QUESTION_COUNT) {
      setNotice({ kind: "warning", message: "São necessárias pelo menos 15 perguntas para criar o baralho Anki." });
      return;
    }
    setExportingAnki(true);
    try {
      const params = new URLSearchParams({ unitId: selectedUnit.id, mode: selectedMode, count: String(questionCount) });
      if (selectedTopicIds.length) params.set("topicIds", selectedTopicIds.join(","));
      const response = await fetch(`/api/quizzes/export?${params.toString()}`, { cache: "no-store" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível preparar o ficheiro Anki."));
      const { apkgBlob, buildQuizExportApkg } = await import("@/lib/anki");
      const result = await buildQuizExportApkg(data as QuizExportPayload);
      const downloadUrl = URL.createObjectURL(apkgBlob(result));
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = result.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      setNotice({ kind: "success", message: `Baralho Anki criado com ${result.cardCount} perguntas${result.mediaCount ? ` e ${result.mediaCount} ${result.mediaCount === 1 ? "imagem" : "imagens"}` : ""}.` });
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível preparar o ficheiro Anki." });
    } finally {
      setExportingAnki(false);
    }
  }, [availableQuestionCount, exportingAnki, questionCount, selectedMode, selectedTopicIds, selectedUnit]);

  const finishAttempt = useCallback(async () => {
    const requestedAttempt = attemptRef.current;
    if (!requestedAttempt || finishing) return;
    setFinishing(true);
    try {
      if (pendingAnswerSaves.current.size) await Promise.allSettled([...pendingAnswerSaves.current.values()]);
      const active = attemptRef.current;
      if (!active || active.id !== requestedAttempt.id) return;
      const response = await fetch(`/api/quiz-attempts/${encodeURIComponent(active.id)}/finish`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível concluir o teste."));
      const next = updateAttempt(data, active.mode);
      clearQuizProgress();
      setRemaining(0);
      setScreen("results");
      if (next.status !== "finished") setNotice({ kind: "success", message: "Teste concluído. Consulta o resultado e as explicações." });
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível concluir o teste." });
    } finally {
      setFinishing(false);
      setAbandonConfirmation(false);
    }
  }, [finishing, updateAttempt]);

  const resumeAttempt = useCallback(() => {
    const active = attemptRef.current;
    if (!active || active.status !== "active" || !active.questions.length) return;
    const firstUnanswered = active.questions.findIndex((item) => !active.answers.some((answer) => answer.questionId === item.id && answer.selectedOptionId));
    const saved = readQuizProgress();
    const restoredIndex = saved?.attemptId === active.id && saved.currentIndex >= 0 && saved.currentIndex < active.questions.length ? saved.currentIndex : null;
    const nextIndex = restoredIndex ?? (firstUnanswered >= 0 ? firstUnanswered : Math.max(0, active.questions.length - 1));
    setCurrentIndex(nextIndex);
    saveQuizProgress(active, nextIndex);
    setRemaining(active.endsAt ? Math.max(0, Math.ceil((new Date(active.endsAt).getTime() - Date.now()) / 1000)) : active.durationSeconds ?? active.questions.length * 60);
    setShowExplanation(false);
    setCommentsOpen(false);
    setReplyTo(null);
    setScreen("attempt");
  }, []);

  const abandonAttempt = useCallback(async () => {
    const active = attemptRef.current;
    if (!active || finishing) return;
    setFinishing(true);
    try {
      const response = await fetch(`/api/quiz-attempts/${encodeURIComponent(active.id)}/abandon`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível desistir do teste."));
      setAttempt(null);
      attemptRef.current = null;
      setAbandonConfirmation(false);
      clearQuizProgress();
      setCurrentIndex(0);
      setRemaining(null);
      setScreen("catalogue");
      setNotice({ kind: "success", message: "Teste encerrado. Podes iniciar uma nova tentativa quando quiseres." });
      void loadCatalogue();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível desistir do teste." });
    } finally {
      setFinishing(false);
    }
  }, [finishing, loadCatalogue]);

  useEffect(() => {
    if (screen !== "attempt" || remaining === null) return;
    if (remaining <= 0) { void finishAttempt(); return; }
    const timer = window.setInterval(() => setRemaining((current) => current === null ? null : Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [finishAttempt, remaining, screen]);

  const answerQuestion = useCallback((optionId: string) => {
    const active = attemptRef.current;
    const current = active?.questions[currentIndex];
    if (!active || !current || pendingAnswerSaves.current.has(current.id) || active.status === "finished") return;
    const saved = active.answers.find((answer) => answer.questionId === current.id);
    if (!isExam && saved && saved.correct !== null) return;

    const optimistic: Answer = {
      questionId: current.id,
      selectedOptionId: optionId,
      correct: !isExam && current.correctOptionId ? optionId === current.correctOptionId : null,
    };
    setAttempt((previous) => {
      if (!previous) return previous;
      const next = { ...previous, answers: [...previous.answers.filter((answer) => answer.questionId !== current.id), optimistic] };
      attemptRef.current = next;
      return next;
    });
    if (!isExam && current.correctOptionId) setShowExplanation(true);
    setSavingQuestionIds((ids) => ids.includes(current.id) ? ids : [...ids, current.id]);

    const save = (async () => {
      try {
        const response = await fetch(`/api/quiz-attempts/${encodeURIComponent(active.id)}/answers`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: current.id, optionId }) });
        const data = await response.json() as Record<string, unknown>;
        if (!response.ok) throw new Error(apiError(data, "Não foi possível guardar a resposta."));
        const returned = data.answer && typeof data.answer === "object" ? normalizeAnswer(data.answer as Record<string, unknown>) : optimistic;
        const questionFeedback = data.question && typeof data.question === "object" ? normalizeQuestion(data.question as ApiQuestion) : null;
        setAttempt((previous) => {
          if (!previous) return previous;
          const nextAnswers = [...previous.answers.filter((answer) => answer.questionId !== current.id), returned];
          const nextQuestions = questionFeedback ? previous.questions.map((item) => item.id === current.id ? { ...item, correctOptionId: questionFeedback.correctOptionId, explanation: questionFeedback.explanation } : item) : previous.questions;
          const next = { ...previous, answers: nextAnswers, questions: nextQuestions };
          attemptRef.current = next;
          return next;
        });
        if (!isExam) setShowExplanation(true);
      } catch (reason) {
        setAttempt((previous) => {
          if (!previous) return previous;
          const remainingAnswers = previous.answers.filter((answer) => answer.questionId !== current.id);
          const next = { ...previous, answers: saved ? [...remainingAnswers, saved] : remainingAnswers };
          attemptRef.current = next;
          return next;
        });
        setNotice({ kind: "error", message: `${reason instanceof Error ? reason.message : "Não foi possível guardar a resposta."} Tenta selecionar novamente.` });
      } finally {
        pendingAnswerSaves.current.delete(current.id);
        setSavingQuestionIds((ids) => ids.filter((id) => id !== current.id));
      }
    })();
    pendingAnswerSaves.current.set(current.id, save);
  }, [currentIndex, isExam]);

  const goToQuestion = useCallback((index: number) => {
    if (!attempt || index < 0 || index >= attempt.questions.length) return;
    setCurrentIndex(index);
    saveQuizProgress(attempt, index);
    setShowExplanation(false);
    setCommentsOpen(false);
    setReplyTo(null);
  }, [attempt]);

  const loadComments = useCallback(async (questionId: string) => {
    setCommentsLoading(true);
    try {
      const response = await fetch(`/api/quiz-comments?questionId=${encodeURIComponent(questionId)}`, { cache: "no-store" });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível carregar os comentários."));
    setComments((value<ApiComment[]>(data, "comments") ?? []).map(normalizeComment));
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível carregar os comentários." });
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (commentsOpen && question) void loadComments(question.id);
  }, [commentsOpen, loadComments, question]);

  async function sendComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = sanitizeRichTextHtml(commentText);
    const plainLength = richTextPlainText(text).length;
    if (!question || plainLength < 2 || plainLength > 1200 || sendingComment) return;
    const reply = replyTo;
    setSendingComment(true);
    try {
      const response = await fetch("/api/quiz-comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: question.id, attemptId: attempt?.id ?? null, parentCommentId: reply?.id ?? null, body: text }) });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(apiError(data, "Não foi possível enviar o comentário."));
      const fromApi = data.comment && typeof data.comment === "object" ? normalizeComment(data.comment as ApiComment) : { id: crypto.randomUUID(), body: text, authorName: "Tu", createdAt: new Date().toISOString(), status: "published" };
      const created: Comment = { ...fromApi, body: sanitizeRichTextHtml(fromApi.body || text), authorName: fromApi.authorName === "Estudante" ? "Tu" : fromApi.authorName, status: "published", parentCommentId: reply?.id, replyToName: reply?.authorName, isLocal: true };
      setComments((current) => {
        if (!created.parentCommentId) return [created, ...current];
        const parentIndex = current.findIndex((comment) => comment.id === created.parentCommentId);
        return parentIndex < 0 ? [created, ...current] : [...current.slice(0, parentIndex + 1), created, ...current.slice(parentIndex + 1)];
      });
      setCommentText("");
      setReplyTo(null);
      setNotice({ kind: "success", message: "Comentário publicado." });
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível enviar o comentário." });
    } finally {
      setSendingComment(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (screen !== "attempt" || !question || target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const number = Number(event.key);
      if (answerFormat === "multiple_choice" && number >= 1 && number <= question.options.length) {
        event.preventDefault();
        void answerQuestion(question.options[number - 1].id);
        return;
      }
      if ((event.key === "ArrowRight" || event.key === "Enter") && currentAnswer?.selectedOptionId) {
        event.preventDefault();
        if (attempt && currentIndex === attempt.questions.length - 1) void finishAttempt();
        else goToQuestion(currentIndex + 1);
      }
      if (event.key === "ArrowLeft") { event.preventDefault(); goToQuestion(currentIndex - 1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answerFormat, answerQuestion, attempt, currentAnswer?.selectedOptionId, currentIndex, finishAttempt, goToQuestion, question, screen]);

  const score = attempt?.score;
  const resultPercent = typeof score === "number" && Number.isFinite(score) ? Math.round(score) : attempt?.questions.length ? Math.round((correctCount / attempt.questions.length) * 100) : 0;

  return <AuthGuard>
    <ModuleGuard moduleKey="quizzes.practice">
      <AppShell active="quizzes" breadcrumb="Testes" focusMode={screen === "attempt"}>
        <div className={styles.page}>
          {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
          {screen === "catalogue" && <Catalogue
            loading={catalogueLoading}
            error={error}
            units={units}
            selectedUnitId={selectedUnitId}
            selectedUnit={selectedUnit}
            selectedMode={selectedMode}
            selectedTopicIds={selectedTopicIds}
            topics={topics}
            questionCount={questionCount}
            answerFormat={answerFormat}
            shortAnswerMode={shortAnswerMode}
            availableQuestionCount={availableQuestionCount}
            loadingAttempt={loadingAttempt}
            resumeAttempt={attempt?.status === "active" ? attempt : null}
            availability={availability}
            onUnit={(unitId) => { setAvailability(null); setSelectedUnitId(unitId); }}
            onMode={(mode) => { setAvailability(null); setSelectedMode(mode); }}
            onTopics={(topicIds) => { setAvailability(null); setSelectedTopicIds(topicIds); }}
            onQuestionCount={(count) => { if (QUIZ_QUESTION_COUNTS.includes(count)) { setAvailability(null); setQuestionCount(count); } }}
            onAnswerFormat={setAnswerFormat}
            onShortAnswerMode={setShortAnswerMode}
            onStart={() => void startAttempt()}
            onResume={resumeAttempt}
            onRetry={() => void loadCatalogue()}
            onNormal={() => { setAvailability(null); setSelectedMode("quick"); }}
            onMistakes={() => { setAvailability(null); setSelectedMode("mistakes"); }}
            onStatistics={() => { setScreen("statistics"); void loadStatistics(); }}
            exportingAnki={exportingAnki}
            onExportAnki={() => void exportToAnki()}
          />}
          {screen === "statistics" && <StatisticsView statistics={statistics} loading={statisticsLoading} error={statisticsError} totalAvailableQuestions={units.reduce((total, unit) => total + unit.questionCount, 0)} clearing={clearingStatistics} onBack={() => setScreen("catalogue")} onRetry={() => void loadStatistics()} onClear={() => setClearStatisticsConfirmation(true)} />}
          {screen === "attempt" && attempt && question && <AttemptView
            attempt={attempt}
            unit={selectedUnit}
            question={question}
            currentIndex={currentIndex}
            currentAnswer={currentAnswer}
            answering={answering}
            remaining={remaining}
            progress={progress}
            showExplanation={showExplanation}
            answerFormat={answerFormat}
            shortAnswerMode={shortAnswerMode}
            commentsOpen={commentsOpen}
            comments={comments}
            commentsLoading={commentsLoading}
            commentText={commentText}
            sendingComment={sendingComment}
            onSelect={(optionId) => void answerQuestion(optionId)}
            onNext={() => currentIndex === attempt.questions.length - 1 ? void finishAttempt() : goToQuestion(currentIndex + 1)}
            onPrevious={() => goToQuestion(currentIndex - 1)}
            onQuestion={goToQuestion}
            onPause={() => { saveQuizProgress(attempt, currentIndex); setScreen("catalogue"); }}
            onQuit={() => setAbandonConfirmation(true)}
            onExplain={() => setShowExplanation((current) => !current)}
            onComments={() => setCommentsOpen((current) => !current)}
            onCommentText={setCommentText}
            onComment={sendComment}
            replyTo={replyTo}
            onReply={(comment) => setReplyTo(comment)}
            onCancelReply={() => setReplyTo(null)}
            onDoubleClick={() => currentAnswer && (currentIndex === attempt.questions.length - 1 ? void finishAttempt() : goToQuestion(currentIndex + 1))}
            finishing={finishing}
          />}
          {screen === "results" && attempt && <ResultsView attempt={attempt} correctCount={correctCount} percent={resultPercent} recommendation={recommendation} onRestart={() => { setAttempt(null); attemptRef.current = null; setScreen("catalogue"); setCurrentIndex(0); }} />}
        </div>
        <ConfirmationDialog open={abandonConfirmation} eyebrow="" title="Queres desistir do teste?" description="" confirmLabel={finishing ? "A desistir…" : "Desistir"} busy={finishing} icon={<TriangleAlert />} onClose={() => setAbandonConfirmation(false)} onConfirm={() => void abandonAttempt()} />
        <ConfirmationDialog open={clearStatisticsConfirmation} eyebrow="Histórico de testes" title="Limpar as estatísticas?" description="As tentativas concluídas ou abandonadas e as respetivas respostas serão apagadas. Um teste em curso será mantido." warning="Esta ação não pode ser anulada." confirmLabel={clearingStatistics ? "A limpar…" : "Limpar estatísticas"} busy={clearingStatistics} icon={<Trash2 />} onClose={() => setClearStatisticsConfirmation(false)} onConfirm={() => void clearStatistics()} />
      </AppShell>
    </ModuleGuard>
  </AuthGuard>;
}

function Catalogue({ loading, error, units, selectedUnitId, selectedUnit, selectedMode, selectedTopicIds, topics, questionCount, answerFormat, shortAnswerMode, availableQuestionCount, loadingAttempt, exportingAnki, resumeAttempt, availability, onUnit, onMode, onTopics, onQuestionCount, onAnswerFormat, onShortAnswerMode, onStart, onResume, onRetry, onNormal, onMistakes, onStatistics, onExportAnki }: {
  loading: boolean; error: string; units: Unit[]; selectedUnitId: string; selectedUnit: Unit | null; selectedMode: Mode; selectedTopicIds: string[]; topics: Topic[]; questionCount: number; answerFormat: AnswerFormat; shortAnswerMode: ShortAnswerMode; availableQuestionCount: number; loadingAttempt: boolean;
  exportingAnki: boolean;
  resumeAttempt: Attempt | null;
  availability: { code: "not_enough_mistakes" | "all_questions_seen" | "not_enough_questions"; available: number; required: number; total: number } | null;
  onUnit: (id: string) => void; onMode: (id: Mode) => void; onTopics: (ids: string[]) => void; onQuestionCount: (count: number) => void; onAnswerFormat: (format: AnswerFormat) => void; onShortAnswerMode: (mode: ShortAnswerMode) => void; onStart: () => void; onResume: () => void; onRetry: () => void; onNormal: () => void; onMistakes: () => void;
  onStatistics: () => void;
  onExportAnki: () => void;
}) {
  const insufficientBank = Boolean(selectedUnit && availableQuestionCount < DEFAULT_QUESTION_COUNT);
  const needsTopics = selectedMode === "topic" && !selectedTopicIds.length;
  const canStart = Boolean(selectedUnit && !insufficientBank && !needsTopics && !availability && !loadingAttempt);
  const shortageAvailable = availability?.code === "not_enough_questions" ? availability.available : availableQuestionCount;
  const shortageRequired = availability?.code === "not_enough_questions" ? availability.required : DEFAULT_QUESTION_COUNT;
  const resumeUnit = resumeAttempt ? units.find((unit) => unit.id === resumeAttempt.unitId) ?? null : null;
  const countOptions = QUIZ_QUESTION_COUNTS.filter((count) => count <= availableQuestionCount);
  return <>
    <header className={`page-heading page-heading--simple ${styles.hero}`}>
      <div><span className="eyebrow">Testes</span><h1>Escolhe uma disciplina</h1></div>
      <button className={styles.statisticsButton} type="button" onClick={onStatistics}><BarChart3 />Estatísticas</button>
    </header>
    {resumeAttempt && <section className={styles.resumeCard} aria-labelledby="continuar-teste"><span><Play /></span><div><h2 id="continuar-teste">Retomar sessão</h2><p>{resumeUnit ? `${resumeUnit.code} · ${resumeUnit.name} · ` : ""}{modeTitle(resumeAttempt.mode)} · {resumeAttempt.answers.length}/{resumeAttempt.questions.length}</p></div><button className={styles.primaryButton} type="button" onClick={onResume}><Play />Continuar</button></section>}
    {loading ? <State icon={<LoaderCircle className={styles.spin} />} title="A preparar a tua sessão" text="A carregar disciplinas e perguntas." /> : error ? <State icon={<TriangleAlert />} title="Não foi possível carregar as sessões" text={error} action={<button type="button" onClick={onRetry}>Tentar novamente</button>} /> : !units.length ? <State icon={<CircleHelp />} title="Ainda não há sessões disponíveis" text="Ainda não existem perguntas publicadas." /> : <>
      <section className={styles.unitCatalogue} aria-label="Disciplinas">
        <div className={styles.unitGrid}>
          {units.map((unit) => {
            const selected = unit.id === selectedUnitId;
            return <article key={unit.id} className={`${styles.unitCard} ${selected ? styles.unitCardSelected : ""}`}>
              <button type="button" className={styles.unitCardHeader} onClick={() => onUnit(unit.id)} aria-expanded={selected}>
                <span className={styles.unitCode}>{unit.code}</span>
                <span><strong>{unit.name}</strong><small>{unit.questionCount} perguntas</small></span>
                <ChevronDown aria-hidden="true" />
              </button>
              {selected && <div className={styles.unitSettings}>
                <section className={styles.settingGroup}><div className={styles.settingHeading}><strong>Objetivo</strong></div><div className={styles.modeGrid} role="radiogroup" aria-label={`Objetivo da sessão de ${unit.name}`}>{modeCards.map((mode) => { const Icon = mode.icon; const active = selectedMode === mode.id; return <button key={mode.id} type="button" role="radio" aria-checked={active} aria-label={`${mode.title}. ${mode.description}`} title={mode.description} className={`${styles.modeCard} ${active ? styles.selected : ""}`} onClick={() => onMode(mode.id)}><span className={styles.modeIcon}><Icon /></span><strong>{mode.title}</strong>{active && <CheckCircle2 className={styles.modeCheck} aria-hidden="true" />}</button>; })}</div>
                  <div className={styles.topicPicker} role="group" aria-labelledby={`quiz-topics-${unit.id}`}><span id={`quiz-topics-${unit.id}`} className={styles.topicTitle}>Temas</span><div className={styles.topicChoices}>{topics.map((topic) => { const checked = selectedTopicIds.includes(topic.id); return <label key={topic.id} className={checked ? styles.topicChecked : ""}><input type="checkbox" checked={checked} onChange={() => onTopics(checked ? selectedTopicIds.filter((id) => id !== topic.id) : [...selectedTopicIds, topic.id])} /><span className={styles.topicName}>{topic.name}</span>{topic.questionCount > 0 && <small>{topic.questionCount}</small>}<span className={styles.topicIndicator}>{checked && <Check />}</span></label>; })}</div>{!topics.length && <small>Sem temas publicados.</small>}</div>
                </section>
                <div className={styles.settingColumns}>
                  <section className={styles.settingGroup}><div className={styles.settingHeading}><strong>Duração</strong></div><label className={styles.countControl} htmlFor={`quiz-question-count-${unit.id}`}><span className={styles.selectWrap}><select id={`quiz-question-count-${unit.id}`} aria-label="Duração da sessão" value={countOptions.includes(questionCount) ? questionCount : ""} disabled={insufficientBank} onChange={(event) => onQuestionCount(Number(event.target.value))}>{countOptions.length ? countOptions.map((count) => <option key={count} value={count}>{count} min · {count} perguntas</option>) : <option value="">Menos de 5 perguntas disponíveis</option>}</select><ChevronDown aria-hidden="true" /></span></label></section>
                  <section className={styles.settingGroup}><div className={styles.settingHeading}><strong>Formato</strong></div><div className={styles.answerFormatGrid} role="radiogroup" aria-label="Formato de resposta"><button type="button" role="radio" aria-checked={answerFormat === "multiple_choice"} className={`${styles.modeCard} ${answerFormat === "multiple_choice" ? styles.selected : ""}`} onClick={() => onAnswerFormat("multiple_choice")}><span className={styles.modeIcon}><CheckCircle2 /></span><strong>Escolha múltipla</strong>{answerFormat === "multiple_choice" && <CheckCircle2 className={styles.modeCheck} aria-hidden="true" />}</button><button type="button" role="radio" aria-checked={answerFormat === "short_answer"} className={`${styles.modeCard} ${answerFormat === "short_answer" ? styles.selected : ""}`} onClick={() => onAnswerFormat("short_answer")}><span className={styles.modeIcon}><Keyboard /></span><strong>Resposta curta</strong>{answerFormat === "short_answer" && <CheckCircle2 className={styles.modeCheck} aria-hidden="true" />}</button></div></section>
                </div>
                {answerFormat === "short_answer" && <section className={styles.settingGroup}><div className={styles.settingHeading}><strong>Resposta curta</strong></div><div className={styles.shortModeChoices} role="radiogroup" aria-label="Modo de resposta curta"><button type="button" role="radio" aria-checked={shortAnswerMode === "type_and_check"} className={shortAnswerMode === "type_and_check" ? styles.selected : ""} onClick={() => onShortAnswerMode("type_and_check")}><Keyboard /><span><strong>Escrever e verificar</strong></span></button><button type="button" role="radio" aria-checked={shortAnswerMode === "reveal_and_self_assess"} className={shortAnswerMode === "reveal_and_self_assess" ? styles.selected : ""} onClick={() => onShortAnswerMode("reveal_and_self_assess")}><Eye /><span><strong>Revelar e autoavaliar</strong></span></button></div></section>}
                {availability?.code === "not_enough_mistakes" && <aside className={styles.availability} role="status"><RotateCcw /><div><strong>Ainda não tens erros suficientes</strong><p>Tens {availability.available} para rever e escolheste {availability.required}.</p></div><button type="button" onClick={onNormal}>Sessão guiada</button></aside>}
                {availability?.code === "all_questions_seen" && <aside className={styles.availability} role="status"><CheckCircle2 /><div><strong>Já respondeste a todas as perguntas</strong><p>Podes repetir uma sessão guiada ou rever os teus erros.</p></div><span className={styles.availabilityActions}><button type="button" onClick={onNormal}>Sessão guiada</button><button type="button" onClick={onMistakes}>Só erros</button></span></aside>}
                {(insufficientBank || availability?.code === "not_enough_questions") && <aside className={styles.availability} role="alert"><TriangleAlert /><div><strong>Banco de perguntas insuficiente</strong><p>{availability?.code === "not_enough_questions" ? <>Esta seleção tem {shortageAvailable} perguntas disponíveis; a sessão escolhida requer {shortageRequired}. Escolhe uma opção mais curta.</> : <>Esta seleção tem apenas {shortageAvailable} perguntas. São necessárias pelo menos 5 para iniciar uma sessão.</>}</p></div></aside>}
                <footer className={styles.unitActions}><span><button className={styles.ankiButton} type="button" onClick={onExportAnki} disabled={!canStart || exportingAnki}>{exportingAnki ? <LoaderCircle className={styles.spin} /> : <Download />}{exportingAnki ? "A criar…" : "Baixar para Anki (.apkg)"}</button><button className={styles.primaryButton} type="button" onClick={onStart} disabled={!canStart || exportingAnki}>{loadingAttempt ? <LoaderCircle className={styles.spin} /> : <Play />}{loadingAttempt ? "A iniciar…" : "Começar sessão"}</button></span></footer>
              </div>}
            </article>;
          })}
        </div>
      </section>
    </>}
  </>;
}

function StatisticsView({ statistics, loading, error, totalAvailableQuestions, clearing, onBack, onRetry, onClear }: { statistics: QuizStatistics | null; loading: boolean; error: string; totalAvailableQuestions: number; clearing: boolean; onBack: () => void; onRetry: () => void; onClear: () => void }) {
  if (loading) return <><header className={`page-heading page-heading--simple ${styles.hero}`}><div><span className="eyebrow">Testes</span><h1>As minhas estatísticas</h1></div><button className={styles.statisticsButton} type="button" onClick={onBack}><ArrowLeft />Novo teste</button></header><State icon={<LoaderCircle className={styles.spin} />} title="A preparar as tuas estatísticas" text="Estamos a reunir o teu progresso e as tentativas concluídas." /></>;
  if (error || !statistics) return <><header className={`page-heading page-heading--simple ${styles.hero}`}><div><span className="eyebrow">Testes</span><h1>As minhas estatísticas</h1></div><button className={styles.statisticsButton} type="button" onClick={onBack}><ArrowLeft />Novo teste</button></header><State icon={<TriangleAlert />} title="Não foi possível carregar as estatísticas" text={error || "Tenta novamente dentro de instantes."} action={<button type="button" onClick={onRetry}>Tentar novamente</button>} /></>;
  const { summary } = statistics;
  const accuracy = Math.round((summary.accuracy ?? 0) * 100);
  const recentAccuracy = Math.round((summary.recentAccuracy ?? 0) * 100);
  const seenPercent = totalAvailableQuestions ? Math.min(100, Math.round((summary.uniqueQuestionCount / totalAvailableQuestions) * 100)) : 0;
  const passedPercent = summary.completedCount ? Math.round((summary.passedCount / summary.completedCount) * 100) : 0;
  const readiness = accuracy >= 85 ? "Excelente preparação. Mantém o ritmo e concentra a revisão nos temas mais frágeis." : accuracy >= 70 ? "Boa base. Revê os temas com menor acerto antes de aumentares a dificuldade." : summary.answeredCount ? "Continua a praticar: alterna testes temáticos com revisão de erros para consolidar a matéria." : "Conclui o primeiro teste para começares a acompanhar a tua evolução.";
  const metrics = [
    { label: "Perguntas vistas", percent: seenPercent, value: `${summary.uniqueQuestionCount}/${totalAvailableQuestions || 0}` },
    { label: "Respostas certas", percent: accuracy, value: `${summary.correctCount}/${summary.answeredCount}` },
    { label: "Testes com ≥50%", percent: passedPercent, value: `${summary.passedCount}/${summary.completedCount}` },
    { label: "Últimos 10 testes", percent: recentAccuracy, value: `${statistics.recentAttempts.length} concluídos` },
  ];
  return <>
    <header className={`page-heading page-heading--simple ${styles.hero}`}><div><span className="eyebrow">Testes</span><h1>As minhas estatísticas</h1></div><div className={styles.statisticsActions}><button className={`${styles.statisticsButton} ${styles.statisticsDangerButton}`} type="button" onClick={onClear} disabled={clearing}><Trash2 />Limpar estatísticas</button><button className={styles.statisticsButton} type="button" onClick={onBack}><ArrowLeft />Novo teste</button></div></header>
    <section className={styles.statisticsLead}>
      <article className={styles.readinessCard}><div><span className={styles.statisticsKicker}><BarChart3 />Preparação global</span><div className={styles.statisticsRing} style={{ "--score": `${accuracy}%` } as CSSProperties}><strong>{accuracy}%</strong><small>acerto</small></div></div><div><h2>{summary.completedCount ? `${summary.completedCount} ${summary.completedCount === 1 ? "teste concluído" : "testes concluídos"}` : "Começa a construir o teu histórico"}</h2><p>{readiness}</p></div></article>
      <article className={styles.timeCard}><span className={styles.statisticsKicker}><Clock3 />Tempo de testes</span><dl><div><dt>Tempo total</dt><dd>{humanDuration(summary.totalDurationSeconds)}</dd></div><div><dt>Média por teste</dt><dd>{humanDuration(summary.averageDurationSeconds)}</dd></div></dl></article>
    </section>
    <section className={styles.statisticsGrid} aria-label="Resumo das estatísticas">
      {metrics.map((metric) => <article className={styles.statisticsMetric} key={metric.label}><h2>{metric.label}</h2><div className={styles.statisticsRing} style={{ "--score": `${metric.percent}%` } as CSSProperties}><strong>{metric.percent}%</strong></div><p>{metric.value}</p></article>)}
    </section>
    <div className={styles.statisticsDetailGrid}>
      <section className={styles.statisticsPanel} aria-labelledby="desempenho-temas"><header><div><span className={styles.statisticsKicker}><Trophy />Desempenho por tema</span><h2 id="desempenho-temas">Onde deves concentrar a revisão</h2></div></header>{statistics.topics.length ? <div className={styles.topicStatistics}>{statistics.topics.slice(0, 8).map((topic) => { const score = Math.round((topic.accuracy ?? 0) * 100); return <div key={`${topic.unitId}-${topic.topicId}`}><div><span className={styles.unitCode}>{topic.unitCode}</span><strong>{topic.title}</strong><small>{topic.correctCount}/{topic.answeredCount} certas</small></div><div className={styles.topicBar} aria-label={`${score}% de acerto`}><span style={{ width: `${score}%` }} /></div><b>{score}%</b></div>; })}</div> : <p className={styles.statisticsEmpty}>Ainda não há temas avaliados em testes concluídos.</p>}</section>
      <section className={styles.statisticsPanel} aria-labelledby="tentativas-recentes"><header><div><span className={styles.statisticsKicker}><TimerReset />Histórico recente</span><h2 id="tentativas-recentes">Últimos testes concluídos</h2></div></header>{statistics.recentAttempts.length ? <div className={styles.recentAttempts}>{statistics.recentAttempts.map((item) => { const score = Math.round((item.accuracy ?? 0) * 100); return <article key={item.id}><div><span className={styles.unitCode}>{item.unitCode}</span><strong>{modeTitle(item.mode)}</strong><small>{humanDate(item.completedAt)} · {humanDuration(item.durationSeconds)}</small></div><span className={score >= 50 ? styles.passedAttempt : styles.reviewAttempt}><b>{score}%</b><small>{item.correctCount}/{item.questionCount}</small></span></article>; })}</div> : <p className={styles.statisticsEmpty}>Os testes concluídos aparecerão aqui.</p>}</section>
    </div>
  </>;
}

function AttemptView({ attempt, unit, question, currentIndex, currentAnswer, answering, remaining, progress, showExplanation, answerFormat, shortAnswerMode, commentsOpen, comments, commentsLoading, commentText, sendingComment, replyTo, onSelect, onNext, onPrevious, onQuestion, onPause, onQuit, onExplain, onComments, onCommentText, onComment, onReply, onCancelReply, onDoubleClick, finishing }: {
  attempt: Attempt; unit: Unit | null; question: Question; currentIndex: number; currentAnswer: Answer | null; answering: boolean; remaining: number | null; progress: number; showExplanation: boolean; answerFormat: AnswerFormat; shortAnswerMode: ShortAnswerMode; commentsOpen: boolean; comments: Comment[]; commentsLoading: boolean; commentText: string; sendingComment: boolean;
  replyTo: Comment | null; onSelect: (id: string) => void; onNext: () => void; onPrevious: () => void; onQuestion: (index: number) => void; onPause: () => void; onQuit: () => void; onExplain: () => void; onComments: () => void; onCommentText: (value: string) => void; onComment: (event: FormEvent<HTMLFormElement>) => void; onReply: (comment: Comment) => void; onCancelReply: () => void; onDoubleClick: () => void; finishing: boolean;
}) {
  const isExam = attempt.mode === "exam";
  const answered = Boolean(currentAnswer?.selectedOptionId);
  const feedback = !isExam && currentAnswer?.correct !== null && currentAnswer?.correct !== undefined;
  const [shortDrafts, setShortDrafts] = useState<Record<string, { value: string; revealed: boolean; correct: boolean | null }>>({});
  const shortDraft = shortDrafts[question.id] ?? { value: "", revealed: false, correct: null };
  const correctOption = question.options.find((option) => option.id === question.correctOptionId) ?? null;
  const incorrectOption = question.options.find((option) => option.id !== question.correctOptionId) ?? null;
  const updateShortDraft = (next: Partial<typeof shortDraft>) => setShortDrafts((current) => ({ ...current, [question.id]: { ...shortDraft, ...next } }));
  const assessShortAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!correctOption || !shortDraft.value.trim()) return;
    updateShortDraft({ revealed: true, correct: isShortAnswerMatch(shortDraft.value, correctOption.text) });
  };
  const submitSelfAssessment = (correct: boolean) => {
    const option = correct ? correctOption : incorrectOption;
    if (!answered && !answering && option) onSelect(option.id);
  };
  return <>
    <section className={styles.sessionBar} aria-label="Progresso do teste">
      <div className={styles.sessionIdentity}><span className={styles.unitCode}>{unit?.code ?? "UC"}</span><span><strong>{unit?.name ?? attempt.title}</strong><small>{modeTitle(attempt.mode)} · {questionLabel(attempt.questions.length)}</small></span></div>
      <div className={styles.sessionStats}><span className={styles.sessionPosition} aria-label={`Pergunta ${currentIndex + 1} de ${attempt.questions.length}`}><b>{currentIndex + 1}</b><small>/ {attempt.questions.length}</small></span>{remaining !== null && <span className={`${styles.timer} ${remaining < 300 ? styles.lowTime : ""}`} aria-label={`Tempo restante: ${formatClock(remaining)}`}><Clock3 /><strong>{formatClock(remaining)}</strong></span>}</div>
      <div className={styles.sessionActions}><button type="button" className={styles.backButton} onClick={onPause} disabled={finishing}><ArrowLeft /> Guardar e sair</button><button type="button" className={styles.quitButton} onClick={onQuit} disabled={finishing}>Desistir</button></div>
      <div className={styles.progressTrack} aria-label={`${progress}% respondido`}><span style={{ width: `${progress}%` }} /></div>
    </section>
    <div className={styles.attemptLayout}>
      <aside className={styles.navigator} aria-label="Navegação pelas perguntas"><header><strong>Perguntas</strong><small>{progress}%</small></header><div className={styles.questionGrid}>{attempt.questions.map((item, index) => { const answer = attempt.answers.find((entry) => entry.questionId === item.id); const state = !answer ? "não respondida" : isExam || answer.correct === null ? "respondida" : answer.correct ? "certa" : "errada"; return <button key={item.id} type="button" className={`${styles.questionNumber} ${index === currentIndex ? styles.current : ""} ${statusClass(answer)}`} onClick={() => onQuestion(index)} aria-current={index === currentIndex ? "step" : undefined} aria-label={`Pergunta ${index + 1}, ${state}`}>{index + 1}</button>; })}</div></aside>
      <section className={styles.questionPanel} aria-labelledby="question-title">
        <header className={styles.questionHeader}><span className={styles.topicLabel}>{question.topic}</span><small>{currentIndex + 1} / {attempt.questions.length}</small></header>
        <div key={question.id} className={`${styles.questionBody} ${question.imageUrl ? styles.questionBodyWithImage : ""}`}>
          {question.imageUrl && <figure className={styles.questionImage}><img src={question.imageUrl} alt={question.imageAlt} /></figure>}
          <div className={styles.questionContent}>
            <RichTextContent id="question-title" value={question.text} className={styles.questionTitle} />
            {answerFormat === "multiple_choice" ? <div className={styles.options} role="radiogroup" aria-label="Opções de resposta">
              {question.options.map((option, index) => {
                const selected = currentAnswer?.selectedOptionId === option.id;
                const correct = feedback && option.id === question.correctOptionId;
                const wrong = feedback && selected && currentAnswer?.correct === false;
                return <button key={option.id} type="button" role="radio" aria-checked={selected} aria-keyshortcuts={String(index + 1)} disabled={answering || (feedback && !selected)} className={`${styles.option} ${selected ? styles.optionSelected : ""} ${correct ? styles.optionCorrect : ""} ${wrong ? styles.optionWrong : ""}`} onClick={() => !feedback && onSelect(option.id)} onDoubleClick={() => answered && onDoubleClick()}><b>{String.fromCharCode(65 + index)}</b><span>{option.text}</span>{correct && <CheckCircle2 aria-label="Resposta certa" />}{wrong && <XCircle aria-label="Resposta errada" />}</button>;
              })}
            </div> : <section className={styles.shortAnswer} aria-label="Resposta curta">
              {shortAnswerMode === "type_and_check" && !shortDraft.revealed && !answered && <form className={styles.shortAnswerForm} onSubmit={assessShortAnswer}><label htmlFor={`short-answer-${question.id}`}>A tua resposta</label><div className={styles.shortAnswerComposer}><textarea id={`short-answer-${question.id}`} value={shortDraft.value} onChange={(event) => updateShortDraft({ value: event.target.value, correct: null })} placeholder="Escreve a resposta…" rows={2} disabled={answering} /><footer><button type="submit" disabled={!shortDraft.value.trim() || !correctOption}>Verificar</button></footer></div></form>}
              {shortAnswerMode === "reveal_and_self_assess" && !shortDraft.revealed && !answered && <button className={styles.revealAnswerButton} type="button" onClick={() => updateShortDraft({ revealed: true })} disabled={!correctOption}><Eye />Ver resposta</button>}
              {(shortDraft.revealed || answered) && <div className={styles.shortAnswerReveal}><span>Resposta correta</span><strong>{correctOption?.text ?? "Resposta indisponível"}</strong>{shortAnswerMode === "type_and_check" && shortDraft.correct !== null && !answered && <p className={shortDraft.correct ? styles.proposalCorrect : styles.proposalIncorrect}>{shortDraft.correct ? <CheckCircle2 /> : <XCircle />}{shortDraft.correct ? "Certa" : "Errada"}</p>}{!answered && <div className={styles.selfAssessmentActions} aria-label="Confirmar resultado"><button type="button" className={shortDraft.correct === false ? styles.selfAssessmentIncorrect : styles.selfAssessmentCorrect} onClick={() => submitSelfAssessment(shortDraft.correct ?? true)} disabled={answering || !correctOption || !incorrectOption}>{shortDraft.correct === false ? <XCircle /> : <CheckCircle2 />}Confirmar</button>{shortAnswerMode === "type_and_check" && shortDraft.correct !== null && <button type="button" className={styles.selfAssessmentOverride} onClick={() => submitSelfAssessment(!shortDraft.correct)} disabled={answering}>{shortDraft.correct ? "Marcar errada" : "Marcar certa"}</button>}</div>}</div>}
            </section>}
            {feedback && <section className={`${styles.feedback} ${currentAnswer?.correct ? styles.feedbackGood : styles.feedbackBad}`} role="status"><span>{currentAnswer?.correct ? <CheckCircle2 /> : <XCircle />}</span><div><strong>{currentAnswer?.correct ? "Resposta certa" : "Ainda não é a resposta correta"}</strong><RichTextContent value={question.explanation ?? "Consulta a explicação para consolidar este conceito."} className={styles.answerExplanation} /></div></section>}
            {showExplanation && question.explanation && !feedback && <section className={styles.explanation}><Lightbulb /><div><strong>Explicação</strong><RichTextContent value={question.explanation} className={styles.answerExplanation} /></div></section>}
          </div>
        </div>
        <footer className={styles.questionActions}><div><button type="button" className={styles.textButton} onClick={onExplain} disabled={!answered && isExam}><Lightbulb /><span>{showExplanation ? "Ocultar explicação" : "Explicação"}</span></button><button type="button" className={styles.textButton} onClick={onComments}><MessageCircle /><span>Comentários</span></button></div><div><button type="button" className={styles.secondaryButton} aria-keyshortcuts="ArrowLeft" onClick={onPrevious} disabled={currentIndex === 0}><ArrowLeft /><span>Anterior</span></button><button type="button" className={styles.primaryButton} aria-keyshortcuts="ArrowRight Enter" onClick={onNext} disabled={!answered}><span>{currentIndex === attempt.questions.length - 1 ? "Concluir" : "Seguinte"}</span><ArrowRight /></button></div></footer>
        {commentsOpen && <Comments comments={comments} loading={commentsLoading} text={commentText} sending={sendingComment} replyTo={replyTo} onText={onCommentText} onSubmit={onComment} onReply={onReply} onCancelReply={onCancelReply} />}
      </section>
    </div>
  </>;
}

function ResultsView({ attempt, correctCount, percent, recommendation, onRestart }: { attempt: Attempt; correctCount: number; percent: number; recommendation: string; onRestart: () => void }) {
  const total = attempt.questions.length;
  const displayedCorrect = attempt.totalCorrect !== null && Number.isFinite(attempt.totalCorrect) ? attempt.totalCorrect : correctCount;
  return <>
    <header className={styles.resultsHero}><div className={styles.scoreRing} style={{ "--score": `${percent}%` } as CSSProperties}><strong>{percent}%</strong></div><div><span className={styles.eyebrow}>Concluído</span><h1>{displayedCorrect}/{total} certas</h1></div><button className={styles.primaryButton} type="button" onClick={onRestart}><RotateCcw /> Novo teste</button></header>
    <section className={styles.recommendation}><span><Sparkles /></span><p>{recommendation}</p><button type="button" onClick={onRestart}>Praticar <ArrowRight /></button></section>
    <section className={styles.review} aria-labelledby="review-title"><header><h2 id="review-title">Revisão</h2><Flag /></header><div className={styles.reviewList}>{attempt.questions.map((question, index) => { const answer = attempt.answers.find((item) => item.questionId === question.id); const correct = answer?.correct ?? (answer?.selectedOptionId === question.correctOptionId); const chosen = question.options.find((option) => option.id === answer?.selectedOptionId); const right = question.options.find((option) => option.id === question.correctOptionId); return <article key={question.id} className={`${styles.reviewItem} ${correct ? styles.reviewGood : styles.reviewBad}`}><span>{correct ? <CheckCircle2 /> : <XCircle />}</span><div><small>{index + 1} · {question.topic}</small><RichTextContent value={question.text} className={styles.reviewQuestion} /><p><b>A tua resposta:</b> {chosen?.text ?? "Não respondida"}</p>{!correct && <p><b>Correta:</b> {right?.text ?? "Disponível no gabarito"}</p>}{question.explanation && <div className={styles.reviewExplanation}><Lightbulb /><RichTextContent value={question.explanation} /></div>}</div></article>; })}</div></section>
  </>;
}

function Comments({ comments, loading, text, sending, replyTo, onText, onSubmit, onReply, onCancelReply }: { comments: Comment[]; loading: boolean; text: string; sending: boolean; replyTo: Comment | null; onText: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReply: (comment: Comment) => void; onCancelReply: () => void }) {
  const plainLength = richTextPlainText(text).length;
  return <section className={styles.comments} aria-labelledby="comments-title">
    <header><MessageCircle /><h2 id="comments-title">Comentários</h2><span className={styles.commentCount}>{comments.length}</span></header>
    <form onSubmit={onSubmit}>
      {replyTo && <aside className={styles.replyingTo}><span>Em resposta a <strong>{replyTo.authorName}</strong></span><button type="button" onClick={onCancelReply}>Cancelar</button></aside>}
      <div className={styles.commentComposer}><RichTextEditor value={text} onChange={onText} ariaLabel={replyTo ? `Resposta a ${replyTo.authorName}` : "Novo comentário sobre a pergunta"} placeholder={replyTo ? `Responder a ${replyTo.authorName}…` : "Escreve uma dúvida ou comentário…"} maxLength={1200} minHeight="minimal" /></div>
      <footer><small>Publicação imediata</small><button className={styles.primaryButton} type="submit" disabled={sending || plainLength < 2 || plainLength > 1200}>{sending ? <LoaderCircle className={styles.spin} /> : <Send />}{sending ? "A enviar…" : replyTo ? "Responder" : "Publicar"}</button></footer>
    </form>
    <div className={styles.commentList}>{loading ? <span className={styles.saving}><LoaderCircle className={styles.spin} /> A carregar comentários…</span> : comments.length ? comments.map((comment) => <article key={comment.id} className={comment.parentCommentId ? styles.commentReply : ""}><span>{comment.authorName.slice(0, 1).toUpperCase()}</span><div className={styles.commentBubble}><header><span><strong>{comment.authorName}</strong>{(comment.isAdmin || comment.authorRole === "admin") && <b className={styles.roleBadge}>Administrador</b>}<small>{humanDate(comment.createdAt)}</small></span><button type="button" onClick={() => onReply(comment)}>Responder</button></header>{comment.replyToName && <p className={styles.replyContext}>Em resposta a {comment.replyToName}</p>}<RichTextContent value={comment.body} className={styles.commentBody} /></div></article>) : <p className={styles.noComments}>Ainda não há comentários.</p>}</div>
  </section>;
}

function State({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) { return <section className={styles.state}>{icon}<strong>{title}</strong><p>{text}</p>{action}</section>; }

function statusClass(answer: Answer | undefined) { return !answer ? styles.unanswered : answer.correct === true ? styles.correct : answer.correct === false ? styles.incorrect : styles.answered; }
