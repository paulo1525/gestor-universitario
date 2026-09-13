"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, Download, Expand, Highlighter, List, LocateFixed, LoaderCircle, MessageCircle, NotebookPen, Pencil, Plus, Trash2, X } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { AppToast } from "@/components/app-toast";
import { ModuleGuard } from "@/components/module-guard";
import { RichTextEditor, RichTextContent } from "@/components/rich-text-editor";
import { richTextPlainText } from "@/lib/announcement-content";
import { useStudyAnnotations } from "@/components/use-study-annotations";
import { useScrollLock } from "@/components/use-scroll-lock";
import { useEscapeKey } from "@/components/use-escape-key";
import { flattenStudyTopics, neuroSections, neuroImages, neuroParagraphs, neuroQuestions, neuroStudySources, type StudyImage, type StudyParagraph, type StudyTopic } from "@/lib/neuroanatomia-study";
import type { AnnotationColor, AnnotationDraft, StudyAnnotation } from "@/lib/study-annotations";
import { downloadStudyPdf } from "@/lib/study-pdf";
import styles from "@/components/neuroanatomia-study.module.css";

type QuestionSelection = { key: string; questionIds: string[]; pinned: boolean };
const allTopics = neuroSections.flatMap((section) => flattenStudyTopics(section.topics));
const colors: [AnnotationColor, string][] = [["yellow", "Amarelo"], ["green", "Verde"], ["blue", "Azul"], ["pink", "Rosa"]];
const topicQuestions = (topic: StudyTopic) => [...new Set(flattenStudyTopics([topic]).flatMap((item) => [...(item.questionIds ?? []), ...item.paragraphs.flatMap((paragraph) => paragraph.parts.flatMap((part) => part.questionIds ?? []))]))].sort();
const paragraphId = (paragraph: StudyParagraph, prefix: string, index: number) => paragraph.id ?? (prefix.endsWith("-orientation") ? `${prefix}-${index}` : `${prefix}-p${index + 1}`);
const annotationAnchorMatches = (item: StudyAnnotation) => {
  if (!item.quote || item.paragraphId === "document") return true;
  const text = neuroParagraphs.get(item.paragraphId);
  return text !== undefined && text.slice(item.start, item.end) === item.quote;
};

function syllabusLines(lines: string[]) {
  const groups: string[] = [];
  for (const line of lines) {
    if (/^[-•–]\s/.test(line) || !groups.length) groups.push(line.replace(/^[-•–]\s*/, ""));
    else groups[groups.length - 1] += " " + line;
  }
  return groups;
}

function dismissOutside(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
}

function QuestionText({ text, answer = false }: { text: string; answer?: boolean }) {
  const formatted = (answer ? text.replace(/Resposta\s+([a-z])\)\s*:/gi, "$1)").replace(/Resposta(?: conjunta)?\s*:\s*/gi, "") : text).replace(/\s+(?=[a-z]\)\s)/gi, "\n");
  return <div className={styles.questionText}>{formatted.split(/\n+/).filter((line) => line.trim()).map((line, index) => {
    const part = line.match(/^([a-z]\))\s*(.*)$/i);
    return part ? <div className={styles.questionPart} key={index}><strong>{part[1]}</strong><p>{part[2]}</p></div> : <p key={index}>{line}</p>;
  })}</div>;
}

