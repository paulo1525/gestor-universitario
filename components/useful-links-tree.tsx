"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, House, Lock, LogIn, Pencil, Plus, Trash2 } from "lucide-react";
import { AppToast, type ToastKind } from "@/components/app-toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useFloatingAction } from "@/components/floating-actions";
import { useI18n } from "@/components/i18n-context";
import { EMPTY_USEFUL_LINK_DRAFT, USEFUL_LINK_CATEGORIES, UsefulLinkEditor, type UsefulLinkDraft } from "@/components/useful-link-editor";
import styles from "@/components/useful-links-tree.module.css";

const FLOATING_CREATE_ICON = <Plus aria-hidden="true" />;
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, important: 1, normal: 2 };
const SKELETON_ROWS = [0, 1, 2, 3, 4];
export const USEFUL_LINKS_PUBLIC_PATH = "/links-uteis/";

type TreeLink = { id: string; title: string; url: string; description: string; category: string; priority: string; visibility: string; status: string; unitId: string | null; requiresLogin: boolean };
type TreeState = { status: "loading" | "ready" | "unavailable"; links: TreeLink[]; authenticated: boolean; restricted: boolean; canManage: boolean };
type ApiLink = { id: string | number; title?: string; url?: string; description?: string; category?: string; priority?: string; visibility?: string; status?: string; unitId?: string | number | null; requiresLogin?: boolean };
type ApiPayload = { links?: ApiLink[]; authenticated?: boolean; restricted?: boolean; canManage?: boolean; error?: string };
type Editor = { key: number; link: TreeLink | null; draft: UsefulLinkDraft };
type Notice = { kind: ToastKind; message: string } | null;

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function initialOf(title: string) {
  const letter = title.trim().match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toLocaleUpperCase() : "·";
}

function normalise(item: ApiLink): TreeLink {
  return {
    id: String(item.id),
    title: item.title?.trim() || hostOf(item.url ?? ""),
    url: item.url ?? "",
    description: item.description?.trim() ?? "",
    category: item.category ?? "other",
    priority: item.priority ?? "normal",
    visibility: item.visibility ?? "public",
    status: item.status ?? "published",
    unitId: item.unitId == null || item.unitId === "" ? null : String(item.unitId),
    requiresLogin: item.requiresLogin === true,
  };
}

function draftOf(link: TreeLink): UsefulLinkDraft {
  return { title: link.title, url: link.url, description: link.description, category: link.category, requiresLogin: link.requiresLogin, ccOnly: link.visibility === "cc", highlight: link.priority !== "normal" };
}

function wantsCreate() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("novo") === "1";
}

