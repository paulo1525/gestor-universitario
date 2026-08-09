"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Download, FileSpreadsheet, Gauge, History, Image as ImageIcon, Lightbulb, ListChecks, LoaderCircle, Pencil, Plus, RefreshCw, Search, Send, ShieldCheck, Tags, Trash2, Upload, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminPage, AdminPageHeader } from "@/components/admin-ui";
import { AppToast } from "@/components/app-toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FormLabel } from "@/components/form-label";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";
import { quizCsvTemplate, validateQuizCsv } from "@/lib/quiz-csv.mjs";
import styles from "@/components/quiz-management.module.css";

type Unit = { id: string; code: string; name: string };
type Theme = { id: string; unitId: string; name: string; questionCount: number };
type Difficulty = "easy" | "medium" | "hard";
type Question = {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  themeId: string;
  theme: string;
  question: string;
  options: string[];
  correctOption: number;
  explanation: string;
  difficulty: Difficulty;
  imageUrl: string;
  status: "draft" | "published" | "archived";
  updatedAt: string;
};
type HistoryItem = { id: string; action: string; detail: string; actorName: string; createdAt: string };
type Notice = { kind: "success" | "error"; message: string } | null;
type FormState = { unitId: string; theme: string; question: string; options: string[]; correctOption: number; explanation: string; difficulty: Difficulty; imageUrl: string; status: "draft" | "published" };
type Section = "questions" | "editor" | "themes" | "import" | "activity";
type Pagination = { page: number; pageSize: 10 | 25 | 50; total: number; totalPages: number; from: number; to: number };
type Confirmation = { kind: "question" } | { kind: "bulk"; action: "publish" | "archive" | "delete" };

const emptyForm = (unitId = ""): FormState => ({ unitId, theme: "", question: "", options: ["", ""], correctOption: 0, explanation: "", difficulty: "medium", imageUrl: "", status: "draft" });

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function id(value: unknown) { return String(value ?? ""); }
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sem data" : new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(parsed);
}
function difficultyLabel(value: Difficulty) { return value === "easy" ? "Fácil" : value === "hard" ? "Difícil" : "Média"; }
function statusLabel(value: Question["status"]) { return value === "published" ? "Publicada" : value === "archived" ? "Arquivada" : "Rascunho"; }
function canPreviewImage(value: string) { return value.startsWith("/") || /^data:image\/(?:jpeg|png|webp);base64,/i.test(value); }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }

