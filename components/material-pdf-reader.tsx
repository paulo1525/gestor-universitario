"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Highlighter, LoaderCircle, Trash2, X } from "lucide-react";
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
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const endpoint = `/api/material-catalog/${encodeURIComponent(materialId)}/highlights`;

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const loadTimer = window.setTimeout(() => void load(controller.signal), 0);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(loadTimer); controller.abort(); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [load, onClose]);

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
    const response = await fetch(endpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: highlight.id }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "Não foi possível remover o realce."); return; }
    setHighlights((current) => current.filter((item) => item.id !== highlight.id));
  };

  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const shape = rectangle(start, normalizedPoint(event));
    setStart(null);
    setPreview(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    void saveRectangle(shape);
  };

  const pageHighlights = highlights.filter((highlight) => highlight.page === page);
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="material-pdf-title">
      <header className={styles.header}>
        <div><span>Leitor de bibliografia</span><h2 id="material-pdf-title">{title}</h2></div>
        <button ref={closeRef} className={styles.close} type="button" onClick={onClose} aria-label="Fechar leitor"><X /></button>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.pageControls}>
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Página anterior"><ChevronLeft /></button>
          <label><span>Página</span><input type="number" min="1" max="10000" value={page} onChange={(event) => setPage(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))} /></label>
          <button type="button" onClick={() => setPage((current) => current + 1)} aria-label="Página seguinte"><ChevronRight /></button>
        </div>
        <div className={styles.colors} aria-label="Cor do realce">{(["gold", "blue", "green", "rose"] as const).map((value) => <button key={value} type="button" data-color={value} aria-label={`Cor ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>
        <button className={`${styles.drawButton} ${drawing ? styles.drawButtonActive : ""}`} type="button" aria-pressed={drawing} onClick={() => setDrawing((current) => !current)}><Highlighter />{drawing ? "A realçar" : "Realçar zona"}</button>
      </div>
      <div className={styles.workspace}>
        <div className={styles.pageStage}>
          <iframe key={page} src={`${viewUrl}#page=${page}&zoom=page-fit&toolbar=0&navpanes=0`} title={`${title}, página ${page}`} />
          <div
            className={`${styles.overlay} ${drawing ? styles.overlayDrawing : ""}`}
            aria-label="Camada de realces"
            onPointerDown={(event) => { if (!drawing || saving) return; const point = normalizedPoint(event); setStart(point); setPreview({ x: point.x, y: point.y, width: 0, height: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (start) setPreview(rectangle(start, normalizedPoint(event))); }}
            onPointerUp={finishDrawing}
            onPointerCancel={() => { setStart(null); setPreview(null); }}
          >
            {pageHighlights.map((highlight) => <span key={highlight.id} className={styles.highlight} data-color={highlight.color} style={{ left: `${highlight.x * 100}%`, top: `${highlight.y * 100}%`, width: `${highlight.width * 100}%`, height: `${highlight.height * 100}%` }} />)}
            {preview && <span className={styles.highlight} data-color={color} style={{ left: `${preview.x * 100}%`, top: `${preview.y * 100}%`, width: `${preview.width * 100}%`, height: `${preview.height * 100}%` }} />}
          </div>
          {saving && <span className={styles.saving}><LoaderCircle />A guardar…</span>}
        </div>
        <aside className={styles.sidebar}>
          <label><span>Nota opcional para o próximo realce</span><textarea value={note} maxLength={800} onChange={(event) => setNote(event.target.value)} placeholder="Conceito, relação ou dúvida…" /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.highlightList}><strong>{loading ? "A carregar…" : `${pageHighlights.length} realces nesta página`}</strong>{pageHighlights.map((highlight) => <article key={highlight.id}><span data-color={highlight.color} /> <p>{highlight.note || "Realce sem nota"}</p><button type="button" onClick={() => void remove(highlight)} aria-label="Remover realce"><Trash2 /></button></article>)}</div>
        </aside>
      </div>
    </section>
  </div>;
}
