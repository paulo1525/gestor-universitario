"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CircleCheck, ChevronLeft, ChevronRight, ClipboardCheck, Download, ExternalLink, FileText, GraduationCap, Library, NotebookPen, Package, Presentation, ScrollText, Star, Video, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { FilterBar, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import { MaterialViews } from "@/components/material-views";
import { subscribeMaterialViews, trackMaterialView } from "@/lib/material-views";
import { materialReaderHref } from "@/lib/material-reader";
import { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory, type MaterialResourceCategory } from "@/lib/material-categories";
import { MATERIAL_FOLDER_GROUPS, materialFolderCount, materialVideoFolder, VIDEO_FOLDERS, type VideoFolder } from "@/lib/material-folders";
import { groupSebentas, sebentaChapterRange, sebentaDisplayTitle, sebentaPageCount } from "@/lib/material-sebentas";
import styles from "@/components/material-catalog.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, useHashRecord } from "@/components/record-list";
import { UnitThumb } from "@/components/unit-thumb";
import { clampPage, Pagination } from "@/components/pagination";

const RESOURCE_PAGE_SIZE = 10;
const UNIT_PAGE_SIZE = 12;

export type MaterialCatalogTab = VideoFolder | "videos" | MaterialResourceCategory | "overview" | "summaries" | "notes" | "slides" | "sebentas" | "compendiums" | "bibliography" | "anki" | "exams" | "other";
/** List sections backed by catalogue items; every item belongs to exactly one. */
type CatalogSection = VideoFolder | MaterialResourceCategory | "summaries" | "notes" | "slides" | "sebentas" | "compendiums" | "bibliography" | "other";
/** Unit offered in the picker; `code` is the stable key shared by the catalogue and the submissions. */
export type MaterialUnitOption = { id: string; code: string; name: string; year?: number | null; semester?: number | null };
type BibliographyFormat = "complete" | "excerpt" | "translation";
type CatalogItem = { studyCategory?: "sebenta" | null; views?: number | null; updatedAt?: number; id: string; kind: string; resourceCategory?: MaterialResourceCategory | null; bibliographyFormat?: BibliographyFormat | null; summaryFormat?: "lecture" | "notes" | null; favorite?: boolean; completed?: boolean; isLink?: boolean; otherFormat?: "slides" | "compendium" | null; title: string; description?: string; fileName?: string; mimeType?: string; downloadUrl?: string | null; viewUrl?: string | null; verification?: "original" | "verified" | "pending" | string; recommended?: boolean; unitCode?: string | null; unitId?: string | null; unitName?: string | null; lessonCode?: string | null; lessonCodes?: string[]; storage?: { backend?: string; state?: string; ready?: boolean }; source?: { title?: string; edition?: string; author?: string } | null; pages?: { printedStart?: string; printedEnd?: string; physicalStart?: string; physicalEnd?: string; note?: string | null } };
type Lesson = { id: string; unitId?: string; code: string; title: string; type: string; cardCount?: number };
type Deck = { views?: number | null; id: string; unitId?: string | null; title: string; description: string; cardCount: number; mediaCount: number; downloadUrl?: string | null; storage: { state: string; ready: boolean }; lessons: Array<{ id: string; code: string; title: string; cardCount: number }> };

const RESOURCE_ICON: Record<MaterialResourceCategory, LucideIcon> = { information: FileText, theory: GraduationCap, tutorials: GraduationCap, practical: GraduationCap, support: BookOpen, seminars: GraduationCap, assessment: ClipboardCheck };
const VIDEO_ICON = { videos: Video, "video-theory": Video, "video-practical": Video, "video-other": Video };
const TAB_ICON: Record<Exclude<MaterialCatalogTab, "overview">, LucideIcon> = { ...VIDEO_ICON, ...RESOURCE_ICON, summaries: ScrollText, notes: NotebookPen, slides: Presentation, sebentas: NotebookPen, compendiums: Library, bibliography: BookOpen, anki: Package, exams: ClipboardCheck, other: FileText };
const listSections: CatalogSection[] = [...VIDEO_FOLDERS, ...MATERIAL_RESOURCE_CATEGORIES, "summaries", "notes", "slides", "sebentas", "compendiums", "bibliography", "other"];
const SECTION_ICON: Record<CatalogSection | "anki", LucideIcon> = { ...VIDEO_ICON, ...RESOURCE_ICON, summaries: ScrollText, notes: NotebookPen, slides: Presentation, sebentas: NotebookPen, compendiums: Library, bibliography: BookOpen, anki: Package, other: FileText };
const formats: BibliographyFormat[] = ["complete", "excerpt", "translation"];
export const GENERAL_MATERIAL_UNIT = "__general";

