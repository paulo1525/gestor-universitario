"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, ChevronLeft, Download, FileText, GraduationCap, Highlighter, Package } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { FilterBar, FilterCheckbox, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import { materialReaderHref } from "@/lib/material-reader";
import styles from "@/components/material-catalog.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, useHashRecord } from "@/components/record-list";
import { UnitThumb } from "@/components/unit-thumb";
import { clampPage, Pagination } from "@/components/pagination";

const RESOURCE_PAGE_SIZE = 10;
const UNIT_PAGE_SIZE = 12;

export type MaterialCatalogTab = "overview" | "summaries" | "notes" | "bibliography" | "anki" | "exams";
/** Unit offered in the picker; `code` is the stable key shared by the catalogue and the submissions. */
export type MaterialUnitOption = { id: string; code: string; name: string; year?: number | null; semester?: number | null };
type BibliographyFormat = "complete" | "excerpt" | "translation";
type CatalogItem = { id: string; kind: string; bibliographyFormat?: BibliographyFormat | null; summaryFormat?: "lecture" | "notes" | null; title: string; description?: string; fileName?: string; mimeType?: string; downloadUrl?: string | null; viewUrl?: string | null; verification?: "original" | "verified" | "pending" | string; recommended?: boolean; unitCode?: string | null; unitId?: string | null; unitName?: string | null; lessonCode?: string | null; lessonCodes?: string[]; storage?: { backend?: string; state?: string; ready?: boolean }; source?: { title?: string; edition?: string; author?: string } | null; pages?: { printedStart?: string; printedEnd?: string; physicalStart?: string; physicalEnd?: string; note?: string | null } };
type Lesson = { id: string; unitId?: string; code: string; title: string; type: string; cardCount?: number };
type Deck = { id: string; unitId?: string | null; title: string; variant: "essential" | "complete" | "custom"; description: string; cardCount: number; mediaCount: number; downloadUrl?: string | null; storage: { state: string; ready: boolean }; lessons: Array<{ id: string; code: string; title: string; cardCount: number }> };