function normaliseUnit(raw: unknown): Unit {
  const item = asRecord(raw);
  return { id: id(item.id), code: text(item.code) || "UC", name: text(item.name) || "Unidade curricular" };
}
function normaliseTheme(raw: unknown): Theme {
  const item = asRecord(raw);
  return { id: id(item.id), unitId: id(item.unitId ?? item.unit_id), name: text(item.name ?? item.title), questionCount: Number(item.questionCount ?? item.question_count ?? 0) || 0 };
}
function normaliseQuestion(raw: unknown, units: Unit[]): Question {
  const item = asRecord(raw);
  const unitId = id(item.unitId ?? item.unit_id ?? asRecord(item.unit).id);
  const unit = units.find((candidate) => candidate.id === unitId);
  const rawOptions = Array.isArray(item.options) ? item.options : [item.option1, item.option2, item.option3, item.option4];
  const options = rawOptions.map((option) => text(asRecord(option).text ?? option)).filter(Boolean);
  const correctOptionId = id(item.correctOptionId ?? item.correct_option_id);
  const optionWithCorrectId = rawOptions.findIndex((option) => id(asRecord(option).id) === correctOptionId);
  const rawCorrect = Number(item.correctOption ?? item.correct_option ?? item.correctAnswer ?? item.correct_answer ?? 0);
  const correctOption = optionWithCorrectId >= 0 ? optionWithCorrectId : rawCorrect >= 1 && rawCorrect <= options.length ? rawCorrect - 1 : rawCorrect;
  const rawDifficulty = text(item.difficulty).toLowerCase();
  const difficulty: Difficulty = rawDifficulty === "easy" || rawDifficulty === "fácil" ? "easy" : rawDifficulty === "hard" || rawDifficulty === "difícil" ? "hard" : "medium";
  const rawStatus = text(item.status).toLowerCase();
  return {
    id: id(item.id), unitId, unitCode: text(item.unitCode ?? item.unit_code ?? asRecord(item.unit).code) || unit?.code || "UC", unitName: text(item.unitName ?? item.unit_name ?? asRecord(item.unit).name) || unit?.name || "Unidade curricular",
    themeId: id(item.topicId ?? item.topic_id ?? item.themeId ?? item.theme_id ?? asRecord(item.theme).id), theme: text(item.topicTitle ?? item.topic_title ?? item.themeName ?? item.theme_name ?? item.theme ?? asRecord(item.theme).name) || "Sem tema",
    question: text(item.question ?? item.prompt ?? item.statement), options, correctOption: Number.isInteger(correctOption) && correctOption >= 0 ? correctOption : 0,
    explanation: text(item.explanation), difficulty, imageUrl: text(item.imageUrl ?? item.image_url),
    status: rawStatus === "published" || rawStatus === "active" ? "published" : rawStatus === "archived" ? "archived" : "draft",
    updatedAt: text(item.updatedAt ?? item.updated_at ?? item.createdAt ?? item.created_at),
  };
}
function normaliseHistory(raw: unknown): HistoryItem {
  const item = asRecord(raw);
  const rawDetails = text(item.detail ?? item.description ?? item.summary ?? item.details);
  let detail = rawDetails;
  try {
    const details = asRecord(JSON.parse(rawDetails));
    const filename = text(details.filename);
    const count = Number(details.count ?? details.questionsCreated ?? details.questions_created ?? 0);
    const topics = Number(details.topicsCreated ?? details.topics_created ?? 0);
    detail = [filename, count ? `${count} pergunta${count === 1 ? "" : "s"}` : "", topics ? `${topics} tema${topics === 1 ? "" : "s"}` : "", !filename && !count && !topics ? text(details.id) : ""].filter(Boolean).join(" · ");
  } catch { /* Os detalhes legados podem ser texto simples. */ }
  return { id: id(item.id), action: text(item.action ?? item.event) || "Alteração", detail, actorName: text(item.actorName ?? item.actor_name ?? asRecord(item.actor).fullName) || "Sistema", createdAt: text(item.createdAt ?? item.created_at ?? item.at) };
}
function normaliseImport(raw: unknown): HistoryItem {
  const item = asRecord(raw);
  const filename = text(item.filename ?? item.fileName ?? item.name) || "Ficheiro CSV";
  const unit = text(item.unitName ?? item.unit_name ?? item.unitCode ?? item.unit_code);
  const rows = Number(item.rowCount ?? item.row_count ?? item.questionsCreated ?? item.questions_created ?? item.imported ?? 0);
  const created = Number(item.questionsCreated ?? item.questions_created ?? item.imported ?? 0);
  const detail = [filename, unit, rows ? `${rows} linha${rows === 1 ? "" : "s"}` : "", created ? `${created} pergunta${created === 1 ? "" : "s"} criada${created === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  return { id: id(item.id) || `import-${filename}-${text(item.createdAt ?? item.created_at)}`, action: "Importação CSV", detail, actorName: text(item.importedBy ?? item.imported_by ?? item.actorName ?? item.actor_name) || "Sistema", createdAt: text(item.createdAt ?? item.created_at) };
}
async function readMessage(response: Response, fallback: string) {
  try { const body = await response.json() as { error?: string; message?: string }; return body.error || body.message || fallback; } catch { return fallback; }
}

export function QuizManagement() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState({ unitId: "", themeId: "", status: "all", query: "" });
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1, from: 0, to: 0 });
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [importUnitId, setImportUnitId] = useState("");
  const [importing, setImporting] = useState(false);
  const [newTheme, setNewTheme] = useState("");
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [section, setSection] = useState<Section>("questions");
  const [themeUnitId, setThemeUnitId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const loadController = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(filter.query.trim());
      setPagination((current) => current.page === 1 ? current : { ...current, page: 1 });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filter.query]);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setLoadError("");
    try {
      const parameters = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize) });
      if (filter.unitId) parameters.set("unitId", filter.unitId);
      if (filter.themeId) parameters.set("topicId", filter.themeId);
      if (filter.status !== "all") parameters.set("status", filter.status);
      if (debouncedQuery) parameters.set("query", debouncedQuery);
      const response = await fetch(`/api/admin/quizzes?${parameters}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(await readMessage(response, "Não foi possível carregar o banco de perguntas."));
      const data = await response.json() as Record<string, unknown>;
      const read = (key: string) => Array.isArray(data[key]) ? data[key] : [];
      const nextUnits = read("units").map(normaliseUnit).filter((unit) => unit.id);
      const nextQuestions = read("questions").map((item) => normaliseQuestion(item, nextUnits)).filter((question) => question.id);
      const rawThemes = read("themes").length ? read("themes") : read("topics");
      const rawPagination = asRecord(data.pagination);
      const nextPageSize = [10, 25, 50].includes(Number(rawPagination.pageSize)) ? Number(rawPagination.pageSize) as Pagination["pageSize"] : pagination.pageSize;
      setPagination({ page: Math.max(1, Number(rawPagination.page) || pagination.page), pageSize: nextPageSize, total: Math.max(0, Number(rawPagination.total) || 0), totalPages: Math.max(1, Number(rawPagination.totalPages) || 1), from: Math.max(0, Number(rawPagination.from) || 0), to: Math.max(0, Number(rawPagination.to) || 0) });
      setUnits(nextUnits); setThemes(rawThemes.map(normaliseTheme).filter((theme) => theme.id)); setQuestions(nextQuestions); setSelected([]);
      const auditHistory = (read("history").length ? read("history") : read("activity")).map(normaliseHistory).filter((item) => item.id);
      const importHistory = read("imports").map(normaliseImport).filter((item) => item.id);
      setHistory([...auditHistory, ...importHistory].sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || "")));
      setForm((current) => current.unitId || !nextUnits[0] ? current : { ...current, unitId: nextUnits[0].id });
      setImportUnitId((current) => current || nextUnits[0]?.id || "");
      setThemeUnitId((current) => current || nextUnits[0]?.id || "");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o banco de perguntas.");
    } finally { if (loadController.current === controller) setLoading(false); }
  }, [debouncedQuery, filter.status, filter.themeId, filter.unitId, pagination.page, pagination.pageSize]);
  // O carregamento é iniciado pelo efeito; as atualizações só ocorrem após a resposta da API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return () => loadController.current?.abort(); }, [load]);

  const visibleThemes = useMemo(() => themes.filter((theme) => !form.unitId || theme.unitId === form.unitId), [themes, form.unitId]);
  const preview = useMemo(() => csvText ? validateQuizCsv(csvText, { units, selectedUnitId: importUnitId, selectedUnitCode: units.find((unit) => unit.id === importUnitId)?.code || "" }) : null, [csvText, importUnitId, units]);
  const visibleQuestions = questions;

  const startNew = () => { setEditingId(null); setForm(emptyForm(filter.unitId || units[0]?.id || "")); setShowEditor(true); setSection("editor"); setNotice(null); };
  const startEdit = (question: Question) => { setEditingId(question.id); setForm({ unitId: question.unitId, theme: question.theme, question: question.question, options: question.options.length >= 2 ? question.options : ["", ""], correctOption: question.correctOption, explanation: question.explanation, difficulty: question.difficulty, imageUrl: question.imageUrl, status: question.status === "published" ? "published" : "draft" }); setShowEditor(true); setSection("editor"); setNotice(null); };
  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm((current) => ({ ...current, [key]: value }));
  const updateOption = (index: number, value: string) => setForm((current) => ({ ...current, options: current.options.map((option, optionIndex) => optionIndex === index ? value : option) }));
  const addOption = () => setForm((current) => current.options.length >= 4 ? current : { ...current, options: [...current.options, ""] });
  const removeOption = (index: number) => setForm((current) => current.options.length <= 2 ? current : { ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index), correctOption: current.correctOption > index ? current.correctOption - 1 : Math.min(current.correctOption, current.options.length - 2) });

  const validateForm = () => {
    const options = form.options.map((option) => option.trim()).filter(Boolean);
    const questionLength = richTextPlainText(form.question).length;
    const explanationLength = richTextPlainText(form.explanation).length;
    if (!form.unitId) return "Selecione a unidade curricular.";
    if (!form.theme.trim()) return "Indique o tema da pergunta.";
    if (questionLength < 3) return "Escreva uma pergunta com pelo menos 3 caracteres.";
    if (questionLength > 1000) return "A pergunta não pode exceder 1000 caracteres.";
    if (options.length < 2 || options.length > 4 || options.length !== form.options.length) return "Preencha entre 2 e 4 opções de resposta.";
    if (form.correctOption < 0 || form.correctOption >= options.length) return "Selecione a resposta correta.";
    if (explanationLength < 2) return "Inclua uma explicação para a resposta correta.";
    if (explanationLength > 2000) return "A explicação não pode exceder 2000 caracteres.";
    if (form.imageUrl && !/^(\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(form.imageUrl)) return "Selecione uma imagem JPEG, PNG ou WebP para guardar na pergunta.";
    return "";
  };
  const saveQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateForm();
    if (error) { setNotice({ kind: "error", message: error }); return; }
    setSaving(true); setNotice(null);
    const topic = themes.find((candidate) => candidate.unitId === form.unitId && candidate.name.localeCompare(form.theme.trim(), "pt-PT", { sensitivity: "accent" }) === 0);
    if (!topic) { setSaving(false); setNotice({ kind: "error", message: "Selecione um tema existente ou crie-o antes de guardar a pergunta." }); return; }
    const question = { ...(editingId ? { id: editingId } : {}), unitId: form.unitId, topicId: topic.id, theme: form.theme.trim(), question: sanitizeRichTextHtml(form.question), options: form.options.map((option) => option.trim()), correctOption: form.correctOption, explanation: sanitizeRichTextHtml(form.explanation), difficulty: form.difficulty, imageUrl: form.imageUrl.trim() || null, status: form.status };
    try {
      const response = await fetch("/api/admin/quizzes", { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: editingId ? "update_question" : "create_question", ...question, payload: question }) });
      if (!response.ok) throw new Error(await readMessage(response, "Não foi possível guardar a pergunta."));
      setNotice({ kind: "success", message: editingId ? "Pergunta atualizada." : "Pergunta adicionada ao banco." }); setShowEditor(false); setEditingId(null); setSection("questions"); await load();
    } catch (reason) { setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível guardar a pergunta." }); }
    finally { setSaving(false); }
  };
  const deleteQuestion = async () => {
    if (!editingId) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/quizzes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete_question", id: editingId }) });
      if (!response.ok) throw new Error(await readMessage(response, "Não foi possível eliminar a pergunta."));
      setConfirmation(null); setShowEditor(false); setEditingId(null); setSection("questions"); setNotice({ kind: "success", message: "Pergunta eliminada." }); await load();
    } catch (reason) { setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível eliminar a pergunta." }); }
    finally { setSaving(false); setConfirmation(null); }
  };
  const createTheme = async () => {
    const unitId = section === "themes" ? themeUnitId : form.unitId;
    if (!unitId || !newTheme.trim()) { setNotice({ kind: "error", message: "Selecione a UC e indique o nome do tema." }); return; }
    setCreatingTheme(true);
    try {
      const response = await fetch("/api/admin/quizzes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_topic", unitId, name: newTheme.trim(), topic: newTheme.trim(), theme: newTheme.trim(), status: "published" }) });
      if (!response.ok) throw new Error(await readMessage(response, "Não foi possível criar o tema."));
      if (section === "editor") setForm((current) => ({ ...current, theme: newTheme.trim() }));
      setNewTheme(""); setNotice({ kind: "success", message: "Tema criado." }); await load();
    } catch (reason) { setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível criar o tema." }); }
    finally { setCreatingTheme(false); }
  };
  const readCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { setCsvText(await file.text()); setCsvFileName(file.name); setNotice(null); } catch { setNotice({ kind: "error", message: "Não foi possível ler o ficheiro selecionado." }); }
    finally { event.target.value = ""; }
  };
  const readImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setNotice({ kind: "error", message: "Use uma imagem JPEG, PNG ou WebP." }); return; }
    if (file.size > 1024 * 1024) { setNotice({ kind: "error", message: "A imagem não pode ultrapassar 1 MiB." }); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { update("imageUrl", reader.result); setNotice(null); } };
    reader.onerror = () => setNotice({ kind: "error", message: "Não foi possível processar a imagem." });
    reader.readAsDataURL(file);
  };
  const importCsv = async () => {
    if (!preview?.validRows.length || preview.errors.length) { setNotice({ kind: "error", message: "Corrija os erros do CSV antes de importar." }); return; }
    setImporting(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/quizzes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "import", filename: csvFileName || "importacao.csv", rows: preview.validRows, questions: preview.validRows }) });
      if (!response.ok) throw new Error(await readMessage(response, "Não foi possível importar o CSV."));
      setNotice({ kind: "success", message: `${preview.validRows.length} pergunta${preview.validRows.length === 1 ? " importada" : "s importadas"}.` }); setCsvText(""); setCsvFileName(""); await load();
    } catch (reason) { setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível importar o CSV." }); }
    finally { setImporting(false); }
  };
  const bulk = async (action: "publish" | "archive" | "delete") => {
    if (!selected.length) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/quizzes/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, entity: "questions", questionIds: selected, ids: selected }) });
      if (!response.ok) throw new Error(await readMessage(response, "Não foi possível concluir a ação em lote."));
      setConfirmation(null); setSelected([]); setNotice({ kind: "success", message: "Ação em lote concluída." }); await load();
    } catch (reason) { setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível concluir a ação em lote." }); }
    finally { setSaving(false); setConfirmation(null); }
  };
  const downloadTemplate = () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([quizCsvTemplate()], { type: "text/csv;charset=utf-8" })); link.download = "modelo-perguntas.csv"; link.click(); URL.revokeObjectURL(link.href); };
  const toggleQuestion = (questionId: string) => setSelected((current) => current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]);
  const allVisibleSelected = visibleQuestions.length > 0 && visibleQuestions.every((question) => selected.includes(question.id));
  const selectVisible = () => setSelected((current) => allVisibleSelected ? current.filter((id) => !visibleQuestions.some((question) => question.id === id)) : [...new Set([...current, ...visibleQuestions.map((question) => question.id)])]);

  const sectionTitle = section === "editor" ? (editingId ? "Editar pergunta" : "Nova pergunta") : section === "themes" ? "Temas" : section === "import" ? "Importar CSV" : section === "activity" ? "Atividade" : "Banco de perguntas";
  const sectionDescription = section === "questions" ? "Consulte e mantenha as perguntas disponíveis nos testes." : section === "editor" ? "Atualize o enunciado, as respostas e a publicação." : section === "themes" ? "Organize o banco por unidade curricular e tema." : section === "import" ? "Valide o ficheiro antes de adicionar perguntas ao banco." : "Consulte as alterações recentes e importações.";

  return <AppShell active="quizzes_management" breadcrumb="Gestão de testes">
    <AdminPage>
      <AdminPageHeader eyebrow="Gestão de testes" title={sectionTitle} description={sectionDescription} actions={section === "questions" ? <button className="button button--primary" type="button" onClick={startNew}><Plus />Adicionar pergunta</button> : section === "editor" ? <button className="button button--secondary" type="button" onClick={() => { setShowEditor(false); setEditingId(null); setSection("questions"); }}><ArrowLeft />Voltar ao banco</button> : undefined} />
      {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

      {section !== "editor" && <nav className={styles.sectionNav} aria-label="Secções da gestão de testes">
        <button type="button" className={section === "questions" ? styles.activeNav : ""} onClick={() => setSection("questions")} aria-current={section === "questions" ? "page" : undefined}><ListChecks />Perguntas</button>
        <button type="button" className={section === "themes" ? styles.activeNav : ""} onClick={() => setSection("themes")} aria-current={section === "themes" ? "page" : undefined}><Tags />Temas</button>
        <button type="button" className={section === "import" ? styles.activeNav : ""} onClick={() => setSection("import")} aria-current={section === "import" ? "page" : undefined}><FileSpreadsheet />Importar CSV</button>
        <button type="button" className={section === "activity" ? styles.activeNav : ""} onClick={() => setSection("activity")} aria-current={section === "activity" ? "page" : undefined}><History />Atividade</button>
      </nav>}

      {section === "editor" && showEditor && <section className={`panel ${styles.editorPanel}`} aria-labelledby="editor-pergunta">
        <h2 className="sr-only" id="editor-pergunta">{editingId ? "Editar pergunta" : "Nova pergunta"}</h2>
        <form className={styles.form} onSubmit={(event) => void saveQuestion(event)} noValidate>
          <div className={styles.formGrid}>
            <label><FormLabel icon={BookOpen}>Unidade curricular</FormLabel><select value={form.unitId} onChange={(event) => { update("unitId", event.target.value); update("theme", ""); }} required><option value="">Selecionar UC</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
            <label><FormLabel icon={Tags}>Tema</FormLabel><select value={form.theme} onChange={(event) => update("theme", event.target.value)} required><option value="">Selecionar tema</option>{visibleThemes.map((theme) => <option value={theme.name} key={theme.id}>{theme.name}</option>)}</select></label>
            <div className={`${styles.full} ${styles.richTextField}`}><FormLabel icon={CircleHelp}>Pergunta</FormLabel><RichTextEditor value={form.question} onChange={(value) => update("question", value)} ariaLabel="Enunciado da pergunta" placeholder="Escreva uma pergunta clara e sem ambiguidade." maxLength={1000} minHeight="compact" onInvalidLink={() => setNotice({ kind: "error", message: "Introduza uma ligação válida iniciada por http://, https:// ou mailto:." })} /></div>
            <fieldset className={`${styles.options} ${styles.full}`}><legend>Opções de resposta <small>Escolha entre 2 e 4 e assinale a correta.</small></legend>{form.options.map((option, index) => <div className={styles.optionRow} key={`${index}-${form.options.length}`}><label className={styles.correctChoice}><input type="radio" name="correct-option" checked={form.correctOption === index} onChange={() => update("correctOption", index)} aria-label={`Marcar opção ${index + 1} como correta`} /><span><Check /></span></label><input value={option} onChange={(event) => updateOption(index, event.target.value)} placeholder={`Opção ${index + 1}`} maxLength={500} required />{form.options.length > 2 && <button className={styles.iconButton} type="button" onClick={() => removeOption(index)} aria-label={`Remover opção ${index + 1}`}><X /></button>}</div>)}{form.options.length < 4 && <button className={styles.addOption} type="button" onClick={addOption}><Plus />Adicionar opção</button>}</fieldset>
            <div className={`${styles.full} ${styles.richTextField}`}><FormLabel icon={Lightbulb}>Explicação da resposta correta</FormLabel><RichTextEditor value={form.explanation} onChange={(value) => update("explanation", value)} ariaLabel="Explicação da resposta correta" placeholder="Explique por que motivo esta é a resposta correta, com uma fonte ou contexto quando necessário." maxLength={2000} minHeight="compact" onInvalidLink={() => setNotice({ kind: "error", message: "Introduza uma ligação válida iniciada por http://, https:// ou mailto:." })} /></div>
            <label><FormLabel icon={Gauge}>Dificuldade</FormLabel><select value={form.difficulty} onChange={(event) => update("difficulty", event.target.value as Difficulty)}><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></label>
            <label><FormLabel icon={ShieldCheck}>Visibilidade</FormLabel><select value={form.status} onChange={(event) => update("status", event.target.value as FormState["status"])}><option value="draft">Guardar como rascunho</option><option value="published">Publicar já</option></select></label>
            <div className={`${styles.imageField} ${styles.full}`}><FormLabel icon={ImageIcon} optional>Imagem</FormLabel><input ref={imageInput} className={styles.visuallyHidden} type="file" accept="image/jpeg,image/png,image/webp" onChange={readImage} aria-label="Selecionar imagem para a pergunta" /><button className={styles.imagePicker} type="button" onClick={() => imageInput.current?.click()}><ImageIcon />{form.imageUrl ? "Substituir imagem" : "Selecionar imagem"}</button><small>JPEG, PNG ou WebP, até 1 MiB. A imagem é guardada com a pergunta.</small>{form.imageUrl && <div className={styles.imagePreview}>{canPreviewImage(form.imageUrl) ? <Image src={form.imageUrl} alt="Pré-visualização da imagem associada à pergunta" width={220} height={120} unoptimized /> : <span>Imagem externa associada. Por segurança, não é mostrada neste ambiente.</span>}<button type="button" onClick={() => update("imageUrl", "")}><X />Remover</button></div>}</div>
          </div>
          <div className={styles.formActions}>{editingId && <button className="button button--secondary button--danger" type="button" onClick={() => setConfirmation({ kind: "question" })} disabled={saving}><Trash2 />Eliminar</button>}<span /><button className="button button--secondary" type="button" onClick={() => { setShowEditor(false); setEditingId(null); setSection("questions"); }} disabled={saving}>Cancelar</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className={styles.spin} /> : <Send />}{editingId ? "Guardar alterações" : "Adicionar pergunta"}</button></div>
        </form>
      </section>}

      {section === "questions" && <section className={`panel ${styles.questionsPanel}`} aria-labelledby="perguntas-registadas">
        <div className={styles.sectionHeading}><span className={styles.sectionIcon}><CircleHelp /></span><div><span className="eyebrow">Conteúdo</span><h2 id="perguntas-registadas">Perguntas registadas</h2></div><div className={styles.panelActions}><span className={styles.resultCount}>{pagination.total} no banco</span><button className="button button--secondary button--compact" type="button" onClick={() => void load()} disabled={loading}><RefreshCw />Atualizar</button></div></div>
        <div className={styles.filters}><label className={styles.searchField}><span>Pesquisar</span><span className={styles.searchControl}><Search /><input type="search" value={filter.query} onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))} placeholder="Pergunta, UC ou tema" /></span></label><label><span>UC</span><select value={filter.unitId} onChange={(event) => { setFilter((current) => ({ ...current, unitId: event.target.value, themeId: "" })); setPagination((current) => ({ ...current, page: 1 })); }}><option value="">Todas as UCs</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label><label><span>Tema</span><select value={filter.themeId} onChange={(event) => { setFilter((current) => ({ ...current, themeId: event.target.value })); setPagination((current) => ({ ...current, page: 1 })); }}><option value="">Todos os temas</option>{themes.filter((theme) => !filter.unitId || theme.unitId === filter.unitId).map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label><label><span>Estado</span><select value={filter.status} onChange={(event) => { setFilter((current) => ({ ...current, status: event.target.value })); setPagination((current) => ({ ...current, page: 1 })); }}><option value="all">Todos</option><option value="draft">Rascunhos</option><option value="published">Publicadas</option><option value="archived">Arquivadas</option></select></label></div>
        {selected.length > 0 && <div className={styles.bulkBar} role="status"><strong>{selected.length} selecionada{selected.length === 1 ? "" : "s"}</strong><span>Aplicar a todas:</span><button type="button" onClick={() => setConfirmation({ kind: "bulk", action: "publish" })} disabled={saving}><CheckCircle2 />Publicar</button><button type="button" onClick={() => setConfirmation({ kind: "bulk", action: "archive" })} disabled={saving}><Archive />Arquivar</button><button className={styles.dangerAction} type="button" onClick={() => setConfirmation({ kind: "bulk", action: "delete" })} disabled={saving}><Trash2 />Eliminar</button><button className={styles.iconButton} type="button" onClick={() => setSelected([])} aria-label="Limpar seleção"><X /></button></div>}
        {loading ? <div className={styles.state}><LoaderCircle className={styles.spin} /><strong>A carregar perguntas…</strong></div> : loadError ? <div className={styles.state} role="alert"><strong>{loadError}</strong><button className="button button--secondary button--compact" type="button" onClick={() => void load()}>Tentar novamente</button></div> : visibleQuestions.length === 0 ? <div className={styles.state}><CircleHelp /><strong>Não existem perguntas neste filtro.</strong><p>Adicione uma pergunta manualmente ou importe um CSV validado.</p><button className="button button--secondary button--compact" type="button" onClick={startNew}><Plus />Adicionar pergunta</button></div> : <div className={styles.questionList}><div className={styles.listTools}><label><input type="checkbox" checked={allVisibleSelected} onChange={selectVisible} />Selecionar esta página</label><span>{pagination.from}–{pagination.to} de {pagination.total}</span></div>{visibleQuestions.map((question) => <QuestionRow key={question.id} question={question} selected={selected.includes(question.id)} onToggle={() => toggleQuestion(question.id)} onEdit={() => startEdit(question)} />)}</div>}
        {!loading && !loadError && pagination.total > 0 && <div className={styles.pagination} aria-label="Paginação das perguntas"><label><span>Por página</span><select value={pagination.pageSize} onChange={(event) => setPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) as Pagination["pageSize"] }))}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><span>Página <strong>{pagination.page}</strong> de {pagination.totalPages}</span><div><button className="button button--secondary button--compact" type="button" onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))} disabled={pagination.page <= 1}><ChevronLeft />Anterior</button><button className="button button--secondary button--compact" type="button" onClick={() => setPagination((current) => ({ ...current, page: Math.min(current.totalPages, current.page + 1) }))} disabled={pagination.page >= pagination.totalPages}>Seguinte<ChevronRight /></button></div></div>}
      </section>}

      {section === "themes" && <section className={`panel ${styles.themesPanel}`} aria-labelledby="temas-registados">
        <div className={styles.sectionHeading}><span className={styles.sectionIcon}><Tags /></span><div><span className="eyebrow">Organização</span><h2 id="temas-registados">Temas registados</h2></div><span className={styles.resultCount}>{themes.length} tema{themes.length === 1 ? "" : "s"}</span></div>
        <div className={styles.themeToolbar}><label><FormLabel icon={BookOpen}>Unidade curricular</FormLabel><select value={themeUnitId} onChange={(event) => setThemeUnitId(event.target.value)}><option value="">Selecionar UC</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label><label><FormLabel icon={Tags}>Novo tema</FormLabel><input value={newTheme} onChange={(event) => setNewTheme(event.target.value)} placeholder="Nome do tema" maxLength={120} /></label><button className="button button--primary button--compact" type="button" onClick={() => void createTheme()} disabled={creatingTheme || !themeUnitId || !newTheme.trim()}>{creatingTheme ? <LoaderCircle className={styles.spin} /> : <Plus />}Adicionar tema</button></div>
        <div className={styles.themeList}>{themes.filter((theme) => !themeUnitId || theme.unitId === themeUnitId).map((theme) => <div className={styles.themeRow} key={theme.id}><div><strong>{theme.name}</strong><small>{units.find((unit) => unit.id === theme.unitId)?.name || "Unidade curricular"}</small></div><span>{theme.questionCount} pergunta{theme.questionCount === 1 ? "" : "s"}</span></div>)}</div>
      </section>}

      {section === "import" && <section className={`panel ${styles.importPanel}`} aria-labelledby="importar-csv">
        <div className={styles.sectionHeading}><span className={styles.sectionIcon}><FileSpreadsheet /></span><div><span className="eyebrow">Importação</span><h2 id="importar-csv">Importar perguntas por CSV</h2></div><button className="button button--secondary button--compact" type="button" onClick={downloadTemplate}><Download />Descarregar modelo</button></div>
        <div className={styles.importBody}>
          <label className={styles.importUnit}><FormLabel icon={BookOpen}>Unidade curricular</FormLabel><select value={importUnitId} onChange={(event) => setImportUnitId(event.target.value)}><option value="">Selecionar UC</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
          <input ref={fileInput} className={styles.visuallyHidden} type="file" accept=".csv,text/csv" onChange={(event) => void readCsv(event)} />
          <button className={styles.dropzone} type="button" onClick={() => fileInput.current?.click()}><Upload /><span><strong>{csvText ? "Substituir ficheiro CSV" : "Selecionar ficheiro CSV"}</strong><small>O ficheiro é validado antes da importação.</small></span></button>
          {preview && <CsvPreview preview={preview} filename={csvFileName} onImport={() => void importCsv()} importing={importing} onClear={() => { setCsvText(""); setCsvFileName(""); }} />}
        </div>
      </section>}

      {section === "activity" && <section className={`panel ${styles.historyPanel}`} aria-labelledby="historico-testes"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><History /></span><div><span className="eyebrow">Auditoria</span><h2 id="historico-testes">Atividade recente</h2></div></div>{history.length === 0 ? <div className={styles.compactEmpty}><History /><strong>Ainda não há atividade registada.</strong></div> : <ol className={styles.history}>{history.slice(0, 20).map((item) => <li key={item.id}><span className={styles.historyDot} /><div><strong>{item.action}</strong>{item.detail && <p>{item.detail}</p>}<small>{item.actorName} · {date(item.createdAt)}</small></div></li>)}</ol>}</section>}
    </AdminPage>
    <ConfirmationDialog open={Boolean(confirmation)} eyebrow="Gestão do banco de perguntas" title={confirmation?.kind === "question" ? "Eliminar esta pergunta?" : confirmation?.action === "publish" ? "Publicar as perguntas selecionadas?" : confirmation?.action === "archive" ? "Arquivar as perguntas selecionadas?" : "Eliminar as perguntas selecionadas?"} description={confirmation?.kind === "question" ? "A pergunta e as respetivas opções serão removidas do banco." : `A ação será aplicada a ${selected.length} pergunta${selected.length === 1 ? "" : "s"}.`} subject={confirmation?.kind === "question" ? richTextPlainText(form.question).slice(0, 180) : `${selected.length} pergunta${selected.length === 1 ? "" : "s"} selecionada${selected.length === 1 ? "" : "s"}`} subjectLabel={confirmation?.kind === "question" ? "Pergunta selecionada" : "Seleção atual"} warning={confirmation?.kind === "question" || confirmation?.action === "delete" ? "Esta ação não pode ser revertida." : undefined} confirmLabel={saving ? "A concluir…" : confirmation?.kind === "question" || confirmation?.action === "delete" ? "Eliminar" : confirmation?.action === "archive" ? "Arquivar" : "Publicar"} busy={saving} tone={confirmation?.kind === "bulk" && confirmation.action !== "delete" ? "primary" : "danger"} icon={confirmation?.kind === "bulk" && confirmation.action === "publish" ? <CheckCircle2 /> : confirmation?.kind === "bulk" && confirmation.action === "archive" ? <Archive /> : <Trash2 />} onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation?.kind === "question") void deleteQuestion(); else if (confirmation) void bulk(confirmation.action); }} />
  </AppShell>;
}