export function normalizeMaterialUnitCode(value: string | null | undefined) {
  return String(value || "").trim().toLocaleUpperCase("pt-PT");
}

/** PowerPoints and compendiums come from other_format (migration 0076); loose .pptx files and titled compendiums are recognised too. */
function catalogSection(item: CatalogItem): CatalogSection {
  const video = materialVideoFolder(item);
  if (video) return video;
  if (item.studyCategory === "sebenta") return "sebentas";
  const category = materialResourceCategory(item.resourceCategory);
  if (category) return category;
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
  const tabLabel = (tab: MaterialCatalogTab) => tab === "videos" || tab.startsWith("video-") ? t(`publicMaterials.section.${tab}` as "publicMaterials.section.videos") : tab === "overview" ? t("community.materials.catalog.allFiles") : t(`community.materials.catalog.tab.${tab}` as "community.materials.catalog.tab.overview");
  // Older links (#recurso-<id>, #ler-<id>) now open the annotator page.
  const [legacyResourceId] = useHashRecord("recurso", { scroll: false });
  const [legacyReadId] = useHashRecord("ler", { scroll: false });
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]), [lessons, setLessons] = useState<Lesson[]>([]), [decks, setDecks] = useState<Deck[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [catalogAttempt, setCatalogAttempt] = useState(0), [search, setSearch] = useState(""), [lessonFilter, setLessonFilter] = useState(""), [verificationFilter, setVerificationFilter] = useState<"all" | "favorites" | "completed" | "pending-study" | "recommended" | "original" | "verified" | "pending">("all"), [formatFilter, setFormatFilter] = useState<"all" | BibliographyFormat>("all"), [unitSearch, setUnitSearch] = useState(""), [favoritesEnabled, setFavoritesEnabled] = useState(false), [completionsEnabled, setCompletionsEnabled] = useState(false);
  const [sortOrder, setSortOrder] = useState("lesson");
  const loadCatalog = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/material-catalog", { cache: "no-store", signal });
      const data = await response.json() as { items?: CatalogItem[]; lessons?: Lesson[]; decks?: Deck[]; capabilities?: { favorites?: boolean; completions?: boolean }; error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.catalog.loadError"));
      if (signal.aborted) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setLessons(Array.isArray(data.lessons) ? data.lessons : []);
      setDecks(Array.isArray(data.decks) ? data.decks : []);
      setFavoritesEnabled(Boolean(data.capabilities?.favorites));
      setCompletionsEnabled(Boolean(data.capabilities?.completions));
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
  const countFor = useCallback((unit: MaterialUnitOption) => {
    const code = normalizeMaterialUnitCode(unit.code);
    const catalogCount = items.filter((item) => normalizeMaterialUnitCode(item.unitCode) === code || item.unitId === unit.id).length;
    const deckCount = decks.filter((deck) => deck.unitId === unit.id).length;
    return catalogCount + deckCount + (submissionCounts[code] || 0);
  }, [decks, items, submissionCounts]);

  const listTab = (listSections as string[]).includes(activeTab);
  const filtered = useMemo(() => {
    const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
    const normalizedSearch = normalizeSearch(search.trim());
    return unitItems.filter((item) => {
      const itemLessons = item.lessonCodes?.length ? item.lessonCodes : item.lessonCode ? [item.lessonCode] : [];
      const searchable = normalizeSearch(`${item.title} ${item.description || ""} ${item.source?.title || ""} ${item.source?.author || ""} ${itemLessons.join(" ")} ${item.pages?.note || ""}`);
      return (activeTab === "overview" || catalogSection(item) === activeTab) &&
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (!lessonFilter || itemLessons.includes(lessonFilter)) &&
        (verificationFilter === "all" || (verificationFilter === "favorites" ? item.favorite : verificationFilter === "completed" ? item.completed : verificationFilter === "pending-study" ? !item.isLink && !item.completed : verificationFilter === "recommended" ? item.recommended : item.verification === verificationFilter));
    }).sort((a, b) => (sortOrder === "views" ? (b.views || 0) - (a.views || 0) : sortOrder === "recent" ? (b.updatedAt || 0) - (a.updatedAt || 0) : 0) || compareCatalogItems(a, b));
  }, [activeTab, lessonFilter, search, unitItems, verificationFilter, sortOrder]);
  const formatCounts = useMemo(() => Object.fromEntries(formats.map((format) => [format, filtered.filter((item) => bibliographyFormat(item) === format).length])) as Record<BibliographyFormat, number>, [filtered]);
  const visible = useMemo(() => activeTab === "bibliography" && formatFilter !== "all" ? filtered.filter((item) => bibliographyFormat(item) === formatFilter) : filtered, [activeTab, filtered, formatFilter]);
  // Translation-only view is organized by lesson so the sequence is visibly chronological.
  // Other bibliography views stay grouped by book.
  const groups = useMemo(() => {
    if (activeTab === "sebentas") return groupSebentas(visible, t("community.materials.catalog.otherSebentas"), sortOrder === "lesson");
    if (activeTab.startsWith("video-")) {
      const videoGroups = new Map<string, { key: string; title: string; items: CatalogItem[] }>();
      for (const item of visible) {
        const code = primaryLessonCode(item);
        const key = code || "complements";
        if (!videoGroups.has(key)) videoGroups.set(key, { key, title: code || "Complementos", items: [] });
        videoGroups.get(key)!.items.push(item);
      }
      return [...videoGroups.values()];
    }
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
    const counts = Object.fromEntries(listSections.map((section) => [section, 0])) as Record<CatalogSection, number>;
    for (const item of unitItems) counts[catalogSection(item)] += 1;
    return { ...counts, anki: unitDecks.length, exams: submissionCounts[unitCode] || 0 };
  }, [unitDecks.length, unitItems, submissionCounts, unitCode]);
  const label = (item: CatalogItem) => { const section = catalogSection(item); return section === "other" ? t("community.materials.catalog.tab.overview") : tabLabel(section); };
  const formatLabel = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}` as "community.materials.catalog.format.complete");
  const formatBadge = (format: BibliographyFormat) => t(`community.materials.catalog.format.${format}Badge` as "community.materials.catalog.format.completeBadge");
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
  // Same optimistic pattern for "completed"; external links never show the toggle.
  const toggleCompleted = async (item: CatalogItem) => {
    const next = !item.completed;
    const flip = (value: boolean) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, completed: value } : entry));
    flip(next);
    try {
      const response = await fetch(`/api/material-catalog/${encodeURIComponent(item.id)}/complete`, { method: next ? "POST" : "DELETE" });
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
    if (item.studyCategory === "sebenta") {
      const pages = sebentaPageCount(item);
      const range = sebentaChapterRange(item);
      const note = /Nota:\s*(.+)$/i.exec(item.description || "")?.[1];
      return [pages && t("community.materials.catalog.pageCount", { count: pages }), range ? t("community.materials.catalog.chapterRange", range) : lessonsOf.join(" · "), note, availability].filter(Boolean).join(" · ");
    }
    return [item.kind === "bibliography" ? formatBadge(bibliographyFormat(item)) : label(item), printed, item.recommended ? "recomendado" : "", item.source?.author, lessonsOf.join(" · "), availability].filter(Boolean).join(" · ");
  };
  // Full reference (formerly the detail card) as the row's tooltip.
  const resourceFacts = (item: CatalogItem) => [
    item.studyCategory === "sebenta" && item.description,
    item.studyCategory === "sebenta" && (item.lessonCodes || []).join(" · "),
    item.source?.title && `Obra: ${item.source.title}${item.source.edition ? ` · ${item.source.edition}` : ""}`,
    item.source?.author && `Autoria: ${item.source.author}`,
    (item.pages?.printedStart || item.pages?.printedEnd) && `Páginas impressas: ${item.pages?.printedStart}–${item.pages?.printedEnd}`,
    (item.pages?.physicalStart || item.pages?.physicalEnd) && `Páginas físicas: ${item.pages?.physicalStart}–${item.pages?.physicalEnd}`,
    item.pages?.note && `Nota: ${item.pages.note}`,
  ].filter(Boolean).join("\n") || undefined;

  // Step 1: choose the curricular unit.
  if (!selectedUnit) {
    const term = unitSearch.trim().toLocaleLowerCase("pt-PT");
    const showOsmosis = !term || "videos osmosis google drive".includes(term.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
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
      {showOsmosis && <div className={list.group}>
        <h3 className={list.groupTitle}>Coleções de vídeos</h3>
        <ul className={list.rows}>
          <li className={list.row}>
            <span className={list.rowIcon} aria-hidden="true"><Video /></span>
            <div className={list.rowMain}>
              <h3><a className={`link-quiet ${list.titleLink}`} href="https://drive.google.com/drive/folders/1FA-iBD8tIldAsPE3GYXacbYwvqw866AA?usp=sharing" target="_blank" rel="noopener noreferrer">Vídeos OSMOSIS</a></h3>
              <p className={list.rowMeta}>Pasta partilhada na Google Drive · coleção parcial</p>
            </div>
            <ExternalLink className={list.rowArrow} aria-label="Abre numa nova janela" />
          </li>
        </ul>
      </div>}
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
      </div>) : !showOsmosis && <div className={list.empty}><GraduationCap /><strong>{t("community.materials.catalog.unit.empty")}</strong></div>}
      {!loading && <Pagination page={currentUnitPage} totalItems={matching.length} pageSize={UNIT_PAGE_SIZE} onChange={setUnitPage} />}
    </section>;
  }

  // Step 2: choose a material type. Files stay hidden until a type is opened.
  const unitTitle = selectedUnit.code === GENERAL_MATERIAL_UNIT ? selectedUnit.name : `${selectedUnit.code} · ${selectedUnit.name}`;
  const folderButton = (tab: Exclude<MaterialCatalogTab, "overview">) => {
    const Icon = TAB_ICON[tab];
    return <button id={`material-tab-${tab}`} key={tab} type="button" className={styles.tab} onClick={() => { setSearch(""); setLessonFilter(""); onTabChange(tab); }}>
      <span className={styles.tabIcon} aria-hidden="true"><Icon /></span>
      <span className={styles.tabLabel}>{tabLabel(tab)}</span>
      <span className={styles.tabCount}>{materialFolderCount(tab, stats)}</span>
      <ChevronRight className={styles.tabChevron} aria-hidden="true" />
    </button>;
  };
  if (activeTab === "overview" || activeTab === "videos") {
    return <>
      <button className={list.back} type="button" onClick={() => activeTab === "videos" ? onTabChange("overview") : onUnitChange("")}><ChevronLeft aria-hidden="true" />{activeTab === "videos" ? selectedUnit.name : t("community.materials.catalog.unit.change")}</button>
      <section className={styles.catalog} aria-label={unitTitle}>
        <div className={styles.head}>
          <h2 className={styles.unitTitle}>{activeTab === "videos" ? <Video aria-hidden="true" /> : <UnitThumb id={selectedUnit.id} code={selectedUnit.code} name={selectedUnit.name} />}<span>{activeTab === "videos" ? `${selectedUnit.name} · ${tabLabel("videos")}` : selectedUnit.name}</span></h2>
          <nav className={styles.tabs} aria-label={t("community.materials.title")}>
            {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : activeTab === "videos" ? VIDEO_FOLDERS.filter((tab) => stats[tab] > 0).map(folderButton) : MATERIAL_FOLDER_GROUPS.map((group) => {
              const folders = group.sections.filter((tab) => materialFolderCount(tab, stats) > 0);
              return folders.length ? <div key={group.key}><h3 className={list.groupTitle}>{t(`publicMaterials.group.${group.key}`)}</h3>{folders.map(folderButton)}</div> : null;
            })}
            {!loading && !error && unitItems.length + unitDecks.length + stats.exams === 0 && <div className={list.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong></div>}
          </nav>
        </div>
        {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
      </section>
    </>;
  }

  const ActiveIcon = TAB_ICON[activeTab as Exclude<MaterialCatalogTab, "overview">];
  return <>
    <button className={list.back} type="button" onClick={() => onTabChange(activeTab.startsWith("video-") ? "videos" : "overview")}><ChevronLeft aria-hidden="true" />{activeTab.startsWith("video-") ? tabLabel("videos") : "Materiais de estudo"}</button>
    <section className={styles.catalog} aria-label={`${unitTitle} · ${tabLabel(activeTab)}`}>
      <div className={styles.detailHead}>
        <span className={styles.tabIcon} aria-hidden="true"><ActiveIcon /></span>
        <div>
          <span className={styles.detailUnit}>{selectedUnit.name}</span>
          <h2>{tabLabel(activeTab)}</h2>
        </div>
      </div>
      {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><div><strong>{t("community.materials.catalog.loadError")}</strong><span>{error}</span></div><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div>}
      <div id={`material-panel-${activeTab}`} tabIndex={-1}>
        {listTab && <>
          <FilterBar label={t("community.materials.catalog.search")} className={`${styles.catalogFilters} ${activeTab === "bibliography" ? styles.bibliographyFilters : ""}`}>
            <FilterSearch label={t("community.materials.catalog.search")} value={search} onChange={setSearch} placeholder={t("community.materials.catalog.searchPlaceholder")} />
            {activeTab === "bibliography" && <FilterSegmented label={t("community.materials.catalog.format.label")} value={formatFilter} onChange={setFormatFilter} options={[{ value: "all", label: t("community.materials.catalog.format.all") }, ...formats.filter((format) => formatCounts[format] > 0).map((format) => ({ value: format, label: formatLabel(format), count: formatCounts[format] }))]} />}
            {unitLessons.length > 0 && <FilterSelect label={t("community.materials.catalog.lesson")} value={lessonFilter} onChange={setLessonFilter} defaultValue="" options={[{ value: "", label: t("community.materials.catalog.allLessons") }, ...unitLessons.map((lesson) => ({ value: lesson.code, label: `${lesson.code} · ${lesson.title}` }))]} />}
            <FilterSelect label={t("community.materials.catalog.editorialStatus")} value={verificationFilter} onChange={(value) => setVerificationFilter(value as typeof verificationFilter)} options={[{ value: "all", label: t("community.materials.catalog.allStatuses") }, ...(favoritesEnabled ? [{ value: "favorites", label: t("community.materials.favorites") }] : []), ...(completionsEnabled ? [{ value: "completed", label: t("community.materials.catalog.completedOnly") }, { value: "pending-study", label: t("community.materials.catalog.notCompletedOnly") }] : []), { value: "recommended", label: t("community.materials.catalog.recommendedOnly") }]} />
            <FilterSelect label={t("community.materials.catalog.sort")} value={sortOrder} onChange={setSortOrder} defaultValue="lesson" options={[{ value: "lesson", label: t("community.materials.catalog.sort.lesson") }, { value: "views", label: t("community.materials.catalog.sort.views") }, { value: "recent", label: t("community.materials.catalog.sort.recent") }]} />
          </FilterBar>
          <div className={styles.resourceList}>
            {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} /> : error ? <div className={list.empty} role="alert"><FileText /><strong>{t("community.materials.catalog.loadError")}</strong><button className="button button--ghost button--compact" type="button" onClick={retryCatalog}>{t("community.materials.catalog.retry")}</button></div> : visible.length ? pageGroups.map((group) => <div className={list.group} key={group.key || "other"}>
              {group.title && <h3 className={list.groupTitle}>{group.title}</h3>}
              <ul className={list.rows}>{group.items.map((item) => <li className={`${list.row} ${styles.materialRow}`} key={item.id} data-completed={item.completed || undefined} data-tone={item.verification === "verified" ? "success" : item.verification === "pending" ? "accent" : undefined}>
                <span className={list.rowIcon} aria-hidden="true">{(() => { const Icon = SECTION_ICON[catalogSection(item)]; return <Icon />; })()}</span>
                <div className={list.rowMain}>
                  <h3>{item.viewUrl ? <a className={`link-quiet ${list.titleLink} ${styles.materialTitle}`} href={materialReaderHref(item.id, item)} target="_blank" rel="noopener">{activeTab === "sebentas" ? sebentaDisplayTitle(item) : item.title}</a> : item.downloadUrl ? <a className={`link-quiet ${list.titleLink} ${styles.materialTitle}`} href={item.downloadUrl} onClick={() => void recordOpening(item)} download={item.fileName || true}>{activeTab === "sebentas" ? sebentaDisplayTitle(item) : item.title}</a> : <span className={`${list.titleLink} ${styles.materialTitle}`}>{activeTab === "sebentas" ? sebentaDisplayTitle(item) : item.title}</span>}</h3>
                  <div className={styles.metadata}><p className={list.rowMeta} title={resourceFacts(item)}>{resourceMeta(item)}</p><MaterialViews count={item.views} /></div>
                  {catalogSection(item) !== "bibliography" && linkedBibliography(item).length > 0 && <details className={styles.linkedBibliography}><summary><BookOpen aria-hidden="true" />{tabLabel("bibliography")} <span>({linkedBibliography(item).length})</span></summary><div>
                    {linkedBibliography(item).map((excerpt) => <a key={excerpt.id} className={styles.linkedChip} href={excerpt.viewUrl ? materialReaderHref(excerpt.id, excerpt) : excerpt.downloadUrl || undefined} target={excerpt.viewUrl ? "_blank" : undefined} rel="noopener" download={excerpt.viewUrl ? undefined : excerpt.fileName || true} title={excerpt.title} onClick={() => { if (!excerpt.viewUrl) void recordOpening(excerpt); }}>{excerptLabel(excerpt)}</a>)}
                  </div></details>}
                </div>
                <span className={list.rowEnd}>
                  {completionsEnabled && !item.isLink && <button type="button" className={`${list.rowAction} ${styles.complete}`} data-icon-only="true" aria-pressed={Boolean(item.completed)} aria-label={`${t(item.completed ? "community.materials.catalog.uncomplete" : "community.materials.catalog.complete")} · ${item.title}`} title={t(item.completed ? "community.materials.catalog.uncomplete" : "community.materials.catalog.complete")} onClick={() => void toggleCompleted(item)}><CircleCheck aria-hidden="true" /></button>}
                  {favoritesEnabled && <button type="button" className={`${list.rowAction} ${styles.star}`} data-icon-only="true" aria-pressed={Boolean(item.favorite)} aria-label={`${t(item.favorite ? "community.materials.unfavorite" : "community.materials.favorite")} · ${item.title}`} title={t(item.favorite ? "community.materials.unfavorite" : "community.materials.favorite")} onClick={() => void toggleFavorite(item)}><Star aria-hidden="true" /></button>}
                  {item.downloadUrl && <span className={list.rowActions}>
                    <a className={list.rowAction} data-icon-only="true" href={item.downloadUrl} onClick={() => void recordOpening(item)} download={item.fileName || true} aria-label={`Descarregar · ${item.title}`} title="Descarregar"><Download aria-hidden="true" /></a>
                  </span>}
                  {item.verification === "pending" && <span className={list.statusPill} data-tone="accent">{t("community.materials.catalog.pending")}</span>}
                </span>
              </li>)}</ul>
            </div>) : <div className={list.empty}><FileText /><strong>{t("community.materials.catalog.empty")}</strong></div>}
            {!loading && !error && <Pagination page={currentResourcePage} totalItems={orderedResources.length} pageSize={RESOURCE_PAGE_SIZE} onChange={setResourcePage} />}
          </div>
        </>}
        {activeTab === "anki" && <>
          {loading ? <RecordSkeleton label={t("community.materials.catalog.loading")} rows={1} /> : unitDecks.length ? <ul className={list.rows}>
            {unitDecks.map((deck) => <li key={deck.id} className={list.row} data-tone={deck.downloadUrl ? "success" : undefined}>
              <span className={list.rowIcon} aria-hidden="true"><Package /></span>
              <div className={list.rowMain}>
                <h3>{deck.title}</h3>
                <p className={list.rowMeta}>{deck.cardCount} {t("community.materials.catalog.cards")}</p>
                <MaterialViews count={deck.views} />
              </div>
              {deck.downloadUrl ? <a className="button button--secondary button--compact" href={deck.downloadUrl} onClick={() => void recordDeckOpening(deck)} download><Download aria-hidden="true" />Descarregar pacote</a> : <span className={styles.pending}>{t("community.materials.catalog.ankiStoragePending")}</span>}
            </li>)}
          </ul> : <div className={list.empty}><Package aria-hidden="true" /><strong>{t("community.materials.catalog.ankiUnitPending")}</strong></div>}
        </>}
        {activeTab === "exams" && examsPanel}
      </div>
    </section>
  </>;
}
