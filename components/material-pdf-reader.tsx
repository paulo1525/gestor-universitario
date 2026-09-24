"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, ExternalLink, Highlighter, ListTree, Minus, MousePointer2, PanelRightClose, PanelRightOpen, Plus, Search, SquareDashed, Trash2, X } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import styles from "@/components/material-pdf-reader.module.css";

type HighlightColor = "gold" | "blue" | "green" | "rose";
type Rect = { x: number; y: number; width: number; height: number };
type Highlight = Rect & {
  id: string;
  page: number;
  rects?: Rect[];
  color: HighlightColor;
  selectedText?: string | null;
  note?: string | null;
  createdAt?: number;
};
type Tool = "text" | "area";
type Zoom = "width" | "page" | number;
type PageSize = { width: number; height: number };
type PendingSelection = { page: number; rects: Rect[]; text: string; anchor: { left: number; top: number } };
type PdfJs = typeof import("pdfjs-dist");

const COLORS: Array<{ value: HighlightColor; label: string }> = [
  { value: "gold", label: "Amarelo" },
  { value: "green", label: "Verde" },
  { value: "blue", label: "Azul" },
  { value: "rose", label: "Rosa" },
];
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PAGE_GAP = 16;

// The legacy build ships the polyfills (e.g. Map#getOrInsertComputed) that
// Safari and older Chromium/Firefox releases still lack.
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((module) => {
    const pdfjs = module as unknown as PdfJs;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-PT").replace(/\s+/g, " ").trim();
}

function rectangle(start: { x: number; y: number }, end: { x: number; y: number }): Rect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

function boundingBox(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Joins the per-span rectangles of a selection into one rectangle per line. */
function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Rect[] = [];
  for (const rect of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y + candidate.height / 2 - (rect.y + rect.height / 2)) < Math.max(candidate.height, rect.height) * 0.5);
    if (!line) { lines.push({ ...rect }); continue; }
    const merged = boundingBox([line, rect]);
    Object.assign(line, merged);
  }
  return lines.map((rect) => ({ x: clamp01(rect.x), y: clamp01(rect.y), width: Math.min(rect.width, 1 - clamp01(rect.x)), height: Math.min(rect.height, 1 - clamp01(rect.y)) })).filter((rect) => rect.width > 0.002 && rect.height > 0.002);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function highlightRects(highlight: Highlight): Rect[] {
  return highlight.rects?.length ? highlight.rects : [{ x: highlight.x, y: highlight.y, width: highlight.width, height: highlight.height }];
}

function storageGet(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode: position is not remembered */ }
}

