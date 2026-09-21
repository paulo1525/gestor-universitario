"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, Image as ImageIcon, LoaderCircle } from "lucide-react";
import {
  buildMaterialCompendiumPdf,
  loadMaterialQuestionBank,
  resolveMaterialCompendiumUnit,
  type MaterialCompendiumEntry,
  type MaterialCompendiumType,
} from "@/lib/material-compendium-pdf";
import styles from "@/components/material-compendium-export.module.css";

type MaterialCardType = Exclude<MaterialCompendiumType, "case">;

export type MaterialCompendiumCard = {
  id: string;
  type: MaterialCardType;
  lesson: string;
  subtopic: string;
  chapter?: string;
  question: string;
  answer?: string;
  hint?: string;
  source?: string;
  sourceLabel?: string;
  sourcePage?: string;
  sourceQuestion?: string;
  assessment?: string;
  session?: string;
  academicYear?: string;
  imageUrl?: string | null;
  options?: Array<{ text: string; isCorrect: boolean }>;
};

type Selection = string[] | null;

type MaterialCompendiumExportProps = {
  cards: readonly MaterialCompendiumCard[];
  unitId?: string | null;
  unitCode?: string | null;
  unitName?: string | null;
  lessonOptions: readonly string[];
  selectedLessons: readonly string[];
  onToggleLesson: (lesson: string) => void;
  selectedTypes: readonly MaterialCardType[];
  onToggleType: (type: MaterialCardType) => void;
};

const cardTypes: MaterialCardType[] = ["multiple_choice", "short_answer", "image"];

function typeLabel(type: MaterialCardType) {
  if (type === "multiple_choice") return "Escolha múltipla";
  if (type === "image") return "Imagem";
  return "Resposta curta";
}

function cardEntries(cards: readonly MaterialCompendiumCard[]): MaterialCompendiumEntry[] {
  return cards.map((card) => ({
    id: `material-card:${card.id}`,
    lesson: card.lesson,
    topic: card.subtopic,
    chapter: card.chapter,
    type: card.type === "multiple_choice" && card.options?.length ? "multiple_choice" : card.type === "image" && card.imageUrl ? "image" : "short_answer",
    question: card.question,
    answer: card.answer,
    hint: card.hint,
    source: card.source,
    sourceLabel: card.sourceLabel,
    sourcePage: card.sourcePage,
    sourceQuestion: card.sourceQuestion,
    assessment: card.assessment,
    session: card.session,
    academicYear: card.academicYear,
    imageUrl: card.imageUrl,
    options: card.options,
  }));
}

export function filterMaterialCompendiumEntries(
  entries: readonly MaterialCompendiumEntry[],
  selectedLessons: readonly string[],
  selectedTypes: readonly MaterialCardType[],
  selectedSources: Selection,
  selectedPages: Selection,
  selectedTopics: Selection,
  imageFilter: "all" | "with" | "without",
  selectedAssessments: Selection = null,
  selectedSessions: Selection = null,
  selectedAcademicYears: Selection = null,
  solutionFilter: "all" | "with" | "without" = "all",
  selectedChapters: Selection = null,
) {
  return entries.filter((entry) => {
    const lessonMatches = !selectedLessons.length || !entry.lesson || selectedLessons.includes(entry.lesson);
    const typeMatches = selectedTypes.includes(entry.type as MaterialCardType);
    const sourceMatches = selectedSources === null || selectedSources.includes(entry.source || entry.sourceLabel || "");
    const pageMatches = selectedPages === null || selectedPages.includes(entry.sourcePage || "");
    const topicMatches = selectedTopics === null || selectedTopics.includes(entry.topic || "");
    const chapterMatches = selectedChapters === null || selectedChapters.includes(entry.chapter || "");
    const assessmentMatches = selectedAssessments === null || selectedAssessments.includes(entry.assessment || "");
    const sessionMatches = selectedSessions === null || selectedSessions.includes(entry.session || "");
    const academicYearMatches = selectedAcademicYears === null || selectedAcademicYears.includes(entry.academicYear || "");
    const imageMatches = imageFilter === "all" || (imageFilter === "with" ? Boolean(entry.imageUrl) : !entry.imageUrl);
    const solutionMatches = solutionFilter === "all" || (solutionFilter === "with" ? Boolean(entry.answer?.trim()) : !entry.answer?.trim());
    return lessonMatches && typeMatches && sourceMatches && pageMatches && topicMatches && chapterMatches && assessmentMatches && sessionMatches && academicYearMatches && imageMatches && solutionMatches;
  });
}

function toggleSelection(current: Selection, value: string, options: readonly string[]): Selection {
  if (!options.length) return null;
  const selected = current === null ? [...options] : current;
  const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
  return next.length === options.length ? null : next;
}

