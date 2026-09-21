"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { BookOpen, Check, Download, FileText, Image as ImageIcon, LoaderCircle, Package, Sparkles, X } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { materialApkgBlob, buildMaterialApkg, type MaterialAnkiCard } from "@/lib/anki/materials";
import styles from "@/components/material-catalog.module.css";

export type MaterialCatalogTab = "overview" | "summaries" | "bibliography" | "anki" | "exams";
type CatalogItem = { id: string; kind: string; title: string; description?: string; fileName?: string; downloadUrl?: string | null; verification?: "original" | "verified" | "pending" | string; recommended?: boolean; unitCode?: string | null; unitName?: string | null; lessonCode?: string | null; lessonCodes?: string[]; storage?: { state?: string; ready?: boolean }; source?: { title?: string; edition?: string; author?: string } | null; pages?: { printedStart?: string; printedEnd?: string; physicalStart?: string; physicalEnd?: string; note?: string | null } };
type Lesson = { id: string; code: string; title: string; type: string; cardCount?: number };
type Deck = { id: string; title: string; variant: "essential" | "complete" | "custom"; description: string; cardCount: number; mediaCount: number; downloadUrl?: string | null; storage: { state: string; ready: boolean }; lessons: Array<{ id: string; code: string; title: string; cardCount: number }> };
type ApiCard = { id: string; type: "multiple_choice" | "short_answer" | "image"; lesson: string; subtopic: string; question: string; answer: string; hint?: string; source?: string; imageUrl?: string | null; tags?: string[]; options?: Array<{ text: string; isCorrect: boolean }> };
type Notice = { kind: "error" | "warning" | "success"; message: string } | null;

const LESSONS = ["AT1", "AT2", "AT3", "AT4", "AT5", "AP1", "AP2", "AP3"];
const tabs: MaterialCatalogTab[] = ["overview", "summaries", "bibliography", "anki", "exams"];

