"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileText, GraduationCap, Library, NotebookPen, Package, Presentation, ScrollText, Star, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { FilterBar, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import { MaterialViews } from "@/components/material-views";
import { subscribeMaterialViews, trackMaterialView } from "@/lib/material-views";
import { materialReaderHref } from "@/lib/material-reader";
import styles from "@/components/material-catalog.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, useHashRecord } from "@/components/record-list";
import { UnitThumb } from "@/components/unit-thumb";
import { clampPage, Pagination } from "@/components/pagination";

const RESOURCE_PAGE_SIZE = 10;
const UNIT_PAGE_SIZE = 12;

export type MaterialCatalogTab = "overview" | "summaries" | "notes" | "slides" | "compendiums" | "bibliography" | "anki" | "exams";
/** List sections backed by catalogue items; every item belongs to exactly one. */
type CatalogSection = "summaries" | "notes" | "slides" | "compendiums" | "bibliography" | "other";
/** Unit offered in the picker; `code` is the stable key shared by the catalogue and the submissions. */
export type MaterialUnitOption = { id: string; code: string; name: string; year?: number | null; semester?: number | null };
type BibliographyFormat = "complete" | "excerpt" | "translation";
type CatalogItem = { views?: number | null; updatedAt?: number; id: string; kind: string; bibliographyFormat?: BibliographyFormat | null; summaryFormat?: "lecture" | "notes" | null; favorite?: boolean; otherFormat?: "slides" | "compendium" | null; title: string; description?: string; fileName?: string; mimeType?: string; downloadUrl?: string | null; viewUrl?: string | null; verification?: "original" | "verified" | "pending" | string; recommended?: boolean; unitCode?: string | null; unitId?: string | null; unitName?: string | null; lessonCode?: string | null; lessonCodes?: string[]; storage?: { backend?: string; state?: string; ready?: boolean }; source?: { title?: string; edition?: string; author?: string } | null; pages?: { printedStart?: string; printedEnd?: string; physicalStart?: string; physicalEnd?: string; note?: string | null } };
type Lesson = { id: string; unitId?: string; code: string; title: string; type: string; cardCount?: number };
type Deck = { views?: number | null; id: string; unitId?: string | null; title: string; variant: "essential" | "complete" | "custom"; description: string; cardCount: number; mediaCount: number; downloadUrl?: string | null; storage: { state: string; ready: boolean }; lessons: Array<{ id: string; code: string; title: string; cardCount: number }> };

const tabs: Exclude<MaterialCatalogTab, "overview">[] = ["summaries", "notes", "slides", "compendiums", "bibliography", "anki", "exams"];
const TAB_ICON: Record<Exclude<MaterialCatalogTab, "overview">, LucideIcon> = { summaries: ScrollText, notes: NotebookPen, slides: Presentation, compendiums: Library, bibliography: BookOpen, anki: Package, exams: ClipboardCheck };
const listSections: Exclude<CatalogSection, "other">[] = ["summaries", "notes", "slides", "compendiums", "bibliography"];
const SECTION_ICON: Record<CatalogSection | "anki", LucideIcon> = { summaries: ScrollText, notes: NotebookPen, slides: Presentation, compendiums: Library, bibliography: BookOpen, anki: Package, other: FileText };
const formats: BibliographyFormat[] = ["complete", "excerpt", "translation"];
export const GENERAL_MATERIAL_UNIT = "__general";

export function normalizeMaterialUnitCode(value: string | null | undefined) {
  return String(value || "").trim().toLocaleUpperCase("pt-PT");
}

/** PowerPoints and compendiums come from other_format (migration 0076); loose .pptx files and titled compendiums are recognised too. */
function catalogSection(item: CatalogItem): CatalogSection {
  if (item.otherFormat === "compendium") return "compendiums";
  if (item.otherFormat === "slides" || /\.pptx?$/i.test(item.fileName || "") || /presentation|powerpoint/i.test(item.mimeType || "")) return "slides";
  if (item.kind === "bibliography") return "bibliography";
  if (/comp[êe]ndio/i.test(item.title)) return "compendiums";
  if (item.kind === "summary") return item.summaryFormat === "notes" ? "notes" : "summaries";
  return "other";
}

