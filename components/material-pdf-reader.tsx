"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Highlighter, LoaderCircle, Trash2, X } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import styles from "@/components/material-pdf-reader.module.css";

type HighlightColor = "gold" | "blue" | "green" | "rose";
type Highlight = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: HighlightColor;
  note?: string | null;
};

type Point = { x: number; y: number };

function normalizedPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
}

function rectangle(start: Point, end: Point) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

export function MaterialPdfReader({ materialId, title, viewUrl, onClose }: { materialId: string; title: string; viewUrl: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [color, setColor] = useState<HighlightColor>("gold");
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<Point | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof rectangle> | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Highlight | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(true);
  const [rendering, setRendering] = useState(true);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previousRenderRef = useRef<Promise<void>>(Promise.resolve());
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endpoint = `/api/material-catalog/${encodeURIComponent(materialId)}/highlights`;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const data = await response.json() as { highlights?: Highlight[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os realces.");
      if (!signal.aborted) setHighlights(Array.isArray(data.highlights) ? data.highlights : []);
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os realces.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const loadTimer = window.setTimeout(() => void load(controller.signal), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(loadTimer); controller.abort(); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [load]);

  useEffect(() => {
    let active = true;
    let loadingTask: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void import("pdfjs-dist").then((pdfjs) => {
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      loadingTask = pdfjs.getDocument({ url: viewUrl, withCredentials: true, disableRange: true, disableStream: true });
      return loadingTask.promise;
    }).then((document) => {
      if (active && document) setPdfDocument(document);
    }).catch((reason) => {
      if (active) setPdfError(reason instanceof Error ? reason.message : "Não foi possível abrir o PDF.");
    }).finally(() => { if (active) setPdfLoading(false); });
    return () => { active = false; void loadingTask?.destroy(); };
  }, [viewUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setRendering(true);
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDocument || !stageSize.width || !stageSize.height || !canvasRef.current) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    const render = async () => {
      await previousRenderRef.current;
      if (!active) return;
      const pdfPage = await pdfDocument.getPage(page);
      if (!active) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min((stageSize.width - 24) / original.width, (stageSize.height - 24) / original.height);
      const viewport = pdfPage.getViewport({ scale: Math.max(0.1, scale) });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) throw new Error("Não foi possível desenhar a página.");
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setPageSize({ width: viewport.width, height: viewport.height });
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (active) setRendering(false);
    };
    const pending = render().catch((reason) => {
      if (active && reason?.name !== "RenderingCancelledException") setPdfError(reason instanceof Error ? reason.message : "Não foi possível desenhar a página.");
    });
    previousRenderRef.current = pending;
    return () => { active = false; renderTask?.cancel(); };
  }, [pdfDocument, page, stageSize]);

  const saveRectangle = async (shape: ReturnType<typeof rectangle>) => {
    if (shape.width < 0.01 || shape.height < 0.006) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, ...shape, color, note }) });
      const data = await response.json() as { highlight?: Highlight; error?: string };
      if (!response.ok || !data.highlight) throw new Error(data.error || "Não foi possível guardar o realce.");
      setHighlights((current) => [...current, data.highlight!]);
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível guardar o realce.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (highlight: Highlight) => {
    setError("");
    setRemoving(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: highlight.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível remover o realce.");
      setHighlights((current) => current.filter((item) => item.id !== highlight.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover o realce.");
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const shape = rectangle(start, normalizedPoint(event));
    setStart(null);
    setPreview(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    void saveRectangle(shape);
  };

  const changePage = (next: number) => {
    const bounded = Math.max(1, Math.min(pdfDocument?.numPages ?? 1, next));
    if (bounded !== page) { setRendering(true); setStart(null); setPreview(null); setPage(bounded); }
  };

  const pageHighlights = highlights.filter((highlight) => highlight.page === page);
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="material-pdf-title">
      <header className={styles.header}>
        <div><span>Leitor de bibliografia</span><h2 id="material-pdf-title">{title}</h2></div>
        <button ref={closeRef} className={styles.close} type="button" onClick={onClose} aria-label="Fechar leitor"><X /></button>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.pageControls}>
          <button type="button" onClick={() => changePage(page - 1)} disabled={page === 1} aria-label="Página anterior"><ChevronLeft /></button>
          <label><span>Página</span><input type="number" min="1" max={pdfDocument?.numPages ?? 1} value={page} onChange={(event) => changePage(Number(event.target.value) || 1)} /></label>
          <button type="button" onClick={() => changePage(page + 1)} disabled={!pdfDocument || page >= pdfDocument.numPages} aria-label="Página seguinte"><ChevronRight /></button>
        </div>
        <div className={styles.colors} aria-label="Cor do realce">{(["gold", "blue", "green", "rose"] as const).map((value) => <button key={value} type="button" data-color={value} aria-label={`Cor ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>
        <a className={styles.originalLink} href={viewUrl} target="_blank" rel="noopener noreferrer">Abrir PDF original</a>
        <button className={`${styles.drawButton} ${drawing ? styles.drawButtonActive : ""}`} type="button" aria-pressed={drawing} disabled={!pdfDocument || Boolean(pdfError) || rendering} onClick={() => setDrawing((current) => !current)}><Highlighter />{drawing ? "A realçar" : "Realçar zona"}</button>
      </div>
      <div className={styles.workspace}>
        <div className={styles.pageStage} ref={stageRef}>
          {(pdfLoading || pdfError) && <p className={styles.pdfStatus} role="status">{pdfError || "A abrir PDF…"}</p>}
          <div className={styles.pageSurface} style={{ width: pageSize.width, height: pageSize.height, visibility: rendering ? "hidden" : "visible" }}>
          <canvas ref={canvasRef} aria-label={`${title}, página ${page}`} role="img" />
          <div
            className={`${styles.overlay} ${drawing && !rendering ? styles.overlayDrawing : ""}`}
            aria-label="Camada de realces"
            onPointerDown={(event) => { if (!drawing || saving || rendering) return; const point = normalizedPoint(event); setStart(point); setPreview({ x: point.x, y: point.y, width: 0, height: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (start) setPreview(rectangle(start, normalizedPoint(event))); }}
            onPointerUp={finishDrawing}
            onPointerCancel={() => { setStart(null); setPreview(null); }}
          >
            {pageHighlights.map((highlight) => <span key={highlight.id} className={styles.highlight} data-color={highlight.color} style={{ left: `${highlight.x * 100}%`, top: `${highlight.y * 100}%`, width: `${highlight.width * 100}%`, height: `${highlight.height * 100}%` }} />)}
            {preview && <span className={styles.highlight} data-color={color} style={{ left: `${preview.x * 100}%`, top: `${preview.y * 100}%`, width: `${preview.width * 100}%`, height: `${preview.height * 100}%` }} />}
          </div>
          </div>
          {saving && <span className={styles.saving}><LoaderCircle />A guardar…</span>}
        </div>
        <aside className={styles.sidebar}>
          <label><span>Nota opcional para o próximo realce</span><textarea value={note} maxLength={800} onChange={(event) => setNote(event.target.value)} placeholder="Conceito, relação ou dúvida…" /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.highlightList}><strong>{loading ? "A carregar…" : `${pageHighlights.length} realces nesta página`}</strong>{pageHighlights.map((highlight) => <article key={highlight.id}><span data-color={highlight.color} /> <p>{highlight.note || "Realce sem nota"}</p><button type="button" onClick={() => setRemoveTarget(highlight)} aria-label="Remover realce"><Trash2 /></button></article>)}</div>
        </aside>
      </div>
      <ConfirmationDialog open={Boolean(removeTarget)} eyebrow="" title="Remover este realce?" description="" subject={removeTarget?.note || undefined} subjectLabel="Nota" confirmLabel={removing ? "A remover…" : "Remover"} busy={removing} onClose={() => setRemoveTarget(null)} onConfirm={() => { if (removeTarget) void remove(removeTarget); }} />
    </section>
  </div>;
}
