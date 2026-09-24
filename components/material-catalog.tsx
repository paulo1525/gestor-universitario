"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeftRight, BookOpen, CheckCircle2, ChevronRight, Download, FileText, FolderOpen, GraduationCap, Highlighter, Layers, ListFilter, LoaderCircle, Package, RotateCcw, Search } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { SurfaceHeader } from "@/components/surface-header";
import { FormLabel } from "@/components/form-label";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import { MaterialPdfReader } from "@/components/material-pdf-reader";
import styles from "@/components/material-catalog.module.css";

export type MaterialCatalogTab = "overview" | "summaries" | "bibliography" | "anki" | "exams";
/** Unit offered in the picker; `code` is the stable key shared by the catalogue and the submissions. */
export type MaterialUnitOption = { id: string; code: string; name: string; year?: number | null; semester?: number | null };
type BibliographyFormat = "complete" | "excerpt" | "translation";
type CatalogItem = { id: string; kind: string; bibliographyFormat?: BibliographyFormat | null; title: string; description?: string; fileName?: string; mimeType?: string; downloadUrl?: string | null; viewUrl?: string | null; verification?: "original" | "verified" | "pending" | string; recommended?: boolean; unitCode?: string | null; unitId?: string | null; unitName?: string | null; lessonCode?: string | null; lessonCodes?: string[]; storage?: { backend?: string; state?: string; ready?: boolean }; source?: { title?: string; edition?: string; author?: string } | null; pages?: { printedStart?: string; printedEnd?: string; physicalStart?: string; physicalEnd?: string; note?: string | null } };
type Lesson = { id: string; unitId?: string; code: string; title: string; type: string; cardCount?: number };
type Deck = { id: string; unitId?: string | null; title: string; variant: "essential" | "complete" | "custom"; description: string; cardCount: number; mediaCount: number; downloadUrl?: string | null; storage: { state: string; ready: boolean }; lessons: Array<{ id: string; code: string; title: string; cardCount: number }> };

const tabs: MaterialCatalogTab[] = ["overview", "summaries", "bibliography", "anki", "exams"];
const formats: BibliographyFormat[] = ["complete", "excerpt", "translation"];
export const GENERAL_MATERIAL_UNIT = "__general";

export function normalizeMaterialUnitCode(value: string | null | undefined) {
  return String(value || "").trim().toLocaleUpperCase("pt-PT");
}

function bibliographyFormat(item: CatalogItem): BibliographyFormat {
  if (item.bibliographyFormat && formats.includes(item.bibliographyFormat)) return item.bibliographyFormat;
  if (/tradu[çc][ãa]o|translation/i.test(`${item.title} ${item.description || ""}`)) return "translation";
  return item.pages?.printedStart || item.pages?.physicalStart ? "excerpt" : "complete";
}

/**
 * Materials follow the announcements anatomy: one panel with a header and
 * counter, a filter bar and bordered rows. The unit is chosen before anything else.
 */
