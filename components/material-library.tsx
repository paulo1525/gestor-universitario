"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  Check,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  ChevronLeft,
  Flag,
  History,
  ShieldCheck,
  Star,
  Pencil,
  ThumbsUp,
  UploadCloud,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { ModuleGuard } from "@/components/module-guard";
import { useModuleEnabled } from "@/components/use-module-enabled";
import { useI18n } from "@/components/i18n-context";
import { RichTextContent } from "@/components/rich-text-editor";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import { GENERAL_MATERIAL_UNIT, MaterialCatalog, normalizeMaterialUnitCode, type MaterialCatalogTab } from "@/components/material-catalog";
import { MaterialUploadForm } from "@/components/material-upload-form";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useFloatingAction } from "@/components/floating-actions";
import styles from "@/components/material-library.module.css";
import list from "@/components/record-list.module.css";
import { clampPage, Pagination } from "@/components/pagination";
import { RecordSkeleton, initials, recordHref, useHashRecord } from "@/components/record-list";
import { richTextPlainText } from "@/lib/announcement-content";

const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;
const FLOATING_PUBLIC_ICON = <ExternalLink aria-hidden="true" />;
const FLOATING_APPROVE_ICON = <Check aria-hidden="true" />;
const FLOATING_REJECT_ICON = <X aria-hidden="true" />;
const FLOATING_VERSION_ICON = <UploadCloud aria-hidden="true" />;
const statusTone: Record<string, string | undefined> = { pending: "accent", approved: "success", rejected: "danger", archived: undefined };