export function MaterialPdfReader({ materialId, title, viewUrl, onClose }: { materialId: string; title: string; viewUrl: string; onClose: () => void }) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [baseSize, setBaseSize] = useState<PageSize | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [zoom, setZoom] = useState<Zoom>(() => {
    const saved = typeof window === "undefined" ? null : storageGet("gu-pdf-zoom");
    return saved === "page" ? "page" : saved && Number(saved) > 0 ? Number(saved) : "width";
  });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [tool, setTool] = useState<Tool>("text");
  const [color, setColor] = useState<HighlightColor>("gold");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Highlight | null>(null);
  const [removing, setRemoving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 900px)").matches);
  const [colorFilter, setColorFilter] = useState<HighlightColor | "all">("all");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{ query: string; pages: number[]; index: number; searching: boolean }>({ query: "", pages: [], index: 0, searching: false });
  const dialogRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const textCache = useRef(new Map<number, string>());
  const restoredRef = useRef(false);
  const endpoint = `/api/material-catalog/${encodeURIComponent(materialId)}/highlights`;
  const numPages = pdfDocument?.numPages ?? 0;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Document and highlights load in parallel.
  useEffect(() => {
    let active = true;
    let loadingTask: ReturnType<PdfJs["getDocument"]> | undefined;
    loadPdfJs().then(async (library) => {
      if (!active) return;
      setPdfjs(library);
      loadingTask = library.getDocument({ url: viewUrl, withCredentials: true, disableRange: true, disableStream: true });
      const document = await loadingTask.promise;
      const first = await document.getPage(1);
      const size = first.getViewport({ scale: 1 });
      if (!active) return;
      setBaseSize({ width: size.width, height: size.height });
      setPdfDocument(document);
    }).catch((reason) => {
      if (active) setPdfError(reason instanceof Error && reason.message ? reason.message : "Não foi possível abrir o PDF.");
    });
    return () => { active = false; void loadingTask?.destroy(); };
  }, [viewUrl]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { highlights?: Highlight[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar os realces.");
        setHighlights(Array.isArray(data.highlights) ? data.highlights : []);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os realces."); })
      .finally(() => { if (!controller.signal.aborted) setHighlightsLoading(false); });
    return () => controller.abort();
  }, [endpoint]);

  // Modal behaviour: body scroll lock, focus return and focus trap.
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-reader-close]")?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const scaleFor = useCallback((size: PageSize | null) => {
    if (!size || !viewport.width) return 1;
    const fitWidth = Math.max(0.2, (viewport.width - 48) / size.width);
    if (zoom === "width") return Math.min(fitWidth, 2.5);
    if (zoom === "page") return Math.max(0.2, Math.min(fitWidth, (viewport.height - 32) / size.height));
    return zoom;
  }, [viewport.height, viewport.width, zoom]);
  const scale = scaleFor(baseSize);

  const scrollToPage = useCallback((page: number, behavior: ScrollBehavior = "smooth", offset = 0) => {
    const element = pageRefs.current.get(page);
    const scroller = scrollerRef.current;
    if (!element || !scroller) return;
    scroller.scrollTo({ top: element.offsetTop - PAGE_GAP + offset, behavior });
  }, []);

  // Restore the last page read in this PDF once the layout exists.
  useEffect(() => {
    if (!pdfDocument || !viewport.width || restoredRef.current) return;
    restoredRef.current = true;
    const saved = Number(storageGet(`gu-pdf-page:${materialId}`));
    if (saved > 1 && saved <= pdfDocument.numPages) window.requestAnimationFrame(() => scrollToPage(saved, "auto"));
  }, [materialId, pdfDocument, scrollToPage, viewport.width]);

  // The current page is the one crossing the upper third of the scroller.
  const updateCurrentPage = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !numPages) return;
    const probe = scroller.scrollTop + scroller.clientHeight / 3;
    let page = 1;
    for (const [number, element] of pageRefs.current) if (element.offsetTop <= probe && number > page) page = number;
    setCurrentPage((previous) => {
      if (previous !== page) { setPageInput(String(page)); storageSet(`gu-pdf-page:${materialId}`, String(page)); }
      return page;
    });
  }, [materialId, numPages]);

  useEffect(() => { updateCurrentPage(); }, [scale, updateCurrentPage]);

  const changeZoom = useCallback((next: Zoom) => {
    const scroller = scrollerRef.current;
    const anchorPage = currentPage;
    const element = pageRefs.current.get(anchorPage);
    const ratio = element && scroller ? (scroller.scrollTop - element.offsetTop) / Math.max(1, element.offsetHeight) : 0;
    setZoom(next);
    storageSet("gu-pdf-zoom", String(next));
    // Keep the same point of the same page under the reader's eyes.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = pageRefs.current.get(anchorPage);
      if (target && scrollerRef.current) scrollerRef.current.scrollTop = target.offsetTop + ratio * target.offsetHeight;
    }));
  }, [currentPage]);

  const stepZoom = useCallback((direction: 1 | -1) => {
    const current = scale;
    const next = direction > 0 ? ZOOM_STEPS.find((step) => step > current + 0.01) : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01);
    if (next) changeZoom(next);
  }, [changeZoom, scale]);

  const onPageSize = useCallback((page: number, size: PageSize) => {
    setPageSizes((current) => current[page] && current[page].width === size.width && current[page].height === size.height ? current : { ...current, [page]: size });
  }, []);

  // ---- Highlights -------------------------------------------------------
  const createHighlight = useCallback(async (page: number, rects: Rect[], selectedText: string, highlightColor: HighlightColor) => {
    if (!rects.length) return;
    const box = boundingBox(rects);
    setSaving(true);
    setError("");
    try {
      const shape = { ...box, rects };
      const color = highlightColor;
      const note = "";
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, ...shape, color, note, selectedText }) });
      const data = await response.json() as { highlight?: Highlight; error?: string };
      if (!response.ok || !data.highlight) throw new Error(data.error || "Não foi possível guardar o realce.");
      const created = { ...data.highlight, rects: data.highlight.rects?.length ? data.highlight.rects : rects };
      setHighlights((current) => [...current, created].sort((a, b) => a.page - b.page || a.y - b.y));
      setActiveId(created.id);
      return created;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível guardar o realce.");
    } finally {
      setSaving(false);
    }
  }, [endpoint]);

  const updateHighlight = useCallback(async (highlight: Highlight, changes: { color?: HighlightColor; note?: string }) => {
    const previous = highlight;
    setHighlights((current) => current.map((item) => item.id === highlight.id ? { ...item, ...changes } : item));
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: highlight.id, ...changes }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o realce.");
    } catch (reason) {
      setHighlights((current) => current.map((item) => item.id === previous.id ? previous : item));
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o realce.");
    }
  }, [endpoint]);

  const remove = async (highlight: Highlight) => {
    setError("");
    setRemoving(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: highlight.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível remover o realce.");
      setHighlights((current) => current.filter((item) => item.id !== highlight.id));
      if (activeId === highlight.id) setActiveId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover o realce.");
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  // Text selection inside a page becomes a pending highlight with a colour popover.
  const captureSelection = useCallback(() => {
    if (tool !== "text") return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) { setPending(null); return; }
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const endElement = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
    const pageElement = startElement?.closest<HTMLElement>("[data-pdf-page]");
    const scroller = scrollerRef.current;
    // Only selections that start and end on the same PDF page become highlights.
    if (!pageElement || !scroller || !scroller.contains(pageElement) || endElement?.closest("[data-pdf-page]") !== pageElement) { setPending(null); return; }
    const page = Number(pageElement.dataset.pdfPage);
    const bounds = pageElement.getBoundingClientRect();
    const rects = mergeLineRects(Array.from(range.getClientRects())
      // Line boxes only: the page-sized helper element used while selecting is dropped.
      .filter((rect) => rect.width > 1 && rect.height > 1 && rect.height < bounds.height * 0.1 && rect.bottom > bounds.top && rect.top < bounds.bottom)
      .map((rect) => ({ x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, width: rect.width / bounds.width, height: rect.height / bounds.height })));
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!rects.length || !text) { setPending(null); return; }
    const last = range.getClientRects()[range.getClientRects().length - 1] ?? bounds;
    const host = scroller.getBoundingClientRect();
    const half = Math.min(120, host.width / 2 - 8);
    setPending({ page, rects, text: text.slice(0, 2000), anchor: { left: Math.min(host.width - half, Math.max(half, last.right - host.left)), top: last.bottom - host.top + scroller.scrollTop + 8 } });
  }, [tool]);

  const commitPending = useCallback(async (highlightColor: HighlightColor) => {
    if (!pending) return;
    setColor(highlightColor);
    const selection = pending;
    setPending(null);
    window.getSelection()?.removeAllRanges();
    await createHighlight(selection.page, selection.rects, selection.text, highlightColor);
    setSidebarOpen((open) => open || window.matchMedia("(min-width: 900px)").matches);
  }, [createHighlight, pending]);

  const selectHighlight = useCallback((highlight: Highlight, scroll = true) => {
    setActiveId(highlight.id);
    setSidebarOpen(true);
    if (scroll) {
      const element = pageRefs.current.get(highlight.page);
      scrollToPage(highlight.page, "smooth", element ? Math.max(0, highlight.y * element.offsetHeight - 80) : 0);
    }
    window.requestAnimationFrame(() => document.getElementById(`pdf-highlight-${highlight.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [scrollToPage]);

  // ---- Search -------------------------------------------------------------
  const pageText = useCallback(async (page: number) => {
    const cached = textCache.current.get(page);
    if (cached !== undefined) return cached;
    if (!pdfDocument) return "";
    const content = await (await pdfDocument.getPage(page)).getTextContent();
    const value = normalizeSearch(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    textCache.current.set(page, value);
    return value;
  }, [pdfDocument]);

  useEffect(() => {
    const term = normalizeSearch(query);
    if (!pdfDocument || term.length < 2) { setSearchState({ query: "", pages: [], index: 0, searching: false }); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchState({ query: term, pages: [], index: 0, searching: true });
      const pages: number[] = [];
      for (let page = 1; page <= pdfDocument.numPages && active; page += 1) {
        if ((await pageText(page)).includes(term)) pages.push(page);
        if (page % 25 === 0 && active) setSearchState({ query: term, pages: [...pages], index: 0, searching: true });
      }
      if (!active) return;
      setSearchState({ query: term, pages, index: 0, searching: false });
      if (pages.length) scrollToPage(pages.find((page) => page >= currentPage) ?? pages[0]);
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
    // The search restarts only when the query or the document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDocument, query]);

  const stepSearch = (direction: 1 | -1) => {
    if (!searchState.pages.length) return;
    const index = (searchState.index + direction + searchState.pages.length) % searchState.pages.length;
    setSearchState((current) => ({ ...current, index }));
    scrollToPage(searchState.pages[index]);
  };

  // ---- Keyboard -------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, [contenteditable='true']"));
      if (event.key === "Escape") {
        if (pending) { setPending(null); window.getSelection()?.removeAllRanges(); return; }
        if (removeTarget) return;
        onCloseRef.current();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        return;
      }
      if (typing || event.altKey || removeTarget) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) { event.preventDefault(); stepZoom(1); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === "-") { event.preventDefault(); stepZoom(-1); return; }
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === "+" || event.key === "=") stepZoom(1);
      else if (event.key === "-") stepZoom(-1);
      else if (event.key === "0") changeZoom("width");
      else if (event.key.toLowerCase() === "h") setTool((current) => current === "text" ? "area" : "text");
      else if (event.key === "ArrowRight" || event.key === "n") scrollToPage(Math.min(numPages, currentPage + 1));
      else if (event.key === "ArrowLeft" || event.key === "p") scrollToPage(Math.max(1, currentPage - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeZoom, currentPage, numPages, pending, removeTarget, scrollToPage, stepZoom]);

  // Same technique as the pdf.js viewer: while selecting, the page-sized
  // `endOfContent` element follows the selection end so dragging across the
  // gaps between lines does not make the selection jump to the end of the page.
  useEffect(() => {
    let previousRange: Range | null = null;
    const reset = () => {
      for (const layer of document.querySelectorAll<HTMLElement>("[data-pdf-page] .textLayer")) {
        layer.classList.remove("selecting");
        const end = layer.closest("[data-pdf-page]")?.querySelector<HTMLElement>(".endOfContent");
        if (end && end.parentElement !== layer) layer.appendChild(end);
      }
      previousRange = null;
    };
    const onSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || !selection.rangeCount) { reset(); return; }
      const range = selection.getRangeAt(0);
      const modifyStart = Boolean(previousRange && (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 || range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0));
      let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
      if (anchor?.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
      if (!modifyStart && range.endOffset === 0 && anchor) {
        do {
          while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
          anchor = anchor?.previousSibling ?? null;
        } while (anchor && !anchor.childNodes.length);
      }
      const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement ?? null;
      const layer = element?.closest<HTMLElement>("[data-pdf-page] .textLayer");
      const end = layer?.closest("[data-pdf-page]")?.querySelector<HTMLElement>(".endOfContent");
      if (layer && end && element && element !== layer && element !== end && element.parentElement && layer.contains(element.parentElement)) {
        element.parentElement.insertBefore(end, modifyStart ? element : element.nextSibling);
      }
      previousRange = range.cloneRange();
    };
    const onPointerUp = () => window.setTimeout(() => {
      for (const layer of document.querySelectorAll<HTMLElement>("[data-pdf-page] .textLayer.selecting")) layer.classList.remove("selecting");
    }, 0);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("pointerup", onPointerUp);
    return () => { document.removeEventListener("selectionchange", onSelectionChange); window.removeEventListener("pointerup", onPointerUp); reset(); };
  }, []);

  // ---- Derived --------------------------------------------------------------
  const byPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const highlight of highlights) map.set(highlight.page, [...(map.get(highlight.page) ?? []), highlight]);
    return map;
  }, [highlights]);
  const listed = useMemo(() => highlights.filter((highlight) => colorFilter === "all" || highlight.color === colorFilter), [colorFilter, highlights]);
  const listedGroups = useMemo(() => {
    const groups = new Map<number, Highlight[]>();
    for (const highlight of listed) groups.set(highlight.page, [...(groups.get(highlight.page) ?? []), highlight]);
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [listed]);
  const colorCounts = useMemo(() => Object.fromEntries(COLORS.map(({ value }) => [value, highlights.filter((highlight) => highlight.color === value).length])) as Record<HighlightColor, number>, [highlights]);

  const exportNotes = () => {
    const lines = [`# ${title}`, "", ...listedGroups.flatMap(([page, items]) => [`## Página ${page}`, "", ...items.flatMap((item) => [`- ${item.selectedText ? `“${item.selectedText}”` : "(zona realçada)"} [${COLORS.find((entry) => entry.value === item.color)?.label ?? item.color}]`, ...(item.note ? [`  - ${item.note}`] : [])]), ""])];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "realces"}-realces.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const goToPageInput = () => {
    const page = Math.max(1, Math.min(numPages || 1, Number(pageInput) || 1));
    setPageInput(String(page));
    scrollToPage(page);
  };

  const zoomLabel = zoom === "width" ? "Largura" : zoom === "page" ? "Página" : `${Math.round(zoom * 100)}%`;
  const zoomValue = typeof zoom === "number" ? String(zoom) : zoom;

  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="material-pdf-title" data-sidebar={sidebarOpen ? "open" : "closed"}>
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true"><Highlighter /></span>
        <div className={styles.headerTitle}><span>Leitor de bibliografia</span><h2 id="material-pdf-title" title={title}>{title}</h2></div>
        <div className={styles.headerActions}>
          <a className={styles.iconButton} href={viewUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir PDF original num novo separador" title="Abrir PDF original"><ExternalLink /></a>
          <button className={styles.iconButton} type="button" onClick={() => setSidebarOpen((open) => !open)} aria-pressed={sidebarOpen} aria-controls="pdf-highlights-panel" aria-label={sidebarOpen ? "Esconder realces" : "Mostrar realces"} title={sidebarOpen ? "Esconder realces" : "Mostrar realces"}>{sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}<span className={styles.badgeCount}>{highlights.length}</span></button>
          <button data-reader-close className={styles.iconButton} type="button" onClick={onClose} aria-label="Fechar leitor" title="Fechar (Esc)"><X /></button>
        </div>
      </header>
      <div className={styles.toolbar} role="toolbar" aria-label="Ferramentas de leitura">
        <div className={styles.group}>
          <button className={styles.iconButton} type="button" onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Página anterior" title="Página anterior (←)"><ChevronLeft /></button>
          <form className={styles.pageField} onSubmit={(event) => { event.preventDefault(); goToPageInput(); }}>
            <label htmlFor="pdf-page-input" className={styles.srOnly}>Página</label>
            <input id="pdf-page-input" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, "").slice(0, 5))} onBlur={goToPageInput} aria-describedby="pdf-page-total" />
            <span id="pdf-page-total">/ {numPages || "–"}</span>
          </form>
          <button className={styles.iconButton} type="button" onClick={() => scrollToPage(currentPage + 1)} disabled={!numPages || currentPage >= numPages} aria-label="Página seguinte" title="Página seguinte (→)"><ChevronRight /></button>
        </div>
        <div className={styles.group}>
          <button className={styles.iconButton} type="button" onClick={() => stepZoom(-1)} disabled={scale <= ZOOM_STEPS[0] + 0.01} aria-label="Reduzir" title="Reduzir (−)"><Minus /></button>
          <label htmlFor="pdf-zoom" className={styles.srOnly}>Zoom</label>
          <select id="pdf-zoom" className={styles.zoomSelect} value={ZOOM_STEPS.includes(Number(zoomValue)) || zoom === "width" || zoom === "page" ? zoomValue : "custom"} onChange={(event) => changeZoom(event.target.value === "width" || event.target.value === "page" ? event.target.value : Number(event.target.value))}>
            <option value="width">Ajustar à largura</option>
            <option value="page">Página inteira</option>
            {ZOOM_STEPS.map((step) => <option key={step} value={String(step)}>{Math.round(step * 100)}%</option>)}
            {typeof zoom === "number" && !ZOOM_STEPS.includes(zoom) && <option value="custom">{zoomLabel}</option>}
          </select>
          <button className={styles.iconButton} type="button" onClick={() => stepZoom(1)} disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.01} aria-label="Ampliar" title="Ampliar (+)"><Plus /></button>
        </div>
        <div className={styles.group} role="group" aria-label="Modo de realce">
          <button className={styles.toolButton} type="button" aria-pressed={tool === "text"} onClick={() => setTool("text")} title="Selecionar texto para realçar"><MousePointer2 /><span className={styles.toolLabel}>Texto</span></button>
          <button className={styles.toolButton} type="button" aria-pressed={tool === "area"} onClick={() => { setTool("area"); setPending(null); }} title="Desenhar uma zona (H)"><SquareDashed /><span className={styles.toolLabel}>Zona</span></button>
          <div className={styles.swatches} role="radiogroup" aria-label="Cor do realce">
            {COLORS.map((entry) => <button key={entry.value} type="button" role="radio" className={styles.swatch} data-color={entry.value} aria-checked={color === entry.value} aria-label={entry.label} title={entry.label} onClick={() => setColor(entry.value)} />)}
          </div>
        </div>
        <form className={styles.search} role="search" onSubmit={(event) => { event.preventDefault(); stepSearch(1); }}>
          <Search aria-hidden="true" />
          <label htmlFor="pdf-search" className={styles.srOnly}>Pesquisar no documento</label>
          <input ref={searchRef} id="pdf-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar no documento" autoComplete="off" />
          {searchState.query && <span className={styles.searchCount} aria-live="polite">{searchState.pages.length ? `${searchState.index + 1}/${searchState.pages.length} pág.` : searchState.searching ? "…" : "0"}</span>}
          <button className={styles.iconButton} type="button" onClick={() => stepSearch(-1)} disabled={!searchState.pages.length} aria-label="Resultado anterior"><ChevronUp /></button>
          <button className={styles.iconButton} type="submit" disabled={!searchState.pages.length} aria-label="Resultado seguinte"><ChevronDown /></button>
        </form>
      </div>
      <div className={styles.workspace}>
        <div ref={scrollerRef} className={styles.scroller} data-tool={tool} onScroll={() => { updateCurrentPage(); }} onPointerUp={() => window.setTimeout(captureSelection, 0)} onKeyUp={(event) => { if (event.shiftKey) captureSelection(); }}>
          {pdfError ? <div className={styles.pdfError} role="alert"><strong>Não foi possível abrir este PDF.</strong><span>{pdfError}</span><a className="button button--secondary button--compact" href={viewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Abrir o PDF original</a></div>
            : !pdfDocument || !pdfjs || !baseSize ? <div className={styles.pages} aria-busy="true"><div className={styles.pagePlaceholder} style={{ width: Math.min(760, Math.max(280, viewport.width - 48)), aspectRatio: "1 / 1.414" }} /></div>
              : <div className={styles.pages}>
                {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => {
                  const size = pageSizes[page] ?? baseSize;
                  return <PdfPage
                    key={page}
                    page={page}
                    pdfDocument={pdfDocument}
                    pdfjs={pdfjs}
                    scale={scaleFor(size)}
                    estimatedSize={size}
                    onSize={onPageSize}
                    registerRef={(element) => { if (element) pageRefs.current.set(page, element); else pageRefs.current.delete(page); }}
                    scrollRoot={scrollerRef}
                    highlights={byPage.get(page) ?? []}
                    activeId={activeId}
                    tool={tool}
                    color={color}
                    searchTerm={searchState.query}
                    pendingRects={pending?.page === page ? pending.rects : null}
                    onSelectHighlight={(highlight) => selectHighlight(highlight, false)}
                    onDrawArea={(rect) => { void createHighlight(page, [rect], "", color); setSidebarOpen((open) => open || window.matchMedia("(min-width: 900px)").matches); }}
                  />;
                })}
              </div>}
          {pending && <div className={styles.selectionPopover} style={{ left: pending.anchor.left, top: pending.anchor.top }} role="dialog" aria-label="Realçar seleção" onPointerUp={(event) => event.stopPropagation()}>
            {COLORS.map((entry) => <button key={entry.value} type="button" className={styles.swatch} data-color={entry.value} aria-label={`Realçar a ${entry.label.toLowerCase()}`} title={`Realçar a ${entry.label.toLowerCase()}`} onClick={() => void commitPending(entry.value)} />)}
            <span className={styles.popoverDivider} aria-hidden="true" />
            <button type="button" className={styles.popoverAction} onClick={() => { void navigator.clipboard?.writeText(pending.text); setPending(null); }}>Copiar</button>
          </div>}
          {saving && <span className={styles.saving} role="status">A guardar realce</span>}
        </div>
        <aside id="pdf-highlights-panel" className={styles.sidebar} aria-label="Realces e notas" hidden={!sidebarOpen}>
          <header className={styles.sidebarHeader}>
            <div><ListTree aria-hidden="true" /><h3>Realces</h3><span className={styles.sidebarCount}>{highlights.length}</span></div>
            <button className="button button--secondary button--compact" type="button" onClick={exportNotes} disabled={!listed.length}><Download aria-hidden="true" />Exportar</button>
          </header>
          <div className={styles.colorFilter} role="group" aria-label="Filtrar por cor">
            <button type="button" aria-pressed={colorFilter === "all"} onClick={() => setColorFilter("all")}>Todas</button>
            {COLORS.map((entry) => <button key={entry.value} type="button" aria-pressed={colorFilter === entry.value} onClick={() => setColorFilter(entry.value)} disabled={!colorCounts[entry.value]}><span className={styles.dot} data-color={entry.value} aria-hidden="true" />{entry.label}<b>{colorCounts[entry.value]}</b></button>)}
          </div>
          {error && <p className={styles.error} role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Fechar aviso"><X /></button></p>}
          <div className={styles.highlightList}>
            {highlightsLoading ? <div className={styles.listSkeleton} aria-busy="true"><span /><span /><span /></div>
              : !listed.length ? <div className={styles.emptyList}><Highlighter aria-hidden="true" /><strong>{highlights.length ? "Sem realces nesta cor" : "Ainda sem realces"}</strong><span>{highlights.length ? "" : "Seleciona texto no PDF e escolhe uma cor."}</span></div>
                : listedGroups.map(([page, items]) => <section key={page} className={styles.pageGroup}>
                  <button type="button" className={styles.pageGroupTitle} onClick={() => scrollToPage(page)}>Página {page}<span>{items.length}</span></button>
                  {items.map((highlight) => <HighlightItem key={highlight.id} highlight={highlight} active={activeId === highlight.id} onJump={() => selectHighlight(highlight)} onColor={(value) => void updateHighlight(highlight, { color: value })} onNote={(value) => void updateHighlight(highlight, { note: value })} onRemove={() => setRemoveTarget(highlight)} />)}
                </section>)}
          </div>
        </aside>
      </div>
      <ConfirmationDialog open={Boolean(removeTarget)} eyebrow="" title="Remover este realce?" description="" subject={removeTarget?.selectedText || removeTarget?.note || undefined} subjectLabel={removeTarget?.selectedText ? "Texto" : "Nota"} confirmLabel={removing ? "A remover…" : "Remover"} busy={removing} onClose={() => setRemoveTarget(null)} onConfirm={() => { if (removeTarget) void remove(removeTarget); }} />
    </section>
  </div>;
}

