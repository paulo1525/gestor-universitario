"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, File, FileImage, FileText, Folder, Globe, House, Lock, LogIn, Package, RefreshCw, Search } from "lucide-react";
import { AppToast, type ToastKind } from "@/components/app-toast";
import { useI18n } from "@/components/i18n-context";
import { clampPage, Pagination } from "@/components/pagination";
import { materialReaderHref } from "@/lib/material-reader";
import styles from "@/components/public-materials.module.css";

export const PUBLIC_MATERIALS_PATH = "/materiais-do-ano/";
const FILES_PAGE_SIZE = 20;

type Section = "summaries" | "notes" | "bibliography" | "anki" | "other";
const SECTIONS: Section[] = ["summaries", "notes", "bibliography", "anki", "other"];
// A locked entry carries only its section: the server never sends its title, id or link to visitors.
type Entry = { section: Section; locked: boolean; id?: string; type?: "catalog" | "anki"; title?: string; href?: string; download?: string; isPublic?: boolean; mime?: string; size?: number | null; updatedAt?: number | null };
type Unit = { key: string; code: string; name: string; entries: Entry[] };
type Drive = { configured: boolean; lastFinishedAt: number | null; status: string; message: string; files: number };
type State = { status: "loading" | "ready" | "unavailable"; units: Unit[]; authenticated: boolean; canManage: boolean; drive?: Drive };
type Place = { unit: string; section: Section | "" };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-PT");
}

/** The open folder lives in the address (?pasta=NEURO/notes) so it can be shared and survives a reload. */
function placeFromUrl(): Place {
  if (typeof window === "undefined") return { unit: "", section: "" };
  const [unit = "", section = ""] = (new URLSearchParams(window.location.search).get("pasta") ?? "").split("/");
  return { unit, section: (SECTIONS as string[]).includes(section) ? section as Section : "" };
}

function unitKey(unit: Unit) {
  return unit.code || unit.key;
}

function fileSize(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
}

