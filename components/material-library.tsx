"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { FileUploadField, MultiFileUploadField, SelectedUpload } from "@/components/file-upload-field";
import { ModuleGuard } from "@/components/module-guard";
import { useI18n } from "@/components/i18n-context";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import styles from "@/components/material-library.module.css";

type Status = "pending" | "approved" | "rejected" | "archived";
type Category = "exam" | "summary" | "notes" | "other";
type ApiMaterial = {
  id: string | number;
  title: string;
  description?: string;
  category?: Category;
  type?: "exam_photo" | "summary" | "notes" | "other";
  status?: Status | "published";
  anonymous?: boolean;
  authorName?: string;
  author_name?: string;
  authorId?: string;
  authorEmail?: string;
  authorStudentNumber?: string;
  fileName?: string;
  file_name?: string;
  fileType?: string;
  file_type?: string;
  fileUrl?: string;
  file_url?: string;
  fileData?: string;
  file_data?: string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentDataUrl?: string;
  createdAt?: string;
  created_at?: string;
  unitId?: string | number;
  unitCode?: string;
  unitName?: string;
  unit?: { id: string | number; code?: string; name?: string };
  curricularUnit?: { id: string | number; code?: string; name?: string };
  attachments?: Array<{ id?: string; name?: string; mime?: string; dataUrl?: string; fileName?: string; fileType?: string; fileUrl?: string }>;
};
type MaterialAttachment = { id: string; name: string; mime: string; dataUrl: string };
type Material = {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  anonymous: boolean;
  authorName: string;
  authorId: string;
  authorEmail: string;
  authorStudentNumber: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  attachments: MaterialAttachment[];
  createdAt: string;
  unit: { id: string; code: string; name: string } | null;
};
type Unit = { id: string; code: string; name: string };
type Notice = { kind: ToastKind; message: string } | null;
const categoryLabelKeys = {
  exam: "community.materials.category.exam",
  summary: "community.materials.category.summary",
  notes: "community.materials.category.notes",
  other: "community.materials.category.other",
} as const;
const categoryToType: Record<
  Category,
  "exam_photo" | "summary" | "notes" | "other"