type Status = "pending" | "approved" | "rejected" | "archived";
const LIBRARY_PAGE_SIZE = 10;
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
  examSitting?: string;
  assessmentComponent?: string;
  examDate?: string | number | null;
  questionCount?: number | null;
  transcriptionStatus?: string;
};
type Unit = { id: string; code: string; name: string; year?: number | null; semester?: number | null };
type Notice = { kind: ToastKind; message: string } | null;
const categoryLabelKeys = {
  exam: "community.materials.category.exam",
  summary: "community.materials.category.summary",
  notes: "community.materials.category.notes",
  other: "community.materials.category.other",
} as const;
const statusLabelKeys = {
  pending: "community.materials.status.pending",
  approved: "community.materials.status.approved",
  rejected: "community.materials.status.rejected",
  archived: "community.materials.status.archived",
} as const;
const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;
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
function materialUnitCode(item: Material) {
  return item.unit ? normalizeMaterialUnitCode(item.unit.code) : GENERAL_MATERIAL_UNIT;
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
  const [openId, openMaterial] = useHashRecord("material");
  const [query, setQuery] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]),
    [units, setUnits] = useState<Unit[]>([]),
    [canModerate, setCanModerate] = useState(false),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState<Notice>(null),
    [editor, setEditor] = useState(false),
    [moderating, setModerating] = useState<string | null>(null),
    [rejectTarget, setRejectTarget] = useState<Material | null>(null),
    [feedbackBusy, setFeedbackBusy] = useState<string | null>(null),
    [versionsOpen, setVersionsOpen] = useState<string | null>(null),
    [versionsLoading, setVersionsLoading] = useState<string | null>(null),
    [versionEditor, setVersionEditor] = useState<string | null>(null),
    [versionFile, setVersionFile] = useState<File | null>(null),
    [versionFileData, setVersionFileData] = useState(""),
    [versionNotes, setVersionNotes] = useState(""),
    [publishingVersion, setPublishingVersion] = useState(false),
    [filter, setFilter] = useState("all"),
    [activeTab, setActiveTab] = useState<MaterialCatalogTab>(() => openId ? "exams" : "overview"),
    // The selected unit lives in the address (?uc=) so a shared or reloaded link keeps the same context.
    [unitCode, setUnitCode] = useState(() => typeof window === "undefined" ? "" : normalizeMaterialUnitCode(new URLSearchParams(window.location.search).get("uc")));
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const moderator = moderationEnabled &&
        (user?.role === "admin" || Boolean(user?.commissionPosition));
      const materialResponse = await fetch(`/api/material-submissions${moderator ? "?scope=moderation" : ""}`, { cache: "no-store" });
      const materialData = (await materialResponse.json()) as {
        materials?: ApiMaterial[];
        submissions?: ApiMaterial[];
        units?: Array<{ id: string | number; code?: string; name?: string; year?: number | null; semester?: number | null }>;
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
          year: item.year ?? null,
          semester: item.semester ?? null,
        })),
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("community.materials.loadError");
      setLoadError(message);
      setNotice({
        kind: "error",
        message,
      });
    } finally {
      setLoading(false);
    }
  }, [moderationEnabled, t, user]);
  useEffect(() => {
    void load();
  }, [load]);
  // After a client-side navigation (e.g. from the dashboard) the address is only committed after the first render.
  useEffect(() => {
    const code = normalizeMaterialUnitCode(new URLSearchParams(window.location.search).get("uc"));
    if (code) void Promise.resolve().then(() => setUnitCode((current) => current || code));
  }, []);
  const selectUnit = useCallback((code: string) => {
    setUnitCode(code);
    setActiveTab("overview");
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("uc", code);
    else url.searchParams.delete("uc");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const submissionCounts = useMemo(() => materials.reduce<Record<string, number>>((counts, item) => {
    const code = materialUnitCode(item);
    counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {}), [materials]);
  const term = query.trim().toLocaleLowerCase(locale);
  const visible = useMemo(
    () =>
      materials
        .filter((item) => materialUnitCode(item) === unitCode && (filter === "all" || (filter === "favorites" ? item.favorite : item.category === filter)))
        .filter((item) => !term || [item.title, richTextPlainText(item.description), item.fileName, item.unit?.code, item.unit?.name, item.anonymous ? "" : item.authorName].join(" ").toLocaleLowerCase(locale).includes(term)),
    [materials, filter, term, locale, unitCode],
  );
  const interactiveStudyVisible = unitCode === "NEURO" && (filter === "all" || filter === "summary") && (!term || "neuroanatomia aula prática 1 resumo".includes(term));
  const libraryCount = visible.length + (interactiveStudyVisible ? 1 : 0);
  const [libraryPage, setLibraryPage] = useState(1);
  useEffect(() => { setLibraryPage(1); }, [filter, term, unitCode]);
  const currentLibraryPage = clampPage(libraryPage, visible.length, LIBRARY_PAGE_SIZE);
  const pageMaterials = visible.slice((currentLibraryPage - 1) * LIBRARY_PAGE_SIZE, currentLibraryPage * LIBRARY_PAGE_SIZE);
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
  const openItem = openId ? materials.find((item) => item.id === openId) ?? null : null;
  const authorOf = (item: Material) => personDisplay({ fullName: item.authorName, id: item.authorId, email: item.authorEmail, studentNumber: item.authorStudentNumber, anonymous: item.anonymous, anonymousLabel: t("community.materials.anonymousShare") }, { revealIdentifier: canModerate, locale });
  // Shortcut to the public, Drive-like page of the year's materials (opens in a new tab).
  useFloatingAction(!editor && !openId ? { id: "public-materials", label: t("nav.materials.public"), icon: FLOATING_PUBLIC_ICON, onClick: () => { window.open("/materiais-do-ano/", "_blank", "noopener"); } } : null);
  useFloatingAction(submissionEnabled && !editor && !openId ? { id: "share-material", label: t("community.materials.share"), icon: FLOATING_CREATE_ICON, onClick: () => setEditor(true) } : null);
  // Actions on the open material live in the floating menu.
  const pendingItem = canModerate && !editor && openItem?.status === "pending" && moderating !== openItem.id ? openItem : null;
  useFloatingAction(pendingItem ? { id: "approve-material", label: t(pendingItem.category === "exam" ? "community.materials.finishReview" : "community.materials.approve"), icon: FLOATING_APPROVE_ICON, onClick: () => void moderate(pendingItem.id, pendingItem.category === "exam" ? "archived" : "approved") } : null);
  useFloatingAction(pendingItem ? { id: "reject-material", label: t("community.materials.reject"), icon: FLOATING_REJECT_ICON, onClick: () => setRejectTarget(pendingItem) } : null);
  const versionable = canModerate && versioningEnabled && !editor && openItem?.status === "approved" ? openItem : null;
  useFloatingAction(versionable ? { id: "material-version", label: t(versionEditor === versionable.id ? "community.materials.closeVersion" : "community.materials.publishVersion"), icon: FLOATING_VERSION_ICON, onClick: () => { if (versionEditor === versionable.id) closeVersionEditor(); else { closeVersionEditor(); setVersionEditor(versionable.id); } } } : null);
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="materials.library">
        <AppShell active="materials" breadcrumb={t("community.materials.breadcrumb")}>
          <div className={styles.page}>
            <SurfaceHeader
              standalone
              headingLevel="h1"
              icon={<FolderOpen />}
              eyebrow={t("community.materials.eyebrow")}
              title={t("community.materials.title")}
            />
            {notice && (
              <AppToast
                kind={notice.kind}
                message={notice.message}
                onDismiss={() => setNotice(null)}
              />
            )}{" "}
            {!openId && !editor && <MaterialCatalog
              activeTab={activeTab}
              onTabChange={setActiveTab}
              unitCode={unitCode}
              onUnitChange={selectUnit}
              units={units}
              submissionCounts={submissionCounts}
              examsPanel={<div aria-busy={loading}>
              <FilterBar label={t("community.materials.filter")}>
                <FilterSearch label={t("community.materials.search")} value={query} onChange={setQuery} placeholder={t("community.materials.search")} />
                <FilterSelect label={t("community.materials.filter")} value={filter} onChange={setFilter} options={[{ value: "all", label: t("community.materials.all") }, ...(favoritesEnabled ? [{ value: "favorites", label: t("community.materials.favorites") }] : []), ...Object.entries(categoryLabelKeys).filter(([value]) => canModerate || value !== "exam").map(([value, key]) => ({ value, label: t(key) }))]} />
              </FilterBar>
              {loading ? <RecordSkeleton label={t("community.materials.loading")} />
                : loadError ? <div className={list.empty} role="alert"><FolderOpen /><strong>{t("community.materials.loadError")}</strong><button className={styles.emptyAction} type="button" onClick={() => void load()}>{t("community.materials.catalog.retry")}</button></div>
                : libraryCount === 0 ? <div className={list.empty}><FolderOpen /><strong>{t("community.materials.empty")}</strong>{(filter !== "all" || query) && <button className={styles.emptyAction} type="button" onClick={() => { setFilter("all"); setQuery(""); }}><X aria-hidden="true" />{t("community.materials.all")}</button>}</div>
                : <ul className={list.rows}>
                  {interactiveStudyVisible && currentLibraryPage === 1 && <li className={list.row} data-tone="success">
                    <span className={list.rowIcon} aria-hidden="true"><BookOpenCheck /></span>
                    <div className={list.rowMain}>
                      <h3><Link className={`link-quiet ${list.titleLink}`} href="/materiais/neuroanatomia/aula-1">Neuroanatomia · Aula prática 1</Link></h3>
                      <p className={list.rowMeta}>{t("community.materials.category.summary")} · Neuroanatomia · Leitura online</p>
                    </div>
                    <span className={list.statusPill} data-tone="success">{t("community.materials.status.approved")}</span>
                  </li>}
                  {pageMaterials.map((item) => <li className={list.row} key={item.id}>
                    <span className={list.rowIcon} aria-hidden="true">{item.fileType.startsWith("image/") ? <ImageIcon /> : <FileText />}</span>
                    <div className={list.rowMain}>
                      <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("material", item.id)} onClick={(event) => { event.preventDefault(); openMaterial(item.id); }}>{item.title}</a></h3>
                      <p className={list.rowMeta}>{t(categoryLabelKeys[item.category])} · <PersonName person={authorOf(item)} />{item.unit && ` · ${item.unit.code}`} · {date(item.createdAt, locale)}{item.favorite && <Star className={styles.favoriteMark} aria-label={t("community.materials.favorites")} />}</p>
                    </div>
                    <span className={list.statusPill} data-tone={statusTone[item.status]}>{t(statusLabelKeys[item.status])}</span>
                  </li>)}
                </ul>}
              {!loading && !loadError && <Pagination page={currentLibraryPage} totalItems={visible.length} pageSize={LIBRARY_PAGE_SIZE} onChange={setLibraryPage} />}
            </div>}
            />}
            {submissionEnabled && editor && (
              <MaterialUploadForm
                units={units}
                onClose={() => setEditor(false)}
                onSubmitted={(count) => {
                  setNotice({ kind: "success", message: t("community.materials.sent") + (count > 1 ? ` (${count})` : "") });
                  void load();
                }}
              />
            )}
            {!editor && openId && <>
              <button className={list.back} type="button" onClick={() => openMaterial(null)}><ChevronLeft aria-hidden="true" />{t("community.materials.all")}</button>
              <article className={`panel ${list.reading}`} aria-busy={loading}>
                {loading ? <RecordSkeleton label={t("community.materials.loading")} rows={2} /> : !openItem ? <div className={list.empty}><FolderOpen /><strong>{t("community.materials.empty")}</strong></div> : <>
                  <header className={list.byline}>
                    <span className={list.avatar} aria-hidden="true">{openItem.anonymous ? <ShieldCheck /> : initials(openItem.authorName)}</span>
                    <div>
                      <p className={list.bylineName}><PersonName person={authorOf(openItem)} /></p>
                      <p className={list.bylineMeta}>{t(categoryLabelKeys[openItem.category])} · {openItem.unit?.name ?? t("community.common.general")} · {date(openItem.createdAt, locale)}{versioningEnabled && ` · ${t("community.materials.version", { number: openItem.version })}`}</p>
                    </div>
                    <span className={list.statusPill} data-tone={statusTone[openItem.status]}>{t(statusLabelKeys[openItem.status])}</span>
                  </header>
                  <h2 className={list.readingTitle}>{openItem.title}</h2>
                  <span className={list.readingRule} aria-hidden="true" />
                  {openItem.description && <RichTextContent value={openItem.description} className={list.readingBody} />}
                  {openItem.fileType.startsWith("image/") && openItem.fileUrl && <div className={`${list.readingSection} ${styles.preview}`}><MaterialThumbnail key={`${openItem.id}-${openItem.fileUrl}`} fileType={openItem.fileType} src={openItem.fileUrl} title={openItem.title} /></div>}
                  {openItem.status === "approved" && openItem.fileUrl && <div className={list.readingSection}>
                    <a className={`button button--secondary button--compact ${styles.fileLink}`} href={openItem.fileUrl} download={openItem.fileName} target="_blank" rel="noreferrer"><Download aria-hidden="true" /><span>{openItem.fileName}</span></a>
                  </div>}
                  {canModerate && openItem.category === "exam" && openItem.attachments.length > 0 && <section className={`${list.readingSection} ${styles.photoDownloads}`}>
                    <h3>{openItem.attachments.length} {openItem.attachments.length === 1 ? t("community.materials.photo") : t("community.materials.photoPlural")}</h3>
                    <div>{openItem.attachments.map((attachment, index) => <a key={attachment.id} href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer"><Download aria-hidden="true" />{t("community.materials.photoNumber", { number: index + 1 })}<small>{attachment.name}</small></a>)}</div>
                  </section>}
                  {openItem.status === "approved" && (favoritesEnabled || feedbackEnabled) && <div className={`${list.readingSection} ${styles.feedbackActions}`}>
                    {favoritesEnabled && <button className={`${styles.feedbackButton} ${openItem.favorite ? styles.isActive : ""}`} type="button" onClick={() => void toggleFavorite(openItem)} disabled={feedbackBusy === `favorite-${openItem.id}`} aria-pressed={openItem.favorite}><Star aria-hidden="true" /><span>{t(openItem.favorite ? "community.materials.unfavorite" : "community.materials.favorite")}</span></button>}
                    {feedbackEnabled && <button className={`${styles.feedbackButton} ${openItem.helpful ? styles.isActive : ""}`} type="button" onClick={() => void setFeedback(openItem, "helpful")} disabled={feedbackBusy === `helpful-${openItem.id}`} aria-pressed={openItem.helpful}><ThumbsUp aria-hidden="true" /><span>{t(openItem.helpful ? "community.materials.notHelpful" : "community.materials.helpful")}</span><b>{openItem.helpfulCount}</b></button>}
                    {feedbackEnabled && <button className={`${styles.feedbackButton} ${openItem.reportedOutdated ? styles.isWarning : ""}`} type="button" onClick={() => void setFeedback(openItem, "outdated")} disabled={feedbackBusy === `outdated-${openItem.id}`} aria-pressed={openItem.reportedOutdated}><Flag aria-hidden="true" /><span>{t(openItem.reportedOutdated ? "community.materials.outdatedMarked" : "community.materials.outdated")}</span>{openItem.outdatedCount > 0 && <b>{openItem.outdatedCount}</b>}</button>}
                  </div>}
                  {versioningEnabled && openItem.status === "approved" && <section className={`${list.readingSection} ${styles.versionList}`}>
                    <h3><button className={styles.versionToggle} type="button" aria-expanded={versionsOpen === openItem.id} onClick={() => void toggleVersions(openItem)} disabled={versionsLoading === openItem.id}><History aria-hidden="true" />{t(versionsOpen === openItem.id ? "community.materials.hideVersions" : "community.materials.versions")}</button></h3>
                    {versionsOpen === openItem.id && versionsLoading !== openItem.id && (openItem.versions.length === 0 ? <p>{t("community.materials.noVersions")}</p> : openItem.versions.map((version) => (
                      <div className={styles.versionRow} key={version.id}>
                        <span><b>{t("community.materials.version", { number: version.number })}</b><small>{date(version.createdAt, locale)}{version.notes ? ` · ${version.notes}` : ""}</small></span>
                        {version.fileUrl && <a href={version.fileUrl} target="_blank" rel="noreferrer" download={version.fileName} title={version.fileName}><Download aria-hidden="true" /></a>}
                      </div>
                    )))}
                  </section>}
                  {canModerate && versionEditor === openItem.id && <footer className={list.manageArea}>
                    <div className={styles.versionForm}>
                      <label><span>{t("community.materials.versionFile")}</span><input type="file" accept={allowed.join(",")} onChange={(event) => void pickVersionFile(event)} />{versionFile && <small>{versionFile.name} · {size(versionFile.size, locale)}</small>}</label>
                      <label><span>{t("community.materials.versionNotes")}</span><textarea value={versionNotes} onChange={(event) => setVersionNotes(event.target.value)} maxLength={500} placeholder={t("community.materials.versionNotesPlaceholder")} /></label>
                      <button className="button button--primary button--compact" type="button" onClick={() => void publishVersion(openItem)} disabled={publishingVersion}>{t(publishingVersion ? "community.materials.publishingVersion" : "community.materials.publishVersion")}</button>
                    </div>
                  </footer>}
                </>}
              </article>
            </>}
            <ConfirmationDialog
              open={Boolean(rejectTarget)}
              eyebrow=""
              title={t("community.materials.rejectConfirm")}
              description=""
              subject={rejectTarget?.title}
              subjectLabel={t("community.materials.selectedMaterial")}
              confirmLabel={t("community.materials.reject")}
              cancelLabel={t("community.common.cancel")}
              icon={<X />}
              busy={Boolean(rejectTarget && moderating === rejectTarget.id)}
              onClose={() => setRejectTarget(null)}
              onConfirm={() => { if (rejectTarget) void moderate(rejectTarget.id, "rejected").then(() => setRejectTarget(null)); }}
            />
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