const tabs: MaterialCatalogTab[] = ["overview", "summaries", "notes", "bibliography", "anki", "exams"];
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
  // Older links (#recurso-<id>, #ler-<id>) now open the annotator page.
  const [legacyResourceId] = useHashRecord("recurso", { scroll: false });
  const [legacyReadId] = useHashRecord("ler", { scroll: false });
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]), [lessons, setLessons] = useState<Lesson[]>([]), [decks, setDecks] = useState<Deck[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [catalogAttempt, setCatalogAttempt] = useState(0), [search, setSearch] = useState(""), [lessonFilter, setLessonFilter] = useState(""), [verificationFilter, setVerificationFilter] = useState<"all" | "original" | "verified" | "pending">("all"), [recommendedOnly, setRecommendedOnly] = useState(false), [formatFilter, setFormatFilter] = useState<"all" | BibliographyFormat>("all"), [unitSearch, setUnitSearch] = useState(""), [ankiVariant, setAnkiVariant] = useState<"essential" | "complete">("essential");
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
    const legacyId = legacyReadId || legacyResourceId;
    if (legacyId) router.replace(materialReaderHref(legacyId));
  }, [legacyReadId, legacyResourceId, router]);
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

  const kind = activeTab === "summaries" || activeTab === "notes" ? "summary" : activeTab === "bibliography" ? "bibliography" : "";
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");
    return unitItems.filter((item) => {
      const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
      const searchable = `${item.title} ${item.description || ""} ${item.unitCode || ""} ${item.source?.title || ""} ${item.source?.author || ""} ${item.pages?.note || ""}`.toLocaleLowerCase("pt-PT");
      return (!kind || item.kind === kind) &&
        (activeTab !== "summaries" || item.summaryFormat !== "notes") &&
        (activeTab !== "notes" || item.summaryFormat === "notes") &&
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (!lessonFilter || itemLessons.includes(lessonFilter)) &&
        (verificationFilter === "all" || item.verification === verificationFilter) &&
        (!recommendedOnly || item.recommended);
    });
  }, [activeTab, kind, lessonFilter, recommendedOnly, search, unitItems, verificationFilter]);
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
  // Pagination runs over the grouped order, then each page is regrouped by book.
  const [resourcePage, setResourcePage] = useState(1);
  const [unitPage, setUnitPage] = useState(1);
  useEffect(() => { setResourcePage(1); }, [activeTab, unitCode, search, lessonFilter, verificationFilter, recommendedOnly, formatFilter]);
  useEffect(() => { setUnitPage(1); }, [unitSearch]);
  const orderedResources = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ group, item }))), [groups]);
  const currentResourcePage = clampPage(resourcePage, orderedResources.length, RESOURCE_PAGE_SIZE);
  const pageGroups = useMemo(() => {
    const slice = orderedResources.slice((currentResourcePage - 1) * RESOURCE_PAGE_SIZE, currentResourcePage * RESOURCE_PAGE_SIZE);
    const result: Array<{ key: string; title: string; items: CatalogItem[] }> = [];
    for (const { group, item } of slice) {
      const last = result[result.length - 1];
      if (last && last.key === group.key) last.items.push(item);
      else result.push({ key: group.key, title: group.title, items: [item] });
    }
    return result;
  }, [currentResourcePage, orderedResources]);
  const stats = useMemo(() => ({ summaries: unitItems.filter((item) => item.kind === "summary" && item.summaryFormat !== "notes").length, notes: unitItems.filter((item) => item.kind === "summary" && item.summaryFormat === "notes").length, bibliography: unitItems.filter((item) => item.kind === "bibliography").length, decks: unitDecks.length }), [unitDecks.length, unitItems]);
  const label = (item: CatalogItem) => item.kind === "summary" ? t(item.summaryFormat === "notes" ? "community.materials.catalog.tab.notes" : "community.materials.catalog.tab.summaries") : item.kind === "bibliography" ? t("community.materials.catalog.tab.bibliography") : item.kind === "anki" ? t("community.materials.catalog.tab.anki") : t("community.materials.catalog.tab.overview");
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
    const availability = item.viewUrl || item.downloadUrl ? "" : item.kind === "bibliography" && item.storage?.backend === "inline" ? "Referência bibliográfica apenas" : item.storage?.state !== "ready" ? t("community.materials.catalog.storagePending") : t("community.materials.catalog.fileUnavailable");
    const printed = item.pages?.printedStart && !/\bpp?\./.test(item.title) ? `pp. ${item.pages.printedStart}–${item.pages.printedEnd || item.pages.printedStart}` : "";
    return [item.kind === "bibliography" ? formatBadge(bibliographyFormat(item)) : label(item), printed, item.recommended ? "recomendado" : "", item.source?.author, lessonsOf.join(" · "), availability].filter(Boolean).join(" · ");
  };
  // Full reference (formerly the detail card) as the row's tooltip.
  const resourceFacts = (item: CatalogItem) => [
    item.source?.title && `Obra: ${item.source.title}${item.source.edition ? ` · ${item.source.edition}` : ""}`,
    item.source?.author && `Autoria: ${item.source.author}`,
    (item.pages?.printedStart || item.pages?.printedEnd) && `Páginas impressas: ${item.pages?.printedStart}–${item.pages?.printedEnd}`,
    (item.pages?.physicalStart || item.pages?.physicalEnd) && `Páginas físicas: ${item.pages?.physicalStart}–${item.pages?.physicalEnd}`,
    item.pages?.note && `Nota: ${item.pages.note}`,
  ].filter(Boolean).join("\n") || undefined;

  // Step 1: choose the curricular unit.
  if (!selectedUnit) {
    const term = unitSearch.trim().toLocaleLowerCase("pt-PT");
    const matching = unitOptions.filter((unit) => !term || `${unit.code} ${unit.name}`.toLocaleLowerCase("pt-PT").includes(term));
    const currentUnitPage = clampPage(unitPage, matching.length, UNIT_PAGE_SIZE);
    const unitGroups = new Map<string, MaterialUnitOption[]>();
    for (const unit of matching.slice((currentUnitPage - 1) * UNIT_PAGE_SIZE, currentUnitPage * UNIT_PAGE_SIZE)) {
      const key = unit.year && unit.semester ? `${unit.year}.º ano · ${unit.semester}.º semestre` : "";
      unitGroups.set(key, [...(unitGroups.get(key) || []), unit]);
    }
    return <section className={`panel ${list.listPanel}`} aria-busy={loading} aria-label={t("community.materials.catalog.unit.title")}>
      <FilterBar label={t("community.materials.catalog.unit.search")}>
        <FilterSearch label={t("community.materials.catalog.unit.search")} value={unitSearch} onChange={setUnitSearch} placeholder={t("community.materials.catalog.unit.searchPlaceholder")} />
      </FilterBar>
      {loading && !units.length ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : matching.length ? [...unitGroups.entries()].map(([group, groupUnits]) => <div className={list.group} key={group || "all"}>
        {group && <h3 className={list.groupTitle}>{group}</h3>}
        <ul className={list.rows}>
          {groupUnits.map((unit) => {
            const total = countFor(unit);
            return <li className={list.row} key={unit.code} data-tone={total ? "accent" : undefined}>
              <UnitThumb id={unit.id} code={unit.code} name={unit.name} />
              <div className={list.rowMain}>
                <h3><a className={`link-quiet ${list.titleLink}`} href={`?uc=${encodeURIComponent(normalizeMaterialUnitCode(unit.code))}`} onClick={(event) => { event.preventDefault(); onUnitChange(normalizeMaterialUnitCode(unit.code)); setUnitSearch(""); }}>{unit.name}</a></h3>
                <p className={list.rowMeta}>{[unit.code === GENERAL_MATERIAL_UNIT ? "" : unit.code, total === 0 ? t("community.materials.catalog.unit.none") : total === 1 ? t("community.materials.catalog.unit.countOne") : t("community.materials.catalog.unit.count", { count: total })].filter(Boolean).join(" · ")}</p>
              </div>
            </li>;
          })}
        </ul>
      </div>) : <div className={list.empty}><GraduationCap /><strong>{t("community.materials.catalog.unit.empty")}</strong></div>}
      {!loading && <Pagination page={currentUnitPage} totalItems={matching.length} pageSize={UNIT_PAGE_SIZE} onChange={setUnitPage} />}
    </section>;
  }

  // Step 2: the unit's materials.
  const unitTitle = selectedUnit.code === GENERAL_MATERIAL_UNIT ? selectedUnit.name : `${selectedUnit.code} · ${selectedUnit.name}`;
  return <>
    <button className={list.back} type="button" onClick={() => onUnitChange("")}><ChevronLeft aria-hidden="true" />{t("community.materials.catalog.unit.change")}</button>
    <section className={styles.catalog} aria-label={unitTitle}>
      <div className={styles.tabsRow}>
        <h2 className={styles.unitTitle}><UnitThumb id={selectedUnit.id} code={selectedUnit.code} name={selectedUnit.name} />{unitTitle}</h2>
        <nav className={styles.tabs} role="tablist" aria-label={t("community.materials.title")}>
          {tabs.map((tab) => <button id={`material-tab-${tab}`} key={tab} type="button" role="tab" className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`} aria-selected={activeTab === tab} aria-controls={`material-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, tab)} onClick={() => onTabChange(tab)}>{tabLabel(tab)}</button>)}
        </nav>
      </div>
      {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
      <div id={`material-panel-${activeTab}`} role="tabpanel" aria-labelledby={`material-tab-${activeTab}`} tabIndex={-1}>
        {activeTab === "overview" && <>
          {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : error ? <div className={styles.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : <>
            <div className={styles.overviewList}><button type="button" className={styles.overviewRow} onClick={() => onTabChange("summaries")}><FileText className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("summaries")}</strong></span><span className={styles.overviewCount}>{stats.summaries}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button><button type="button" className={styles.overviewRow} onClick={() => onTabChange("notes")}><FileText className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("notes")}</strong></span><span className={styles.overviewCount}>{stats.notes}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button><button type="button" className={styles.overviewRow} onClick={() => onTabChange("bibliography")}><BookOpen className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("bibliography")}</strong></span><span className={styles.overviewCount}>{stats.bibliography}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button><button type="button" className={styles.overviewRow} onClick={() => onTabChange("anki")}><Package className={styles.overviewIcon} aria-hidden="true" /><span className={styles.overviewText}><strong>{tabLabel("anki")}</strong></span><span className={styles.overviewCount}>{stats.decks}</span><ArrowRight className={styles.overviewArrow} aria-hidden="true" /></button></div>
          </>}
        </>}
        {(activeTab === "summaries" || activeTab === "notes" || activeTab === "bibliography") && <>
          <FilterBar label={t("community.materials.catalog.search")}>
            <FilterSearch label={t("community.materials.catalog.search")} value={search} onChange={setSearch} placeholder={t("community.materials.catalog.searchPlaceholder")} />
            {activeTab === "bibliography" && <FilterSelect label={t("community.materials.catalog.format.label")} value={formatFilter} onChange={(value) => setFormatFilter(value as typeof formatFilter)} options={[{ value: "all", label: `${t("community.materials.catalog.format.all")} (${filtered.length})` }, ...formats.map((format) => ({ value: format, label: `${formatLabel(format)} (${formatCounts[format]})` }))]} />}
            {unitLessons.length > 0 && <FilterSelect label={t("community.materials.catalog.lesson")} value={lessonFilter} onChange={setLessonFilter} defaultValue="" options={[{ value: "", label: t("community.materials.catalog.allLessons") }, ...unitLessons.map((lesson) => ({ value: lesson.code, label: `${lesson.code} · ${lesson.title}` }))]} />}
            <FilterSelect label={t("community.materials.catalog.editorialStatus")} value={verificationFilter} onChange={(value) => setVerificationFilter(value as typeof verificationFilter)} options={[{ value: "all", label: t("community.materials.catalog.allStatuses") }, { value: "verified", label: t("community.materials.catalog.verified") }, { value: "original", label: t("community.materials.catalog.original") }, { value: "pending", label: t("community.materials.catalog.pending") }]} />
            <FilterCheckbox label={t("community.materials.catalog.recommendedOnly")} checked={recommendedOnly} onChange={setRecommendedOnly} />
          </FilterBar>
          <div className={styles.resourceList}>
            {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : error ? <div className={list.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : visible.length ? pageGroups.map((group) => <div className={list.group} key={group.key || "other"}>
              {group.title && <h3 className={list.groupTitle}>{group.title}</h3>}
              <ul className={list.rows}>{group.items.map((item) => <li className={list.row} key={item.id} data-tone={item.verification === "verified" ? "success" : item.verification === "pending" ? "accent" : undefined}>
                <span className={list.rowIcon} aria-hidden="true">{item.kind === "bibliography" ? <BookOpen /> : <FileText />}</span>
                <div className={list.rowMain}>
                  <h3>{item.viewUrl ? <a className={`link-quiet ${list.titleLink}`} href={materialReaderHref(item.id)} target="_blank" rel="noopener">{item.title}</a> : item.downloadUrl ? <a className={`link-quiet ${list.titleLink}`} href={item.downloadUrl} download={item.fileName || true}>{item.title}</a> : <span className={list.titleLink}>{item.title}</span>}</h3>
                  <p className={list.rowMeta} title={resourceFacts(item)}>{resourceMeta(item)}</p>
                </div>
                <span className={list.rowEnd}>
                  {(item.viewUrl || item.downloadUrl) && <span className={list.rowActions}>
                    {item.viewUrl && <a className={list.rowAction} href={materialReaderHref(item.id)} target="_blank" rel="noopener" aria-label={`Anotar · ${item.title} (abre num novo separador)`} title="Anotar num novo separador"><Highlighter aria-hidden="true" /><span>Anotar</span></a>}
                    {item.downloadUrl && <a className={list.rowAction} href={item.downloadUrl} download={item.fileName || true} aria-label={`Descarregar · ${item.title}`} title="Descarregar"><Download aria-hidden="true" /><span>Descarregar</span></a>}
                  </span>}
                  <span className={list.statusPill} data-tone={item.verification === "verified" ? "success" : item.verification === "pending" ? "accent" : undefined}>{verificationLabel(item.verification)}</span>
                </span>
              </li>)}</ul>
            </div>) : <div className={list.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong></div>}
            {!loading && !error && <Pagination page={currentResourcePage} totalItems={orderedResources.length} pageSize={RESOURCE_PAGE_SIZE} onChange={setResourcePage} />}
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
    </section>
  </>;
}