export function StudyDocument() {
  const [openTopics, setOpenTopics] = useState(() => new Set(allTopics.map((item) => item.id)));
  const [openSections, setOpenSections] = useState(() => new Set(neuroSections.map((section) => section.id)));
  const [readingSize, setReadingSize] = useState("normal");
  const [selection, setSelection] = useState<QuestionSelection | null>(null);
  const [lightboxImage, setLightboxImage] = useState<StudyImage | null>(null);
  const [imageZoom, setImageZoom] = useState(false);
  const [pendingHighlight, setPendingHighlight] = useState<AnnotationDraft | null>(null);
  const [selectionPosition, setSelectionPosition] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<StudyAnnotation | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [discardRequest, setDiscardRequest] = useState<{ next: AnnotationDraft | null } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfError, setPdfError] = useState("");
  const annotations = useStudyAnnotations();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const indexRef = useRef<HTMLDialogElement>(null);
  const notesRef = useRef<HTMLDialogElement>(null);
  const questionRef = useRef<HTMLDialogElement>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const original = annotations.annotations.find((item) => item.id === draft?.id);
  const pendingHighlightIsSaved = Boolean(pendingHighlight && annotations.annotations.some((item) => item.id === pendingHighlight.id));
  const dirty = Boolean(draft && (original ? draft.note !== original.note || draft.color !== original.color : richTextPlainText(draft.note)));
  const noteCount = annotations.annotations.length;
  const allExpanded = openTopics.size === allTopics.length && openSections.size === neuroSections.length;
  useScrollLock(notesOpen || indexOpen || Boolean(selection) || Boolean(lightboxImage), false);
  useEscapeKey(Boolean(deleteRequest || discardRequest), () => { if (!annotations.saving) { setDeleteRequest(null); setDiscardRequest(null); } });
  useEffect(() => {
    if (!deleteRequest && !discardRequest) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationCancelRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [deleteRequest, discardRequest]);
  const placeSelectionActions = (rect: { left: number; width: number; bottom: number }) => {
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const width = window.innerWidth / zoom, height = window.innerHeight / zoom;
    setSelectionPosition({ left: Math.max(160, Math.min(width - 160, (rect.left + rect.width / 2) / zoom)), top: Math.max(64, Math.min(height - 76, rect.bottom / zoom + 8)) });
  };

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  useEffect(() => {
    if (selection && !questionRef.current?.open) questionRef.current?.showModal();
    else questionRef.current?.close();
  }, [selection]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const capture = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed || !selected.rangeCount || notesRef.current?.open || questionRef.current?.open || indexRef.current?.open || dialogRef.current?.open) return;
        const range = selected.getRangeAt(0);
        const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
        const paragraph = element?.closest<HTMLElement>("[data-paragraph-id]");
        if (!paragraph || !paragraph.contains(range.endContainer)) return;
        const before = range.cloneRange(); before.selectNodeContents(paragraph); before.setEnd(range.startContainer, range.startOffset);
        const start = before.toString().length, quote = range.toString();
        if (!quote.trim() || quote.length > 4000) return;
        const rect = range.getBoundingClientRect();
        const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const width = window.innerWidth / zoom;
        const height = window.innerHeight / zoom;
        setSelectionPosition({ left: Math.max(160, Math.min(width - 160, (rect.left + rect.width / 2) / zoom)), top: Math.max(64, Math.min(height - 76, rect.bottom / zoom + 8)) });
        setSelection(null);
        setPendingHighlight({ id: crypto.randomUUID(), paragraphId: paragraph.dataset.paragraphId!, start, end: start + quote.length, quote, note: "", color: "yellow", revision: 0 });
      }, 150);
    };
    document.addEventListener("selectionchange", capture);
    document.addEventListener("pointerup", capture);
    document.addEventListener("keyup", capture);
    return () => { document.removeEventListener("selectionchange", capture); document.removeEventListener("pointerup", capture); document.removeEventListener("keyup", capture); clearTimeout(timer); };
  }, []);

  const closeQuestions = () => { questionRef.current?.close(); setSelection(null); };
  const toggleTopic = (id: string) => {
    setOpenTopics((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setSelection(null); setPendingHighlight(null);
  };
  const openImage = (image: StudyImage) => {
    setLightboxImage(image); setImageZoom(false); setSelection(null);
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  };
  const closeImage = () => { dialogRef.current?.close(); setLightboxImage(null); };
  const openNotes = (nextDraft?: AnnotationDraft) => {
    if (nextDraft) {
      if (dirty) { setDiscardRequest({ next: nextDraft }); if (!notesRef.current?.open) notesRef.current?.showModal(); setNotesOpen(true); return; }
      setDraft(nextDraft);
    }
    setSelection(null); setPendingHighlight(null);
    window.getSelection()?.removeAllRanges();
    if (!notesRef.current?.open) notesRef.current?.showModal(); setNotesOpen(true);
  };
  const selectAnnotation = (annotation: StudyAnnotation, element: HTMLElement) => {
    if (window.getSelection()?.toString()) return;
    placeSelectionActions(element.getBoundingClientRect());
    setPendingHighlight({ ...annotation });
  };
  const newDraft = (id: string, text = ""): AnnotationDraft => ({ id: crypto.randomUUID(), paragraphId: id, start: 0, end: text.length, quote: text, note: "", color: "yellow", revision: 0 });
  const saveDraft = async () => {
    if (!draft || annotations.saving) return;
    const saved = await annotations.save(draft);
    if (saved) setDraft(null);
  };
  const saveHighlight = async (color: AnnotationColor) => {
    if (!pendingHighlight || annotations.saving) return;
    const saved = await annotations.save({ ...pendingHighlight, color });
    if (saved) { setPendingHighlight(null); window.getSelection()?.removeAllRanges(); }
  };
  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true); setPdfMessage(""); setPdfError("");
    try {
      await downloadStudyPdf(annotations.annotations);
      setPdfMessage("PDF com sublinhados descarregado.");
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "Não foi possível descarregar o PDF.");
    } finally { setPdfLoading(false); }
  };
  const jump = (id: string) => {
    indexRef.current?.close(); notesRef.current?.close(); setSelection(null);
    setOpenTopics(new Set(allTopics.map((item) => item.id)));
    setOpenSections(new Set(neuroSections.map((section) => section.id)));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" }));
  };
  const exportNotes = () => {
    const text = ["# Neuroanatomia — Aula prática 1", "", ...annotations.annotations.flatMap((item) => [item.quote ? "> " + item.quote : "", item.note, ""])].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "neuroanatomia-apontamentos.md"; link.click(); URL.revokeObjectURL(url);
  };
  const decoratedText = (text: string, offset: number, personal: StudyAnnotation[], insideQuestion = false) => {
    const boundaries = new Set([0, text.length]);
    for (const item of personal) {
      if (item.start < offset + text.length && item.end > offset) { boundaries.add(Math.max(0, item.start - offset)); boundaries.add(Math.min(text.length, item.end - offset)); }
    }
    const points = [...boundaries].sort((a, b) => a - b);
    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1], mark = personal.find((item) => item.start < offset + end && item.end > offset + start);
      return mark ? <mark key={start} data-color={mark.color} data-annotation-id={mark.id} role={insideQuestion ? undefined : "button"} tabIndex={insideQuestion ? undefined : 0} aria-label={insideQuestion ? undefined : `Editar sublinhado: ${text.slice(start, end)}`} title={richTextPlainText(mark.note) || "Editar sublinhado"} onClick={(event) => { event.stopPropagation(); selectAnnotation(mark, event.currentTarget); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); selectAnnotation(mark, event.currentTarget); } }}>{text.slice(start, end)}</mark> : <Fragment key={start}>{text.slice(start, end)}</Fragment>;
    });
  };

  const paragraphs = (items: StudyParagraph[], prefix: string) => <div className={styles.text}>
    {items.map((paragraph, index) => {
      const id = paragraphId(paragraph, prefix, index), text = paragraph.parts.map((part) => part.text).join("");
      const personal = annotations.annotations.filter((item) => item.paragraphId === id && text.slice(item.start, item.end) === item.quote);
      let offset = 0;
      return <div key={id} id={id} className={styles.paragraph}>
        <p data-paragraph-id={id}>{paragraph.parts.map((part, partIndex) => {
          const key = `${id}-${partIndex}`, decorated = decoratedText(part.text, offset, personal, Boolean(part.questionIds?.length));
          offset += part.text.length;
          if (!part.questionIds?.length) return part.bold ? <strong key={key}>{decorated}</strong> : <Fragment key={key}>{decorated}</Fragment>;
          return <button type="button" key={key} data-study-highlight data-count={part.questionIds.length} className={styles.highlight} data-tone={part.tone ?? "gold"}
            aria-expanded={selection?.key === key} aria-controls={selection?.key === key ? "study-questions" : undefined}
            aria-label={`${part.text} — ${part.questionIds.length} ${part.questionIds.length === 1 ? "pergunta associada" : "perguntas associadas"}`}
            title="Ver perguntas associadas" onClick={() => { if (window.getSelection()?.toString()) return; setSelection({ key, questionIds: part.questionIds!, pinned: true }); }}>
            {decorated}
          </button>;
        })}</p>
      </div>;
    })}
  </div>;

  const topic = (item: StudyTopic, depth = 0) => {
    const open = openTopics.has(item.id), questionIds = topicQuestions(item);
    return <section id={item.id} key={item.id} className={styles.topic} data-depth={Math.min(depth, 2)}>
      <div className={styles.topicRow}>
        <div role="heading" aria-level={Math.min(depth + 3, 6)}>
          <button type="button" className={styles.topicToggle} aria-expanded={open} aria-controls={`${item.id}-content`} onClick={() => toggleTopic(item.id)}>
            <ChevronDown aria-hidden="true" /><span>{item.number}</span><strong>{item.title}</strong>
          </button>
        </div>
        {questionIds.length > 0 && <button className={styles.questionLink} type="button" data-question-link aria-label={`Ver ${questionIds.length} perguntas de ${item.title}`} aria-expanded={selection?.key === item.id} onClick={() => setSelection({ key: item.id, questionIds, pinned: true })}><MessageCircle aria-hidden="true" /><span>{questionIds.length} {questionIds.length === 1 ? "pergunta" : "perguntas"}</span></button>}
      </div>
      <div id={`${item.id}-content`} hidden={!open} className={styles.topicContent}>
        {item.id === "revisoes-1-1-1" ? <dl className={styles.rootList}><div><dt>Raiz anterior</dt><dd>Eferentes somáticos<br />Eferentes viscerais gerais</dd></div><div><dt>Raiz posterior</dt><dd>Aferentes somáticos gerais<br />Aferentes viscerais gerais</dd></div></dl> : item.paragraphs.length === 0 && item.outline.length > 0 && <div className={styles.outline}>{syllabusLines(item.outline).map((line, index) => <p key={index}>{line}</p>)}</div>}
        {paragraphs(item.paragraphs, item.id)}
        {item.imageIds.length > 0 && <details className={styles.imagesDisclosure}>
          <summary><BookOpen aria-hidden="true" />{item.imageIds.length === 1 ? "Ver imagem" : `Ver ${item.imageIds.length} imagens`}<ChevronDown aria-hidden="true" /></summary>
          <div className={styles.images}>{item.imageIds.map((id) => {
            const image = neuroImages[id];
            return <figure key={id}><button type="button" onClick={() => openImage(image)} aria-label={`Ampliar: ${image.caption}`}>
              <Image src={image.src} width={image.width} height={image.height} alt={image.alt} sizes="(max-width: 760px) 100vw, 900px" />
              <span aria-hidden="true"><Expand /></span>
            </button><figcaption><strong>{image.caption}</strong><small>{image.source}</small></figcaption></figure>;
          })}</div>
        </details>}
        {item.children.length > 0 && <div className={styles.children}>{item.children.map((child) => topic(child, depth + 1))}</div>}
      </div>
    </section>;
  };

  const deleteDialog = deleteRequest && <div className={styles.confirmBar} style={notesOpen ? undefined : selectionPosition} data-in-notes={notesOpen} role="alertdialog" aria-label="Apagar apontamento e sublinhado?">
    <span>Apagar apontamento?</span><button type="button" className={styles.iconButton} title="Confirmar eliminação" aria-label="Confirmar eliminação" disabled={annotations.saving} onClick={async () => { if (await annotations.remove(deleteRequest)) { if (draft?.id === deleteRequest.id) setDraft(null); setPendingHighlight(null); setDeleteRequest(null); } }}><Check aria-hidden="true" /></button><button ref={confirmationCancelRef} type="button" className={styles.iconButton} title="Cancelar" aria-label="Cancelar eliminação" disabled={annotations.saving} onClick={() => setDeleteRequest(null)}><X aria-hidden="true" /></button>
  </div>;

  return <div className={styles.page} data-reading-size={readingSize}>
    <a href="#study-content" className="skip-link">Saltar para a leitura</a>
    <header className={styles.readerHeader}>
      <a href="/materiais/" className={styles.backLink}><ArrowLeft aria-hidden="true" /><span>Materiais</span></a>
      <span className={styles.headerTitle}>Neuroanatomia · Aula Prática 1</span>
      <div className={styles.readerActions}>
        <div className={styles.fontControls} role="group" aria-label="Tamanho do texto de estudo">
          {([["small", "A−", "Diminuir texto"], ["normal", "A", "Texto normal"], ["large", "A+", "Aumentar texto"]] as const).map(([size, label, name]) => <button type="button" key={size} aria-label={name} aria-pressed={readingSize === size} onClick={() => setReadingSize(size)}>{label}</button>)}
        </div>
        <button className={styles.iconButton} type="button" aria-label="Descarregar PDF com sublinhados" title="Descarregar PDF com sublinhados" disabled={pdfLoading} onClick={() => void downloadPdf()}>{pdfLoading ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Download aria-hidden="true" />}</button>
        <button className={styles.iconButton} type="button" aria-label={allExpanded ? "Recolher todos" : "Expandir todos"} title={allExpanded ? "Recolher todos" : "Expandir todos"} onClick={() => { setOpenTopics(new Set(allExpanded ? [] : allTopics.map((item) => item.id))); setOpenSections(new Set(allExpanded ? [] : neuroSections.map((section) => section.id))); setSelection(null); setPendingHighlight(null); }}>{allExpanded ? <ChevronsDownUp aria-hidden="true" /> : <ChevronsUpDown aria-hidden="true" />}</button>
        <button className={styles.control} type="button" aria-label="Sumário" title="Sumário" onClick={() => { if (!indexRef.current?.open) indexRef.current?.showModal(); setIndexOpen(true); }}><List aria-hidden="true" /><span>Sumário</span></button>
        <button className={styles.control} type="button" aria-label={dirty ? "Apontamentos — rascunho por guardar" : "Apontamentos"} title="Apontamentos" onClick={() => openNotes()}><NotebookPen aria-hidden="true" /><span>{dirty ? "Rascunho" : "Apontamentos"}</span></button>
      </div>
    </header>
    <main className={styles.reader} id="study-content">
      <header className={styles.lessonHeading}><h1>Introdução à Neuroanatomia. Neurocrânio</h1></header>
      <article className={styles.document} aria-label="Texto da aula">
        {neuroSections.map((section, index) => <section className={styles.chapter} key={section.id}>
          <h2><button type="button" className={styles.sectionToggle} aria-expanded={openSections.has(section.id)} aria-controls={`${section.id}-section`} onClick={() => setOpenSections((current) => { const next = new Set(current); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })}><span>{index === 0 ? "I" : "II"}.</span> {section.title}<ChevronDown aria-hidden="true" /></button></h2>
          <div id={`${section.id}-section`} hidden={!openSections.has(section.id)}>
          {section.orientation && paragraphs(section.orientation, section.id + "-orientation")}
          {section.topics.map((item) => topic(item))}
          </div>
        </section>)}
        <details className={styles.sourcesDisclosure}>
          <summary><BookOpen aria-hidden="true" /><span>Bibliografia</span><ChevronDown aria-hidden="true" /></summary>
          <ul>{neuroStudySources.map((source) => <li key={source}>{source}</li>)}</ul>
        </details>
      </article>
    </main>
    {annotations.message && <AppToast key={annotations.message} message={annotations.message} onDismiss={annotations.clearMessage} />}
    {pdfMessage && <AppToast key={pdfMessage} message={pdfMessage} onDismiss={() => setPdfMessage("")} />}
    {pdfError && <AppToast key={pdfError} kind="error" message={pdfError} onDismiss={() => setPdfError("")} />}
    {annotations.error && <div role="alert" className={styles.errorBar}>{annotations.error}<button type="button" className={styles.textButton} onClick={() => openNotes()}>Abrir apontamentos</button></div>}
    {pendingHighlight && !deleteRequest && <div data-selection-actions className={styles.selectionActions} style={selectionPosition} role="group" aria-label="Sublinhar seleção" onPointerDown={(event) => event.preventDefault()}>
      {colors.map(([color, name]) => <button type="button" className={styles.colorButton} data-color={color} aria-label={`Sublinhar a ${name.toLowerCase()}`} aria-pressed={pendingHighlightIsSaved ? pendingHighlight.color === color : undefined} title={name} key={color} disabled={annotations.saving || annotations.loading} onClick={() => void saveHighlight(color)} />)}
      <button type="button" className={styles.iconButton} aria-label={pendingHighlightIsSaved ? "Editar apontamento" : "Acrescentar apontamento"} title={pendingHighlightIsSaved ? "Editar" : "Acrescentar apontamento"} disabled={annotations.saving} onClick={() => openNotes(pendingHighlight)}><Pencil aria-hidden="true" /></button>
      {pendingHighlightIsSaved && <button type="button" className={styles.iconButton} aria-label="Apagar sublinhado" title="Apagar sublinhado" disabled={annotations.saving} onClick={() => setDeleteRequest(annotations.annotations.find((item) => item.id === pendingHighlight.id) ?? null)}><Trash2 aria-hidden="true" /></button>}
      <button type="button" className={styles.iconButton} aria-label="Cancelar seleção" onClick={() => { setPendingHighlight(null); window.getSelection()?.removeAllRanges(); }}><X aria-hidden="true" /></button>
    </div>}
    <dialog id="study-questions" ref={questionRef} className={styles.questions} aria-labelledby="study-questions-title" onClose={() => setSelection(null)} onClick={dismissOutside}>
      <header><strong id="study-questions-title">Perguntas do compêndio</strong><button className={styles.iconButton} type="button" aria-label="Fechar perguntas" onClick={closeQuestions}><X aria-hidden="true" /></button></header>
      <div className={styles.questionScroll}>{(selection?.questionIds ?? []).map((id) => { const question = neuroQuestions[id]; return <section key={id} className={styles.question}>
        <h3>Questão {question.number}</h3><QuestionText text={question.prompt} />
        <details><summary><ChevronDown aria-hidden="true" /><span className={styles.showAnswer}>Mostrar resposta</span><span className={styles.hideAnswer}>Ocultar resposta</span></summary><div className={styles.answer}>{question.answerParts ? question.answerParts.map((part) => <div className={styles.questionPart} key={part.label}><strong>{part.label}</strong><p>{part.text}</p></div>) : <QuestionText text={question.answer} answer />}</div></details><small>Compêndio · p. {question.sourcePage}</small>
      </section>; })}</div>
    </dialog>
    <dialog ref={indexRef} className={styles.indexDialog} aria-labelledby="study-index-title" onClose={() => setIndexOpen(false)} onClick={dismissOutside}>
      <header className={styles.dialogHeader}><h2 id="study-index-title">Sumário</h2><button className={styles.iconButton} type="button" aria-label="Fechar sumário" onClick={() => indexRef.current?.close()}><X aria-hidden="true" /></button></header>
      <nav className={styles.indexList}>{neuroSections.map((section) => <section key={section.id}><h3>{section.title}</h3>{flattenStudyTopics(section.topics).map((item) => <button key={item.id} type="button" data-depth={Math.min(item.number.split(".").length - 1, 2)} onClick={() => jump(item.id)}><span>{item.number}</span>{item.title}</button>)}</section>)}</nav>
    </dialog>
    <dialog ref={notesRef} className={styles.notesDialog} aria-labelledby="study-notes-title" onClose={() => setNotesOpen(false)} onClick={dismissOutside}>
      <header className={styles.dialogHeader}>{draft && <button type="button" className={styles.iconButton} aria-label="Voltar à lista" title="Voltar à lista" disabled={annotations.saving} onClick={() => { if (dirty) setDiscardRequest({ next: null }); else setDraft(null); }}><ArrowLeft aria-hidden="true" /></button>}<h2 id="study-notes-title">{draft ? "Editar apontamento" : "Apontamentos"}</h2><div className={styles.notesHeaderActions}>{draft ? <><button type="button" className={styles.iconButton} aria-label={annotations.saving ? "A guardar…" : "Guardar apontamento"} title="Guardar" disabled={annotations.saving || (!draft.quote && !richTextPlainText(draft.note))} onClick={() => void saveDraft()}><Check aria-hidden="true" /></button>{original && <button type="button" className={styles.iconButton} aria-label="Apagar apontamento" title="Apagar apontamento" onClick={() => setDeleteRequest(original)}><Trash2 aria-hidden="true" /></button>}</> : <><button type="button" className={styles.iconButton} aria-label="Novo apontamento" title="Novo apontamento" onClick={() => openNotes(newDraft("document"))}><Plus aria-hidden="true" /></button><button type="button" className={styles.iconButton} aria-label="Exportar apontamentos" title="Exportar apontamentos" onClick={exportNotes} disabled={!noteCount}><Download aria-hidden="true" /></button></>}<button className={styles.iconButton} type="button" aria-label="Fechar apontamentos" onClick={() => notesRef.current?.close()}><X aria-hidden="true" /></button></div></header>
      <div className={styles.notesBody}>
        {annotations.error && <p className={styles.inlineError} role="alert">{annotations.error}</p>}
        {draft ? <form onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
          {draft.quote && <blockquote>{draft.quote}</blockquote>}
          <div className={styles.noteLabel}>Nota pessoal</div><div className={styles.noteEditor}><RichTextEditor key={draft.id} ariaLabel="Nota pessoal" value={draft.note} onChange={(note) => setDraft({ ...draft, note })} placeholder="Escreva o seu apontamento…" disabled={annotations.saving} allowHeadings /></div>
          {draft.quote && <div className={styles.noteColors} role="group" aria-label="Cor do sublinhado">{colors.map(([color, name]) => <button key={color} type="button" className={styles.colorButton} data-color={color} aria-label={name} aria-pressed={draft.color === color} onClick={() => setDraft({ ...draft, color })} />)}</div>}
        </form> : <>
          {annotations.loading ? <p role="status">A carregar apontamentos…</p> : noteCount === 0 ? <div className={styles.emptyNotes}><Highlighter aria-hidden="true" /><p>Os seus sublinhados e notas ficam reunidos aqui.</p><small>Selecione um trecho durante a leitura ou crie um apontamento livre.</small></div> : <div className={styles.noteList}>{annotations.annotations.map((item) => {
            const staleAnchor = !annotationAnchorMatches(item);
            return <section key={item.id}>
            {item.quote && <blockquote data-color={item.color}>{item.quote}</blockquote>}{staleAnchor && <small className={styles.staleAnnotation}>Trecho de uma versão anterior</small>}{item.note && <RichTextContent value={item.note} className={styles.savedNote} />}
            <div className={styles.annotationActions}><button type="button" className={styles.iconButton} aria-label="Editar apontamento" title="Editar" onClick={() => setDraft(item)}><Pencil aria-hidden="true" /></button>{item.paragraphId !== "document" && !staleAnchor && <button type="button" className={styles.iconButton} aria-label="Ir para o texto" title="Ir para o texto" onClick={() => jump(item.paragraphId)}><LocateFixed aria-hidden="true" /></button>}<button type="button" className={styles.iconButton} aria-label="Apagar apontamento" title="Apagar" onClick={() => setDeleteRequest(item)}><Trash2 aria-hidden="true" /></button></div>
            </section>; })}</div>}
        </>}
        {discardRequest && <div className={styles.confirmBar} data-in-notes="true" role="alertdialog" aria-label="Descartar alterações por guardar?"><span>Descartar alterações?</span><button type="button" className={styles.iconButton} title="Descartar alterações" aria-label="Descartar alterações" onClick={() => { setDraft(discardRequest.next); setDiscardRequest(null); }}><Check aria-hidden="true" /></button><button ref={confirmationCancelRef} type="button" className={styles.iconButton} title="Continuar a escrever" aria-label="Continuar a escrever" onClick={() => setDiscardRequest(null)}><X aria-hidden="true" /></button></div>}
        {notesOpen && deleteDialog}
      </div>
    </dialog>
    {!notesOpen && deleteDialog}
    <dialog ref={dialogRef} className={styles.lightbox} aria-labelledby="study-image-title" onClose={() => setLightboxImage(null)} onClick={dismissOutside}>
      {lightboxImage && <div><header><div><strong id="study-image-title">{lightboxImage.caption}</strong><small>{lightboxImage.source}</small></div><button className={styles.control} type="button" aria-pressed={imageZoom} onClick={() => setImageZoom((value) => !value)}>{imageZoom ? "Ajustar" : "100%"}</button><button className={styles.iconButton} type="button" onClick={closeImage} aria-label="Fechar imagem"><X aria-hidden="true" /></button></header>
        <div className={styles.imageViewport} data-zoom={imageZoom}><Image src={lightboxImage.src} width={lightboxImage.width} height={lightboxImage.height} alt={lightboxImage.alt} sizes="95vw" /></div>
      </div>}
    </dialog>
  </div>;
}

export function NeuroanatomiaStudy() {
  return <AuthGuard><ModuleGuard moduleKey="materials.library"><StudyDocument /></ModuleGuard></AuthGuard>;
}
