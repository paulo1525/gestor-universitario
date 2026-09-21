"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, ChevronDown, Download, RefreshCw, Search } from "lucide-react";
import { SurfaceHeader } from "@/components/surface-header";
import styles from "@/components/question-bank-section.module.css";

type QuestionBankTopic = {
  id: string;
  title: string;
  chapterNumber: string;
  questionCount: number;
};

type QuestionBankQuestion = {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string; text: string; position: number; isCorrect: boolean }> | null;
  answer: string | null;
  indicatedAnswer: string | null;
  hasSolution: boolean;
  hasOptions: boolean;
  hasImage: boolean;
  imageUrl: string | null;
  responseType: string;
  topic: { id: string; title: string; chapterNumber: string };
  source: { subtopic: string; academicYear: string; page: string; question: string; assessment: string; session: string; original: string; indicatedAnswer: string | null; validatedAnswer: string | null; validationState: string; warning: string; justification: string; confidence: string };
  sheet: Record<string, string | null>;
};

type QuestionBankData = {
  topics: QuestionBankTopic[];
  questions: QuestionBankQuestion[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; from: number; to: number };
  source: { label: string; importedCount: number; publishedCount: number; reviewCount: number } | null;
  sources: Array<{ id: string; label: string }>;
  facets: { subtopics: string[]; academicYears: string[]; assessments: string[]; sessions: string[]; pages: string[]; responseTypes: string[]; images: { with: number; without: number }; solutions: { with: number; without: number } };
  capabilities?: { filters?: { images?: boolean }; export?: { complete?: boolean } };
};

