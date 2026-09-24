"use client";

import { CheckCircle2, FileArchive, FileText, Image as ImageIcon, Layers, LoaderCircle, Presentation, RotateCcw, Upload, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { CancelButton, FormActions, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { useI18n } from "@/components/i18n-context";
import { SurfaceHeader } from "@/components/surface-header";
import type { AnkiInspection, AnkiIssue } from "@/lib/anki/inspect";
import {
  MATERIAL_FILE_LIMITS,
  MATERIAL_MAX_EXAM_PHOTOS,
  kindFromFileName,
  suggestedCategory,
  titleFromFileName,
  type MaterialCategory,
  type MaterialFileKind,
} from "@/lib/material-upload";
import styles from "@/components/material-upload-form.module.css";

// Hypothesis A: drop any supported file, the kind is detected and only the
// relevant fields appear. Each row becomes one submission; photos are grouped
// into a single exam. Files go to R2 in parts before the submission is created.

type Unit = { id: string; code: string; name: string };
type RowStatus = "ready" | "reading" | "sending" | "sent" | "error";
type Row = {
  id: string;
  kind: MaterialFileKind;
  files: File[];
  title: string;
  category: MaterialCategory;
  unitId: string;
  status: RowStatus;
  progress: number;
  error: string;
  anki?: AnkiInspection;
  issues?: AnkiIssue[];
  sitting: string;
  component: string;
  examDate: string;
  questionCount: string;
};

const ACCEPT = ".pdf,.docx,.pptx,.zip,.apkg,.jpg,.jpeg,.png,.webp";
const KIND_ICON: Record<MaterialFileKind, typeof FileText> = { pdf: FileText, docx: FileText, pptx: Presentation, zip: FileArchive, apkg: Layers, image: ImageIcon };

async function uploadFile(file: File, onProgress: (sentBytes: number) => void): Promise<string> {
  const start = await fetch("/api/material-uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
  const session = await start.json().catch(() => ({})) as { id?: string; partSize?: number; parts?: number; error?: string };
  if (!start.ok || !session.id || !session.partSize || !session.parts) throw new Error(session.error || "");
  const parts: Array<{ partNumber: number; etag: string }> = [];
  for (let index = 0; index < session.parts; index++) {
    const chunk = file.slice(index * session.partSize, (index + 1) * session.partSize);
    const response = await fetch(`/api/material-uploads/${session.id}/parts/${index + 1}`, { method: "PUT", body: chunk });
    const part = await response.json().catch(() => ({})) as { partNumber?: number; etag?: string; error?: string };
    if (!response.ok || !part.etag) throw new Error(part.error || "");
    parts.push({ partNumber: part.partNumber ?? index + 1, etag: part.etag });
    onProgress(Math.min(file.size, (index + 1) * session.partSize));
  }
  const done = await fetch(`/api/material-uploads/${session.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parts }) });
  const result = await done.json().catch(() => ({})) as { error?: string };
  if (!done.ok) throw new Error(result.error || "");
  return session.id;
}

export function MaterialUploadForm({ units, onClose, onSubmitted }: { units: Unit[]; onClose: () => void; onSubmitted: (count: number) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [anonymous, setAnonymous] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));

  const inspectDeck = async (row: Row) => {
    try {
      const { inspectApkg, ankiSubmissionIssues } = await import("@/lib/anki/inspect");
      const inspection = await inspectApkg(new Uint8Array(await row.files[0].arrayBuffer()));
      update(row.id, { status: "ready", anki: inspection, issues: ankiSubmissionIssues(inspection) });
    } catch {
      update(row.id, { status: "error", error: t("community.materials.upload.unsupported") });
    }
  };

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const next: Row[] = [];
    const photos: File[] = [];
    for (const file of incoming) {
      const kind = kindFromFileName(file.name);
      const base = { id: crypto.randomUUID(), files: [file], title: titleFromFileName(file.name), unitId: "", progress: 0, error: "", sitting: "unknown", component: "unknown", examDate: "", questionCount: "" };
      if (!kind) { next.push({ ...base, kind: "zip", category: "other", status: "error", error: t("community.materials.upload.unsupported") }); continue; }
      if (file.size > MATERIAL_FILE_LIMITS[kind]) { next.push({ ...base, kind, category: suggestedCategory(kind), status: "error", error: t("community.materials.upload.tooLarge") }); continue; }
      if (kind === "image") { photos.push(file); continue; }
      next.push({ ...base, kind, category: suggestedCategory(kind), status: kind === "apkg" ? "reading" : "ready" });
    }
    setRows((current) => {
      let result = [...current, ...next];
      if (photos.length) {
        const exam = result.find((row) => row.kind === "image" && row.status !== "sent");
        if (exam) {
          const files = [...exam.files, ...photos];
          result = result.map((row) => row === exam ? { ...row, files, status: files.length > MATERIAL_MAX_EXAM_PHOTOS ? "error" : "ready", error: files.length > MATERIAL_MAX_EXAM_PHOTOS ? t("community.materials.upload.tooManyPhotos") : "" } : row);
        } else {
          result.push({ id: crypto.randomUUID(), kind: "image", files: photos, title: "", category: "exam", unitId: "", status: photos.length > MATERIAL_MAX_EXAM_PHOTOS ? "error" : "ready", progress: 0, error: photos.length > MATERIAL_MAX_EXAM_PHOTOS ? t("community.materials.upload.tooManyPhotos") : "", sitting: "unknown", component: "unknown", examDate: "", questionCount: "" });
        }
      }
      return result;
    });
    next.filter((row) => row.status === "reading").forEach((row) => void inspectDeck(row));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };

  const rowError = (row: Row): string => {
    if (row.error) return row.error;
    if (row.issues?.some((issue) => issue.level === "error")) return row.issues.find((issue) => issue.level === "error")!.message;
    if (row.kind !== "image" && row.title.trim().length < 3) return t("community.materials.upload.titleRequired");
    if (!row.unitId) return t("community.materials.upload.unitRequired");
    return "";
  };

  const pending = rows.filter((row) => row.status !== "sent");
  const canSubmit = !busy && pending.length > 0 && pending.every((row) => row.status === "ready" && !rowError(row));

  const submit = async () => {
    setBusy(true);
    let sent = 0;
    for (const row of pending) {
      update(row.id, { status: "sending", progress: 0, error: "" });
      try {
        const total = row.files.reduce((sum, file) => sum + file.size, 0);
        let done = 0;
        const uploads: string[] = [];
        for (const file of row.files) {
          const before = done;
          uploads.push(await uploadFile(file, (sentBytes) => update(row.id, { progress: Math.round(((before + sentBytes) / total) * 100) })));
          done += file.size;
        }
        const response = await fetch("/api/material-submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            uploads,
            title: row.kind === "image" ? row.title || row.files[0].name : row.title,
            category: row.category === "anki" ? "other" : row.category,
            unitId: row.unitId,
            anonymous,
            anki: row.anki,
            sitting: row.sitting,
            assessmentComponent: row.component,
            examDate: row.examDate || undefined,
            questionCount: row.questionCount || undefined,
          }),
        });
        const data = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(data.error || "");
        update(row.id, { status: "sent", progress: 100 });
        sent++;
      } catch (reason) {
        update(row.id, { status: "error", error: (reason instanceof Error && reason.message) || t("community.materials.upload.failed") });
      }
    }
    setBusy(false);
    if (sent) onSubmitted(sent);
  };

  const retry = (row: Row) => update(row.id, { status: "ready", error: "", progress: 0 });

  return (
    <section className={styles.panel}>
      <SurfaceHeader icon={<Upload />} title={t("community.materials.new")} actions={<FormCloseButton onClick={onClose} label={t("common.close")} disabled={busy} />} />
      <p className="surface-note">{t("community.materials.moderationInfo")}</p>

      <div
        className={`${styles.drop}${dragging ? ` ${styles.dragging}` : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <button className="button button--secondary" type="button" onClick={() => input.current?.click()}><Upload />{t("community.materials.upload.add")}</button>
        {dragging && <span>{t("community.materials.upload.drop")}</span>}
        <input ref={input} className="sr-only" type="file" multiple accept={ACCEPT} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
      </div>

      {rows.length > 0 && <ul className={styles.rows}>
        {rows.map((row) => {
          const Icon = KIND_ICON[row.kind];
          const error = row.status === "sending" || row.status === "sent" ? "" : rowError(row);
          const locked = row.status === "sending" || row.status === "sent";
          const rejected = !kindFromFileName(row.files[0]?.name ?? "") || row.error === t("community.materials.upload.tooLarge");
          return <li key={row.id} className={styles.row} data-status={row.status}>
            <Icon className={styles.icon} aria-hidden="true" />
            <div className={styles.main}>
              {rejected ? <span className={styles.fileName}>{row.files[0]?.name}</span> : <div className={styles.fields}>
                <input className={styles.title} value={row.title} disabled={locked} onChange={(event) => update(row.id, { title: event.target.value })} aria-label={t("community.materials.field.title")} placeholder={row.kind === "image" ? t("community.materials.category.exam") : t("community.materials.field.title")} />
                {row.kind === "apkg"
                  ? <span className={styles.kind}>{t("community.materials.upload.anki")}{row.anki?.readable ? ` · ${t("community.materials.upload.cards", { count: row.anki.cardCount })}` : ""}</span>
                  : row.kind === "image"
                    ? <span className={styles.kind}>{t("community.materials.upload.photos", { count: row.files.length })}</span>
                    : row.kind === "zip"
                      ? <span className={styles.kind}>{t("community.materials.category.other")}</span>
                      : <select value={row.category} disabled={locked} onChange={(event) => update(row.id, { category: event.target.value as MaterialCategory })} aria-label={t("community.materials.field.type")}>
                        {(["summary", "notes", "other"] as const).map((category) => <option key={category} value={category}>{t(`community.materials.category.${category}`)}</option>)}
                      </select>}
                <select value={row.unitId} disabled={locked} onChange={(event) => update(row.id, { unitId: event.target.value })} aria-label={t("community.materials.field.unit")}>
                  <option value="" disabled>{t("community.materials.field.unit")}</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
                </select>
              </div>}
              {row.kind === "image" && !locked && !rejected && <div className={styles.fields}>
                <select value={row.sitting} onChange={(event) => update(row.id, { sitting: event.target.value })} aria-label={t("community.materials.examSitting")}>
                  {(["unknown", "normal", "resit", "special", "continuous"] as const).map((value) => <option key={value} value={value}>{value === "unknown" ? t("community.materials.examSitting") : t(`community.materials.examSitting${value[0].toUpperCase()}${value.slice(1)}` as "community.materials.examSittingNormal")}</option>)}
                </select>
                <select value={row.component} onChange={(event) => update(row.id, { component: event.target.value })} aria-label={t("community.materials.examComponent")}>
                  {(["unknown", "theory", "practical", "mixed"] as const).map((value) => <option key={value} value={value}>{value === "unknown" ? t("community.materials.examComponent") : t(`community.materials.examComponent${value[0].toUpperCase()}${value.slice(1)}` as "community.materials.examComponentTheory")}</option>)}
                </select>
                <input type="date" value={row.examDate} onChange={(event) => update(row.id, { examDate: event.target.value })} aria-label={t("community.materials.examDate")} />
                <input type="number" min={1} max={500} value={row.questionCount} onChange={(event) => update(row.id, { questionCount: event.target.value })} aria-label={t("community.materials.questionCount")} placeholder={t("community.materials.questionCount")} />
              </div>}
              {row.kind === "image" && !error && <p className={styles.note}>{t("community.materials.privateNotice")}</p>}
              {row.status === "sending" && <progress className={styles.progress} max={100} value={row.progress} />}
              {error && <p className={styles.error} role="alert">{error}</p>}
              {!error && row.issues?.filter((issue) => issue.level === "warning").map((issue) => <p key={issue.code} className={styles.warning}>{issue.message}</p>)}
            </div>
            <div className={styles.state}>
              {row.status === "reading" && <LoaderCircle className={styles.spin} aria-label={t("community.materials.upload.reading")} />}
              {row.status === "sending" && <span>{row.progress}%</span>}
              {row.status === "sent" && <CheckCircle2 className={styles.ok} aria-label={t("community.materials.upload.sent")} />}
              {row.status === "error" && row.files.length > 0 && kindFromFileName(row.files[0].name) && row.error && row.error !== t("community.materials.upload.tooLarge") && <button className={styles.iconButton} type="button" onClick={() => retry(row)} aria-label={t("community.materials.upload.retry")}><RotateCcw /></button>}
              {!locked && <button className={styles.iconButton} type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label={t("community.materials.upload.remove")}><X /></button>}
            </div>
          </li>;
        })}
      </ul>}

      <FormActions aside={<label className={styles.anonymous}>
          <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
          <span>{t("community.materials.anonymous")}</span>
        </label>}>
        <CancelButton onClick={onClose} disabled={busy}>{t("common.cancel")}</CancelButton>
        <SubmitButton busy={busy} disabled={!canSubmit} onClick={() => void submit()}>
          {pending.length > 1 ? t("community.materials.upload.submitMany", { count: pending.length }) : t("community.materials.upload.submitOne")}
        </SubmitButton>
      </FormActions>
    </section>
  );
}
