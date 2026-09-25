"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, DoorOpen, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FilterBar, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { useFloatingAction } from "@/components/floating-actions";
import { CancelButton, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { RecordSkeleton, useHashRecord } from "@/components/record-list";
import { SurfaceHeader } from "@/components/surface-header";
import { useEscapeKey } from "@/components/use-escape-key";
import { useScrollLock } from "@/components/use-scroll-lock";
import list from "@/components/record-list.module.css";
import styles from "./campus-directory.module.css";

/* "Salas e docentes": a weekly board (days × time slots) of which class uses which room,
   with a week navigator for rotas that alternate by week and a per-room view. */

type Building = "cim" | "hsj";
type Space = { id: string; room: string; building: Building; teacher: string | null; classes: number[]; subject: string | null; session: string | null; weekday: number | null; startsAt: string | null; endsAt: string | null; note: string | null; weeks: string[] | null };
type Notice = { kind: ToastKind; message: string };
type Form = { room: string; building: Building; teacher: string; classes: number[]; subject: string; session: string; weekday: string; startsAt: string; endsAt: string; note: string };

const EMPTY_FORM: Form = { room: "", building: "cim", teacher: "", classes: [], subject: "", session: "", weekday: "", startsAt: "", endsAt: "", note: "" };
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
/** Weekday name (1 = Monday) in the interface language. */
function weekdayName(day: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, day)));
}

/* Dates are handled as local YYYY-MM-DD strings; a week is identified by its Monday. */
function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function fromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function mondayOf(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}
function shiftWeek(weekStart: string, weeks: number) {
  const date = fromIso(weekStart);
  date.setDate(date.getDate() + weeks * 7);
  return isoDate(date);
}
function dayDate(weekStart: string, day: number) {
  const date = fromIso(weekStart);
  date.setDate(date.getDate() + day - 1);
  return isoDate(date);
}
function dayLabel(weekStart: string, day: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(fromIso(dayDate(weekStart, day)));
}
function weekRange(weekStart: string, locale: string) {
  return `${dayLabel(weekStart, 1, locale)} – ${dayLabel(weekStart, 5, locale)}`;
}
/** Compact class type: P1, P2, TP, T… with a tone per type. */
function sessionShort(session: string | null) {
  const value = (session || "").toLocaleLowerCase("pt-PT");
  if (value.startsWith("prática 1")) return "P1";
  if (value.startsWith("prática 2")) return "P2";
  if (value.startsWith("teórico")) return "TP";
  if (value.startsWith("teórica")) return "T";
  if (value.startsWith("avalia")) return "Aval.";
  if (value.startsWith("prática")) return "P";
  return session || "—";
}
function sessionKind(session: string | null) {
  const short = sessionShort(session);
  return short === "P1" || short === "P" ? "practical" : short === "P2" ? "practical-2" : short === "TP" ? "mixed" : short === "T" ? "theory" : short === "Aval." ? "assessment" : "other";
}