function CsvPreview({ preview, filename, onImport, importing, onClear }: { preview: ReturnType<typeof validateQuizCsv>; filename: string; onImport: () => void; importing: boolean; onClear: () => void }) {
  const errorsByRow = new Map<number, string[]>();
  for (const error of preview.errors) errorsByRow.set(error.row, [...(errorsByRow.get(error.row) || []), error.message]);
  return <div className={styles.csvPreview}><div className={styles.csvSummary}><div><strong>{preview.rows.length} linha{preview.rows.length === 1 ? "" : "s"} lida{preview.rows.length === 1 ? "" : "s"}</strong><span>{filename ? `${filename} · ` : ""}{preview.errors.length ? `${preview.errors.length} erro${preview.errors.length === 1 ? "" : "s"} a corrigir` : "CSV pronto a importar"}</span></div><button className={styles.textButton} type="button" onClick={onClear}>Remover ficheiro</button></div>{preview.rows.length > 0 && <div className={styles.previewTableWrap}><table><thead><tr><th>Linha</th><th>UC</th><th>Tema</th><th>Pergunta</th><th>Estado</th></tr></thead><tbody>{preview.rows.slice(0, 8).map((row) => <tr key={row.row} className={errorsByRow.has(row.row) ? styles.invalidRow : ""}><td>{row.row}</td><td>{row.unitCode || row.unitId || "—"}</td><td>{row.theme || "—"}</td><td>{row.question || "—"}</td><td>{errorsByRow.has(row.row) ? errorsByRow.get(row.row)?.join(" ") : "Válida"}</td></tr>)}</tbody></table></div>}{preview.rows.length > 8 && <small className={styles.moreRows}>A pré-visualização mostra as primeiras 8 linhas.</small>}<p className={styles.imageCsvHint}>As imagens só podem usar um caminho interno iniciado por <code>/</code> ou um data URL JPEG, PNG ou WebP até 1 MiB. URLs externas não são apresentadas pela aplicação.</p>{preview.errors.length > 0 && <ul className={styles.csvErrors}>{preview.errors.slice(0, 12).map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>Linha {error.row || "—"}: {error.message}</li>)}</ul>}<div className={styles.csvActions}><button className="button button--primary button--compact" type="button" onClick={onImport} disabled={importing || preview.errors.length > 0 || preview.validRows.length === 0}>{importing ? <LoaderCircle className={styles.spin} /> : <Upload />}{importing ? "A importar…" : `Importar ${preview.validRows.length} válida${preview.validRows.length === 1 ? "" : "s"}`}</button></div></div>;
}