> = { exam: "exam_photo", summary: "summary", notes: "notes", other: "other" };
const statusLabelKeys = {
  pending: "community.materials.status.pending",
  approved: "community.materials.status.approved",
  rejected: "community.materials.status.rejected",
  archived: "community.materials.status.archived",
} as const;
const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;
const allowedPhotos = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 8;
const MAX_PHOTO_TOTAL_SIZE = 24 * 1024 * 1024;
function normalize(item: ApiMaterial, anonymousLabel: string, studentLabel: string, unitLabel: string): Material {
  const nested = item.unit ?? item.curricularUnit;
  const unit =
    nested ??
    (item.unitId
      ? { id: item.unitId, code: item.unitCode, name: item.unitName }
      : null);
  const apiType = item.type;
  const category: Category =
    item.category ?? (apiType === "exam_photo" ? "exam" : (apiType ?? "other"));
  const legacyAttachment: MaterialAttachment = {
    id: `${item.id}-legacy`,
    name: item.attachmentName ?? item.fileName ?? item.file_name ?? "ficheiro",
    mime: item.attachmentMime ?? item.fileType ?? item.file_type ?? "application/octet-stream",
    dataUrl: item.attachmentDataUrl ?? item.fileUrl ?? item.file_url ?? item.fileData ?? item.file_data ?? "",
  };
  const attachments = item.attachments?.map((attachment, index) => ({
    id: attachment.id ?? `${item.id}-${index}`,
    name: attachment.name ?? attachment.fileName ?? `fotografia-${index + 1}`,
    mime: attachment.mime ?? attachment.fileType ?? "application/octet-stream",
    dataUrl: attachment.dataUrl ?? attachment.fileUrl ?? "",
  })).filter((attachment) => attachment.dataUrl) ?? [];
  return {
    id: String(item.id),
    title: item.title,
    description: item.description ?? "",
    category,
    status: category === "exam" && (item.status === "published" || item.status === "approved")
      ? "archived"
      : item.status === "published" ? "approved" : (item.status ?? "pending"),
    anonymous: item.anonymous ?? false,
    authorName: item.anonymous
      ? anonymousLabel
      : (item.authorName ?? item.author_name ?? studentLabel),
    authorId: item.authorId ?? "",
    authorEmail: item.authorEmail ?? "",
    authorStudentNumber: item.authorStudentNumber ?? "",
    fileName:
      item.attachmentName ?? item.fileName ?? item.file_name ?? "ficheiro",
    fileType:
      item.attachmentMime ??
      item.fileType ??
      item.file_type ??
      "application/octet-stream",
    fileUrl:
      item.attachmentDataUrl ??
      item.fileUrl ??
      item.file_url ??
      item.fileData ??
      item.file_data ??
      "",
    attachments: attachments.length ? attachments : legacyAttachment.dataUrl ? [legacyAttachment] : [],
    createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString(),
    unit: unit
      ? {
          id: String(unit.id),
          code: unit.code ?? "UC",
          name: unit.name ?? unitLabel,
        }
      : null,
  };
}
function date(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}
function size(value: number, locale: string) {
  return value < 1024 * 1024
    ? `${Math.round(value / 1024)} KB`
    : `${(value / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error());
    reader.readAsDataURL(file);
  });
}
export function MaterialLibrary() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const [materials, setMaterials] = useState<Material[]>([]),
    [units, setUnits] = useState<Unit[]>([]),
    [canModerate, setCanModerate] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<Notice>(null),
    [editor, setEditor] = useState(false),
    [saving, setSaving] = useState(false),
    [moderating, setModerating] = useState<string | null>(null),
    [filter, setFilter] = useState("all");
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState<Category>("exam"),
    [unitId, setUnitId] = useState(""),
    [anonymous, setAnonymous] = useState(true),
    [file, setFile] = useState<File | null>(null),
    [fileData, setFileData] = useState(""),
    [examFiles, setExamFiles] = useState<Array<SelectedUpload & { dataUrl: string }>>([]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const moderator =
        user?.role === "admin" || Boolean(user?.commissionPosition);
      const materialResponse = await fetch(
        `/api/material-submissions${moderator ? "?scope=moderation" : ""}`,
        { cache: "no-store" },
      );
      const materialData = (await materialResponse.json()) as {
        materials?: ApiMaterial[];
        submissions?: ApiMaterial[];
        units?: Array<{ id: string | number; code?: string; name?: string }>;
        canModerate?: boolean;
        capabilities?: { moderate?: boolean };
        error?: string;
      };
      if (!materialResponse.ok)
        throw new Error(
          materialData.error || t("community.materials.loadError"),
        );
      setMaterials(
        (materialData.materials ?? materialData.submissions ?? []).map(
          (item) => normalize(item, t("community.materials.anonymousShare"), t("community.materials.student"), t("community.common.curricularUnit")),
        ),
      );
      setCanModerate(
        moderator &&
          (materialData.canModerate ??
            materialData.capabilities?.moderate ??
            true),
      );
      setUnits(
        (materialData.units ?? []).map((item) => ({
          id: String(item.id),
          code: item.code ?? "UC",
          name: item.name ?? t("community.common.curricularUnit"),
        })),
      );
    } catch (reason) {
      setNotice({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : t("community.materials.loadError"),
      });
    } finally {
      setLoading(false);
    }
  }, [t, user]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      materials.filter((item) => filter === "all" || item.category === filter),
    [materials, filter],
  );
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!allowed.includes(selected.type)) {
      setNotice({
        kind: "warning",
        message: t("community.materials.fileTypeError"),
      });
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_SIZE) {
      setNotice({
        kind: "warning",
        message: t("community.materials.fileSizeError"),
      });
      event.target.value = "";
      return;
    }
    try {
      const value = await readFileDataUrl(selected);
      setFile(selected);
      setFileData(value);
    } catch {
      setNotice({
        kind: "error",
        message: t("community.materials.fileReadError"),
      });
    }
  };
  const pickExamPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    if (examFiles.length + selected.length > MAX_PHOTOS) {
      setNotice({ kind: "warning", message: t("community.materials.photoCountError", { count: MAX_PHOTOS }) });
      event.target.value = "";
      return;
    }
    if (selected.some((item) => !allowedPhotos.includes(item.type))) {
      setNotice({ kind: "warning", message: t("community.materials.photoTypeError") });
      event.target.value = "";
      return;
    }
    if (selected.some((item) => item.size > MAX_SIZE)) {
      setNotice({ kind: "warning", message: t("community.materials.photoSizeError") });
      event.target.value = "";
      return;
    }
    const total = [...examFiles.map((item) => item.file), ...selected].reduce((sum, item) => sum + item.size, 0);
    if (total > MAX_PHOTO_TOTAL_SIZE) {
      setNotice({ kind: "warning", message: t("community.materials.photoTotalError") });
      event.target.value = "";
      return;
    }
    try {
      const encoded = await Promise.all(selected.map(async (item) => {
        const dataUrl = await readFileDataUrl(item);
        return { file: item, dataUrl, previewUrl: dataUrl };
      }));
      setExamFiles((current) => [...current, ...encoded]);
    } catch {
      setNotice({ kind: "error", message: t("community.materials.photoReadError") });
    } finally {
      event.target.value = "";
    }
  };
  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("exam");
    setUnitId("");
    setAnonymous(true);
    setFile(null);
    setFileData("");
    setExamFiles([]);
    setEditor(false);
  };
  const descriptionLength = richTextPlainText(description).length;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const examSubmission = category === "exam";
    const primaryExamFile = examFiles[0];
    if (!title.trim() || (examSubmission ? !primaryExamFile : !file || !fileData)) {
      setNotice({
        kind: "warning",
        message:
          t("community.materials.requiredError"),
      });
      return;
    }
    if (descriptionLength > 1200) {
      setNotice({ kind: "warning", message: t("community.materials.descriptionError") });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/material-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: sanitizeRichTextHtml(description),
          type: categoryToType[category],
          unitId: unitId || null,
          anonymous,
          attachmentName: examSubmission ? primaryExamFile.file.name : file?.name,
          attachmentDataUrl: examSubmission ? primaryExamFile.dataUrl : fileData,
          attachments: examSubmission ? examFiles.map((item) => ({ name: item.file.name, dataUrl: item.dataUrl })) : undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || t("community.materials.sendError"));
      reset();
      setNotice({
        kind: "success",
        message: t("community.materials.sent"),
      });
      await load();
    } catch (reason) {
      setNotice({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : t("community.materials.sendError"),
      });
    } finally {
      setSaving(false);
    }
  };
  const moderate = async (id: string, status: "approved" | "rejected" | "archived") => {
    setModerating(id);
    try {
      const response = await fetch("/api/material-submissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          status: status === "approved" ? "published" : status,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || t("community.materials.moderateError"));
      setNotice({
        kind: "success",
        message:
          status === "approved"
            ? t("community.materials.approved")
            : status === "archived" ? t("community.materials.archived") : t("community.materials.rejected"),
      });
      await load();
    } catch (reason) {
      setNotice({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : t("community.materials.moderateError"),
      });
    } finally {
      setModerating(null);
    }
  };
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="materials.library">
        <AppShell active="materials" breadcrumb={t("community.materials.breadcrumb")}>
          <div className={styles.page}>
            <header className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.heroIcon}>
                  <FolderOpen />
                </span>
                <div>
                  <span className="eyebrow">{t("community.materials.eyebrow")}</span>
                  <h1>{t("community.materials.title")}</h1>
                  <p>{t("community.materials.description")}</p>
                </div>
              </div>
              <div className={styles.heroActions}>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setEditor((value) => !value)}
                >
                  {editor ? <X /> : <Upload />}
                  {editor ? t("community.materials.closeForm") : t("community.materials.share")}
                </button>
              </div>
            </header>
            {notice && (
              <AppToast
                kind={notice.kind}
                message={notice.message}
                onDismiss={() => setNotice(null)}
              />
            )}{" "}
            {editor && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>{t("community.materials.new")}</h2>
                    <p>{t("community.materials.moderationInfo")}</p>
                  </div>
                </div>
                <form className={styles.form} onSubmit={submit}>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>{t("community.materials.field.title")}</span>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={180}
                        placeholder={t("community.materials.titlePlaceholder")}
                        required
                      />
                    </label>
                    <label className={styles.field}>
                      <span>{t("community.materials.field.type")}</span>
                      <select
                        value={category}
                        onChange={(event) =>
                          setCategory(event.target.value as Category)
                        }
                      >
                        {Object.entries(categoryLabelKeys).map(
                          ([value, key]) => (
                            <option value={value} key={value}>
                              {t(key)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>
                        {t("community.materials.field.unit")} <small>({t("community.common.optional")})</small>
                      </span>
                      <select
                        value={unitId}
                        onChange={(event) => setUnitId(event.target.value)}
                      >
                        <option value="">{t("community.materials.noUnit")}</option>
                        {units.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={`${styles.field} ${styles.fieldFull}`}>
                      <span>
                        {t("community.materials.field.description")} <small>({t("community.common.optional")})</small>
                      </span>
                      <RichTextEditor
                        value={description}
                        onChange={setDescription}
                        ariaLabel={t("community.materials.descriptionAria")}
                        maxLength={1200}
                        minHeight="compact"
                        placeholder={t("community.materials.descriptionPlaceholder")}
                        onInvalidLink={() => setNotice({ kind: "warning", message: t("community.materials.invalidLink") })}
                      />
                    </div>
                  </div>
                  <div className={styles.legacyUpload} aria-hidden="true">
                  {file ? (
                    <div className={styles.preview}>
                      {file.type.startsWith("image/") ? (
                        <img
                          src={fileData}
                          alt={t("community.materials.filePreview")}
                        />
                      ) : (
                        <span className={styles.filePreview}>
                          <FileText />
                        </span>
                      )}
                      <span>
                        <strong>{file.name}</strong>
                        <small>
                          {file.type} · {size(file.size, locale)}
                        </small>
                      </span>
                      <button
                        className={styles.iconButton}
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setFileData("");
                        }}
                        aria-label={t("community.materials.removeFile")}
                      >
                        <X />
                      </button>
                    </div>
                  ) : (
                    <label className={styles.dropzone}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => void pick(event)}
                        disabled
                      />
                      <Upload />
                      <strong>{t("community.materials.fileEmpty")}</strong>
                      <small>{t("community.materials.fileHelp")}</small>
                    </label>
                  )}
                  </div>
                  {category === "exam" ? <>
                    <div className={styles.privateNotice} role="note">
                      <ShieldCheck />
                      <span><strong>{t("community.materials.privateTitle")}</strong><small>{t("community.materials.privateNotice")}</small></span>
                    </div>
                    <MultiFileUploadField
                      accept="image/jpeg,image/png,image/webp"
                      emptyLabel={t("community.materials.selectExamPhotos")}
                      files={examFiles}
                      help={t("community.materials.photoHelp", { count: MAX_PHOTOS })}
                      label={t("community.materials.privatePhotos")}
                      maxFiles={MAX_PHOTOS}
                      onChange={(event) => void pickExamPhotos(event)}
                      onRemove={(index) => setExamFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    />
                  </> : <FileUploadField
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      emptyLabel={t("community.materials.fileEmpty")}
                      file={file}
                      help={t("community.materials.fileHelp")}
                      onChange={(event) => void pick(event)}
                      onRemove={() => { setFile(null); setFileData(""); }}
                      previewUrl={fileData}
                    />}
                  <label className={styles.checkField}>
                    <input
                      type="checkbox"
                      checked={anonymous}
                      onChange={(event) => setAnonymous(event.target.checked)}
                    />
                    <span>
                      <strong>{t("community.materials.anonymous")}</strong>
                      <small>{t("community.materials.anonymousHint")}</small>
                    </span>
                  </label>
                  <div className={styles.formActions}>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={reset}
                    >
                      {t("community.common.cancel")}
                    </button>
                    <button
                      className="button button--primary"
                      type="submit"
                    disabled={saving || descriptionLength > 1200}
                    >
                      {saving ? (
                        <LoaderCircle className={styles.spin} />
                      ) : (
                        <Send />
                      )}
                      {saving ? t("community.materials.sending") : t("community.materials.send")}
                    </button>
                  </div>
                </form>
              </section>
            )}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {canModerate
                      ? t("community.materials.libraryModeration")
                      : t("community.materials.library")}
                  </h2>
                  <p>
                    {canModerate
                      ? t("community.materials.pendingFirst")
                      : t("community.materials.approvedCommunity")}
                  </p>
                </div>
                {!loading && (
                  <span className={styles.count}>
                    {visible.length}{" "}
                    {visible.length === 1 ? t("community.materials.material") : t("community.materials.materialPlural")}
                  </span>
                )}
              </div>
              <div className={styles.toolbar}>
                <label>
                  <span className="sr-only">{t("community.materials.filter")}</span>
                  <select
                    className={styles.select}
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">{t("community.materials.all")}</option>
                    {Object.entries(categoryLabelKeys).filter(([value]) => canModerate || value !== "exam").map(([value, key]) => (
                      <option value={value} key={value}>
                        {t(key)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {loading ? (
                <div className={styles.state}>
                  <LoaderCircle className={styles.spin} />
                  <strong>{t("community.materials.loading")}</strong>
                </div>
              ) : visible.length === 0 ? (
                <div className={styles.state}>
                  <FolderOpen />
                  <strong>{t("community.materials.empty")}</strong>
                  <p>{t("community.materials.emptyHint")}</p>
                </div>
              ) : (
                <div className={styles.materialGrid}>
                  {visible.map((item) => { const author = personDisplay({ fullName: item.authorName, id: item.authorId, email: item.authorEmail, studentNumber: item.authorStudentNumber, anonymous: item.anonymous, anonymousLabel: t("community.materials.anonymousShare") }, { revealIdentifier: canModerate, locale }); return (
                    <article className={styles.material} key={item.id}>
                      <div className={styles.materialThumb}>
                        {item.fileType.startsWith("image/") && item.fileUrl ? (
                          <img src={item.fileUrl} alt="" />
                        ) : (
                          <FileText />
                        )}
                      </div>
                      <div className={styles.materialBody}>
                        <div className={styles.cardTop}>
                          <span className={styles.tag}>
                            {t(categoryLabelKeys[item.category])}
                          </span>
                          <span
                            className={`${styles.status} ${item.status === "approved" ? styles.statusApproved : item.status === "rejected" ? styles.statusRejected : item.status === "archived" ? styles.statusArchived : styles.statusPending}`}
                          >
                            {t(statusLabelKeys[item.status])}
                          </span>
                        </div>
                        <div>
                          <h3>{item.title}</h3>
                          {item.description && <RichTextContent value={item.description} className={styles.materialDescription} />}
                        </div>
                        {item.unit && (
                          <span className={styles.unitCode}>
                            {item.unit.code}
                          </span>
                        )}
                        <div className={styles.meta}>
                          <span className={styles.metaRow}>
                            {item.anonymous ? <ShieldCheck /> : <ImageIcon />}
                              <PersonName person={author} />
                          </span>
                          <span className={styles.metaRow}>
                            <FileText />
                            <span>{item.fileName}</span>
                          </span>
                        </div>
                        {canModerate && item.category === "exam" && item.attachments.length > 0 && (
                          <div className={styles.photoDownloads}>
                            <strong>{item.attachments.length} {item.attachments.length === 1 ? t("community.materials.photo") : t("community.materials.photoPlural")}</strong>
                            <div>{item.attachments.map((attachment, index) => <a key={attachment.id} href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer"><Download />{t("community.materials.photoNumber", { number: index + 1 })}<small>{attachment.name}</small></a>)}</div>
                          </div>
                        )}
                        {canModerate && item.status === "pending" ? (
                          <div className={styles.moderation}>
                            <button
                              className="button button--primary button--compact"
                              type="button"
                              onClick={() => void moderate(item.id, item.category === "exam" ? "archived" : "approved")}
                              disabled={moderating === item.id}
                            >
                              {moderating === item.id ? (
                                <LoaderCircle className={styles.spin} />
                              ) : (
                                <Check />
                              )}
                              {item.category === "exam" ? t("community.materials.finishReview") : t("community.materials.approve")}
                            </button>
                            <button
                              className="button button--danger button--compact"
                              type="button"
                              onClick={() => void moderate(item.id, "rejected")}
                              disabled={moderating === item.id}
                            >
                              <X />
                              {t("community.materials.reject")}
                            </button>
                          </div>
                        ) : (
                          item.status === "approved" &&
                          item.fileUrl && (
                            <a
                              className="button button--secondary button--compact"
                              href={item.fileUrl}
                              download={item.fileName}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download />
                              {t("community.materials.open")}
                            </a>
                          )
                        )}
                        <footer className={styles.materialFooter}>
                          <span>{date(item.createdAt, locale)}</span>
                          <span>{item.unit?.name ?? t("community.common.general")}</span>
                        </footer>
                      </div>
                    </article>
                  ); })}
                </div>
              )}
            </section>
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