function HighlightItem({ highlight, active, onJump, onColor, onNote, onRemove }: { highlight: Highlight; active: boolean; onJump: () => void; onColor: (color: HighlightColor) => void; onNote: (note: string) => void; onRemove: () => void }) {
  const [note, setNote] = useState(highlight.note ?? "");
  const [editing, setEditing] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setNote(highlight.note ?? ""); }, [editing, highlight.note]);
  useEffect(() => { if (editing) noteRef.current?.focus(); }, [editing]);
  const save = () => {
    setEditing(false);
    if (note.trim() !== (highlight.note ?? "").trim()) onNote(note.trim());
  };
  return <article id={`pdf-highlight-${highlight.id}`} className={styles.highlightItem} data-color={highlight.color} data-active={active || undefined}>
    <button type="button" className={styles.quote} onClick={onJump} title="Ir para o realce">
      {highlight.selectedText ? <q>{highlight.selectedText}</q> : <em>Zona realçada</em>}
    </button>
    {editing ? <textarea ref={noteRef} className={styles.noteInput} value={note} maxLength={800} onChange={(event) => setNote(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save(); if (event.key === "Escape") { event.stopPropagation(); setNote(highlight.note ?? ""); setEditing(false); } }} placeholder="Escreve uma nota…" aria-label="Nota do realce" />
      : highlight.note ? <button type="button" className={styles.note} onClick={() => setEditing(true)} title="Editar nota">{highlight.note}</button>
        : <button type="button" className={styles.addNote} onClick={() => setEditing(true)}>Adicionar nota</button>}
    <footer className={styles.itemFooter}>
      <div className={styles.itemSwatches} role="radiogroup" aria-label="Cor">
        {COLORS.map((entry) => <button key={entry.value} type="button" role="radio" className={styles.swatchSmall} data-color={entry.value} aria-checked={highlight.color === entry.value} aria-label={entry.label} onClick={() => onColor(entry.value)} />)}
      </div>
      <button type="button" className={styles.removeButton} onClick={onRemove} aria-label="Remover realce" title="Remover realce"><Trash2 /></button>
    </footer>
  </article>;
}

