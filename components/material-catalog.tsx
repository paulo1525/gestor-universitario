"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { BookOpen, Download, FileText, Highlighter, LoaderCircle, Package, Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { SurfaceHeader } from "@/components/surface-header";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import { MaterialPdfReader } from "@/components/material-pdf-reader";
import styles from "@/components/material-catalog.module.css";

export type MaterialCatalogTab = "overview" | "summaries" | "bibliography" | "anki" | "exams";
type CatalogItem = { id: string; kind: string; title: string; description?: string; fileName?: string; mimeType?: string; downloadUrl?: string | null; viewUrl?: string | null; verification?: "original" | "verified" | "pending" | string; recommended?: boolean; unitCode?: string | null; unitId?: string | null; unitName?: string | null; lessonCode?: string | null; lessonCodes?: string[]; storage?: { state?: string; ready?: boolean }; source?: { title?: string; edition?: string; author?: string } | null; pages?: { printedStart?: string; printedEnd?: string; physicalStart?: string; physicalEnd?: string; note?: string | null } };
type Lesson = { id: string; unitId?: string; code: string; title: string; type: string; cardCount?: number };
type Deck = { id: string; unitId?: string | null; title: string; variant: "essential" | "complete" | "custom"; description: string; cardCount: number; mediaCount: number; downloadUrl?: string | null; storage: { state: string; ready: boolean }; lessons: Array<{ id: string; code: string; title: string; cardCount: number }> };

const LESSONS = ["AT1", "AT2", "AT3", "AT4", "AT5", "AP1", "AP2", "AP3"];
const tabs: MaterialCatalogTab[] = ["overview", "summaries", "bibliography", "anki", "exams"];