export function MaterialCompendiumExport({ cards, unitId, unitCode, unitName, lessonOptions, selectedLessons, onToggleLesson, selectedTypes, onToggleType }: MaterialCompendiumExportProps) {
  const [includeQuestionBank, setIncludeQuestionBank] = useState(true);
  const [questionBank, setQuestionBank] = useState<MaterialCompendiumEntry[]>([]);
  const [questionBankLoaded, setQuestionBankLoaded] = useState(false);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);
  const [questionBankError, setQuestionBankError] = useState("");
  const [selectedSources, setSelectedSources] = useState<Selection>(null);
  const [selectedPages, setSelectedPages] = useState<Selection>(null);
  const [selectedTopics, setSelectedTopics] = useState<Selection>(null);
  const [selectedChapters, setSelectedChapters] = useState<Selection>(null);
  const [selectedAssessments, setSelectedAssessments] = useState<Selection>(null);
  const [selectedSessions, setSelectedSessions] = useState<Selection>(null);
  const [selectedAcademicYears, setSelectedAcademicYears] = useState<Selection>(null);
  const [imageFilter, setImageFilter] = useState<"all" | "with" | "without">("all");
  const [solutionFilter, setSolutionFilter] = useState<"all" | "with" | "without">("all");
  const [includeSolutions, setIncludeSolutions] = useState(true);
  const [buildBusy, setBuildBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [buildError, setBuildError] = useState("");

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const materialEntries = useMemo(() => cardEntries(cards), [cards]);
  const availableEntries = useMemo(() => includeQuestionBank ? [...materialEntries, ...questionBank] : materialEntries, [includeQuestionBank, materialEntries, questionBank]);
  const sourceOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.source || entry.sourceLabel).filter((source): source is string => Boolean(source)))], [availableEntries]);
  const pageOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.sourcePage).filter((page): page is string => Boolean(page)))], [availableEntries]);
  const topicOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.topic).filter((topic): topic is string => Boolean(topic)))], [availableEntries]);
  const chapterOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.chapter).filter((chapter): chapter is string => Boolean(chapter)))], [availableEntries]);
  const assessmentOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.assessment).filter((assessment): assessment is string => Boolean(assessment)))], [availableEntries]);
  const sessionOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.session).filter((session): session is string => Boolean(session)))], [availableEntries]);
  const academicYearOptions = useMemo(() => [...new Set(availableEntries.map((entry) => entry.academicYear).filter((year): year is string => Boolean(year)))], [availableEntries]);
  const availableTypeOptions = useMemo(() => cardTypes.filter((type) => availableEntries.some((entry) => entry.type === type && (type !== "image" || Boolean(entry.imageUrl)))), [availableEntries]);
  const imageCounts = useMemo(() => availableEntries.reduce((counts, entry) => { counts[entry.imageUrl ? "with" : "without"] += 1; return counts; }, { with: 0, without: 0 }), [availableEntries]);
  const hasImages = imageCounts.with > 0;
  const showImageFilter = imageCounts.with > 0 && imageCounts.without > 0;
  const solutionCounts = useMemo(() => availableEntries.reduce((counts, entry) => { counts[entry.answer?.trim() ? "with" : "without"] += 1; return counts; }, { with: 0, without: 0 }), [availableEntries]);
  const showSolutionFilter = solutionCounts.with > 0 && solutionCounts.without > 0;
  const effectiveImageFilter = hasImages ? imageFilter : "all";
  const effectiveSolutionFilter = showSolutionFilter ? solutionFilter : "all";
  const filteredEntries = useMemo(() => filterMaterialCompendiumEntries(availableEntries, selectedLessons, selectedTypes, selectedSources, selectedPages, selectedTopics, effectiveImageFilter, selectedAssessments, selectedSessions, selectedAcademicYears, effectiveSolutionFilter, selectedChapters), [availableEntries, effectiveImageFilter, effectiveSolutionFilter, selectedAcademicYears, selectedAssessments, selectedChapters, selectedLessons, selectedPages, selectedSessions, selectedSources, selectedTopics, selectedTypes]);
  const bankStatus = questionBankLoading ? "A carregar o banco de questões…" : questionBankLoaded ? `${questionBank.length} perguntas do banco disponíveis` : unitId ? "O banco de questões será carregado ao exportar" : "Banco de questões indisponível para esta unidade";
  const resolvedUnit = resolveMaterialCompendiumUnit(unitCode || unitName);
  const unitLabel = resolvedUnit?.shortTitle || unitName || unitCode || "unidade curricular";

  const loadBank = async () => {
    if (questionBankLoaded) return questionBank;
    if (!unitId) throw new Error("A unidade curricular não está disponível para carregar o banco de questões.");
    setQuestionBankLoading(true);
    setQuestionBankError("");
    try {
      const loaded = await loadMaterialQuestionBank(unitId);
      setQuestionBank(loaded.entries);
      setQuestionBankLoaded(true);
      return loaded.entries;
    } finally {
      setQuestionBankLoading(false);
    }
  };

  const buildPdf = async () => {
    setBuildBusy(true);
    setBuildError("");
    setQuestionBankError("");
    try {
      let bankEntries = questionBank;
      if (includeQuestionBank && !questionBankLoaded) {
        bankEntries = await loadBank();
      }
      const entries = includeQuestionBank ? [...materialEntries, ...bankEntries] : materialEntries;
      const filtered = filterMaterialCompendiumEntries(entries, selectedLessons, selectedTypes, selectedSources, selectedPages, selectedTopics, effectiveImageFilter, selectedAssessments, selectedSessions, selectedAcademicYears, effectiveSolutionFilter, selectedChapters);
      if (!filtered.length) throw new Error("Nenhuma pergunta corresponde aos filtros escolhidos.");
      const bytes = await buildMaterialCompendiumPdf(filtered, {
        title: `${unitLabel} · Compêndio personalizado`,
        subtitle: "Perguntas selecionadas a partir dos materiais publicados",
        unitCode: unitCode || undefined,
        unitName: unitName || undefined,
        coverUrl: resolvedUnit?.coverUrl,
        includeSolutions,
      });
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const pdfBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(pdfBuffer).set(bytes);
      setDownloadUrl(URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" })));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível criar o PDF.";
      setQuestionBankError(message.includes("banco de questões") ? message : "");
      setBuildError(message);
    } finally {
      setBuildBusy(false);
    }
  };

  const sourceSelected = (value: string) => selectedSources === null || selectedSources.includes(value);
  const pageSelected = (value: string) => selectedPages === null || selectedPages.includes(value);
  const topicSelected = (value: string) => selectedTopics === null || selectedTopics.includes(value);
  const chapterSelected = (value: string) => selectedChapters === null || selectedChapters.includes(value);
  const assessmentSelected = (value: string) => selectedAssessments === null || selectedAssessments.includes(value);
  const sessionSelected = (value: string) => selectedSessions === null || selectedSessions.includes(value);
  const academicYearSelected = (value: string) => selectedAcademicYears === null || selectedAcademicYears.includes(value);

  return <section className={styles.panel} aria-labelledby="material-compendium-title">
    <div className={styles.heading}>
      <span className={styles.icon} aria-hidden="true"><FileDown /></span>
      <div><span className={styles.eyebrow}>PDF PERSONALIZADO · {unitLabel}</span><h2 id="material-compendium-title">Compêndio para estudar</h2><p>Escolhe aulas, capítulos e os campos de avaliação disponíveis. A montagem acontece no teu navegador.</p></div>
    </div>
    <div className={styles.bankControls}><label className={styles.checkbox}><input type="checkbox" checked={includeQuestionBank} onChange={(event) => setIncludeQuestionBank(event.target.checked)} disabled={!unitId} /><span><strong>Incluir banco de questões</strong><small>{bankStatus}</small></span></label>{includeQuestionBank && unitId && !questionBankLoaded && <button className="button button--ghost button--compact" type="button" onClick={() => void loadBank().catch((reason) => setQuestionBankError(reason instanceof Error ? reason.message : "Não foi possível carregar as opções do banco."))} disabled={questionBankLoading}>{questionBankLoading ? <LoaderCircle className={styles.spin} /> : null}{questionBankLoading ? "A carregar…" : "Carregar opções do banco"}</button>}</div>
    <div className={styles.filters}>
      <div className={styles.filterBlock}><span className={styles.label}>Aulas</span><div className={styles.chips}>{lessonOptions.length ? lessonOptions.map((lesson) => <button key={lesson} type="button" className={selectedLessons.includes(lesson) ? styles.chipActive : ""} aria-pressed={selectedLessons.includes(lesson)} onClick={() => onToggleLesson(lesson)}>{lesson}</button>) : <span className={styles.muted}>Todas as aulas</span>}</div></div>
      <div className={styles.filterBlock}><span className={styles.label}>Tipos de pergunta</span><div className={styles.chips}>{availableTypeOptions.map((type) => <button key={type} type="button" className={selectedTypes.includes(type) ? styles.chipActive : ""} aria-pressed={selectedTypes.includes(type)} onClick={() => onToggleType(type)}>{typeLabel(type)}</button>)}{!availableTypeOptions.length && <span className={styles.muted}>Sem tipos com dados disponíveis.</span>}</div></div>
      {sourceOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Fontes</span><div className={styles.chipsScrollable}>{sourceOptions.map((source) => <button key={source} type="button" className={sourceSelected(source) ? styles.chipActive : ""} aria-pressed={sourceSelected(source)} onClick={() => setSelectedSources((current) => toggleSelection(current, source, sourceOptions))}>{source}</button>)}</div></div>}
      {pageOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Página de fonte</span><div className={styles.chips}>{pageOptions.map((page) => <button key={page} type="button" className={pageSelected(page) ? styles.chipActive : ""} aria-pressed={pageSelected(page)} onClick={() => setSelectedPages((current) => toggleSelection(current, page, pageOptions))}>p. {page}</button>)}</div></div>}
      {chapterOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Capítulos</span><div className={styles.chips}>{chapterOptions.map((chapter) => <button key={chapter} type="button" className={chapterSelected(chapter) ? styles.chipActive : ""} aria-pressed={chapterSelected(chapter)} onClick={() => setSelectedChapters((current) => toggleSelection(current, chapter, chapterOptions))}>Cap. {chapter}</button>)}</div></div>}
      {topicOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Subtemas</span><div className={styles.chipsScrollable}>{topicOptions.map((topic) => <button key={topic} type="button" className={topicSelected(topic) ? styles.chipActive : ""} aria-pressed={topicSelected(topic)} onClick={() => setSelectedTopics((current) => toggleSelection(current, topic, topicOptions))}>{topic}</button>)}</div></div>}
      {assessmentOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Avaliação</span><div className={styles.chipsScrollable}>{assessmentOptions.map((assessment) => <button key={assessment} type="button" className={assessmentSelected(assessment) ? styles.chipActive : ""} aria-pressed={assessmentSelected(assessment)} onClick={() => setSelectedAssessments((current) => toggleSelection(current, assessment, assessmentOptions))}>{assessment}</button>)}</div></div>}
      {sessionOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Época</span><div className={styles.chipsScrollable}>{sessionOptions.map((session) => <button key={session} type="button" className={sessionSelected(session) ? styles.chipActive : ""} aria-pressed={sessionSelected(session)} onClick={() => setSelectedSessions((current) => toggleSelection(current, session, sessionOptions))}>{session}</button>)}</div></div>}
      {academicYearOptions.length > 0 && <div className={styles.filterBlock}><span className={styles.label}>Ano letivo</span><div className={styles.chips}>{academicYearOptions.map((year) => <button key={year} type="button" className={academicYearSelected(year) ? styles.chipActive : ""} aria-pressed={academicYearSelected(year)} onClick={() => setSelectedAcademicYears((current) => toggleSelection(current, year, academicYearOptions))}>{year}</button>)}</div></div>}
    </div>
    <div className={styles.options}>
      <label className={styles.checkbox}><input type="checkbox" checked={includeSolutions} onChange={(event) => setIncludeSolutions(event.target.checked)} /><span><strong>Incluir soluções</strong><small>{includeSolutions ? "Respostas e opções corretas visíveis" : "Só perguntas e opções, sem respostas"}</small></span></label>
      {showImageFilter && <label className={styles.selectField}><span>Imagens</span><select value={imageFilter} onChange={(event) => setImageFilter(event.target.value as typeof imageFilter)}><option value="all">Com e sem imagem</option><option value="with">Apenas com imagem</option><option value="without">Apenas sem imagem</option></select></label>}
      {showSolutionFilter && <label className={styles.selectField}><span>Respostas</span><select value={solutionFilter} onChange={(event) => setSolutionFilter(event.target.value as typeof solutionFilter)}><option value="all">Com e sem resposta</option><option value="with">Apenas com resposta</option><option value="without">Apenas sem resposta</option></select></label>}
    </div>
    <div className={styles.summary}><span>{filteredEntries.length} perguntas selecionadas</span><span>{includeQuestionBank ? "Materiais + banco de questões" : "Materiais carregados"}</span></div>
    {questionBankError && <p className={styles.error} role="alert">{questionBankError}</p>}
    {buildError && !questionBankError && <p className={styles.error} role="alert">{buildError}</p>}
    <div className={styles.actions}><button className="button button--primary" type="button" onClick={() => void buildPdf()} disabled={buildBusy || questionBankLoading || (!filteredEntries.length && !(includeQuestionBank && Boolean(unitId) && !questionBankLoaded))}>{buildBusy ? <LoaderCircle className={styles.spin} /> : <FileDown />}{buildBusy ? "A preparar PDF…" : "Criar PDF personalizado"}</button>{downloadUrl && <a className="button button--secondary" href={downloadUrl} download={`${resolvedUnit?.fileStem || unitLabel.replace(/\s+/g, "_")}_compendio_personalizado.pdf`}><Download />Descarregar PDF</a>}</div>
    <p className={styles.note}><ImageIcon aria-hidden="true" /> As imagens só são incluídas quando existem no cartão. O banco de questões fornece tema, capítulo, tipo de resposta e referência de avaliação/página quando esses campos estão preenchidos.</p>
  </section>;
}