export function QuestionBankSection({ unitId, unitCode }: { unitId: string; unitCode: string }) {
  const [data, setData] = useState<QuestionBankData | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [topicId, setTopicId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [assessment, setAssessment] = useState("");
  const [session, setSession] = useState("");
  const [sourcePage, setSourcePage] = useState("");
  const [responseType, setResponseType] = useState("");
  const [imageFilter, setImageFilter] = useState("all");
  const [solutionFilter, setSolutionFilter] = useState("all");
  const [includeSolutions, setIncludeSolutions] = useState(true);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ unitId, page: String(page), pageSize: String(pageSize), solutions: includeSolutions ? "with" : "without", solutionFilter });
    if (query) params.set("query", query);
    if (sourceId) params.set("sourceId", sourceId);
    if (topicId) params.set("topicId", topicId);
    if (subtopic) params.set("subtopic", subtopic);
    if (academicYear) params.set("academicYear", academicYear);
    if (assessment) params.set("assessment", assessment);
    if (session) params.set("session", session);
    if (sourcePage) params.set("sourcePage", sourcePage);
    if (responseType) params.set("responseType", responseType);
    if (imageFilter !== "all") params.set("images", imageFilter);
    try {
      const response = await fetch(`/api/question-bank?${params.toString()}`, { cache: "no-store", signal });
      const raw = await response.json() as QuestionBankData & { error?: string };
      if (!response.ok) throw new Error(raw.error || "Não foi possível carregar o banco de questões.");
      setData(raw);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o banco de questões.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [academicYear, assessment, imageFilter, includeSolutions, page, pageSize, query, responseType, session, solutionFilter, sourceId, sourcePage, subtopic, topicId, unitId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const pagination = data?.pagination;
  const retry = () => {
    const controller = new AbortController();
    void load(controller.signal);
  };

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ unitId, export: "1", pageSize: "2000", solutions: includeSolutions ? "with" : "without", solutionFilter });
    if (query) params.set("query", query);
    if (sourceId) params.set("sourceId", sourceId);
    if (topicId) params.set("topicId", topicId);
    if (subtopic) params.set("subtopic", subtopic);
    if (academicYear) params.set("academicYear", academicYear);
    if (assessment) params.set("assessment", assessment);
    if (session) params.set("session", session);
    if (sourcePage) params.set("sourcePage", sourcePage);
    if (responseType) params.set("responseType", responseType);
    if (imageFilter !== "all") params.set("images", imageFilter);
    return `/api/question-bank?${params.toString()}`;
  }, [academicYear, assessment, imageFilter, includeSolutions, query, responseType, session, solutionFilter, sourceId, sourcePage, subtopic, topicId, unitId]);

  return (
    <section className={styles.panel} aria-labelledby="question-bank-title" aria-busy={loading}>
      <SurfaceHeader
        icon={<BookOpenCheck />}
        eyebrow="Banco de questões"
        title={`Pratica ${unitCode}`}
        description="Perguntas organizadas por capítulo, com respostas disponíveis para revisão autónoma."
        headingId="question-bank-title"
        actions={<div className={styles.headerActions}>
          <a className={styles.link} href={exportHref} download="banco-neuroanatomia.json">Exportar resultados <Download aria-hidden="true" /></a>
          <Link className={styles.link} href="/testes">Abrir testes <ArrowRight aria-hidden="true" /></Link>
        </div>}
      />

      <div className={styles.sourceNote}>
        <span>Fonte estruturada da unidade curricular</span>
        {data?.source && <span>{data.source.publishedCount} perguntas publicadas · {data.source.reviewCount} em revisão</span>}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>Fonte</span>
          <select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(1); }}>
            <option value="">Todas as fontes</option>
            {(data?.sources ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Pesquisar perguntas</span>
          <div className={styles.inputWrap}>
            <Search aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por enunciado" />
          </div>
        </label>
        <label className={styles.field}>
          <span>Capítulo</span>
          <select value={topicId} onChange={(event) => { setTopicId(event.target.value); setPage(1); }}>
            <option value="">Todos os capítulos</option>
            {(data?.topics ?? []).map((topic) => <option key={topic.id} value={topic.id}>Cap. {topic.chapterNumber} · {topic.title} ({topic.questionCount})</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Subtema</span>
          <select value={subtopic} onChange={(event) => { setSubtopic(event.target.value); setPage(1); }}>
            <option value="">Todos os subtemas</option>
            {(data?.facets.subtopics ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Ano letivo</span>
          <select value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setPage(1); }}>
            <option value="">Todos os anos</option>
            {(data?.facets.academicYears ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Tipo de pergunta</span>
          <select value={responseType} onChange={(event) => { setResponseType(event.target.value); setPage(1); }}>
            <option value="">Todos os tipos</option>
            {(data?.facets.responseTypes ?? []).map((item) => <option key={item} value={item}>{item === "short_answer" ? "Resposta curta" : item === "multiple_choice" ? "Escolha múltipla" : "Caso clínico"}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Avaliação</span>
          <select value={assessment} onChange={(event) => { setAssessment(event.target.value); setPage(1); }}>
            <option value="">Todas as avaliações</option>
            {(data?.facets.assessments ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Época / aula</span>
          <select value={session} onChange={(event) => { setSession(event.target.value); setPage(1); }}>
            <option value="">Todas as épocas</option>
            {(data?.facets.sessions ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {data?.facets.pages?.length ? <label className={styles.field}>
          <span>Página de origem</span>
          <select value={sourcePage} onChange={(event) => { setSourcePage(event.target.value); setPage(1); }}>
            <option value="">Todas as páginas</option>
            {data.facets.pages.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label> : null}
        {data?.capabilities?.filters?.images ? <label className={styles.field}>
          <span>Imagens</span>
          <select value={imageFilter} onChange={(event) => { setImageFilter(event.target.value); setPage(1); }}>
            <option value="all">Com e sem imagens</option>
            <option value="with">Com imagens ({data?.facets.images.with ?? 0})</option>
            <option value="without">Sem imagens ({data?.facets.images.without ?? 0})</option>
          </select>
        </label> : null}
        <label className={styles.field}>
          <span>Filtro de soluções</span>
          <select value={solutionFilter} onChange={(event) => { setSolutionFilter(event.target.value); setPage(1); }}>
            <option value="all">Com e sem soluções</option>
            <option value="with">Com soluções ({data?.facets.solutions.with ?? 0})</option>
            <option value="without">Sem soluções ({data?.facets.solutions.without ?? 0})</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Mostrar respostas</span>
          <select value={includeSolutions ? "with" : "without"} onChange={(event) => setIncludeSolutions(event.target.value === "with")}>
            <option value="with">Mostrar soluções</option>
            <option value="without">Ocultar soluções</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Por página</span>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      {error ? (
        <div className={styles.state} role="alert">
          <strong>{error}</strong>
          <button type="button" className={styles.stateAction} onClick={retry}><RefreshCw aria-hidden="true" />Tentar novamente</button>
        </div>
      ) : loading && !data ? (
        <div className={styles.state} role="status" aria-live="polite">A carregar perguntas…</div>
      ) : pagination?.total ? (
        <>
          <div className={styles.resultMeta} aria-live="polite">A mostrar {pagination.from}–{pagination.to} de {pagination.total} perguntas</div>
          <div className={styles.list}>
            {data?.questions.map((question, index) => (
              <details className={styles.item} key={question.id}>
                <summary>
                  <span className={styles.number}>{pagination.from + index}</span>
                  <span className={styles.promptWrap}>
                    <strong>{question.prompt}</strong>
                    <small>Cap. {question.topic.chapterNumber} · {question.topic.title}{question.source.assessment ? ` · ${question.source.assessment}` : ""}{question.source.session ? ` · ${question.source.session}` : ""}</small>
                  </span>
                  <ChevronDown className={styles.chevron} aria-hidden="true" />
                </summary>
                <div className={styles.answer}>
                  <span className={styles.answerLabel}>{includeSolutions ? "Solução validada" : "Compêndio sem soluções"}</span>
                  {question.answer ? <p>{question.answer}</p> : <p>Resposta ocultada para este compêndio.</p>}
                  {question.options?.length ? <div className={styles.options} aria-label="Opções de resposta">
                    {question.options.map((option) => <div className={option.isCorrect && includeSolutions ? styles.optionCorrect : styles.option} key={option.id}><span>{option.label})</span><span>{option.text}</span></div>)}
                  </div> : null}
                  {!question.options?.length && question.responseType === "multiple_choice" && <small>Esta linha foi mantida sem opções estruturadas na origem.</small>}
                  {question.source.subtopic && <small>Subtema: {question.source.subtopic}</small>}
                  {(question.source.page || question.source.question || question.source.academicYear) && <small>{[question.source.question, question.source.page, question.source.academicYear].filter(Boolean).join(" · ")}</small>}
                </div>
              </details>
            ))}
          </div>
          {pagination.totalPages > 1 && <nav className={styles.pagination} aria-label="Paginação do banco de questões">
            <button type="button" disabled={pagination.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft aria-hidden="true" />Anterior</button>
            <span>Página {pagination.page} de {pagination.totalPages} · {pagination.pageSize} por página</span>
            <button type="button" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))}>Seguinte<ArrowRight aria-hidden="true" /></button>
          </nav>}
        </>
      ) : (
        <div className={styles.state}>
          <strong>Nenhuma pergunta encontrada.</strong>
          <span>Altera a pesquisa ou escolhe outro capítulo.</span>
        </div>
      )}
    </section>
  );
}