/** Reading order: theory lessons (AT1, AT2… AT10), then practical ones (AP1…), then the rest by title with natural numbers. */
const LESSON_PREFIX_ORDER = ["AT", "AP"];
function primaryLessonCode(item: CatalogItem): string {
  // Prefer the lesson explicitly named in the material title. Some PDFs are linked
  // to complementary lessons too (for example AP4 also linked to AT7), and those
  // secondary associations must not move the PDF out of its visible AP/AT order.
  const titleMatch = /\b(A[TP])\s*0*(\d+)\b/i.exec(item.title);
  const raw = titleMatch?.[0] || item.lessonCodes?.[0] || item.lessonCode || "";
  const match = /^\s*(A[TP])\s*0*(\d+)/i.exec(raw);
  return match ? `${match[1].toUpperCase()}${Number(match[2])}` : "";
}
function lessonOrder(item: CatalogItem): [number, number] {
  const match = /^(A[TP])(\d+)$/.exec(primaryLessonCode(item));
  return match ? [LESSON_PREFIX_ORDER.indexOf(match[1]), Number(match[2])] : [LESSON_PREFIX_ORDER.length, 0];
}
function compareCatalogItems(a: CatalogItem, b: CatalogItem) {
  const [prefixA, numberA] = lessonOrder(a), [prefixB, numberB] = lessonOrder(b);
  return prefixA - prefixB || numberA - numberB || a.title.localeCompare(b.title, "pt-PT", { numeric: true, sensitivity: "base" });
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
export function MaterialCatalog({ activeTab, onTabChange, unitCode, onUnitChange, units, submissionCounts, examsPanel }: {
  activeTab: MaterialCatalogTab;
  onTabChange: (tab: MaterialCatalogTab) => void;
  unitCode: string;
  onUnitChange: (code: string) => void;
  units: MaterialUnitOption[];
  submissionCounts: Record<string, number>;
  /** Exams list, owned by the library and rendered inside this card. */
  examsPanel?: ReactNode;
}) {
  const { t } = useI18n();
  const tabLabel = (tab: MaterialCatalogTab) => tab === "overview" ? t("community.materials.catalog.allFiles") : t(`community.materials.catalog.tab.${tab}` as "community.materials.catalog.tab.overview");
  // Older links (#recurso-<id>, #ler-<id>) now open the annotator page.
  const [legacyResourceId] = useHashRecord("recurso", { scroll: false });
  const [legacyReadId] = useHashRecord("ler", { scroll: false });
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]), [lessons, setLessons] = useState<Lesson[]>([]), [decks, setDecks] = useState<Deck[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [catalogAttempt, setCatalogAttempt] = useState(0), [search, setSearch] = useState(""), [lessonFilter, setLessonFilter] = useState(""), [verificationFilter, setVerificationFilter] = useState<"all" | "favorites" | "recommended" | "original" | "verified" | "pending">("all"), [formatFilter, setFormatFilter] = useState<"all" | BibliographyFormat>("all"), [unitSearch, setUnitSearch] = useState(""), [ankiVariant, setAnkiVariant] = useState<"essential" | "complete">("essential"), [favoritesEnabled, setFavoritesEnabled] = useState(false);
  const [sortOrder, setSortOrder] = useState("lesson");
  const loadCatalog = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/material-catalog", { cache: "no-store", signal });
      const data = await response.json() as { items?: CatalogItem[]; lessons?: Lesson[]; decks?: Deck[]; capabilities?: { favorites?: boolean }; error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.catalog.loadError"));
      if (signal.aborted) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setLessons(Array.isArray(data.lessons) ? data.lessons : []);
      setDecks(Array.isArray(data.decks) ? data.decks : []);
      setFavoritesEnabled(Boolean(data.capabilities?.favorites));
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
  useEffect(() => subscribeMaterialViews(({ id, type, views }) => {
    if (type === "catalog") setItems((current) => current.map((item) => item.id === id ? { ...item, views: Math.max(item.views || 0, views) } : item));
    else setDecks((current) => current.map((item) => item.id === id ? { ...item, views: Math.max(item.views || 0, views) } : item));
  }), []);
  useEffect(() => { setSearch(""); setLessonFilter(""); setVerificationFilter("all"); setFormatFilter("all"); setSortOrder("lesson"); }, [unitCode]);

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

  const listTab = activeTab === "overview" || (listSections as string[]).includes(activeTab);
  const filtered = useMemo(() => {
    const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
    const normalizedSearch = normalizeSearch(search.trim());
    return unitItems.filter((item) => {
      const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
      const searchable = normalizeSearch(`${item.title} ${item.description || ""} ${item.source?.title || ""} ${item.source?.author || ""} ${itemLessons.join(" ")} ${item.pages?.note || ""}`);
      return (activeTab === "overview" || catalogSection(item) === activeTab) &&
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (!lessonFilter || itemLessons.includes(lessonFilter)) &&
        (verificationFilter === "all" || (verificationFilter === "favorites" ? item.favorite : verificationFilter === "recommended" ? item.recommended : item.verification === verificationFilter));
    }).sort((a, b) => (sortOrder === "views" ? (b.views || 0) - (a.views || 0) : sortOrder === "recent" ? (b.updatedAt || 0) - (a.updatedAt || 0) : 0) || compareCatalogItems(a, b));
  }, [activeTab, lessonFilter, search, unitItems, verificationFilter, sortOrder]);
  const formatCounts = useMemo(() => Object.fromEntries(formats.map((format) => [format, filtered.filter((item) => bibliographyFormat(item) === format).length])) as Record<BibliographyFormat, number>, [filtered]);
  const visible = useMemo(() => activeTab === "bibliography" && formatFilter !== "all" ? filtered.filter((item) => bibliographyFormat(item) === formatFilter) : filtered, [activeTab, filtered, formatFilter]);
  // Translation-only view is organized by lesson so the sequence is visibly chronological.
  // Other bibliography views stay grouped by book.
  const groups = useMemo(() => {
    if (activeTab !== "bibliography" || sortOrder !== "lesson") return [{ key: "all", title: "", items: visible }];

    if (formatFilter === "translation") {
      const byLesson = new Map<string, { key: string; title: string; items: CatalogItem[] }>();
      for (const item of visible) {
        const code = primaryLessonCode(item);
        const key = code || "other";
        const title = code || t("community.materials.catalog.otherSources");
        if (!byLesson.has(key)) byLesson.set(key, { key, title, items: [] });
        byLesson.get(key)!.items.push(item);
      }
      return [...byLesson.values()]
        .map((group) => ({
          ...group,
          items: group.items.sort((a, b) =>
            (a.source?.title || "").localeCompare(b.source?.title || "", "pt-PT", { numeric: true, sensitivity: "base" }) ||
            a.title.localeCompare(b.title, "pt-PT", { numeric: true, sensitivity: "base" }),
          ),
        }))
        .sort((a, b) => {
          const firstA = a.items[0], firstB = b.items[0];
          if (!firstA || !firstB) return a.title.localeCompare(b.title, "pt-PT", { numeric: true });
          return compareCatalogItems(firstA, firstB);
        });
    }

    const map = new Map<string, { key: string; title: string; items: CatalogItem[] }>();
    for (const item of visible) {
      const key = item.source?.title ? `${item.source.title}|${item.source.edition || ""}` : "";
      const title = item.source?.title ? `${item.source.title}${item.source.edition ? ` · ${item.source.edition}` : ""}` : t("community.materials.catalog.otherSources");
      if (!map.has(key)) map.set(key, { key, title, items: [] });
      map.get(key)!.items.push(item);
    }
    const order = (item: CatalogItem) => formats.indexOf(bibliographyFormat(item));
    return [...map.values()].map((group) => ({ ...group, items: group.items.sort((a, b) => compareCatalogItems(a, b) || order(a) - order(b)) })).sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.title.localeCompare(b.title, "pt-PT"));
  }, [activeTab, formatFilter, sortOrder, t, visible]);
  // Pagination runs over the current grouped order and preserves those groups per page.
  const [resourcePage, setResourcePage] = useState(1);
  const [unitPage, setUnitPage] = useState(1);
  useEffect(() => { setResourcePage(1); }, [activeTab, unitCode, search, lessonFilter, verificationFilter, formatFilter, sortOrder]);
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
  // Summaries and slides show the bibliography excerpts of the same lesson, so each lesson reads as one set.
  const bibliographyByLesson = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of unitItems) {
      if (catalogSection(item) !== "bibliography" || (!item.viewUrl && !item.downloadUrl)) continue;
      for (const code of item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : []) map.set(code, [...(map.get(code) || []), item]);
    }
    return map;
  }, [unitItems]);
  const linkedBibliography = (item: CatalogItem) => {
    const codes = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
    return [...new Map(codes.flatMap((code) => bibliographyByLesson.get(code) || []).map((excerpt) => [excerpt.id, excerpt])).values()];
  };
  /** "Gray’s Anatomy · pp. 227–236": the book and the pages of the excerpt. */
  const excerptLabel = (excerpt: CatalogItem) => [(excerpt.source?.title || excerpt.title).split(/[:—]/)[0].trim(), /pp?\.\s*[^—·]+$/.exec(excerpt.title)?.[0].trim()].filter(Boolean).join(" · ");
  const stats = useMemo(() => {
    const counts: Record<CatalogSection, number> = { summaries: 0, notes: 0, slides: 0, compendiums: 0, bibliography: 0, other: 0 };
    for (const item of unitItems) counts[catalogSection(item)] += 1;
    return { ...counts, anki: unitDecks.length };
  }, [unitDecks.length, unitItems]);
  const label = (item: CatalogItem) => { const section = catalogSection(item); return section === "other" ? t("community.materials.catalog.tab.overview") : tabLabel(section); };
  const verificationLabel = (value?: CatalogItem["verification"]) => value === "verified" ? t("community.materials.catalog.verified") : value === "original" ? t("community.materials.catalog.original") : t("community.materials.catalog.pending");
  const formatLabel = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}` as "community.materials.catalog.format.complete");
  const formatBadge = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}Badge` as "community.materials.catalog.format.completeBadge");
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: Exclude<MaterialCatalogTab, "overview">) => {
    const index = tabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    onTabChange(next);
    window.requestAnimationFrame(() => document.getElementById(`material-tab-${next}`)?.focus());
  };
  // Optimistic star: flips at once and reverts if the server refuses.
  const toggleFavorite = async (item: CatalogItem) => {
    const next = !item.favorite;
    const flip = (value: boolean) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favorite: value } : entry));
    flip(next);
    try {
      const response = await fetch(`/api/material-catalog/${encodeURIComponent(item.id)}/favorite`, { method: next ? "POST" : "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      flip(!next);
    }
  };
  const recordOpening = async (item: CatalogItem) => {
    const views = await trackMaterialView(item.id);
    if (views !== null) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, views } : entry));
  };
  const recordDeckOpening = async (deck: Deck) => {
    const views = await trackMaterialView(deck.id, "anki");
    if (views !== null) setDecks((current) => current.map((entry) => entry.id === deck.id ? { ...entry, views } : entry));
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
      {error && <div className={styles.notice} role="alert"><span>{error}</span><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
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
      <div className={styles.head}>
        <h2 className={styles.unitTitle}><UnitThumb id={selectedUnit.id} code={selectedUnit.code} name={selectedUnit.name} /><span>{selectedUnit.name}</span></h2>
        <nav className={styles.tabs} role="tablist" aria-label={t("community.materials.title")}>
          {tabs.map((tab) => {
            const Icon = TAB_ICON[tab];
            const count = tab === "exams" ? submissionCounts[unitCode] || 0 : stats[tab];
            return <button id={`material-tab-${tab}`} key={tab} type="button" role="tab" className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`} aria-selected={activeTab === tab} aria-controls={`material-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, tab)} onClick={() => onTabChange(tab)}>
              <span className={styles.tabIcon} aria-hidden="true"><Icon /></span>
              <span className={styles.tabLabel}>{tabLabel(tab)}</span>
              <span className={styles.tabCount}>{count}</span>
              <ChevronRight className={styles.tabChevron} aria-hidden="true" />
            </button>;
          })}
        </nav>
      </div>
      {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
      <div id={`material-panel-${activeTab}`} role="tabpanel" aria-labelledby={`material-tab-${activeTab}`} tabIndex={-1}>
        {listTab && <>
          <FilterBar label={t("community.materials.catalog.search")} className={`${styles.catalogFilters} ${activeTab === "bibliography" ? styles.bibliographyFilters : ""}`}>
            <FilterSearch label={t("community.materials.catalog.search")} value={search} onChange={setSearch} placeholder={t("community.materials.catalog.searchPlaceholder")} />
            {activeTab === "bibliography" && <FilterSegmented label={t("community.materials.catalog.format.label")} value={formatFilter} onChange={setFormatFilter} options={[{ value: "all", label: t("community.materials.catalog.format.all") }, ...formats.map((format) => ({ value: format, label: formatLabel(format), count: formatCounts[format] }))]} />}
            {unitLessons.length > 0 && <FilterSelect label={t("community.materials.catalog.lesson")} value={lessonFilter} onChange={setLessonFilter} defaultValue="" options={[{ value: "", label: t("community.materials.catalog.allLessons") }, ...unitLessons.map((lesson) => ({ value: lesson.code, label: `${lesson.code} · ${lesson.title}` }))]} />}
            <FilterSelect label={t("community.materials.catalog.editorialStatus")} value={verificationFilter} onChange={(value) => setVerificationFilter(value as typeof verificationFilter)} options={[{ value: "all", label: t("community.materials.catalog.allStatuses") }, ...(favoritesEnabled ? [{ value: "favorites", label: t("community.materials.favorites") }] : []), { value: "recommended", label: t("community.materials.catalog.recommendedOnly") }, { value: "verified", label: t("community.materials.catalog.verified") }, { value: "original", label: t("community.materials.catalog.original") }, { value: "pending", label: t("community.materials.catalog.pending") }]} />
            <FilterSelect label={t("community.materials.catalog.sort")} value={sortOrder} onChange={setSortOrder} defaultValue="lesson" options={[{ value: "lesson", label: t("community.materials.catalog.sort.lesson") }, { value: "views", label: t("community.materials.catalog.sort.views") }, { value: "recent", label: t("community.materials.catalog.sort.recent") }]} />
          </FilterBar>
          <div className={styles.resourceList}>
            {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : error ? <div className={list.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : visible.length ? pageGroups.map((group) => <div className={list.group} key={group.key || "other"}>
              {group.title && <h3 className={list.groupTitle}>{group.title}</h3>}
              <ul className={list.rows}>{group.items.map((item) => <li className={`${list.row} ${styles.materialRow}`} key={item.id} data-tone={item.verification === "verified" ? "success" : item.verification === "pending" ? "accent" : undefined}>
                <span className={list.rowIcon} aria-hidden="true">{(() => { const Icon = SECTION_ICON[catalogSection(item)]; return <Icon />; })()}</span>
                <div className={list.rowMain}>
                  <h3>{item.viewUrl ? <a className={`link-quiet ${list.titleLink} ${styles.materialTitle}`} href={materialReaderHref(item.id)} target="_blank" rel="noopener">{item.title}</a> : item.downloadUrl ? <a className={`link-quiet ${list.titleLink} ${styles.materialTitle}`} href={item.downloadUrl} onClick={() => void recordOpening(item)} download={item.fileName || true}>{item.title}</a> : <span className={`${list.titleLink} ${styles.materialTitle}`}>{item.title}</span>}</h3>
                  <div className={styles.metadata}><p className={list.rowMeta} title={resourceFacts(item)}>{resourceMeta(item)}</p><MaterialViews count={item.views} /></div>
                  {catalogSection(item) !== "bibliography" && linkedBibliography(item).length > 0 && <details className={styles.linkedBibliography}><summary><BookOpen aria-hidden="true" />{tabLabel("bibliography")} <span>({linkedBibliography(item).length})</span></summary><div>
                    {linkedBibliography(item).map((excerpt) => <a key={excerpt.id} className={styles.linkedChip} href={excerpt.viewUrl ? materialReaderHref(excerpt.id) : excerpt.downloadUrl || undefined} target={excerpt.viewUrl ? "_blank" : undefined} rel="noopener" download={excerpt.viewUrl ? undefined : excerpt.fileName || true} title={excerpt.title} onClick={() => { if (!excerpt.viewUrl) void recordOpening(excerpt); }}>{excerptLabel(excerpt)}</a>)}
                  </div></details>}
                </div>
                <span className={list.rowEnd}>
                  {favoritesEnabled && <button type="button" className={`${list.rowAction} ${styles.star}`} data-icon-only="true" aria-pressed={Boolean(item.favorite)} aria-label={`${t(item.favorite ? "community.materials.unfavorite" : "community.materials.favorite")} · ${item.title}`} title={t(item.favorite ? "community.materials.unfavorite" : "community.materials.favorite")} onClick={() => void toggleFavorite(item)}><Star aria-hidden="true" /></button>}
                  {item.downloadUrl && <span className={list.rowActions}>
                    <a className={list.rowAction} data-icon-only="true" href={item.downloadUrl} onClick={() => void recordOpening(item)} download={item.fileName || true} aria-label={`Descarregar · ${item.title}`} title="Descarregar"><Download aria-hidden="true" /></a>
                  </span>}
                  {item.verification === "verified"
                    ? <span className={list.statusIcon} data-tone="success" role="img" aria-label={verificationLabel(item.verification)} title={verificationLabel(item.verification)}><CheckCircle2 aria-hidden="true" /></span>
                    : <span className={list.statusPill} data-tone={item.verification === "pending" ? "accent" : undefined}>{verificationLabel(item.verification)}</span>}
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
                <MaterialViews count={selectedDeck?.views} />
              </div>
              {selectedDeck?.downloadUrl ? <a className="button button--secondary button--compact" href={selectedDeck.downloadUrl} onClick={() => void recordDeckOpening(selectedDeck)} download><Download aria-hidden="true" />Descarregar pacote</a> : selectedDeck && <span className={styles.pending}>{t("community.materials.catalog.ankiStoragePending")}</span>}
            </li>
          </ul>}
        </>}
        {activeTab === "exams" && examsPanel}
      </div>
    </section>
  </>;
}