export function MaterialCatalog({ activeTab, onTabChange }: { activeTab: MaterialCatalogTab; onTabChange: (tab: MaterialCatalogTab) => void }) {
  const { t } = useI18n();
  const tabLabel = (tab: MaterialCatalogTab) => t(`community.materials.catalog.tab.${tab}` as "community.materials.catalog.tab.overview");
  const [items, setItems] = useState<CatalogItem[]>([]), [lessons, setLessons] = useState<Lesson[]>([]), [decks, setDecks] = useState<Deck[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [catalogAttempt, setCatalogAttempt] = useState(0), [search, setSearch] = useState(""), [lessonFilter, setLessonFilter] = useState(""), [verificationFilter, setVerificationFilter] = useState<"all" | "original" | "verified" | "pending">("all"), [recommendedOnly, setRecommendedOnly] = useState(false), [ankiVariant, setAnkiVariant] = useState<"essential" | "complete">("essential"), [ankiTypes, setAnkiTypes] = useState<Array<"multiple_choice" | "short_answer" | "image">>(["short_answer", "image"]), [ankiLessons, setAnkiLessons] = useState<string[]>([]), [cards, setCards] = useState<ApiCard[]>([]), [cardsLoading, setCardsLoading] = useState(false), [cardsError, setCardsError] = useState(""), [ankiAttempt, setAnkiAttempt] = useState(0), [buildBusy, setBuildBusy] = useState(false), [downloadUrl, setDownloadUrl] = useState<string | null>(null), [notice, setNotice] = useState<Notice>(null);
  const loadCatalog = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/material-catalog", { cache: "no-store", signal });
      const data = await response.json() as { items?: CatalogItem[]; lessons?: Lesson[]; decks?: Deck[]; error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.catalog.loadError"));
      if (signal.aborted) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setLessons(Array.isArray(data.lessons) ? data.lessons : []);
      setDecks(Array.isArray(data.decks) ? data.decks : []);
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : t("community.materials.catalog.loadError"));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [t]);
  useEffect(() => { const controller = new AbortController(); void loadCatalog(controller.signal); return () => controller.abort(); }, [catalogAttempt, loadCatalog]);
  useEffect(() => {
    if (activeTab !== "anki") return;
    const controller = new AbortController();
    if (!ankiTypes.length) { setCards([]); setCardsError(""); setCardsLoading(false); return () => controller.abort(); }
    setCardsLoading(true); setCardsError(""); setCards([]);
    const params = new URLSearchParams({ variant: ankiVariant }); ankiLessons.forEach((lesson) => params.append("lesson", lesson)); ankiTypes.forEach((type) => params.append("type", type));
    fetch(`/api/material-anki?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { cards?: ApiCard[]; error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.catalog.ankiLoadError"));
      if (!controller.signal.aborted) setCards(Array.isArray(data.cards) ? data.cards : []);
    }).catch((reason) => { if (!controller.signal.aborted) { setCardsError(reason instanceof Error ? reason.message : t("community.materials.catalog.ankiLoadError")); setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("community.materials.catalog.ankiLoadError") }); } }).finally(() => { if (!controller.signal.aborted) setCardsLoading(false); });
    return () => controller.abort();
  }, [activeTab, ankiAttempt, ankiLessons, ankiTypes, ankiVariant, t]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useEffect(() => { setDownloadUrl((current) => { if (current) URL.revokeObjectURL(current); return null; }); }, [ankiLessons, ankiTypes, ankiVariant]);
  const visible = useMemo(() => {
    const kind = activeTab === "summaries" ? "summary" : activeTab === "bibliography" ? "bibliography" : "";
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");
    return items.filter((item) => {
      const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
      const searchable = `${item.title} ${item.description || ""} ${item.unitCode || ""} ${item.source?.title || ""} ${item.source?.author || ""} ${item.pages?.note || ""}`.toLocaleLowerCase("pt-PT");
      return (!kind || item.kind === kind) &&
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (!lessonFilter || itemLessons.includes(lessonFilter)) &&
        (verificationFilter === "all" || item.verification === verificationFilter) &&
        (!recommendedOnly || item.recommended);
    });
  }, [activeTab, items, lessonFilter, recommendedOnly, search, verificationFilter]);
  const stats = useMemo(() => ({ summaries: items.filter((item) => item.kind === "summary").length, bibliography: items.filter((item) => item.kind === "bibliography").length, decks: decks.length }), [decks.length, items]);
  const lessonOptions = lessons.length ? lessons.map((lesson) => lesson.code) : LESSONS;
  const toggleLesson = (lesson: string) => setAnkiLessons((current) => current.includes(lesson) ? current.filter((value) => value !== lesson) : [...current, lesson]);
  const toggleType = (type: "multiple_choice" | "short_answer" | "image") => setAnkiTypes((current) => current.includes(type) ? current.filter((value) => value !== type) : [...current, type]);
  const generate = async () => { if (!cards.length || !ankiTypes.length) return; setBuildBusy(true); setNotice(null); try { const materialCards: MaterialAnkiCard[] = await Promise.all(cards.map(async (card) => { let image: MaterialAnkiCard["image"] = null; if (card.imageUrl) { const response = await fetch(card.imageUrl); if (response.ok) image = { fileName: `${card.id}.png`, bytes: new Uint8Array(await response.arrayBuffer()), alt: card.subtopic }; } return { id: card.id, type: card.type, lesson: card.lesson, subtopic: card.subtopic, question: card.question, answer: card.answer, hint: card.hint, source: card.source, options: card.options, image, tags: ["NEURO", card.lesson, card.subtopic, card.type] }; })); const result = await buildMaterialApkg({ deckName: `Neuroanatomia::${ankiVariant === "essential" ? "Essencial" : "Completo"}::Personalizado`, cards: materialCards, description: "Baralho criado no Gestor Universitário.", fileName: `Neuroanatomia_${ankiVariant}_personalizado.apkg` }); if (downloadUrl) URL.revokeObjectURL(downloadUrl); setDownloadUrl(URL.createObjectURL(materialApkgBlob(result))); setNotice({ kind: "success", message: `${result.noteCount} cartões preparados.` }); } catch (reason) { setNotice({ kind: "error", message: reason instanceof Error ? reason.message : "Não foi possível criar o baralho." }); } finally { setBuildBusy(false); } };
  const label = (item: CatalogItem) => item.kind === "summary" ? t("community.materials.catalog.tab.summaries") : item.kind === "bibliography" ? t("community.materials.catalog.tab.bibliography") : item.kind === "anki" ? t("community.materials.catalog.tab.anki") : t("community.materials.catalog.tab.overview");
  const verificationLabel = (value?: CatalogItem["verification"]) => value === "verified" ? t("community.materials.catalog.verified") : value === "original" ? t("community.materials.catalog.original") : t("community.materials.catalog.pending");
  const resourceFiltersActive = Boolean(search || lessonFilter || verificationFilter !== "all" || recommendedOnly);
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: MaterialCatalogTab) => {
    const index = tabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    onTabChange(next);
    window.requestAnimationFrame(() => document.getElementById(`material-tab-${next}`)?.focus());
  };
  const retryCatalog = () => setCatalogAttempt((attempt) => attempt + 1);
  const retryAnki = () => setAnkiAttempt((attempt) => attempt + 1);
  return <section className={styles.catalog} aria-label={t("community.materials.title")}>
    <nav className={styles.tabs} role="tablist" aria-label={t("community.materials.title")}>
      {tabs.map((tab) => <button id={`material-tab-${tab}`} key={tab} type="button" role="tab" className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`} aria-selected={activeTab === tab} aria-controls={`material-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, tab)} onClick={() => onTabChange(tab)}>{tabLabel(tab)}</button>)}
    </nav>
    {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
    {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : notice.kind === "success" ? styles.noticeSuccess : ""}`} role="status"><span>{notice.message}</span><button type="button" aria-label={t("community.common.close")} onClick={() => setNotice(null)}><X /></button></div>}
    <div id={`material-panel-${activeTab}`} role="tabpanel" aria-labelledby={`material-tab-${activeTab}`} tabIndex={-1}>
      {activeTab === "overview" && <>
        {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} /><span>{t("community.materials.catalog.loading")}</span></div> : error ? <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : <>
          <div className={styles.overviewGrid}><article className={styles.overviewCard}><span className={styles.overviewIcon} aria-hidden="true"><FileText /></span><div><strong>{stats.summaries}</strong><span>{t("community.materials.catalog.tab.summaries")}</span><small>{t("community.materials.catalog.summaryDescription")}</small></div><button type="button" onClick={() => onTabChange("summaries")}>{t("community.materials.catalog.explore")}</button></article><article className={styles.overviewCard}><span className={styles.overviewIcon} aria-hidden="true"><BookOpen /></span><div><strong>{stats.bibliography}</strong><span>{t("community.materials.catalog.tab.bibliography")}</span><small>{t("community.materials.catalog.bibliographyDescription")}</small></div><button type="button" onClick={() => onTabChange("bibliography")}>{t("community.materials.catalog.explore")}</button></article><article className={styles.overviewCard}><span className={styles.overviewIcon} aria-hidden="true"><Package /></span><div><strong>{stats.decks}</strong><span>{t("community.materials.catalog.tab.anki")}</span><small>{t("community.materials.catalog.ankiDescription")}</small></div><button type="button" onClick={() => onTabChange("anki")}>{t("community.materials.catalog.configure")}</button></article></div>
          <div className={styles.overviewNote}><Sparkles aria-hidden="true" /><div><strong>Materiais organizados para estudar por aula</strong><p>Os originais são preservados e as versões verificadas ficam identificadas. Os ficheiros grandes serão servidos pelo armazenamento de materiais quando o bucket estiver ativo.</p></div></div>
        </>}
      </>}
      {(activeTab === "summaries" || activeTab === "bibliography") && <>
        <div className={styles.toolbar}>
          <label className={styles.toolbarField}><span>{t("community.materials.catalog.search")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("community.materials.catalog.searchPlaceholder")} /></label>
          <label className={styles.toolbarField}><span>{t("community.materials.catalog.lesson")}</span><select value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}><option value="">{t("community.materials.catalog.allLessons")}</option>{lessonOptions.map((code) => { const lesson = lessons.find((item) => item.code === code); return <option value={code} key={code}>{lesson ? `${lesson.code} · ${lesson.title}` : code}</option>; })}</select></label>
          <label className={styles.toolbarField}><span>{t("community.materials.catalog.editorialStatus")}</span><select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value as typeof verificationFilter)}><option value="all">{t("community.materials.catalog.allStatuses")}</option><option value="verified">{t("community.materials.catalog.verified")}</option><option value="original">{t("community.materials.catalog.original")}</option><option value="pending">{t("community.materials.catalog.pending")}</option></select></label>
          <label className={styles.toolbarCheck}><input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} /><span>{t("community.materials.catalog.recommendedOnly")}</span></label>
          {resourceFiltersActive && <button className="button button--ghost button--compact" type="button" onClick={() => { setSearch(""); setLessonFilter(""); setVerificationFilter("all"); setRecommendedOnly(false); }}>{t("community.materials.catalog.clearFilters")}</button>}
          <span className={styles.resultCount} aria-live="polite">{visible.length} {visible.length === 1 ? t("community.materials.catalog.result") : t("community.materials.catalog.results")}</span>
        </div>
        <div className={styles.resourceList}>
          {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} />{t("community.materials.catalog.loading")}</div> : error ? <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : visible.length ? visible.map((item) => {
            const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
            const storagePending = item.storage?.state !== "ready";
            return <article className={styles.resource} key={item.id}><span className={styles.resourceIcon} aria-hidden="true">{item.kind === "bibliography" ? <BookOpen /> : <FileText />}</span><div className={styles.resourceMain}><div className={styles.resourceHeading}><div><span className={styles.resourceLabel}>{label(item)}{item.recommended && " · recomendado"}</span><h3>{item.title}</h3></div><span className={`${styles.badge} ${item.verification === "verified" ? styles.badgeVerified : item.verification === "pending" ? styles.badgePending : ""}`}>{verificationLabel(item.verification)}</span></div>{item.description && <p>{item.description}</p>}<div className={styles.resourceMeta}>{item.unitCode && <span>{item.unitCode}{item.unitName ? ` · ${item.unitName}` : ""}</span>}{item.source?.title && <span>{item.source.title}{item.source.edition ? ` · ${item.source.edition}` : ""}</span>}{item.source?.author && <span>{item.source.author}</span>}{(item.pages?.printedStart || item.pages?.printedEnd) && <span>Páginas impressas {item.pages?.printedStart}–{item.pages?.printedEnd}</span>}{(item.pages?.physicalStart || item.pages?.physicalEnd) && <span>Páginas físicas {item.pages?.physicalStart}–{item.pages?.physicalEnd}</span>}{itemLessons.length > 0 && <span>{itemLessons.join(" · ")}</span>}{item.pages?.note && <span>{item.pages.note}</span>}</div><div className={styles.resourceActions}>{item.downloadUrl ? <a className="button button--secondary button--compact" href={item.downloadUrl} download={item.fileName}><Download />Descarregar</a> : <span className={styles.pending}>{storagePending ? t("community.materials.catalog.storagePending") : t("community.materials.catalog.fileUnavailable")}</span>}</div></div></article>;
          }) : <div className={styles.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong><span>{t("community.materials.catalog.emptyHint")}</span></div>}
        </div>
      </>}
      {activeTab === "anki" && <div className={styles.ankiWorkspace}><div className={styles.ankiMain}><div className={styles.segmented}><span className={styles.controlLabel}>{t("community.materials.catalog.packageBase")}</span><button type="button" aria-pressed={ankiVariant === "essential"} className={ankiVariant === "essential" ? styles.segmentActive : ""} onClick={() => setAnkiVariant("essential")}>{t("community.materials.catalog.essential")}</button><button type="button" aria-pressed={ankiVariant === "complete"} className={ankiVariant === "complete" ? styles.segmentActive : ""} onClick={() => setAnkiVariant("complete")}>{t("community.materials.catalog.complete")}</button></div><div className={styles.filterBlock}><span className={styles.controlLabel}>{t("community.materials.catalog.cardType")}</span><div className={styles.checkChips}>{(["multiple_choice", "short_answer", "image"] as const).map((type) => <button key={type} type="button" aria-pressed={ankiTypes.includes(type)} className={ankiTypes.includes(type) ? styles.chipActive : ""} onClick={() => toggleType(type)}>{type === "multiple_choice" ? t("community.materials.catalog.multipleChoice") : type === "short_answer" ? t("community.materials.catalog.shortAnswer") : t("community.materials.catalog.image")}</button>)}</div></div><div className={styles.filterBlock}><span className={styles.controlLabel}>{t("community.materials.catalog.includeLessons")}</span><div className={styles.checkChips}>{lessonOptions.map((lesson) => <button key={lesson} type="button" aria-pressed={ankiLessons.includes(lesson)} className={ankiLessons.includes(lesson) ? styles.chipActive : ""} onClick={() => toggleLesson(lesson)}>{lesson}</button>)}</div></div>{cardsError && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><span>{cardsError}</span><button className="button button--ghost button--compact" type="button" onClick={retryAnki}>{t("community.materials.catalog.retry")}</button></div>}<div className={styles.builderPreview}><div><span className={styles.resourceLabel}>{t("community.materials.catalog.preview")}</span><h2>{t("community.materials.catalog.selectLessons")}</h2><p role="status">{cardsLoading ? t("community.materials.catalog.cardsLoading") : t("community.materials.catalog.cardsIncluded", { count: cards.length })}</p>{!ankiTypes.length && <p className={styles.selectionHint}>{t("community.materials.catalog.noCardTypes")}</p>}</div><div className={styles.cardTypeSummary}><span><Check />{cards.filter((card) => card.type === "multiple_choice").length} {t("community.materials.catalog.multipleChoice")}</span><span><Check />{cards.filter((card) => card.type === "short_answer").length} {t("community.materials.catalog.shortAnswer")}</span><span><ImageIcon />{cards.filter((card) => card.type === "image").length} {t("community.materials.catalog.image")}</span></div></div><button className="button button--primary" type="button" onClick={() => void generate()} disabled={buildBusy || cardsLoading || !cards.length || !ankiTypes.length}>{buildBusy ? <LoaderCircle className={styles.spin} /> : <Sparkles />}{buildBusy ? t("community.materials.catalog.creatingDeck") : t("community.materials.catalog.createDeck")}</button>{downloadUrl && <a className={`button button--secondary ${styles.downloadGenerated}`} href={downloadUrl} download={`Neuroanatomia_${ankiVariant}_personalizado.apkg`}><Download />{t("community.materials.catalog.downloadCustomDeck")}</a>}</div><aside className={styles.ankiAside} aria-label={t("community.materials.catalog.recommended")}><span className={styles.overviewIcon} aria-hidden="true"><Package /></span><span className={styles.resourceLabel}>{t("community.materials.catalog.recommended")}</span><h2>{ankiVariant === "essential" ? "Neuroanatomia · Essencial" : "Neuroanatomia · Completo"}</h2><p>{decks.find((deck) => deck.variant === ankiVariant)?.description || "Baralho organizado por aula e subtópico."}</p><strong>{decks.find((deck) => deck.variant === ankiVariant)?.cardCount || 0} {t("community.materials.catalog.cards")}</strong>{decks.find((deck) => deck.variant === ankiVariant)?.downloadUrl ? <a className="button button--secondary button--compact" href={decks.find((deck) => deck.variant === ankiVariant)?.downloadUrl || undefined} download><Download />Descarregar pacote</a> : <span className={styles.pending}>{t("community.materials.catalog.ankiStoragePending")}</span>}</aside></div>}
      {activeTab === "exams" && <div className={styles.examHint}><FileText aria-hidden="true" /><div><strong>{t("community.materials.catalog.examTitle")}</strong><p>{t("community.materials.catalog.examDescription")}</p></div></div>}
    </div>
  </section>;
}