export function UsefulLinksTree() {
  const { t } = useI18n();
  const [state, setState] = useState<TreeState>({ status: "loading", links: [], authenticated: false, restricted: false, canManage: false });
  const [pendingCreate] = useState(wantsCreate);
  const editorSeq = useRef(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TreeLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    try {
      const response = await fetch("/api/useful-links", { cache: "no-store", credentials: "same-origin", signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as ApiPayload;
      const links = (data.links ?? []).filter((item) => typeof item.url === "string" && item.url.startsWith("https://")).map(normalise);
      setState({ status: "ready", links, authenticated: data.authenticated === true, restricted: data.restricted === true, canManage: data.canManage === true });
      return data.canManage === true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setState((current) => ({ ...current, status: current.status === "ready" ? "ready" : "unavailable" }));
      return false;
    }
  }, []);

  const openCreate = useCallback(() => { editorSeq.current += 1; setEditorError(""); setEditor({ key: editorSeq.current, link: null, draft: EMPTY_USEFUL_LINK_DRAFT }); }, []);
  const openEdit = (link: TreeLink) => { editorSeq.current += 1; setEditorError(""); setEditor({ key: editorSeq.current, link, draft: draftOf(link) }); };

  useEffect(() => {
    const controller = new AbortController();
    // /links-uteis/?novo=1 opens the add modal once the server confirms the visitor may manage.
    // State is only set after the fetch resolves, never synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal).then((canManage) => {
      if (!pendingCreate || controller.signal.aborted) return;
      window.history.replaceState(null, "", window.location.pathname);
      if (canManage) openCreate();
    });
    return () => controller.abort();
  }, [load, openCreate, pendingCreate]);

  useFloatingAction(state.canManage && !editor ? { id: "new-link", label: t("links.add"), icon: FLOATING_CREATE_ICON, onClick: openCreate } : null);

  const save = async (draft: UsefulLinkDraft) => {
    const current = editor?.link ?? null;
    let url: URL | null = null;
    try { url = new URL(draft.url.trim()); } catch { url = null; }
    if (!draft.title.trim() || !url || url.protocol !== "https:") { setEditorError(t(url ? "links.required" : "links.invalidUrl")); return; }
    const requiresLogin = draft.ccOnly || draft.requiresLogin;
    const payload = {
      id: current?.id,
      title: draft.title.trim(),
      url: url.toString(),
      description: draft.description.trim(),
      category: draft.category,
      priority: draft.highlight ? (current && current.priority !== "normal" ? current.priority : "urgent") : "normal",
      visibility: draft.ccOnly ? "cc" : requiresLogin ? "students" : "public",
      requiresLogin,
      status: current?.status ?? "published",
      unitId: current?.unitId ?? null,
    };
    setSaving(true);
    setEditorError("");
    try {
      const response = await fetch("/api/useful-links", { method: current ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("links.saveError"));
      setEditor(null);
      setNotice({ kind: "success", message: t("links.saved") });
      await load();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t("links.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/useful-links", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: deleteTarget.id }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("links.actionError"));
      setNotice({ kind: "success", message: t("links.deleted") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("links.actionError") });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const groups = useMemo(() => {
    const byCategory = new Map<string, TreeLink[]>();
    for (const item of state.links) {
      const key = (USEFUL_LINK_CATEGORIES as readonly string[]).includes(item.category) ? item.category : "other";
      byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
    }
    return USEFUL_LINK_CATEGORIES.filter((key) => byCategory.has(key)).map((key) => ({
      key,
      links: (byCategory.get(key) ?? []).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)),
    }));
  }, [state.links]);

  const showLabels = groups.length > 1;
  const signInHref = `/login/?next=${encodeURIComponent(USEFUL_LINKS_PUBLIC_PATH)}`;

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <nav className={styles.topRow} aria-label={t("links.title")}>
          {state.authenticated && <Link className={styles.iconLink} href="/" aria-label={t("links.tree.home")} title={t("links.tree.home")}><House aria-hidden="true" /></Link>}
          <span className={styles.spacer} />
          {state.status === "ready" && !state.authenticated && state.restricted && <Link className={styles.signIn} href={signInHref}><LogIn aria-hidden="true" />{t("links.tree.signIn")}</Link>}
        </nav>

        <header className={styles.header}>
          <span className={styles.logoFrame}><Image className={styles.logo} src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt={t("shell.brandAlt")} width={88} height={88} priority /></span>
          <h1 className={styles.title}>{t("links.title")}</h1>
          <p className={styles.brand}>{t("links.tree.brand")}</p>
        </header>

        {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

        {state.status === "loading" ? (
          <div className={styles.list} aria-busy="true" aria-label={t("links.title")}>
            {SKELETON_ROWS.map((row) => <span className={`${styles.row} ${styles.skeleton}`} key={row}><span className={styles.link}><span className={styles.chip} /><span className={styles.copy}><span className={styles.skeletonLine} /><span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} /></span></span></span>)}
          </div>
        ) : state.status === "unavailable" ? (
          <p className={styles.message} role="status">{t("links.tree.unavailable")}</p>
        ) : groups.length === 0 ? (
          <p className={styles.message}>{t("links.emptyNone")}</p>
        ) : (
          <div className={styles.groups}>
            {groups.map((group) => (
              <section className={styles.group} key={group.key} aria-label={t(`links.category.${group.key}`)}>
                {showLabels && <h2 className={styles.groupLabel}>{t(`links.category.${group.key}`)}</h2>}
                <ul className={styles.list}>
                  {group.links.map((item) => (
                    <li className={styles.row} data-priority={item.priority} key={item.id}>
                      {/* Row: [chip + text link] [lock] [edit] [delete] [↗]. Actions are siblings of the links, never nested. */}
                      <a className={styles.link} href={item.url} target="_blank" rel="noopener noreferrer">
                        <span className={styles.chip} aria-hidden="true">{initialOf(item.title)}</span>
                        <span className={styles.copy}>
                          <strong>{item.title}</strong>
                          <small>{item.description || hostOf(item.url)}</small>
                        </span>
                        {state.canManage && item.requiresLogin && <Lock className={styles.lock} aria-label={t("links.requiresLogin")} role="img" />}
                        <span className="sr-only"> ({t("links.opensInNewTab")})</span>
                      </a>
                      {state.canManage && (
                        <span className={styles.itemActions}>
                          <button className={styles.itemAction} type="button" onClick={(event) => { event.stopPropagation(); openEdit(item); }} aria-label={`${t("links.editAction")}: ${item.title}`} title={t("links.editAction")}><Pencil aria-hidden="true" /></button>
                          <button className={`${styles.itemAction} ${styles.itemActionDanger}`} type="button" onClick={(event) => { event.stopPropagation(); setDeleteTarget(item); }} aria-label={`${t("links.delete")}: ${item.title}`} title={t("links.delete")}><Trash2 aria-hidden="true" /></button>
                        </span>
                      )}
                      <a className={styles.arrowLink} href={item.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true"><ArrowUpRight className={styles.arrow} /></a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {editor && <UsefulLinkEditor key={editor.key} open editing={Boolean(editor.link)} initial={editor.draft} busy={saving} error={editorError} onClose={() => setEditor(null)} onSubmit={(draft) => void save(draft)} />}
      <ConfirmationDialog open={Boolean(deleteTarget)} title={t("links.deleteTitle")} description={t("links.confirmDelete")} subject={deleteTarget?.title} warning={t("links.deleteWarning")} confirmLabel={t("links.delete")} cancelLabel={t("links.cancel")} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </main>
  );
}
