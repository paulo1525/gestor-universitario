"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, BookOpen, ChevronLeft, Download, FileText, GraduationCap, Highlighter, Package } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { FilterBar, FilterCheckbox, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import { MaterialPdfReader } from "@/components/material-pdf-reader";
import styles from "@/components/material-catalog.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";

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
 * Materials: the curricular unit is chosen first, then its summaries, bibliography,
 * Anki packages and exams follow the list → reading-card model.
 */
export function MaterialCatalog({ activeTab, onTabChange, unitCode, onUnitChange, units, submissionCounts }: {
  activeTab: MaterialCatalogTab;
  onTabChange: (tab: MaterialCatalogTab) => void;
  unitCode: string;
  onUnitChange: (code: string) => void;
  units: MaterialUnitOption[];
  submissionCounts: Record<string, number>;
}) {
  const { t } = useI18n();
  const tabLabel = (tab: MaterialCatalogTab) => t(`community.materials.catalog.tab.${tab}` as "community.materials.catalog.tab.overview");
  const [openResourceId, openResource] = useHashRecord("recurso");
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
  const label = (item: CatalogItem) => item.kind === "summary" ? t("community.materials.catalog.tab.summaries") : item.kind === "bibliography" ? t("community.materials.catalog.tab.bibliography") : item.kind === "anki" ? t("community.materials.catalog.tab.anki") : t("community.materials.catalog.tab.overview");
  const verificationLabel = (value?: CatalogItem["verification"]) => value === "verified" ? t("community.materials.catalog.verified") : value === "original" ? t("community.materials.catalog.original") : t("community.materials.catalog.pending");
  const formatLabel = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}` as "community.materials.catalog.format.complete");
  const formatBadge = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}Badge` as "community.materials.catalog.format.completeBadge");
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
  const resourceMeta = (item: CatalogItem) => {
    const lessonsOf = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
    return [item.kind === "bibliography" ? formatBadge(bibliographyFormat(item)) : label(item), item.recommended ? "recomendado" : "", item.source?.author, lessonsOf.join(" · ")].filter(Boolean).join(" · ");
  };
  const openItem = openResourceId ? items.find((item) => item.id === openResourceId) ?? null : null;

  if (openResourceId) {
    const lessonsOf = openItem ? (openItem.lessonCodes?.length ? openItem.lessonCodes : openItem.lessonCode ? [openItem.lessonCode] : []) : [];
    const metadataOnly = openItem?.kind === "bibliography" && openItem.storage?.backend === "inline";
    const storagePending = openItem?.storage?.state !== "ready";
    return <>
      <button className={list.back} type="button" onClick={() => openResource(null)}><ChevronLeft aria-hidden="true" />{openItem ? tabLabel(openItem.kind === "bibliography" ? "bibliography" : "summaries") : t("community.materials.title")}</button>
      <article className={`panel ${list.reading}`} aria-busy={loading}>
        {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} rows={2} /> : !openItem ? <div className={list.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong></div> : <>
          <header className={list.byline}>
            <span className={list.iconChip} aria-hidden="true">{openItem.kind === "bibliography" ? <BookOpen /> : <FileText />}</span>
            <div>
              <p className={list.bylineName}>{openItem.kind === "bibliography" ? formatBadge(bibliographyFormat(openItem)) : label(openItem)}{openItem.recommended && " · recomendado"}</p>
              <p className={list.bylineMeta}>{[openItem.unitCode && `${openItem.unitCode}${openItem.unitName ? ` · ${openItem.unitName}` : ""}`, lessonsOf.join(" · ")].filter(Boolean).join(" · ")}</p>
            </div>
            <span className={list.statusPill} data-tone={openItem.verification === "verified" ? "success" : openItem.verification === "pending" ? "accent" : undefined}>{verificationLabel(openItem.verification)}</span>
          </header>
          <h2 className={list.readingTitle}>{openItem.title}</h2>
          <span className={list.readingRule} aria-hidden="true" />
          {openItem.description && <p className={list.readingBody}>{openItem.description}</p>}
          {(openItem.source?.title || openItem.source?.author || openItem.pages?.printedStart || openItem.pages?.physicalStart || openItem.pages?.note) && <dl className={list.facts}>
            {openItem.source?.title && <div><dt>Obra</dt><dd>{openItem.source.title}{openItem.source.edition ? ` · ${openItem.source.edition}` : ""}</dd></div>}
            {openItem.source?.author && <div><dt>Autoria</dt><dd>{openItem.source.author}</dd></div>}
            {(openItem.pages?.printedStart || openItem.pages?.printedEnd) && <div><dt>Páginas impressas</dt><dd>{openItem.pages?.printedStart}–{openItem.pages?.printedEnd}</dd></div>}
            {(openItem.pages?.physicalStart || openItem.pages?.physicalEnd) && <div><dt>Páginas físicas</dt><dd>{openItem.pages?.physicalStart}–{openItem.pages?.physicalEnd}</dd></div>}
            {openItem.pages?.note && <div><dt>Nota</dt><dd>{openItem.pages.note}</dd></div>}
          </dl>}
          <footer className={list.manageArea}>
            <div className={styles.resourceActions}>{metadataOnly ? <span className={styles.pending}>Referência bibliográfica apenas; consulte a obra por uma via licenciada.</span> : <>{openItem.viewUrl && <button className="button button--primary button--compact" type="button" onClick={() => setReader(openItem)}><Highlighter aria-hidden="true" />Abrir e realçar</button>}{openItem.downloadUrl ? <a className="button button--secondary button--compact" href={openItem.downloadUrl} download={openItem.fileName}><Download aria-hidden="true" />Descarregar</a> : <span className={styles.pending}>{storagePending ? t("community.materials.catalog.storagePending") : t("community.materials.catalog.fileUnavailable")}</span>}</>}</div>
          </footer>
        </>}
      </article>
      {reader?.viewUrl && <MaterialPdfReader key={reader.id} materialId={reader.id} title={reader.title} viewUrl={reader.viewUrl} onClose={() => setReader(null)} />}
    </>;
  }

  // Step 1: choose the curricular unit.
  if (!selectedUnit) {
    const term = unitSearch.trim().toLocaleLowerCase("pt-PT");
    const matching = unitOptions.filter((unit) => !term || `${unit.code} ${unit.name}`.toLocaleLowerCase("pt-PT").includes(term));
    const unitGroups = new Map<string, MaterialUnitOption[]>();
    for (const unit of matching) {
      const key = unit.year && unit.semester ? `${unit.year}.º ano · ${unit.semester}.º semestre` : "";
      unitGroups.set(key, [...(unitGroups.get(key) || []), unit]);
    }
    return <section className={`panel ${list.listPanel}`} aria-busy={loading} aria-label={t("community.materials.catalog.unit.title")}>
      <FilterBar label={t("community.materials.catalog.unit.search")}>
        <FilterSearch label={t("community.materials.catalog.unit.search")} value={unitSearch} onChange={setUnitSearch} placeholder={t("community.materials.catalog.unit.searchPlaceholder")} />
      </FilterBar>
      {loading && !units.length ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : matching.length ? [...unitGroups.entries()].map(([group, groupUnits]) => <div className={styles.group} key={group || "all"}>
        {group && <h3 className={styles.groupTitle}>{group}</h3>}
        <ul className={list.rows}>
          {groupUnits.map((unit) => {
            const total = countFor(unit);
            return <li className={list.row} key={unit.code} data-tone={total ? "accent" : undefined}>
              <span className={list.rowIcon} aria-hidden="true"><GraduationCap /></span>
              <div className={list.rowMain}>
                <h3><a className={`link-quiet ${list.titleLink}`} href={`?uc=${encodeURIComponent(normalizeMaterialUnitCode(unit.code))}`} onClick={(event) => { event.preventDefault(); onUnitChange(normalizeMaterialUnitCode(unit.code)); setUnitSearch(""); }}>{unit.name}</a></h3>
                <p className={list.rowMeta}>{[unit.code === GENERAL_MATERIAL_UNIT ? "" : unit.code, total === 0 ? t("community.materials.catalog.unit.none") : total === 1 ? t("community.materials.catalog.unit.countOne") : t("community.materials.catalog.unit.count", { count: total })].filter(Boolean).join(" · ")}</p>
              </div>
            </li>;
          })}
        </ul>
      </div>) : <div className={list.empty}><GraduationCap /><strong>{t("community.materials.catalog.unit.empty")}</strong></div>}
    </section>;
  }

  // Step 2: the unit's materials.
  const unitTitle = selectedUnit.code === GENERAL_MATERIAL_UNIT ? selectedUnit.name : `${selectedUnit.code} · ${selectedUnit.name}`;
  return <>
    <button className={list.back} type="button" onClick={() => onUnitChange("")}><ChevronLeft aria-hidden="true" />{t("community.materials.catalog.unit.change")}</button>
    <section className={styles.catalog} aria-label={unitTitle}>
      <div className={styles.tabsRow}>
        <h2 className={styles.unitTitle}>{unitTitle}</h2>
        <nav className={styles.tabs} role="tablist" aria-label={t("community.materials.title")}>
          {tabs.map((tab) => <button id={`material-tab-${tab}`} key={tab} type="button" role="tab" className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`} aria-selected={activeTab === tab} aria-controls={`material-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, tab)} onClick={() => onTabChange(tab)}>{tabLabel(tab)}</button>)}
        </nav>
      </div>
      {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
      <div id={`material-panel-${activeTab}`} role="tabpanel" aria-labelledby={`material-tab-${activeTab}`} tabIndex={-1}>
        {activeTab === "overview" && <>
          {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : error ? <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : <>
            <div className={styles.overviewList}><button type="button" className={styles.overviewRow} onClick={() => onTabChange("summaries")}><FileText className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("summaries")}</strong></span><span className={styles.overviewCount}>{stats.summaries}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button><button type="button" className={styles.overviewRow} onClick={() => onTabChange("bibliography")}><BookOpen className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("bibliography")}</strong></span><span className={styles.overviewCount}>{stats.bibliography}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button><button type="button" className={styles.overviewRow} onClick={() => onTabChange("anki")}><Package className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("anki")}</strong></span><span className={styles.overviewCount}>{stats.decks}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button></div>
          </>}
        </>}
        {(activeTab === "summaries" || activeTab === "bibliography") && <>
          <FilterBar label={t("community.materials.catalog.search")}>
            <FilterSearch label={t("community.materials.catalog.search")} value={search} onChange={setSearch} placeholder={t("community.materials.catalog.searchPlaceholder")} />
            {activeTab === "bibliography" && <FilterSelect label={t("community.materials.catalog.format.label")} value={formatFilter} onChange={(value) => setFormatFilter(value as typeof formatFilter)} options={[{ value: "all", label: `${t("community.materials.catalog.format.all")} (${filtered.length})` }, ...formats.map((format) => ({ value: format, label: `${formatLabel(format)} (${formatCounts[format]})` }))]} />}
            {unitLessons.length > 0 && <FilterSelect label={t("community.materials.catalog.lesson")} value={lessonFilter} onChange={setLessonFilter} defaultValue="" options={[{ value: "", label: t("community.materials.catalog.allLessons") }, ...unitLessons.map((lesson) => ({ value: lesson.code, label: `${lesson.code} · ${lesson.title}` }))]} />}
            <FilterSelect label={t("community.materials.catalog.editorialStatus")} value={verificationFilter} onChange={(value) => setVerificationFilter(value as typeof verificationFilter)} options={[{ value: "all", label: t("community.materials.catalog.allStatuses") }, { value: "verified", label: t("community.materials.catalog.verified") }, { value: "original", label: t("community.materials.catalog.original") }, { value: "pending", label: t("community.materials.catalog.pending") }]} />
            <FilterCheckbox label={t("community.materials.catalog.recommendedOnly")} checked={recommendedOnly} onChange={setRecommendedOnly} />
          </FilterBar>
          <div className={styles.resourceList}>
            {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : error ? <div className={list.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : visible.length ? groups.map((group) => <div className={styles.group} key={group.key || "other"}>
              {group.title && <h3 className={styles.groupTitle}>{group.title}</h3>}
              <ul className={list.rows}>{group.items.map((item) => <li className={list.row} key={item.id} data-tone={item.verification === "verified" ? "success" : item.verification === "pending" ? "accent" : undefined}>
                <span className={list.rowIcon} aria-hidden="true">{item.kind === "bibliography" ? <BookOpen /> : <FileText />}</span>
                <div className={list.rowMain}>
                  <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("recurso", item.id)} onClick={(event) => { event.preventDefault(); openResource(item.id); }}>{item.title}</a></h3>
                  <p className={list.rowMeta}>{resourceMeta(item)}</p>
                </div>
                <span className={list.statusPill} data-tone={item.verification === "verified" ? "success" : item.verification === "pending" ? "accent" : undefined}>{verificationLabel(item.verification)}</span>
              </li>)}</ul>
            </div>) : <div className={list.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong></div>}
          </div>
        </>}
        {activeTab === "anki" && <>
          <FilterBar label={t("community.materials.catalog.packageBase")}>
            <FilterSegmented label={t("community.materials.catalog.packageBase")} value={ankiVariant} onChange={setAnkiVariant} options={[{ value: "essential", label: t("community.materials.catalog.essential") }, { value: "complete", label: t("community.materials.catalog.complete") }]} />
          </FilterBar>
          {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} rows={1} /> : <ul className={list.rows}>
            <li className={list.row} data-tone={selectedDeck?.downloadUrl ? "success" : undefined}>
              <span className={list.rowIcon} aria-hidden="true"><Package /></span>
              <div className={list.rowMain}>
                <h3>{compendiumUnit?.shortTitle || selectedUnit.name} · {ankiVariant === "essential" ? t("community.materials.catalog.essential") : t("community.materials.catalog.complete")}</h3>
                <p className={list.rowMeta}>{selectedDeck ? `${selectedDeck.cardCount} ${t("community.materials.catalog.cards")}` : t("community.materials.catalog.ankiUnitPending")}</p>
              </div>
              {selectedDeck?.downloadUrl ? <a className="button button--secondary button--compact" href={selectedDeck.downloadUrl} download><Download aria-hidden="true" />Descarregar pacote</a> : selectedDeck && <span className={styles.pending}>{t("community.materials.catalog.ankiStoragePending")}</span>}
            </li>
          </ul>}
        </>}
      </div>
      {reader?.viewUrl && <MaterialPdfReader key={reader.id} materialId={reader.id} title={reader.title} viewUrl={reader.viewUrl} onClose={() => setReader(null)} />}
    </section>
  </>;
}
