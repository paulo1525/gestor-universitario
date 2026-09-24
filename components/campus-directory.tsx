"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, DoorOpen, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { useFloatingAction } from "@/components/floating-actions";
import { CancelButton, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";
import { SurfaceHeader } from "@/components/surface-header";
import { useEscapeKey } from "@/components/use-escape-key";
import { useScrollLock } from "@/components/use-scroll-lock";
import list from "@/components/record-list.module.css";
import styles from "./campus-directory.module.css";

/* "Salas e docentes": a simple list of rooms (room, building, optional teacher, classes). */

type Building = "cim" | "hsj";
type Space = { id: string; room: string; building: Building; teacher: string | null; classes: number[] };
type Notice = { kind: ToastKind; message: string };
type Form = { room: string; building: Building; teacher: string; classes: number[] };

const EMPTY_FORM: Form = { room: "", building: "cim", teacher: "", classes: [] };
const CREATE_ICON = <Plus aria-hidden="true" />;
const EDIT_ICON = <Pencil aria-hidden="true" />;
const DELETE_ICON = <Trash2 aria-hidden="true" />;

export function CampusDirectory() {
  const { t } = useI18n();
  const buildingLabel = useCallback((building: Building) => t(building === "cim" ? "campus.spaces.building.cim" : "campus.spaces.building.hsj"), [t]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [classIds, setClassIds] = useState<number[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [editor, setEditor] = useState<{ id: string | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Space | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openId, openSpace] = useHashRecord("sala");

  // Links from the calendar arrive as /salas-docentes?q=<place>.
  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("q") || "";
    if (preset) queueMicrotask(() => setQuery(current => current || preset.slice(0, 100)));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/campus", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as { spaces?: Space[]; classes?: number[]; canManage?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || t("campus.spaces.loadError"));
      setSpaces(data.spaces ?? []);
      setClassIds(data.classes ?? []);
      setCanManage(Boolean(data.canManage));
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("campus.spaces.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  // A função inicia I/O antes de atualizar o estado com a resposta.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-PT");
    return spaces.filter(space =>
      (buildingFilter === "all" || space.building === buildingFilter)
      && (classFilter === "all" || space.classes.includes(Number(classFilter)))
      && (!needle || [space.room, space.teacher || "", buildingLabel(space.building)].join(" ").toLocaleLowerCase("pt-PT").includes(needle)));
  }, [buildingFilter, buildingLabel, classFilter, query, spaces]);

  const openItem = openId ? spaces.find(space => space.id === openId) ?? null : null;
  const classesMeta = (space: Space) => space.classes.length ? t("campus.spaces.classesMeta", { list: space.classes.join(", ") }) : "";
  const meta = (space: Space) => [buildingLabel(space.building), space.teacher, classesMeta(space)].filter(Boolean).join(" · ");

  const openEditor = (space: Space | null) => setEditor({ id: space?.id ?? null, form: space ? { room: space.room, building: space.building, teacher: space.teacher || "", classes: space.classes } : EMPTY_FORM });
  const closeEditor = () => { if (!saving) setEditor(null); };

  useFloatingAction(canManage && !editor && !openId ? { id: "new-space", label: t("campus.spaces.new"), icon: CREATE_ICON, onClick: () => openEditor(null) } : null);
  useFloatingAction(canManage && !editor && openItem ? { id: "edit-space", label: t("campus.spaces.edit"), icon: EDIT_ICON, onClick: () => openEditor(openItem) } : null);
  useFloatingAction(canManage && !editor && openItem ? { id: "delete-space", label: t("campus.spaces.delete"), icon: DELETE_ICON, onClick: () => setDeleteTarget(openItem) } : null);

  const save = async (form: Form, id: string | null) => {
    setSaving(true);
    try {
      const response = await fetch("/api/campus", { method: id ? "PUT" : "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "space", id, ...form }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("campus.spaces.error"));
      setEditor(null);
      setNotice({ kind: "success", message: t("campus.spaces.saved") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("campus.spaces.error") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/campus", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "space", id: deleteTarget.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("campus.spaces.error"));
      if (openId === deleteTarget.id) openSpace(null);
      setDeleteTarget(null);
      setNotice({ kind: "success", message: t("campus.spaces.deleted") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("campus.spaces.error") });
    } finally {
      setDeleting(false);
    }
  };

  return <AuthGuard><ModuleGuard moduleKey="campus.directory"><AppShell active="campus" breadcrumb={t("campus.title")}>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <SurfaceHeader standalone headingLevel="h1" icon={<MapPinned />} eyebrow={t("campus.eyebrow")} title={t("campus.title")} />

    {!openId && <section className={`panel ${list.listPanel}`} aria-busy={loading}>
      <FilterBar label={t("campus.spaces.search")}>
        <FilterSearch label={t("campus.spaces.search")} value={query} onChange={setQuery} placeholder={t("campus.spaces.search")} />
        <FilterSelect label={t("campus.spaces.building")} value={buildingFilter} onChange={setBuildingFilter} options={[{ value: "all", label: t("campus.spaces.allBuildings") }, { value: "cim", label: buildingLabel("cim") }, { value: "hsj", label: buildingLabel("hsj") }]} />
        <FilterSelect label={t("campus.spaces.classes")} value={classFilter} onChange={setClassFilter} options={[{ value: "all", label: t("campus.spaces.allClasses") }, ...classIds.map(id => ({ value: String(id), label: t("campus.spaces.class", { n: id }) }))]} />
      </FilterBar>
      {loading ? <RecordSkeleton label={t("campus.spaces.loading")} /> : visible.length === 0 ? <div className={list.empty}><DoorOpen /><strong>{t(spaces.length ? "campus.spaces.noResults" : "campus.spaces.empty")}</strong></div> : <ul className={list.rows}>
        {visible.map(space => <li className={list.row} key={space.id} data-tone={space.building === "cim" ? "accent" : "info"}>
          <span className={list.statusDot} aria-hidden="true" />
          <div className={list.rowMain}>
            <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("sala", space.id)} onClick={event => { event.preventDefault(); openSpace(space.id); }}>{space.room}</a></h3>
            <p className={list.rowMeta}>{meta(space)}</p>
          </div>
        </li>)}
      </ul>}
    </section>}

    {openId && <>
      <button className={list.back} type="button" onClick={() => openSpace(null)}><ChevronLeft aria-hidden="true" />{t("campus.spaces.back")}</button>
      <article className={`panel ${list.reading}`} aria-busy={loading}>
        {loading ? <RecordSkeleton label={t("campus.spaces.loading")} rows={2} /> : !openItem ? <div className={list.empty}><DoorOpen /><strong>{t("campus.spaces.noResults")}</strong></div> : <>
          <p className={styles.eyebrow}>{buildingLabel(openItem.building)}</p>
          <h2 className={styles.title}>{openItem.room}</h2>
          <span className={styles.rule} aria-hidden="true" />
          <dl className={styles.facts}>
            <div><dt>{t("campus.spaces.building")}</dt><dd>{buildingLabel(openItem.building)}</dd></div>
            {openItem.teacher && <div><dt>{t("campus.spaces.teacher")}</dt><dd>{openItem.teacher}</dd></div>}
            {openItem.classes.length > 0 && <div><dt>{t("campus.spaces.classes")}</dt><dd className={styles.classList}>{openItem.classes.map(id => <span key={id}>{id}</span>)}</dd></div>}
          </dl>
        </>}
      </article>
    </>}

    {editor && <SpaceEditor editor={editor} classIds={classIds.length ? classIds : Array.from({ length: 20 }, (_, index) => index + 1)} saving={saving} buildingLabel={buildingLabel} onClose={closeEditor} onSave={save} />}

    <ConfirmationDialog
      open={Boolean(deleteTarget)}
      title={t("campus.spaces.deleteTitle")}
      description={t("campus.spaces.deleteTitle")}
      subject={deleteTarget ? `${deleteTarget.room} · ${buildingLabel(deleteTarget.building)}` : undefined}
      confirmLabel={t("campus.spaces.delete")}
      cancelLabel={t("common.cancel")}
      busy={deleting}
      onClose={() => { if (!deleting) setDeleteTarget(null); }}
      onConfirm={() => void remove()}
    />
  </AppShell></ModuleGuard></AuthGuard>;
}

function SpaceEditor({ editor, classIds, saving, buildingLabel, onClose, onSave }: { editor: { id: string | null; form: Form }; classIds: number[]; saving: boolean; buildingLabel: (building: Building) => string; onClose: () => void; onSave: (form: Form, id: string | null) => Promise<void> }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(editor.form);
  useEscapeKey(true, onClose);
  useScrollLock(true);
  useEffect(() => { roomRef.current?.focus(); }, []);

  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])") ?? [])];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const toggleClass = (id: number) => setForm(current => ({ ...current, classes: current.classes.includes(id) ? current.classes.filter(value => value !== id) : [...current.classes, id].sort((a, b) => a - b) }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (form.room.trim()) void onSave({ ...form, room: form.room.trim(), teacher: form.teacher.trim() }, editor.id); };

  return <div className="app-modal-backdrop" data-app-modal-backdrop role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section ref={dialogRef} data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keepFocusInside}>
      <header className="app-modal-header" data-app-modal-header>
        <h2 id={titleId}>{t(editor.id ? "campus.spaces.editTitle" : "campus.spaces.new")}</h2>
        <FormCloseButton onClick={onClose} label={t("common.close")} disabled={saving} />
      </header>
      <form id="campus-space-form" className={styles.form} data-app-modal-body onSubmit={submit}>
        <label className={styles.field}><span>{t("campus.spaces.room")}</span><input ref={roomRef} value={form.room} maxLength={60} required onChange={event => setForm({ ...form, room: event.target.value })} /></label>
        <label className={styles.field}><span>{t("campus.spaces.building")}</span><select value={form.building} onChange={event => setForm({ ...form, building: event.target.value as Building })}><option value="cim">{buildingLabel("cim")}</option><option value="hsj">{buildingLabel("hsj")}</option></select></label>
        <label className={styles.field}><span>{t("campus.spaces.teacher")} <small>({t("common.optional")})</small></span><input value={form.teacher} maxLength={160} onChange={event => setForm({ ...form, teacher: event.target.value })} /></label>
        <fieldset className={styles.classes}>
          <legend>{t("campus.spaces.classes")}</legend>
          <div>{classIds.map(id => <label key={id} className={form.classes.includes(id) ? styles.classOn : ""}><input type="checkbox" checked={form.classes.includes(id)} onChange={() => toggleClass(id)} /><span>{id}</span></label>)}</div>
        </fieldset>
      </form>
      <footer data-app-modal-footer>
        <CancelButton onClick={onClose} disabled={saving}>{t("common.cancel")}</CancelButton>
        <SubmitButton form="campus-space-form" busy={saving} disabled={!form.room.trim()}>{t("campus.spaces.save")}</SubmitButton>
      </footer>
    </section>
  </div>;
}