function fileDate(value?: number | null) {
  return value ? new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function FileIcon({ entry }: { entry: Entry }) {
  if (entry.section === "anki" || entry.mime === "application/apkg") return <Package aria-hidden="true" />;
  if (entry.mime?.startsWith("image/")) return <FileImage aria-hidden="true" />;
  if (entry.mime === "application/pdf") return <FileText aria-hidden="true" />;
  return <File aria-hidden="true" />;
}

/** Public, Drive-like browser of the year's materials: subject folders → type folders → files. */
export function PublicMaterials() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading", units: [], authenticated: false, canManage: false });
  const [place, setPlace] = useState<Place>(placeFromUrl);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ kind: ToastKind; message: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/public-materials", { cache: "no-store", credentials: "same-origin", signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as { units?: Unit[]; authenticated?: boolean; canManage?: boolean; drive?: Drive };
      setState({ status: "ready", units: (data.units ?? []).filter((unit) => unit.entries.length), authenticated: data.authenticated === true, canManage: data.canManage === true, drive: data.drive });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setState((current) => ({ ...current, status: current.status === "ready" ? "ready" : "unavailable" }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const onPop = () => { setPlace(placeFromUrl()); setPage(1); };
    window.addEventListener("popstate", onPop);
    return () => { controller.abort(); window.removeEventListener("popstate", onPop); };
  }, [load]);

  const open = (next: Place) => {
    setPlace(next);
    setPage(1);
    setQuery("");
    const url = new URL(window.location.href);
    const value = [next.unit, next.section].filter(Boolean).join("/");
    if (value) url.searchParams.set("pasta", value); else url.searchParams.delete("pasta");
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  };

  const toggle = async (entry: Entry) => {
    if (!entry.id || !entry.type) return;
    const next = !entry.isPublic;
    setBusy(entry.id);
    try {
      const response = await fetch("/api/public-materials", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.id, type: entry.type, public: next }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || t("publicMaterials.toggleError"));
      setState((current) => ({ ...current, units: current.units.map((unit) => ({ ...unit, entries: unit.entries.map((item) => item.id === entry.id && item.type === entry.type ? { ...item, isPublic: next } : item) })) }));
      setNotice({ kind: "success", message: t(next ? "publicMaterials.madePublic" : "publicMaterials.madePrivate") });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("publicMaterials.toggleError") });
    } finally {
      setBusy(null);
    }
  };

  const syncDrive = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/drive-sync", { method: "POST" });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string; files?: number };
      if (!response.ok) throw new Error(data.error || data.message || t("publicMaterials.drive.error"));
      setNotice({ kind: "success", message: t("publicMaterials.drive.done", { count: data.files ?? 0 }) });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("publicMaterials.drive.error") });
    } finally {
      setSyncing(false);
    }
  };

  const sectionLabel = (section: Section) => t(`publicMaterials.section.${section}` as "publicMaterials.section.summaries");
  const unit = state.units.find((item) => unitKey(item) === place.unit) ?? null;
  const section = unit && place.section && unit.entries.some((entry) => entry.section === place.section) ? place.section : "";
  const term = normalize(query.trim());

  // What the current view lists: search results across every folder, or the files of the open type folder.
  const files = useMemo(() => {
    if (term) return state.units.flatMap((item) => item.entries.filter((entry) => !entry.locked && normalize(`${entry.title ?? ""} ${item.code} ${item.name}`).includes(term)).map((entry) => ({ entry, unit: item })));
    if (unit && section) return unit.entries.filter((entry) => entry.section === section).map((entry) => ({ entry, unit }));
    return [];
  }, [section, state.units, term, unit]);
  const currentPage = clampPage(page, files.length, FILES_PAGE_SIZE);
  const pageFiles = files.slice((currentPage - 1) * FILES_PAGE_SIZE, currentPage * FILES_PAGE_SIZE);

  const signInHref = `/login/?next=${encodeURIComponent(PUBLIC_MATERIALS_PATH)}`;
  const hasLocked = state.units.some((item) => item.entries.some((entry) => entry.locked));
  // Signed-in users read PDFs in the annotator; visitors open the public file directly.
  const openHref = (entry: Entry) => state.authenticated && entry.type === "catalog" && entry.id && entry.href?.endsWith("/view") ? materialReaderHref(entry.id) : entry.href ?? "#";
  const count = (entries: Entry[]) => t(entries.length === 1 ? "publicMaterials.fileOne" : "publicMaterials.files", { count: entries.length });

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <Link className={styles.brand} href={PUBLIC_MATERIALS_PATH} onClick={(event) => { event.preventDefault(); open({ unit: "", section: "" }); }}>
          <Image src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="" width={32} height={32} priority />
          <span><strong>{t("publicMaterials.title")}</strong><small>{t("links.tree.brand")}</small></span>
        </Link>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <span className="sr-only">{t("publicMaterials.search")}</span>
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("publicMaterials.searchPlaceholder")} />
        </label>
        <nav className={styles.topActions} aria-label={t("publicMaterials.title")}>
          {state.authenticated && <Link className={styles.iconButton} href="/" aria-label={t("links.tree.home")} title={t("links.tree.home")}><House aria-hidden="true" /></Link>}
          {state.status === "ready" && !state.authenticated && hasLocked && <Link className={styles.textButton} href={signInHref}><LogIn aria-hidden="true" />{t("links.tree.signIn")}</Link>}
        </nav>
      </header>

      <div className={styles.body}>
        {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

        {/* Only shown once Google Drive is configured; storage stays on R2 otherwise. */}
        {state.canManage && state.drive?.configured && <div className={styles.driveBar} role="status">
          <span>
            <strong>{t("publicMaterials.drive.title")}</strong>
            <small>{!state.drive.configured ? t("publicMaterials.drive.notConfigured") : state.drive.status === "error" ? state.drive.message : state.drive.lastFinishedAt ? `${t("publicMaterials.drive.last", { date: new Date(Number(state.drive.lastFinishedAt)).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) })}${state.drive.message && state.drive.message !== "Sincronizado." ? ` · ${state.drive.message}` : ""}` : t("publicMaterials.drive.never")}</small>
          </span>
          {state.drive.configured && <button className={styles.textButton} type="button" onClick={() => void syncDrive()} disabled={syncing}><RefreshCw aria-hidden="true" />{syncing ? t("publicMaterials.drive.syncing") : t("publicMaterials.drive.sync")}</button>}
        </div>}

        <nav className={styles.crumbs} aria-label={t("publicMaterials.path")}>
          {term ? <span aria-current="page">{t("publicMaterials.results", { count: files.length })}</span> : <>
            <button type="button" onClick={() => open({ unit: "", section: "" })} aria-current={!unit ? "page" : undefined}>{t("publicMaterials.title")}</button>
            {unit && <><ChevronRight aria-hidden="true" /><button type="button" onClick={() => open({ unit: unitKey(unit), section: "" })} aria-current={!section ? "page" : undefined}>{unit.code ? `${unit.code} · ${unit.name}` : unit.name || t("publicMaterials.general")}</button></>}
            {unit && section && <><ChevronRight aria-hidden="true" /><span aria-current="page">{sectionLabel(section)}</span></>}
          </>}
        </nav>

        {state.status === "loading" ? (
          <div className={styles.folders} aria-busy="true" aria-label={t("publicMaterials.title")}>{[0, 1, 2, 3].map((item) => <span className={`${styles.folder} ${styles.skeleton}`} key={item} />)}</div>
        ) : state.status === "unavailable" ? (
          <p className={styles.message} role="status">{t("links.tree.unavailable")}</p>
        ) : state.units.length === 0 ? (
          <p className={styles.message}>{t("publicMaterials.empty")}</p>
        ) : !term && !unit ? (
          <ul className={styles.folders}>
            {state.units.map((item) => <li key={item.key}><button className={styles.folder} type="button" onClick={() => open({ unit: unitKey(item), section: "" })}>
              <Folder aria-hidden="true" />
              <span><strong>{item.code || item.name || t("publicMaterials.general")}</strong><small>{item.code ? `${item.name} · ` : ""}{count(item.entries)}</small></span>
            </button></li>)}
          </ul>
        ) : !term && unit && !section ? (
          <ul className={styles.folders}>
            {SECTIONS.filter((key) => unit.entries.some((entry) => entry.section === key)).map((key) => {
              const entries = unit.entries.filter((entry) => entry.section === key);
              return <li key={key}><button className={styles.folder} type="button" onClick={() => open({ unit: unitKey(unit), section: key })}>
                <Folder aria-hidden="true" />
                <span><strong>{sectionLabel(key)}</strong><small>{count(entries)}</small></span>
              </button></li>;
            })}
          </ul>
        ) : files.length === 0 ? (
          <p className={styles.message} role="status">{t("publicMaterials.noResults")}</p>
        ) : (
          <div className={styles.files}>
            <div className={styles.fileHead} aria-hidden="true"><span>{t("publicMaterials.column.name")}</span><span>{t("publicMaterials.column.size")}</span><span>{t("publicMaterials.column.date")}</span><span /></div>
            <ul>
              {pageFiles.map(({ entry, unit: owner }, index) => entry.locked ? (
                <li className={`${styles.file} ${styles.locked}`} key={`locked-${index}`}>
                  <Link className={styles.fileName} href={signInHref}>
                    <Lock aria-hidden="true" />
                    <span><span className={styles.redacted} aria-hidden="true" /><small>{t("publicMaterials.lockedFile")}</small><span className="sr-only">{t("links.tree.locked")}</span></span>
                  </Link>
                  <span className={styles.fileMeta}>—</span><span className={styles.fileMeta}>—</span><span />
                </li>
              ) : (
                <li className={styles.file} key={`${entry.type}-${entry.id}`}>
                  <a className={styles.fileName} href={openHref(entry)} target="_blank" rel="noopener">
                    <FileIcon entry={entry} />
                    <span><strong>{entry.title}</strong>{term && <small>{owner.code || owner.name} › {sectionLabel(entry.section)}</small>}</span>
                    <span className="sr-only"> ({t("links.opensInNewTab")})</span>
                  </a>
                  <span className={styles.fileMeta}>{fileSize(entry.size)}</span>
                  <span className={styles.fileMeta}>{fileDate(entry.updatedAt)}</span>
                  <span className={styles.fileActions}>
                    {state.canManage && <button type="button" disabled={busy === entry.id} onClick={() => void toggle(entry)} aria-pressed={entry.isPublic === true} aria-label={`${t(entry.isPublic ? "publicMaterials.isPublic" : "publicMaterials.isPrivate")}: ${entry.title}`} title={t(entry.isPublic ? "publicMaterials.isPublic" : "publicMaterials.isPrivate")}>{entry.isPublic ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}</button>}
                    {entry.download && <a href={entry.download} download aria-label={`${t("publicMaterials.download")}: ${entry.title}`} title={t("publicMaterials.download")}><Download aria-hidden="true" /></a>}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination page={currentPage} totalItems={files.length} pageSize={FILES_PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>
    </main>
  );
}