/** One class in a board cell: room first, then type, classes and teacher. */
function SessionChip({ space, showSubject, onOpen }: { space: Space; showSubject: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  const label = space.classes.length === 20 ? t("campus.board.allClasses") : space.classes.join(", ");
  return <button type="button" className={styles.chip} data-kind={sessionKind(space.session)} onClick={onOpen} title={[space.subject, space.session, space.note].filter(Boolean).join(" · ")}>
    <span className={styles.chipTop}><strong>{space.room}</strong><span className={styles.tag} data-kind={sessionKind(space.session)}>{sessionShort(space.session)}</span></span>
    <span className={styles.chipMeta}>{[showSubject ? space.subject : "", space.classes.length === 20 ? label : t(space.classes.length === 1 ? "campus.board.classOne" : "campus.board.classMany", { list: label }), space.teacher].filter(Boolean).join(" · ")}</span>
    {space.note && <span className={styles.chipNote}>{space.note}</span>}
  </button>;
}

const CREATE_ICON = <Plus aria-hidden="true" />;
const EDIT_ICON = <Pencil aria-hidden="true" />;
const DELETE_ICON = <Trash2 aria-hidden="true" />;

export function CampusDirectory() {
  const { t, locale } = useI18n();
  const buildingLabel = useCallback((building: Building) => t(building === "cim" ? "campus.spaces.building.cim" : "campus.spaces.building.hsj"), [t]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [classIds, setClassIds] = useState<number[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
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
      && (subjectFilter === "all" || space.subject === subjectFilter)
      && (!needle || [space.room, space.teacher || "", space.subject || "", space.session || "", space.note || "", buildingLabel(space.building)].join(" ").toLocaleLowerCase("pt-PT").includes(needle)));
  }, [buildingFilter, buildingLabel, classFilter, query, spaces, subjectFilter]);
  const subjects = useMemo(() => [...new Set(spaces.map(space => space.subject).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-PT")), [spaces]);
  const buildings = useMemo(() => [...new Set(spaces.map(space => space.building))], [spaces]);

  // Board: the chosen week's classes as days × time slots, like the timetables they come from.
  const [view, setView] = useState<"week" | "rooms">("week");
  const currentMonday = useMemo(() => isoDate(mondayOf(new Date())), []);
  const todayIso = useMemo(() => isoDate(new Date()), []);
  const [weekStart, setWeekStart] = useState(currentMonday);
  const weekly = useMemo(() => visible
    .filter(space => space.weekday && space.startsAt && (!space.weeks || space.weeks.includes(weekStart)))
    .sort((a, b) => (a.weekday || 0) - (b.weekday || 0) || String(a.startsAt).localeCompare(String(b.startsAt)) || a.room.localeCompare(b.room, "pt-PT", { numeric: true })), [visible, weekStart]);
  const days = useMemo(() => [1, 2, 3, 4, 5, ...[6, 7].filter(day => weekly.some(space => space.weekday === day))], [weekly]);
  const slots = useMemo(() => [...new Set(weekly.map(space => String(space.startsAt)))].sort(), [weekly]);
  const slotEnds = useMemo(() => new Map(weekly.map(space => [String(space.startsAt), String(space.endsAt || "")])), [weekly]);
  const byRoom = useMemo(() => {
    const groups = new Map<string, Space[]>();
    for (const space of weekly) groups.set(space.room, [...(groups.get(space.room) || []), space]);
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-PT", { numeric: true }));
  }, [weekly]);

  const openItem = openId ? spaces.find(space => space.id === openId) ?? null : null;
  const classesMeta = (space: Space) => space.classes.length ? t("campus.spaces.classesMeta", { list: space.classes.join(", ") }) : "";
  // "Fisiologia · Prática 1" and "segunda-feira, 14:00–16:00": which class uses the room and when.
  const lesson = (space: Space) => [space.subject, space.session].filter(Boolean).join(" · ");
  const when = (space: Space) => [space.weekday ? weekdayName(space.weekday, locale) : "", space.startsAt && space.endsAt ? `${space.startsAt}–${space.endsAt}` : ""].filter(Boolean).join(", ");

  const openEditor = (space: Space | null) => setEditor({ id: space?.id ?? null, form: space ? { room: space.room, building: space.building, teacher: space.teacher || "", classes: space.classes, subject: space.subject || "", session: space.session || "", weekday: space.weekday ? String(space.weekday) : "", startsAt: space.startsAt || "", endsAt: space.endsAt || "", note: space.note || "" } : EMPTY_FORM });
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
        {subjects.length > 0 && <FilterSegmented label={t("campus.spaces.subject")} value={subjectFilter} onChange={setSubjectFilter} options={[{ value: "all", label: t("campus.spaces.allSubjects") }, ...subjects.map(subject => ({ value: subject, label: subject }))]} />}
        <FilterSearch label={t("campus.spaces.search")} value={query} onChange={setQuery} placeholder={t("campus.spaces.search")} />
        <FilterSelect label={t("campus.spaces.classes")} value={classFilter} onChange={setClassFilter} options={[{ value: "all", label: t("campus.spaces.allClasses") }, ...classIds.map(id => ({ value: String(id), label: t("campus.spaces.class", { n: id }) }))]} />
        {buildings.length > 1 && <FilterSelect label={t("campus.spaces.building")} value={buildingFilter} onChange={setBuildingFilter} options={[{ value: "all", label: t("campus.spaces.allBuildings") }, { value: "cim", label: buildingLabel("cim") }, { value: "hsj", label: buildingLabel("hsj") }]} />}
      </FilterBar>
      {/* Week navigator: rotas that alternate by week (Histologia I) show exactly what happens in the chosen week. */}
      <div className={styles.weekBar}>
        <div className={styles.weekNav}>
          <button type="button" className={styles.weekStep} onClick={() => setWeekStart(shiftWeek(weekStart, -1))} aria-label={t("campus.board.previous")}><ChevronLeft aria-hidden="true" /></button>
          <strong className={styles.weekLabel}>{t("campus.board.week", { range: weekRange(weekStart, locale) })}</strong>
          <button type="button" className={styles.weekStep} onClick={() => setWeekStart(shiftWeek(weekStart, 1))} aria-label={t("campus.board.next")}><ChevronRight aria-hidden="true" /></button>
          {weekStart !== currentMonday && <button type="button" className={styles.weekToday} onClick={() => setWeekStart(currentMonday)}>{t("campus.board.thisWeek")}</button>}
        </div>
        <div className="filter-segmented" role="group" aria-label={t("campus.board.view")}>
          <button type="button" className={view === "week" ? "is-active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}><CalendarRange aria-hidden="true" />{t("campus.board.viewWeek")}</button>
          <button type="button" className={view === "rooms" ? "is-active" : ""} aria-pressed={view === "rooms"} onClick={() => setView("rooms")}><DoorOpen aria-hidden="true" />{t("campus.board.viewRooms")}</button>
        </div>
      </div>
      {loading ? <RecordSkeleton label={t("campus.spaces.loading")} /> : weekly.length === 0 ? <div className={list.empty}><DoorOpen /><strong>{t(spaces.length ? "campus.board.empty" : "campus.spaces.empty")}</strong></div> : view === "week" ? <div className={styles.board} style={{ "--board-days": days.length } as CSSProperties} role="table" aria-label={t("campus.board.week", { range: weekRange(weekStart, locale) })}>
        <div className={styles.boardHead} role="row">
          <span role="columnheader" />
          {days.map(day => <span role="columnheader" key={day} className={styles.dayHead} data-today={dayDate(weekStart, day) === todayIso || undefined}><strong>{weekdayName(day, locale)}</strong><small>{dayLabel(weekStart, day, locale)}</small></span>)}
        </div>
        {slots.map((slot, slotIndex) => <div className={styles.boardRow} role="row" key={slot}>
          <span role="rowheader" className={styles.slotHead}><strong>{slot}</strong><small>{slotEnds.get(slot)}</small></span>
          {days.map(day => {
            const entries = weekly.filter(space => space.weekday === day && space.startsAt === slot);
            return <div role="cell" key={day} className={styles.cell} data-empty={entries.length ? undefined : true} style={{ order: day * 100 + slotIndex }}>
              <span className={styles.cellLabel}>{weekdayName(day, locale)} · {slot}–{slotEnds.get(slot)}</span>
              {entries.map(space => <SessionChip key={space.id} space={space} showSubject={subjectFilter === "all"} onOpen={() => openSpace(space.id)} />)}
            </div>;
          })}
        </div>)}
      </div> : <div className={styles.roomGroups}>
        {byRoom.map(([room, entries]) => <section className={styles.roomGroup} key={room} aria-label={room}>
          <header className={styles.roomHead}><DoorOpen aria-hidden="true" /><h3>{room}</h3><small>{t(entries.length === 1 ? "campus.board.sessionsOne" : "campus.board.sessions", { count: entries.length })}</small></header>
          <ul className={styles.roomSessions}>
            {entries.map(space => <li key={space.id}>
              <button type="button" className={styles.roomSession} onClick={() => openSpace(space.id)}>
                <span className={styles.roomWhen}><strong>{weekdayName(space.weekday || 1, locale)}</strong><small>{space.startsAt}–{space.endsAt}</small></span>
                <span className={styles.tag} data-kind={sessionKind(space.session)}>{sessionShort(space.session)}</span>
                <span className={styles.roomWhat}><strong>{space.subject}</strong><small>{[classesMeta(space), space.teacher, space.note].filter(Boolean).join(" · ")}</small></span>
              </button>
            </li>)}
          </ul>
        </section>)}
      </div>}
    </section>}

    {openId && <>
      <button className={list.back} type="button" onClick={() => openSpace(null)}><ChevronLeft aria-hidden="true" />{t("campus.spaces.back")}</button>
      <article className={`panel ${list.reading}`} aria-busy={loading}>
        {loading ? <RecordSkeleton label={t("campus.spaces.loading")} rows={2} /> : !openItem ? <div className={list.empty}><DoorOpen /><strong>{t("campus.spaces.noResults")}</strong></div> : <>
          <p className={styles.eyebrow}>{buildingLabel(openItem.building)}</p>
          <h2 className={styles.title}>{openItem.room}</h2>
          <span className={styles.rule} aria-hidden="true" />
          <dl className={styles.facts}>
            {lesson(openItem) && <div><dt>{t("campus.spaces.lesson")}</dt><dd>{lesson(openItem)}</dd></div>}
            {when(openItem) && <div><dt>{t("campus.spaces.schedule")}</dt><dd>{when(openItem)}</dd></div>}
            <div><dt>{t("campus.spaces.building")}</dt><dd>{buildingLabel(openItem.building)}</dd></div>
            {openItem.teacher && <div><dt>{t("campus.spaces.teacher")}</dt><dd>{openItem.teacher}</dd></div>}
            {openItem.classes.length > 0 && <div><dt>{t("campus.spaces.classes")}</dt><dd className={styles.classList}>{openItem.classes.map(id => <span key={id}>{id}</span>)}</dd></div>}
            {openItem.note && <div><dt>{t("campus.spaces.note")}</dt><dd>{openItem.note}</dd></div>}
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
  const { t, locale } = useI18n();
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
        <label className={styles.field}><span>{t("campus.spaces.subject")} <small>({t("common.optional")})</small></span><input value={form.subject} maxLength={80} onChange={event => setForm({ ...form, subject: event.target.value })} /></label>
        <label className={styles.field}><span>{t("campus.spaces.session")} <small>({t("common.optional")})</small></span><input value={form.session} maxLength={40} onChange={event => setForm({ ...form, session: event.target.value })} /></label>
        <label className={styles.field}><span>{t("campus.spaces.weekday")} <small>({t("common.optional")})</small></span><select value={form.weekday} onChange={event => setForm({ ...form, weekday: event.target.value })}><option value="">—</option>{WEEKDAYS.map(day => <option key={day} value={day}>{weekdayName(day, locale)}</option>)}</select></label>
        <label className={styles.field}><span>{t("campus.spaces.startsAt")}</span><input type="time" value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })} /></label>
        <label className={styles.field}><span>{t("campus.spaces.endsAt")}</span><input type="time" value={form.endsAt} min={form.startsAt || undefined} onChange={event => setForm({ ...form, endsAt: event.target.value })} /></label>
        <label className={styles.field}><span>{t("campus.spaces.note")} <small>({t("common.optional")})</small></span><input value={form.note} maxLength={200} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
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