export function MaterialCatalog({ activeTab, onTabChange }: { activeTab: MaterialCatalogTab; onTabChange: (tab: MaterialCatalogTab) => void }) {
  const { t } = useI18n();
  const tabLabel = (tab: MaterialCatalogTab) => t(`community.materials.catalog.tab.${tab}` as "community.materials.catalog.tab.overview");
  const [items, setItems] = useState<CatalogItem[]>([]), [lessons, setLessons] = useState<Lesson[]>([]), [decks, setDecks] = useState<Deck[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [catalogAttempt, setCatalogAttempt] = useState(0), [search, setSearch] = useState(""), [lessonFilter, setLessonFilter] = useState(""), [verificationFilter, setVerificationFilter] = useState<"all" | "original" | "verified" | "pending">("all"), [recommendedOnly, setRecommendedOnly] = useState(false), [ankiUnitCode, setAnkiUnitCode] = useState("NEURO"), [ankiVariant, setAnkiVariant] = useState<"essential" | "complete">("essential"), [reader, setReader] = useState<CatalogItem | null>(null);
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
  const selectedCompendiumUnit = resolveMaterialCompendiumUnit(ankiUnitCode) || MATERIAL_COMPENDIUM_UNITS.find((unit) => unit.code === "NEURO") || MATERIAL_COMPENDIUM_UNITS[0];
  const selectedUnitId = items.find((item) => item.unitCode?.toLocaleUpperCase("pt-PT") === ankiUnitCode)?.unitId || selectedCompendiumUnit.id;
  const selectedDeck = decks.find((deck) => deck.variant === ankiVariant && deck.unitId === selectedUnitId);
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
  return <section className={styles.catalog} aria-label={t("community.materials.title")}>
    <nav className={styles.tabs} role="tablist" aria-label={t("community.materials.title")}>
      {tabs.map((tab) => <button id={`material-tab-${tab}`} key={tab} type="button" role="tab" className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`} aria-selected={activeTab === tab} aria-controls={`material-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, tab)} onClick={() => onTabChange(tab)}>{tabLabel(tab)}</button>)}
    </nav>
    {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
    <div id={`material-panel-${activeTab}`} role="tabpanel" aria-labelledby={`material-tab-${activeTab}`} tabIndex={-1}>
      {activeTab === "overview" && <>
        {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} /><span>{t("community.materials.catalog.loading")}</span></div> : error ? <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : <>
          <div className={styles.overviewGrid}><article className={styles.overviewCard}><span className={styles.overviewIcon} aria-hidden="true"><FileText /></span><div><strong>{stats.summaries}</strong><span>{t("community.materials.catalog.tab.summaries")}</span><small>{t("community.materials.catalog.summaryDescription")}</small></div><button type="button" onClick={() => onTabChange("summaries")}>{t("community.materials.catalog.explore")}</button></article><article className={styles.overviewCard}><span className={styles.overviewIcon} aria-hidden="true"><BookOpen /></span><div><strong>{stats.bibliography}</strong><span>{t("community.materials.catalog.tab.bibliography")}</span><small>{t("community.materials.catalog.bibliographyDescription")}</small></div><button type="button" onClick={() => onTabChange("bibliography")}>{t("community.materials.catalog.explore")}</button></article><article className={styles.overviewCard}><span className={styles.overviewIcon} aria-hidden="true"><Package /></span><div><strong>{stats.decks}</strong><span>{t("community.materials.catalog.tab.anki")}</span><small>{t("community.materials.catalog.ankiDescription")}</small></div><button type="button" onClick={() => onTabChange("anki")}>{t("community.materials.catalog.configure")}</button></article></div>
          <div className={styles.overviewNote}><Sparkles aria-hidden="true" /><div><strong>Materiais organizados para estudar por aula</strong><p>Os originais são preservados e as versões verificadas ficam identificadas. Os ficheiros grandes serão servidos pelo armazenamento de materiais quando o bucket estiver ativo.</p></div></div>
        </>}
      </>}
      {(activeTab === "summaries" || activeTab === "bibliography") && <>
        <SurfaceHeader icon={activeTab === "bibliography" ? <BookOpen /> : <FileText />} title={tabLabel(activeTab)} meta={`${visible.length} ${visible.length === 1 ? t("community.materials.catalog.result") : t("community.materials.catalog.results")}`} />
        <div className={styles.toolbar}>
          <label className={styles.toolbarField}><span>{t("community.materials.catalog.search")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("community.materials.catalog.searchPlaceholder")} /></label>
          <label className={styles.toolbarField}><span>{t("community.materials.catalog.lesson")}</span><select value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}><option value="">{t("community.materials.catalog.allLessons")}</option>{lessonOptions.map((code) => { const lesson = lessons.find((item) => item.code === code); return <option value={code} key={code}>{lesson ? `${lesson.code} · ${lesson.title}` : code}</option>; })}</select></label>
          <label className={styles.toolbarField}><span>{t("community.materials.catalog.editorialStatus")}</span><select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value as typeof verificationFilter)}><option value="all">{t("community.materials.catalog.allStatuses")}</option><option value="verified">{t("community.materials.catalog.verified")}</option><option value="original">{t("community.materials.catalog.original")}</option><option value="pending">{t("community.materials.catalog.pending")}</option></select></label>
          <label className={styles.toolbarCheck}><input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} /><span>{t("community.materials.catalog.recommendedOnly")}</span></label>
          {resourceFiltersActive && <button className="button button--ghost button--compact" type="button" onClick={() => { setSearch(""); setLessonFilter(""); setVerificationFilter("all"); setRecommendedOnly(false); }}>{t("community.materials.catalog.clearFilters")}</button>}
          
        </div>
        <div className={styles.resourceList}>
          {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} />{t("community.materials.catalog.loading")}</div> : error ? <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : visible.length ? visible.map((item) => {
            const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
            const storagePending = item.storage?.state !== "ready";
            return <article className={styles.resource} key={item.id}><span className={styles.resourceIcon} aria-hidden="true">{item.kind === "bibliography" ? <BookOpen /> : <FileText />}</span><div className={styles.resourceMain}><div className={styles.resourceHeading}><div><span className={styles.resourceLabel}>{label(item)}{item.recommended && " · recomendado"}</span><h3>{item.title}</h3></div><span className={`${styles.badge} ${item.verification === "verified" ? styles.badgeVerified : item.verification === "pending" ? styles.badgePending : ""}`}>{verificationLabel(item.verification)}</span></div>{item.description && <p>{item.description}</p>}<div className={styles.resourceMeta}>{item.unitCode && <span>{item.unitCode}{item.unitName ? ` · ${item.unitName}` : ""}</span>}{item.source?.title && <span>{item.source.title}{item.source.edition ? ` · ${item.source.edition}` : ""}</span>}{item.source?.author && <span>{item.source.author}</span>}{(item.pages?.printedStart || item.pages?.printedEnd) && <span>Páginas impressas {item.pages?.printedStart}–{item.pages?.printedEnd}</span>}{(item.pages?.physicalStart || item.pages?.physicalEnd) && <span>Páginas físicas {item.pages?.physicalStart}–{item.pages?.physicalEnd}</span>}{itemLessons.length > 0 && <span>{itemLessons.join(" · ")}</span>}{item.pages?.note && <span>{item.pages.note}</span>}</div><div className={styles.resourceActions}>{item.viewUrl && <button className="button button--primary button--compact" type="button" onClick={() => setReader(item)}><Highlighter />Abrir e realçar</button>}{item.downloadUrl ? <a className="button button--secondary button--compact" href={item.downloadUrl} download={item.fileName}><Download />Descarregar</a> : <span className={styles.pending}>{storagePending ? t("community.materials.catalog.storagePending") : t("community.materials.catalog.fileUnavailable")}</span>}</div></div></article>;
          }) : <div className={styles.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong><span>{t("community.materials.catalog.emptyHint")}</span></div>}
        </div>
      </>}
      {activeTab === "anki" && <div className={styles.ankiWorkspace}><div className={styles.ankiMain}><label className={styles.unitSelect}><span>Unidade curricular</span><select value={ankiUnitCode} onChange={(event) => setAnkiUnitCode(event.target.value)}><optgroup label="2.º ano · 1.º semestre">{MATERIAL_COMPENDIUM_UNITS.filter((unit) => ["DECIDES I", "MP", "AR", "FIS1", "HIST1", "NEURO"].includes(unit.code)).map((unit) => <option key={unit.code} value={unit.code}>{unit.code} · {unit.title}</option>)}</optgroup><optgroup label="2.º ano · 2.º semestre">{MATERIAL_COMPENDIUM_UNITS.filter((unit) => ["FIS2", "DECIDES II", "HIST2", "IMUNO BAS", "PG"].includes(unit.code)).map((unit) => <option key={unit.code} value={unit.code}>{unit.code} · {unit.title}</option>)}</optgroup></select></label><div className={styles.segmented}><span className={styles.controlLabel}>{t("community.materials.catalog.packageBase")}</span><button type="button" aria-pressed={ankiVariant === "essential"} className={ankiVariant === "essential" ? styles.segmentActive : ""} onClick={() => setAnkiVariant("essential")}>{t("community.materials.catalog.essential")}</button><button type="button" aria-pressed={ankiVariant === "complete"} className={ankiVariant === "complete" ? styles.segmentActive : ""} onClick={() => setAnkiVariant("complete")}>{t("community.materials.catalog.complete")}</button></div><div className={styles.builderPreview}><div><span className={styles.resourceLabel}>Download preparado</span><h2>{selectedCompendiumUnit.shortTitle} · {ankiVariant === "essential" ? "Essencial" : "Completo"}</h2><p>O pacote é gerado uma única vez e servido diretamente do armazenamento, sem processamento no dispositivo.</p></div></div></div><aside className={styles.ankiAside} aria-label={t("community.materials.catalog.recommended")}><span className={styles.overviewIcon} aria-hidden="true"><Package /></span><span className={styles.resourceLabel}>{t("community.materials.catalog.recommended")}</span><h2>{ankiVariant === "essential" ? `${selectedCompendiumUnit.shortTitle} · Essencial` : `${selectedCompendiumUnit.shortTitle} · Completo`}</h2><p>{selectedDeck?.description || `O pacote de ${selectedCompendiumUnit.shortTitle} ainda está em preparação editorial.`}</p><strong>{selectedDeck?.cardCount || 0} {t("community.materials.catalog.cards")}</strong>{selectedDeck?.downloadUrl ? <a className="button button--secondary button--compact" href={selectedDeck.downloadUrl} download><Download />Descarregar pacote</a> : <span className={styles.pending}>{t("community.materials.catalog.ankiStoragePending")}</span>}</aside></div>}
      {activeTab === "exams" && <div className={styles.examHint}><FileText aria-hidden="true" /><div><strong>{t("community.materials.catalog.examTitle")}</strong><p>{t("community.materials.catalog.examDescription")}</p></div></div>}
    </div>
    {reader?.viewUrl && <MaterialPdfReader materialId={reader.id} title={reader.title} viewUrl={reader.viewUrl} onClose={() => setReader(null)} />}
  </section>;
}
