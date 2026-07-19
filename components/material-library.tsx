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
  Filter,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Flag,
  History,
  Send,
  ShieldCheck,
  Star,
  ThumbsUp,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { FileUploadField, MultiFileUploadField, SelectedUpload } from "@/components/file-upload-field";
import { ModuleGuard } from "@/components/module-guard";
import { useModuleEnabled } from "@/components/use-module-enabled";
import { useI18n } from "@/components/i18n-context";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import styles from "@/components/material-library.module.css";

type Status = "pending" | "approved" | "rejected" | "archived";
type Category = "exam" | "summary" | "notes" | "other";

function MaterialThumbnail({ fileType, src, title }: { fileType: string; src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const isSupportedSource = /^(https?:\/\/|\/(?!\/)|data:image\/(?:jpeg|png|webp);base64,|blob:)/i.test(src.trim());
  const showImage = fileType.startsWith("image/") && isSupportedSource && !failed;

  return (
    <div className={styles.materialThumb} data-placeholder={!showImage}>
      {showImage ? (
        <img src={src} alt={title} onError={() => setFailed(true)} />
      ) : (
        <span className={styles.thumbPlaceholder} aria-hidden="true">
          <FileText />
        </span>
      )}
    </div>
  );
}
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
  favorite?: boolean;
  isFavorite?: boolean;
  favorited?: boolean;
  helpful?: boolean;
  isHelpful?: boolean;
  helpfulByMe?: boolean;
  helpfulCount?: number;
  usefulCount?: number;
  outdated?: boolean;
  reportedOutdated?: boolean;
  isOutdatedReported?: boolean;
  reportedOutdatedByMe?: boolean;
  outdatedCount?: number;
  reportCount?: number;
  version?: number;
  versionNumber?: number;
  currentVersion?: number;
  versionCount?: number;
  versions?: ApiMaterialVersion[];
  versionHistory?: ApiMaterialVersion[];
};
type ApiMaterialVersion = {
  id?: string | number;
  version?: number;
  versionNumber?: number;
  fileName?: string;
  file_name?: string;
  fileUrl?: string;
  file_url?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  notes?: string;
  description?: string;
  changeNote?: string;
  createdAt?: string;
  created_at?: string;
};
type MaterialAttachment = { id: string; name: string; mime: string; dataUrl: string };
type MaterialVersion = { id: string; number: number; fileName: string; fileUrl: string; notes: string; createdAt: string };
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
  favorite: boolean;
  helpful: boolean;
  helpfulCount: number;
  reportedOutdated: boolean;
  outdatedCount: number;
  version: number;
  versionCount: number;
  versions: MaterialVersion[];
  versionsLoaded: boolean;
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
  const rawVersions = item.versions ?? item.versionHistory ?? [];
  const versions = rawVersions.map((version, index) => ({
    id: String(version.id ?? `${item.id}-version-${index}`),
    number: version.version ?? version.versionNumber ?? rawVersions.length - index,
    fileName: version.fileName ?? version.file_name ?? version.attachmentName ?? "ficheiro",
    fileUrl: version.fileUrl ?? version.file_url ?? version.attachmentDataUrl ?? "",
    notes: version.notes ?? version.changeNote ?? version.description ?? "",
    createdAt: version.createdAt ?? version.created_at ?? item.createdAt ?? item.created_at ?? new Date().toISOString(),
  })).sort((a, b) => b.number - a.number);
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
    favorite: item.favorite ?? item.isFavorite ?? item.favorited ?? false,
    helpful: item.helpfulByMe ?? item.helpful ?? item.isHelpful ?? false,
    helpfulCount: item.helpfulCount ?? item.usefulCount ?? 0,
    reportedOutdated: item.reportedOutdatedByMe ?? item.outdated ?? item.reportedOutdated ?? item.isOutdatedReported ?? false,
    outdatedCount: item.outdatedCount ?? item.reportCount ?? 0,
    version: item.currentVersion ?? item.version ?? item.versionNumber ?? versions[0]?.number ?? 1,
    versionCount: item.versionCount ?? Math.max(1, versions.length),
    versions,
    versionsLoaded: Boolean(item.versions || item.versionHistory),
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
  const submissionEnabled = useModuleEnabled("materials.submission");
  const moderationEnabled = useModuleEnabled("materials.moderation");
  const favoritesEnabled = useModuleEnabled("materials.favorites");
  const feedbackEnabled = useModuleEnabled("materials.feedback");
  const versioningEnabled = useModuleEnabled("materials.versioning");
  const [materials, setMaterials] = useState<Material[]>([]),
    [units, setUnits] = useState<Unit[]>([]),
    [canModerate, setCanModerate] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<Notice>(null),
    [editor, setEditor] = useState(false),
    [saving, setSaving] = useState(false),
    [moderating, setModerating] = useState<string | null>(null),
    [feedbackBusy, setFeedbackBusy] = useState<string | null>(null),
    [versionsOpen, setVersionsOpen] = useState<string | null>(null),
    [versionsLoading, setVersionsLoading] = useState<string | null>(null),
    [versionEditor, setVersionEditor] = useState<string | null>(null),
    [versionFile, setVersionFile] = useState<File | null>(null),
    [versionFileData, setVersionFileData] = useState(""),
    [versionNotes, setVersionNotes] = useState(""),
    [publishingVersion, setPublishingVersion] = useState(false),
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
      const moderator = moderationEnabled &&
        (user?.role === "admin" || Boolean(user?.commissionPosition));
      const materialResponse = await fetch(`/api/material-submissions${moderator ? "?scope=moderation" : ""}`, { cache: "no-store" });
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
  }, [moderationEnabled, t, user]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      materials.filter((item) => filter === "all" || (filter === "favorites" ? item.favorite : item.category === filter)),
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
  const toggleFavorite = async (item: Material) => {
    setFeedbackBusy(`favorite-${item.id}`);
    try {
      const response = await fetch("/api/material-favorites", {
        method: item.favorite ? "DELETE" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ materialId: item.id }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.feedbackError"));
      setMaterials((current) => current.map((material) => material.id === item.id ? { ...material, favorite: !item.favorite } : material));
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("community.materials.feedbackError") });
    } finally {
      setFeedbackBusy(null);
    }
  };
  const setFeedback = async (item: Material, type: "helpful" | "outdated") => {
    setFeedbackBusy(`${type}-${item.id}`);
    const nextValue = type === "helpful" ? !item.helpful : !item.reportedOutdated;
    try {
      const response = await fetch("/api/material-feedback", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ materialId: item.id, [type]: nextValue }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.feedbackError"));
      setMaterials((current) => current.map((material) => {
        if (material.id !== item.id) return material;
        if (type === "helpful") return { ...material, helpful: nextValue, helpfulCount: Math.max(0, material.helpfulCount + (nextValue ? 1 : -1)) };
        return { ...material, reportedOutdated: nextValue, outdatedCount: Math.max(0, material.outdatedCount + (nextValue ? 1 : -1)) };
      }));
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("community.materials.feedbackError") });
    } finally {
      setFeedbackBusy(null);
    }
  };
  const toggleVersions = async (item: Material, force = false) => {
    if (!force && versionsOpen === item.id) {
      setVersionsOpen(null);
      return;
    }
    setVersionsOpen(item.id);
    if (!force && item.versionsLoaded) return;
    setVersionsLoading(item.id);
    try {
      const response = await fetch(`/api/material-submissions/${encodeURIComponent(item.id)}/versions`, { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        currentVersion?: number;
        versions?: ApiMaterialVersion[];
      };
      if (!response.ok) throw new Error(data.error || t("community.materials.versionsError"));
      const rawVersions = data.versions ?? [];
      const versions = rawVersions.map((version, index) => ({
        id: String(version.id ?? `${item.id}-version-${index}`),
        number: version.version ?? version.versionNumber ?? rawVersions.length - index,
        fileName: version.fileName ?? version.file_name ?? version.attachmentName ?? t("community.materials.file"),
        fileUrl: version.fileUrl ?? version.file_url ?? version.attachmentDataUrl ?? "",
        notes: version.notes ?? version.changeNote ?? version.description ?? "",
        createdAt: version.createdAt ?? version.created_at ?? item.createdAt,
      })).sort((a, b) => b.number - a.number);
      setMaterials((current) => current.map((material) => material.id === item.id ? {
        ...material,
        version: data.currentVersion ?? versions[0]?.number ?? material.version,
        versionCount: Math.max(1, versions.length),
        versions,
        versionsLoaded: true,
      } : material));
    } catch (reason) {
      setVersionsOpen(null);
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("community.materials.versionsError") });
    } finally {
      setVersionsLoading(null);
    }
  };
  const pickVersionFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!allowed.includes(selected.type)) {
      setNotice({ kind: "warning", message: t("community.materials.fileTypeError") });
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_SIZE) {
      setNotice({ kind: "warning", message: t("community.materials.fileSizeError") });
      event.target.value = "";
      return;
    }
    try {
      setVersionFile(selected);
      setVersionFileData(await readFileDataUrl(selected));
    } catch {
      setNotice({ kind: "error", message: t("community.materials.fileReadError") });
    }
  };
  const closeVersionEditor = () => {
    setVersionEditor(null);
    setVersionFile(null);
    setVersionFileData("");
    setVersionNotes("");
  };
  const publishVersion = async (item: Material) => {
    if (!versionFile || !versionFileData) {
      setNotice({ kind: "warning", message: t("community.materials.versionRequired") });
      return;
    }
    setPublishingVersion(true);
    try {
      const response = await fetch(`/api/material-submissions/${encodeURIComponent(item.id)}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attachmentName: versionFile.name,
          attachmentDataUrl: versionFileData,
          changeNote: versionNotes.trim(),
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("community.materials.versionError"));
      closeVersionEditor();
      setMaterials((current) => current.map((material) => material.id === item.id ? { ...material, versionsLoaded: false } : material));
      setVersionsOpen(null);
      setNotice({ kind: "success", message: t("community.materials.versionPublished") });
      await load();
      await toggleVersions({ ...item, versionsLoaded: false }, true);
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("community.materials.versionError") });
    } finally {
      setPublishingVersion(false);
    }
  };
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="materials.library">
        <AppShell active="materials" breadcrumb={t("community.materials.breadcrumb")}>
          <div className={styles.page}>
            <header className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.heroIcon} aria-hidden="true">
                  <FolderOpen />
                </span>
                <div>
                  <span className="eyebrow">{t("community.materials.eyebrow")}</span>
                  <h1>{t("community.materials.title")}</h1>
                  <p>{t("community.materials.description")}</p>
                </div>
              </div>
              {submissionEnabled && <div className={styles.heroActions}>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setEditor((value) => !value)}
                >
                  {editor ? <X /> : <Upload />}
                  {editor ? t("community.materials.closeForm") : t("community.materials.share")}
                </button>
              </div>}
            </header>
            {notice && (
              <AppToast
                kind={notice.kind}
                message={notice.message}
                onDismiss={() => setNotice(null)}
              />
            )}{" "}
            {submissionEnabled && editor && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelHeading}>
                    <span className={styles.panelIcon} aria-hidden="true"><UploadCloud /></span>
                    <div>
                      <h2>{t("community.materials.new")}</h2>
                      <p>{t("community.materials.moderationInfo")}</p>
                    </div>
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
                <div className={styles.panelHeading}>
                  <span className={styles.panelIcon} aria-hidden="true"><FolderOpen /></span>
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
                </div>
                {!loading && (
                  <span className={styles.count}>
                    {visible.length}{" "}
                    {visible.length === 1 ? t("community.materials.material") : t("community.materials.materialPlural")}
                  </span>
                )}
              </div>
              <div className={styles.toolbar}>
                <label className={styles.filterControl}>
                  <span className={styles.filterLabel}><Filter aria-hidden="true" />{t("community.materials.filter")}</span>
                  <select
                    className={styles.select}
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">{t("community.materials.all")}</option>
                    {favoritesEnabled && <option value="favorites">{t("community.materials.favorites")}</option>}
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
                  <span className={styles.stateIcon} aria-hidden="true"><LoaderCircle className={styles.spin} /></span>
                  <strong>{t("community.materials.loading")}</strong>
                </div>
              ) : visible.length === 0 ? (
                <div className={styles.state}>
                  <span className={styles.stateIcon} aria-hidden="true"><FolderOpen /></span>
                  <strong>{t("community.materials.empty")}</strong>
                  <p>{t("community.materials.emptyHint")}</p>
                  {filter !== "all" && (
                    <button className={styles.emptyAction} type="button" onClick={() => setFilter("all")}>
                      <X aria-hidden="true" />
                      {t("community.materials.all")}
                    </button>
                  )}
                </div>
              ) : (
                <div className={styles.materialGrid}>
                  {visible.map((item) => { const author = personDisplay({ fullName: item.authorName, id: item.authorId, email: item.authorEmail, studentNumber: item.authorStudentNumber, anonymous: item.anonymous, anonymousLabel: t("community.materials.anonymousShare") }, { revealIdentifier: canModerate, locale }); return (
                    <article className={styles.material} key={item.id}>
                      <MaterialThumbnail key={`${item.id}-${item.fileUrl}`} fileType={item.fileType} src={item.fileUrl} title={item.title} />
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
                        {versioningEnabled && <span className={styles.versionBadge}>{t("community.materials.version", { number: item.version })}</span>}
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
                        {item.status === "approved" && (favoritesEnabled || feedbackEnabled) && (
                          <div className={styles.feedbackActions}>
                            {favoritesEnabled && <button className={`${styles.feedbackButton} ${item.favorite ? styles.isActive : ""}`} type="button" onClick={() => void toggleFavorite(item)} disabled={feedbackBusy === `favorite-${item.id}`} aria-pressed={item.favorite} title={t(item.favorite ? "community.materials.unfavorite" : "community.materials.favorite")}>
                              {feedbackBusy === `favorite-${item.id}` ? <LoaderCircle className={styles.spin} /> : <Star />}
                              <span>{t(item.favorite ? "community.materials.unfavorite" : "community.materials.favorite")}</span>
                            </button>}
                            {feedbackEnabled && <button className={`${styles.feedbackButton} ${item.helpful ? styles.isActive : ""}`} type="button" onClick={() => void setFeedback(item, "helpful")} disabled={feedbackBusy === `helpful-${item.id}`} aria-pressed={item.helpful}>
                              {feedbackBusy === `helpful-${item.id}` ? <LoaderCircle className={styles.spin} /> : <ThumbsUp />}
                              <span>{t(item.helpful ? "community.materials.notHelpful" : "community.materials.helpful")}</span><b>{item.helpfulCount}</b>
                            </button>}
                            {feedbackEnabled && <button className={`${styles.feedbackButton} ${item.reportedOutdated ? styles.isWarning : ""}`} type="button" onClick={() => void setFeedback(item, "outdated")} disabled={feedbackBusy === `outdated-${item.id}`} aria-pressed={item.reportedOutdated}>
                              {feedbackBusy === `outdated-${item.id}` ? <LoaderCircle className={styles.spin} /> : <Flag />}
                              <span>{t(item.reportedOutdated ? "community.materials.outdatedMarked" : "community.materials.outdated")}</span>{item.outdatedCount > 0 && <b>{item.outdatedCount}</b>}
                            </button>}
                          </div>
                        )}
                        {versioningEnabled && item.status === "approved" && (
                          <div className={styles.versionArea}>
                            <div className={styles.versionActions}>
                              <button type="button" onClick={() => void toggleVersions(item)} disabled={versionsLoading === item.id}>{versionsLoading === item.id ? <LoaderCircle className={styles.spin} /> : <History />}{t(versionsLoading === item.id ? "community.materials.loadingVersions" : versionsOpen === item.id ? "community.materials.hideVersions" : "community.materials.versions")}</button>
                              {canModerate && <button type="button" onClick={() => { if (versionEditor === item.id) closeVersionEditor(); else { closeVersionEditor(); setVersionEditor(item.id); } }}><UploadCloud />{t(versionEditor === item.id ? "community.materials.closeVersion" : "community.materials.publishVersion")}</button>}
                            </div>
                            {versionsOpen === item.id && (
                              <div className={styles.versionList}>
                                <strong>{t("community.materials.currentVersion")}: {t("community.materials.version", { number: item.version })}</strong>
                                {item.versions.length === 0 ? <p>{t("community.materials.noVersions")}</p> : item.versions.map((version) => (
                                  <div className={styles.versionRow} key={version.id}>
                                    <span><b>{t("community.materials.version", { number: version.number })}</b><small>{date(version.createdAt, locale)}{version.notes ? ` · ${version.notes}` : ""}</small></span>
                                    {version.fileUrl && <a href={version.fileUrl} target="_blank" rel="noreferrer" download={version.fileName} title={version.fileName}><Download /></a>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {canModerate && versionEditor === item.id && (
                              <div className={styles.versionForm}>
                                <label><span>{t("community.materials.versionFile")}</span><input type="file" accept={allowed.join(",")} onChange={(event) => void pickVersionFile(event)} />{versionFile && <small>{versionFile.name} · {size(versionFile.size, locale)}</small>}</label>
                                <label><span>{t("community.materials.versionNotes")}</span><textarea value={versionNotes} onChange={(event) => setVersionNotes(event.target.value)} maxLength={500} placeholder={t("community.materials.versionNotesPlaceholder")} /></label>
                                <button className="button button--primary button--compact" type="button" onClick={() => void publishVersion(item)} disabled={publishingVersion}>{publishingVersion && <LoaderCircle className={styles.spin} />}{t(publishingVersion ? "community.materials.publishingVersion" : "community.materials.publishVersion")}</button>
                              </div>
                            )}
                          </div>
                        )}
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