function QuestionRow({ question, selected, onToggle, onEdit }: { question: Question; selected: boolean; onToggle: () => void; onEdit: () => void }) {
  return <article className={styles.questionRow}><label className={styles.rowCheck}><input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Selecionar pergunta: ${richTextPlainText(question.question)}`} /></label><div className={styles.questionContent}><div className={styles.questionMeta}><span className={styles.unitBadge}>{question.unitCode}</span><span>{question.theme}</span><span className={`${styles.status} ${styles[question.status]}`}>{statusLabel(question.status)}</span><span className={styles.difficulty}>{difficultyLabel(question.difficulty)}</span></div><RichTextContent value={question.question} className={styles.questionTitle} /><p className={styles.optionsText}>{question.options.map((option, index) => <span className={index === question.correctOption ? styles.correctOption : ""} key={`${question.id}-${index}`}>{String.fromCharCode(65 + index)}. {option}</span>)}</p><div className={styles.explanation}><strong>Explicação:</strong><RichTextContent value={question.explanation} /></div><div className={styles.questionFooter}>{question.imageUrl && <a href={question.imageUrl} target="_blank" rel="noreferrer"><ImageIcon />Imagem</a>}{question.updatedAt && <time>{date(question.updatedAt)}</time>}</div></div><button className="button button--secondary button--compact" type="button" onClick={onEdit}><Pencil />Editar</button></article>;
}