export function MaterialCatalog({ activeTab, onTabChange, unitCode, onUnitChange, units, submissionCounts, examCount, examFilters, examSummary, children }: {
  activeTab: MaterialCatalogTab;
  onTabChange: (tab: MaterialCatalogTab) => void;
  unitCode: string;
  onUnitChange: (code: string) => void;
  units: MaterialUnitOption[];
  submissionCounts: Record<string, number>;
  examCount?: number;
  examFilters?: ReactNode;
  examSummary?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const tabLabel = (tab: MaterialCatalogTab) => t(`community.materials.catalog.tab.${tab}` as "community.materials.catalog.tab.overview");
  const [items, setItems] = useState<CatalogItem[]>([]), [lessons, setLessons] = useState<Lesson[]>([]), [decks, setDecks] = useState<Deck[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [catalogAttempt, setCatalogAttempt] = useState(0), [search, setSearch] = useState(""), [lessonFilter, setLessonFilter] = useState(""), [verificationFilter, setVerificationFilter] = useState<"all" | "original" | "verified" | "pending">("all"), [recommendedOnly, setRecommendedOnly] = useState(false), [formatFilter, setFormatFilter] = useState<"all" | BibliographyFormat>("all"), [unitSearch, setUnitSearch] = useState(""), [ankiVariant, setAnkiVariant] = useState<"essential" | "complete">("essential"), [reader, setReader] = useState<CatalogItem | null>(null);
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
  useEffect(() => { setSearch(""); setLessonFilter(""); setVerificationFilter("all"); setRecommendedOnly(false); setFormatFilter("all"); }, [unitCode]);

  // The picker lists every active unit plus any unit that only exists in the catalogue.
  const unitOptions = useMemo(() => {
    const byCode = new Map<string, MaterialUnitOption>();
    for (const unit of units) if (unit.code) byCode.set(normalizeMaterialUnitCode(unit.code), unit);
    for (const item of items) {
      const code = normalizeMaterialUnitCode(item.unitCode);
      if (code && !byCode.has(code)) byCode.set(code, { id: item.unitId || code, code: item.unitCode || code, name: item.unitName || code });
    }
    if (!byCode.size) for (const unit of MATERIAL_COMPENDIUM_UNITS) byCode.set(unit.code, { id: unit.id, code: unit.code, name: unit.title });
    if (submissionCounts[GENERAL_MATERIAL_UNIT]) byCode.set(GENERAL_MATERIAL_UNIT, { id: GENERAL_MATERIAL_UNIT, code: GENERAL_MATERIAL_UNIT, name: t("community.common.general") });
    return [...byCode.values()];
  }, [items, submissionCounts, t, units]);
  const selectedUnit = unitOptions.find((unit) => normalizeMaterialUnitCode(unit.code) === unitCode) || null;
  const belongsToUnit = useCallback((item: { unitCode?: string | null; unitId?: string | null }) => normalizeMaterialUnitCode(item.unitCode) === unitCode || Boolean(selectedUnit && item.unitId && item.unitId === selectedUnit.id), [selectedUnit, unitCode]);
  const unitItems = useMemo(() => items.filter(belongsToUnit), [belongsToUnit, items]);
  const unitLessons = useMemo(() => lessons.filter((lesson) => selectedUnit && lesson.unitId === selectedUnit.id), [lessons, selectedUnit]);
  const compendiumUnit = resolveMaterialCompendiumUnit(unitCode) || (selectedUnit ? resolveMaterialCompendiumUnit(selectedUnit.id) || resolveMaterialCompendiumUnit(selectedUnit.name) : undefined);
  const selectedUnitId = selectedUnit?.id || compendiumUnit?.id;
  const unitDecks = useMemo(() => decks.filter((deck) => deck.unitId && (deck.unitId === selectedUnitId || deck.unitId === compendiumUnit?.id)), [compendiumUnit?.id, decks, selectedUnitId]);
  const selectedDeck = unitDecks.find((deck) => deck.variant === ankiVariant);
  const countFor = useCallback((unit: MaterialUnitOption) => {
    const code = normalizeMaterialUnitCode(unit.code);
    const catalogCount = items.filter((item) => normalizeMaterialUnitCode(item.unitCode) === code || item.unitId === unit.id).length;
    const deckCount = decks.filter((deck) => deck.unitId === unit.id).length;
    return catalogCount + deckCount + (submissionCounts[code] || 0);
  }, [decks, items, submissionCounts]);

  const kind = activeTab === "summaries" ? "summary" : activeTab === "bibliography" ? "bibliography" : "";
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");
    return unitItems.filter((item) => {
      const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
      const searchable = `${item.title} ${item.description || ""} ${item.unitCode || ""} ${item.source?.title || ""} ${item.source?.author || ""} ${item.pages?.note || ""}`.toLocaleLowerCase("pt-PT");
      return (!kind || item.kind === kind) &&
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (!lessonFilter || itemLessons.includes(lessonFilter)) &&
        (verificationFilter === "all" || item.verification === verificationFilter) &&
        (!recommendedOnly || item.recommended);
    });
  }, [kind, lessonFilter, recommendedOnly, search, unitItems, verificationFilter]);
  const formatCounts = useMemo(() => Object.fromEntries(formats.map((format) => [format, filtered.filter((item) => bibliographyFormat(item) === format).length])) as Record<BibliographyFormat, number>, [filtered]);
  const visible = useMemo(() => activeTab === "bibliography" && formatFilter !== "all" ? filtered.filter((item) => bibliographyFormat(item) === formatFilter) : filtered, [activeTab, filtered, formatFilter]);
  // Bibliography is read book by book: the complete work, then its excerpts and translations.
  const groups = useMemo(() => {
    if (activeTab !== "bibliography") return [{ key: "all", title: "", items: visible }];
    const map = new Map<string, { key: string; title: string; items: CatalogItem[] }>();
    for (const item of visible) {
      const key = item.source?.title ? `${item.source.title}|${item.source.edition || ""}` : "";
      const title = item.source?.title ? `${item.source.title}${item.source.edition ? ` · ${item.source.edition}` : ""}` : t("community.materials.catalog.otherSources");
      if (!map.has(key)) map.set(key, { key, title, items: [] });
      map.get(key)!.items.push(item);
    }
    const order = (item: CatalogItem) => formats.indexOf(bibliographyFormat(item));
    return [...map.values()].map((group) => ({ ...group, items: group.items.sort((a, b) => order(a) - order(b)) })).sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.title.localeCompare(b.title, "pt-PT"));
  }, [activeTab, t, visible]);
  const stats = useMemo(() => ({ summaries: unitItems.filter((item) => item.kind === "summary").length, bibliography: unitItems.filter((item) => item.kind === "bibliography").length, decks: unitDecks.length }), [unitDecks.length, unitItems]);
  const verificationLabel = (value?: CatalogItem["verification"]) => value === "verified" ? t("community.materials.catalog.verified") : value === "original" ? t("community.materials.catalog.original") : t("community.materials.catalog.pending");
  const formatLabel = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}` as "community.materials.catalog.format.complete");
  const formatBadge = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}Badge` as "community.materials.catalog.format.completeBadge");
  const resourceFiltersActive = Boolean(search || lessonFilter || verificationFilter !== "all" || recommendedOnly || formatFilter !== "all");
  const clearResourceFilters = () => { setSearch(""); setLessonFilter(""); setVerificationFilter("all"); setRecommendedOnly(false); setFormatFilter("all"); };
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
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  const results = (value: number) => count(value, t("community.materials.catalog.result"), t("community.materials.catalog.results"));
  const errorState = <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong>{error && <span>{error}</span>}<button className="button button--secondary button--compact" type="button" onClick={retryCatalog}><RotateCcw />{t("community.materials.catalog.retry")}</button></div>;
  const loadingState = <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} /><strong>{t("community.materials.catalog.loading")}</strong></div>;

  if (!selectedUnit) {
    const term = unitSearch.trim().toLocaleLowerCase("pt-PT");
    const matching = unitOptions.filter((unit) => !term || `${unit.code} ${unit.name}`.toLocaleLowerCase("pt-PT").includes(term));
    const unitGroups = new Map<string, MaterialUnitOption[]>();
    for (const unit of matching) {
      const key = unit.year && unit.semester ? `${unit.year}.º ano · ${unit.semester}.º semestre` : "";
      unitGroups.set(key, [...(unitGroups.get(key) || []), unit]);
    }
    return <section className={`panel ${styles.feed}`} aria-busy={loading}>
      <SurfaceHeader icon={<GraduationCap />} title={t("community.materials.catalog.unit.title")} meta={count(matching.length, t("community.units.unit"), t("community.units.unitPlural"))} />
      <div className={styles.filters}>
        <label className={styles.searchField}><FormLabel icon={Search}>{t("community.materials.catalog.unit.search")}</FormLabel><div><Search /><input type="search" value={unitSearch} onChange={(event) => setUnitSearch(event.target.value)} placeholder={t("community.materials.catalog.unit.searchPlaceholder")} /></div></label>
        <button className={styles.resetFilters} type="button" onClick={() => setUnitSearch("")} disabled={!unitSearch}><RotateCcw />{t("community.materials.catalog.clearFilters")}</button>
      </div>
      <div className={styles.resultsSummary}><span>{t("community.materials.catalog.unit.description")}</span></div>
      {loading && !units.length ? loadingState : matching.length ? [...unitGroups.entries()].map(([group, groupUnits]) => <div className={styles.group} key={group || "all"}>
        {group && <h3 className={styles.groupTitle}>{group}</h3>}
        <ul className={styles.list}>
          {groupUnits.map((unit) => {
            const total = countFor(unit);
            return <li key={unit.code}><button type="button" className={styles.row} onClick={() => { onUnitChange(normalizeMaterialUnitCode(unit.code)); setUnitSearch(""); }}>
              <span className={styles.rail}><GraduationCap /></span>
              <span className={styles.rowContent}><span className={styles.badges}><span className={styles.badge}>{unit.code === GENERAL_MATERIAL_UNIT ? "UC" : unit.code}</span></span><strong>{unit.name}</strong><small>{total === 0 ? t("community.materials.catalog.unit.none") : total === 1 ? t("community.materials.catalog.unit.countOne") : t("community.materials.catalog.unit.count", { count: total })}</small></span>
              <ChevronRight className={styles.rowArrow} aria-hidden="true" />
            </button></li>;
          })}
        </ul>
      </div>) : <div className={styles.empty}><Search /><strong>{t("community.materials.catalog.unit.empty")}</strong><button className="button button--secondary button--compact" type="button" onClick={() => setUnitSearch("")}><RotateCcw />{t("community.materials.catalog.clearFilters")}</button></div>}
    </section>;
  }

  const meta = activeTab === "summaries" || activeTab === "bibliography" ? results(visible.length)
    : activeTab === "exams" ? results(examCount ?? 0)
    : activeTab === "anki" ? results(unitDecks.length)
    : results(stats.summaries + stats.bibliography + stats.decks);
  const unitTitle = selectedUnit.code === GENERAL_MATERIAL_UNIT ? selectedUnit.name : `${selectedUnit.code} · ${selectedUnit.name}`;

  return <section className={`panel ${styles.feed}`} aria-busy={loading}>
    <SurfaceHeader icon={<FolderOpen />} title={unitTitle} meta={meta} actions={<button className="button button--secondary button--compact" type="button" onClick={() => onUnitChange("")}><ArrowLeftRight />{t("community.materials.catalog.unit.change")}</button>} />
    <div className={styles.toolbar}>
      <nav className={styles.tabs} role="tablist" aria-label={t("community.materials.title")}>
        {tabs.map((tab) => <button id={`material-tab-${tab}`} key={tab} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`material-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, tab)} onClick={() => onTabChange(tab)}>{tabLabel(tab)}</button>)}
      </nav>
    </div>
    <div id={`material-panel-${activeTab}`} className={styles.tabPanel} role="tabpanel" aria-labelledby={`material-tab-${activeTab}`} tabIndex={-1}>
      {activeTab === "overview" && (loading ? loadingState : error ? errorState : <ul className={styles.list}>
        {([["summaries", FileText, stats.summaries, "summaryDescription"], ["bibliography", BookOpen, stats.bibliography, "bibliographyDescription"], ["anki", Package, stats.decks, "ankiDescription"]] as const).map(([tab, Icon, total, description]) => <li key={tab}><button type="button" className={styles.row} onClick={() => onTabChange(tab)}>
          <span className={styles.rail}><Icon /></span>
          <span className={styles.rowContent}><strong>{tabLabel(tab)}</strong><small>{t(`community.materials.catalog.${description}`)}</small></span>
          <span className={styles.rowCount}>{total}</span>
          <ChevronRight className={styles.rowArrow} aria-hidden="true" />
        </button></li>)}
      </ul>)}
      {(activeTab === "summaries" || activeTab === "bibliography") && <>
        <div className={styles.filters}>
          <label className={styles.searchField}><FormLabel icon={Search}>{t("community.materials.catalog.search")}</FormLabel><div><Search /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("community.materials.catalog.searchPlaceholder")} /></div></label>
          {activeTab === "bibliography" && <label><FormLabel icon={Layers}>{t("community.materials.catalog.format.label")}</FormLabel><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as typeof formatFilter)}><option value="all">{t("community.materials.catalog.format.all")} ({filtered.length})</option>{formats.map((format) => <option value={format} key={format}>{formatLabel(format)} ({formatCounts[format]})</option>)}</select></label>}
          {unitLessons.length > 0 && <label><FormLabel icon={ListFilter}>{t("community.materials.catalog.lesson")}</FormLabel><select value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}><option value="">{t("community.materials.catalog.allLessons")}</option>{unitLessons.map((lesson) => <option value={lesson.code} key={lesson.id}>{lesson.code} · {lesson.title}</option>)}</select></label>}
          <label><FormLabel icon={CheckCircle2}>{t("community.materials.catalog.editorialStatus")}</FormLabel><select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value as typeof verificationFilter)}><option value="all">{t("community.materials.catalog.allStatuses")}</option><option value="verified">{t("community.materials.catalog.verified")}</option><option value="original">{t("community.materials.catalog.original")}</option><option value="pending">{t("community.materials.catalog.pending")}</option></select></label>
          <button className={styles.resetFilters} type="button" onClick={clearResourceFilters} disabled={!resourceFiltersActive}><RotateCcw />{t("community.materials.catalog.clearFilters")}</button>
        </div>
        <div className={styles.resultsSummary}><label className={styles.check}><input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} /><span>{t("community.materials.catalog.recommendedOnly")}</span></label><span>{results(visible.length)}</span></div>
        {loading ? loadingState : error ? errorState : visible.length ? groups.map((group) => <div className={styles.group} key={group.key || "other"}>
          {group.title && <h3 className={styles.groupTitle}>{group.title}</h3>}
          <div className={styles.list}>
            {group.items.map((item) => {
              const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
              const storagePending = item.storage?.state !== "ready";
              const metadataOnly = item.kind === "bibliography" && item.storage?.backend === "inline";
              const format = item.kind === "bibliography" ? bibliographyFormat(item) : null;
              return <article className={styles.resource} key={item.id}>
                <div className={styles.rail}>{item.kind === "bibliography" ? <BookOpen /> : <FileText />}</div>
                <div className={styles.resourceMain}>
                  <header><div className={styles.badges}>{format && <span className={styles.badge}>{formatBadge(format)}</span>}{item.recommended && <span className={styles.badge}>Recomendado</span>}<span className={`${styles.badge} ${item.verification === "verified" ? styles.badgeVerified : item.verification === "pending" ? styles.badgePending : styles.badgeNeutral}`}>{verificationLabel(item.verification)}</span></div></header>
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                  <footer>
                    <div className={styles.resourceMeta}>{item.source?.author && <span>{item.source.author}</span>}{(item.pages?.printedStart || item.pages?.printedEnd) && <span>Páginas impressas {item.pages?.printedStart}–{item.pages?.printedEnd}</span>}{(item.pages?.physicalStart || item.pages?.physicalEnd) && <span>Páginas físicas {item.pages?.physicalStart}–{item.pages?.physicalEnd}</span>}{itemLessons.length > 0 && <span>{itemLessons.join(" · ")}</span>}{item.pages?.note && <span>{item.pages.note}</span>}</div>
                    <div className={styles.resourceActions}>{metadataOnly ? <span className={styles.pending}>Referência bibliográfica apenas; consulte a obra por uma via licenciada.</span> : <>{item.viewUrl && <button className="button button--primary button--compact" type="button" onClick={() => setReader(item)}><Highlighter />Abrir e realçar</button>}{item.downloadUrl ? <a className="button button--secondary button--compact" href={item.downloadUrl} download={item.fileName}><Download />Descarregar</a> : <span className={styles.pending}>{storagePending ? t("community.materials.catalog.storagePending") : t("community.materials.catalog.fileUnavailable")}</span>}</>}</div>
                  </footer>
                </div>
              </article>;
            })}
          </div>
        </div>) : <div className={styles.empty}><Search /><strong>{t("community.materials.catalog.empty")}</strong><span>{t("community.materials.catalog.emptyHint")}</span>{resourceFiltersActive && <button className="button button--secondary button--compact" type="button" onClick={clearResourceFilters}><RotateCcw />{t("community.materials.catalog.clearFilters")}</button>}</div>}
      </>}
      {activeTab === "anki" && <>
        <div className={styles.filters}>
          <div className={styles.segmentField}><FormLabel icon={Package}>{t("community.materials.catalog.packageBase")}</FormLabel><div className={styles.segmented}><button type="button" aria-pressed={ankiVariant === "essential"} onClick={() => setAnkiVariant("essential")}>{t("community.materials.catalog.essential")}</button><button type="button" aria-pressed={ankiVariant === "complete"} onClick={() => setAnkiVariant("complete")}>{t("community.materials.catalog.complete")}</button></div></div>
        </div>
        <div className={styles.resultsSummary}><span>O pacote é gerado uma única vez e servido diretamente do armazenamento, sem processamento no dispositivo.</span></div>
        {loading ? loadingState : <article className={styles.resource}>
          <div className={styles.rail}><Package /></div>
          <div className={styles.resourceMain}>
            <header><div className={styles.badges}><span className={styles.badge}>Download preparado</span><span className={`${styles.badge} ${styles.badgeNeutral}`}>{selectedDeck?.cardCount || 0} {t("community.materials.catalog.cards")}</span></div></header>
            <h3>{compendiumUnit?.shortTitle || selectedUnit.name} · {ankiVariant === "essential" ? "Essencial" : "Completo"}</h3>
            <p>{selectedDeck?.description || t("community.materials.catalog.ankiUnitPending")}</p>
            <footer><div className={styles.resourceMeta} /><div className={styles.resourceActions}>{selectedDeck?.downloadUrl ? <a className="button button--secondary button--compact" href={selectedDeck.downloadUrl} download><Download />Descarregar pacote</a> : <span className={styles.pending}>{selectedDeck ? t("community.materials.catalog.ankiStoragePending") : t("community.materials.catalog.ankiUnitPending")}</span>}</div></footer>
          </div>
        </article>}
      </>}
      {activeTab === "exams" && <>
        {examFilters && <div className={styles.filters}>{examFilters}</div>}
        {examSummary && <div className={styles.resultsSummary}>{examSummary}</div>}
        {children}
      </>}
    </div>
    {reader?.viewUrl && <MaterialPdfReader key={reader.id} materialId={reader.id} title={reader.title} viewUrl={reader.viewUrl} onClose={() => setReader(null)} />}
  </section>;
}