type PdfPageProps = {
  page: number;
  pdfDocument: PDFDocumentProxy;
  pdfjs: PdfJs;
  scale: number;
  estimatedSize: PageSize;
  onSize: (page: number, size: PageSize) => void;
  registerRef: (element: HTMLDivElement | null) => void;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  highlights: Highlight[];
  activeId: string | null;
  tool: Tool;
  color: HighlightColor;
  searchTerm: string;
  pendingRects: Rect[] | null;
  onSelectHighlight: (highlight: Highlight) => void;
  onDrawArea: (rect: Rect) => void;
};

/** One page: canvas + selectable text layer + highlights. Renders only near the viewport. */
const PdfPage = memo(function PdfPage({ page, pdfDocument, pdfjs, scale, estimatedSize, onSize, registerRef, scrollRoot, highlights, activeId, tool, color, searchTerm, pendingRects, onSelectHighlight, onDrawArea }: PdfPageProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [textReady, setTextReady] = useState(0);
  const [draft, setDraft] = useState<{ start: { x: number; y: number }; rect: Rect } | null>(null);
  const width = Math.floor(estimatedSize.width * scale);
  const height = Math.floor(estimatedSize.height * scale);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: scrollRoot.current, rootMargin: "1200px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!near) { setRendered(false); const canvas = canvasRef.current; if (canvas) { canvas.width = 0; canvas.height = 0; } if (textRef.current) textRef.current.replaceChildren(); return; }
    let active = true;
    let renderTask: RenderTask | undefined;
    let textLayer: InstanceType<PdfJs["TextLayer"]> | undefined;
    (async () => {
      const pdfPage: PDFPageProxy = await pdfDocument.getPage(page);
      if (!active) return;
      const base = pdfPage.getViewport({ scale: 1 });
      onSize(page, { width: base.width, height: base.height });
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (!active) return;
      setRendered(true);
      const container = textRef.current;
      if (!container) return;
      container.replaceChildren();
      container.style.setProperty("--total-scale-factor", String(scale));
      textLayer = new pdfjs.TextLayer({ textContentSource: pdfPage.streamTextContent(), container, viewport });
      await textLayer.render();
      const endOfContent = document.createElement("div");
      endOfContent.className = "endOfContent";
      container.appendChild(endOfContent);
      if (active) setTextReady((value) => value + 1);
    })().catch((reason) => {
      if (reason?.name !== "RenderingCancelledException" && active) setRendered(true);
    });
    return () => { active = false; renderTask?.cancel(); textLayer?.cancel(); };
  }, [near, onSize, page, pdfDocument, pdfjs, scale]);

  // Search hits are marked on the text layer spans of rendered pages.
  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    for (const span of container.querySelectorAll("span")) {
      const hit = Boolean(searchTerm) && normalizeSearch(span.textContent ?? "").includes(searchTerm);
      span.classList.toggle(styles.searchHit, hit);
    }
  }, [searchTerm, textReady]);

  const point = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: clamp01((event.clientX - bounds.left) / bounds.width), y: clamp01((event.clientY - bounds.top) / bounds.height) };
  };

  return <div
    ref={(element) => { wrapperRef.current = element; registerRef(element); }}
    className={styles.page}
    data-pdf-page={page}
    data-rendered={rendered || undefined}
    style={{ width, height, "--total-scale-factor": scale, "--scale-round-x": "1px", "--scale-round-y": "1px" } as CSSProperties}
    onClick={(event) => {
      // Highlights never block text selection; a plain click on one selects it.
      if (tool !== "text" || !window.getSelection()?.isCollapsed) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
      const hit = [...highlights].reverse().find((highlight) => highlightRects(highlight).some((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
      if (hit) onSelectHighlight(hit);
    }}
  >
    <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    <div ref={textRef} className={`textLayer ${styles.textLayer}`} aria-label={`Texto da página ${page}`} onPointerDown={(event) => event.currentTarget.classList.add("selecting")} />
    <div className={styles.highlightLayer} aria-hidden="true">
      {highlights.flatMap((highlight) => highlightRects(highlight).map((rect, index) => <span key={`${highlight.id}-${index}`} className={styles.mark} data-color={highlight.color} data-active={activeId === highlight.id || undefined} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />))}
      {pendingRects?.map((rect, index) => <span key={`pending-${index}`} className={styles.mark} data-color={color} data-pending style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)}
    </div>
    {tool === "area" && <div
      className={styles.drawLayer}
      aria-label="Camada de realces"
      onPointerDown={(event) => { const start = point(event); setDraft({ start, rect: { ...start, width: 0, height: 0 } }); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (draft) setDraft({ ...draft, rect: rectangle(draft.start, point(event)) }); }}
      onPointerUp={(event) => { if (!draft) return; const rect = rectangle(draft.start, point(event)); setDraft(null); event.currentTarget.releasePointerCapture(event.pointerId); if (rect.width > 0.01 && rect.height > 0.006) onDrawArea(rect); }}
      onPointerCancel={() => setDraft(null)}
    >
      {draft && <span className={styles.mark} data-color={color} data-pending style={{ left: `${draft.rect.x * 100}%`, top: `${draft.rect.y * 100}%`, width: `${draft.rect.width * 100}%`, height: `${draft.rect.height * 100}%` }} />}
    </div>}
    <span className={styles.pageNumber} aria-hidden="true">{page}</span>
  </div>;
});
