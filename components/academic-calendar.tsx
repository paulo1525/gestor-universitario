"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  PencilLine,
  Shapes,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { ModuleGuard } from "@/components/module-guard";
import { useI18n } from "@/components/i18n-context";
import { useModuleEnabled } from "@/components/use-module-enabled";
import { CalendarSubscription } from "@/components/calendar-subscription";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { useEscapeKey } from "@/components/use-escape-key";
import { useScrollLock } from "@/components/use-scroll-lock";
import { richTextPlainText } from "@/lib/announcement-content";
import { useFloatingAction } from "@/components/floating-actions";
import { FormCloseButton } from "@/components/form-actions";
import { FormLabel } from "@/components/form-label";
import styles from "@/components/academic-calendar.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";

const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;

type DateInput = string | number;
type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  type: string;
  startsAt: DateInput;
  endsAt: DateInput | null;
  location: string;
  unitId: string;
  unitName: string;
  visibility: string;
  status: string;
};
type Unit = { id: string; name: string; code: string };
type Notice = { kind: ToastKind; message: string } | null;
type CalendarView = "month" | "agenda";
type EventForm = { title: string; description: string; type: string; startsAt: string; endsAt: string; location: string; unitId: string };

const emptyEventForm: EventForm = { title: "", description: "", type: "assessment", startsAt: "", endsAt: "", location: "", unitId: "" };

const eventLabelKeys = { assessment: "community.calendar.type.assessment", exam: "community.calendar.type.exam", deadline: "community.calendar.type.deadline", academic: "community.calendar.type.academic", meeting: "community.calendar.type.meeting" } as const;

const weekDayKeys = ["community.calendar.week.mon", "community.calendar.week.tue", "community.calendar.week.wed", "community.calendar.week.thu", "community.calendar.week.fri", "community.calendar.week.sat", "community.calendar.week.sun"] as const;

function value(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (source[key] != null) return source[key];
  return undefined;
}

function dateInput(raw: unknown): DateInput {
  return typeof raw === "number" ? raw : String(raw || "");
}

function normaliseEvent(raw: Record<string, unknown>, fallbackTitle: string): CalendarEvent {
  const unit = (raw.unit && typeof raw.unit === "object" ? raw.unit : {}) as Record<string, unknown>;
  return {
    id: String(value(raw, "id") || ""),
    title: String(value(raw, "title", "name") || fallbackTitle),
    description: String(value(raw, "description", "details") || ""),
    type: String(value(raw, "type", "eventType", "event_type") || "academic"),
    startsAt: dateInput(value(raw, "startsAt", "starts_at", "date")),
    endsAt: value(raw, "endsAt", "ends_at") ? dateInput(value(raw, "endsAt", "ends_at")) : null,
    location: String(value(raw, "location") || ""),
    unitId: String(value(raw, "unitId", "unit_id") ?? value(unit, "id") ?? ""),
    unitName: String(value(raw, "unitName", "unit_name") ?? value(unit, "name") ?? ""),
    visibility: String(value(raw, "visibility") || "students"),
    status: String(value(raw, "status") || "scheduled"),
  };
}

function normaliseUnit(raw: Record<string, unknown>): Unit {
  return { id: String(raw.id), name: String(raw.name || ""), code: String(raw.code || "") };
}

function validDate(input: DateInput) {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateTimeLocal(input: DateInput | Date) {
  const date = input instanceof Date ? input : validDate(input);
  if (!date) return "";
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formForDay(date: Date): EventForm {
  const startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0);
  const endsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0);
  return { ...emptyEventForm, startsAt: dateTimeLocal(startsAt), endsAt: dateTimeLocal(endsAt) };
}

function formForEvent(item: CalendarEvent): EventForm {
  return {
    title: item.title,
    description: item.description,
    type: item.type,
    startsAt: dateTimeLocal(item.startsAt),
    endsAt: item.endsAt ? dateTimeLocal(item.endsAt) : "",
    location: item.location,
    unitId: item.unitId,
  };
}

function campusSearchHref(location: string) {
  return `/salas-docentes?q=${encodeURIComponent(location.trim())}`;
}

function unitHref(unitId: string) {
  return `/unidades-curriculares/${encodeURIComponent(unitId)}`;
}

function isExternalLocation(location: string) {
  return /^(?:https?:|mailto:)/i.test(location.trim());
}

function formatDate(input: DateInput, includeDate = true, locale = "pt-PT", fallback = "Date to be confirmed") {
  const date = validDate(input);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, includeDate
    ? { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(date);
}

function sameDay(start: DateInput, end: DateInput) {
  const a = validDate(start), b = validDate(end);
  return Boolean(a && b && dateKey(a) === dateKey(b));
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function moveEventToDate(item: CalendarEvent, target: Date): CalendarEvent | null {
  const starts = validDate(item.startsAt);
  if (!starts) return null;
  const ends = item.endsAt ? validDate(item.endsAt) : null;
  const duration = ends ? Math.max(0, ends.getTime() - starts.getTime()) : 0;
  const nextStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), starts.getHours(), starts.getMinutes(), starts.getSeconds(), starts.getMilliseconds());
  const nextEnd = ends ? new Date(nextStart.getTime() + duration) : null;
  return { ...item, startsAt: nextStart.toISOString(), endsAt: nextEnd?.toISOString() ?? null };
}

function eventPayload(form: EventForm, current?: CalendarEvent) {
  return {
    ...(current ? { id: current.id, visibility: current.visibility, status: current.status } : {}),
    ...form,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    unitId: form.unitId || null,
  };
}

export function AcademicCalendar() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const eventLabels = useMemo(() => Object.fromEntries(Object.entries(eventLabelKeys).map(([key, labelKey]) => [key, t(labelKey)])), [t]);
  const weekDays = useMemo(() => weekDayKeys.map((key) => t(key)), [t]);
  const formatEventDate = (input: DateInput, includeDate = true) => formatDate(input, includeDate, locale, t("community.calendar.dateUnknown"));
  const managementEnabled = useModuleEnabled("calendar.management");
  const subscriptionEnabled = useModuleEnabled("calendar.subscription");
  const canManage = managementEnabled && (user?.role === "admin" || Boolean(user?.commissionPosition));
  const today = useMemo(() => startOfDay(new Date()), []);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(false);
  const [editingEvent, setEditingEvent] = useState(false);
  const [view, setView] = useState<CalendarView>("month");
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today));
  // The open event lives in #evento-<id> so it can be linked and Back closes it.
  const [selectedEventId, setEventHash] = useHashRecord("evento", { scroll: false });
  const setSelectedEventId = (id: string | null) => { if (id !== selectedEventId) setEventHash(id); };
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [movingEventId, setMovingEventId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState<EventForm>(emptyEventForm);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const editorTitleRef = useRef<HTMLInputElement>(null);
  const readingRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/calendar-events", { cache: "no-store" });
      const data = await response.json() as { events?: Record<string, unknown>[]; calendarEvents?: Record<string, unknown>[]; units?: Record<string, unknown>[]; curricularUnits?: Record<string, unknown>[]; error?: string };
      if (!response.ok) throw new Error(data.error || t("community.calendar.loadError"));
      setEvents((data.events || data.calendarEvents || []).map((item) => normaliseEvent(item, t("community.calendar.eventFallback"))));
      setUnits((data.units || data.curricularUnits || []).map(normaliseUnit));
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("community.calendar.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!editor) return;
    const frame = window.requestAnimationFrame(() => {
      editorTitleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  useEffect(() => {
    if (!selectedEventId) return;
    readingRef.current?.focus();
  }, [selectedEventId]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase(locale);
    return events
    .filter(item => (typeFilter === "all" || item.type === typeFilter) && (unitFilter === "all" || item.unitId === unitFilter))
    .filter(item => !term || [item.title, richTextPlainText(item.description), item.location, item.unitName].join(" ").toLocaleLowerCase(locale).includes(term))
    .sort((a, b) => (validDate(a.startsAt)?.getTime() || Number.MAX_SAFE_INTEGER) - (validDate(b.startsAt)?.getTime() || Number.MAX_SAFE_INTEGER));
  }, [events, locale, searchQuery, typeFilter, unitFilter]);

  const eventsByDay = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const item of filtered) {
      const date = validDate(item.startsAt);
      if (!date) continue;
      const key = dateKey(date);
      result.set(key, [...(result.get(key) || []), item]);
    }
    return result;
  }, [filtered]);

  const days = useMemo(() => monthDays(visibleMonth), [visibleMonth]);
  const selectedEvents = eventsByDay.get(selectedDate) || [];
  const selectedEvent = filtered.find(item => item.id === selectedEventId) || null;
  useScrollLock(editor || Boolean(selectedEvent));
  useEscapeKey(editor, () => { if (!saving) { setEditor(false); setForm(emptyEventForm); } });
  useEscapeKey(Boolean(selectedEvent), () => { if (!saving && movingEventId !== selectedEvent?.id) { setEditingEvent(false); setSelectedEventId(null); } });
  const upcoming = useMemo(() => filtered.filter(item => {
    const date = validDate(item.startsAt);
    return date && date >= today;
  }).slice(0, 5), [filtered, today]);
  const descriptionLength = richTextPlainText(form.description).length;

  const selectDay = (date: Date) => {
    setSelectedDate(dateKey(date));
    setSelectedEventId(null);
    setEditingEvent(false);
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const openCreateForDate = (date: Date) => {
    selectDay(date);
    setForm(formForDay(date));
    setEditor(true);
  };

  const closeEditor = () => {
    setEditor(false);
    setForm(emptyEventForm);
  };

  const selectEvent = (item: CalendarEvent) => {
    const date = validDate(item.startsAt);
    if (date) {
      setSelectedDate(dateKey(date));
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setEditor(false);
    setEditingEvent(false);
    setSelectedEventId(item.id);
  };

  const beginEdit = (item: CalendarEvent) => {
    setForm(formForEvent(item));
    setEditingEvent(true);
  };

  const goToToday = () => {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(dateKey(today));
    setSelectedEventId(null);
    setEditingEvent(false);
  };

  const moveMonth = (offset: number) => {
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setSelectedEventId(null);
    setEditingEvent(false);
  };

  const reschedule = async (item: CalendarEvent, target: Date) => {
    if (!canManage || movingEventId) return;
    const moved = moveEventToDate(item, target);
    if (!moved) {
      setNotice({ kind: "error", message: t("community.calendar.invalidDate") });
      return;
    }
    const previousEvents = events;
    setEvents(current => current.map(currentItem => currentItem.id === item.id ? moved : currentItem));
    setMovingEventId(item.id);
    setSelectedDate(dateKey(target));
    try {
      const response = await fetch("/api/calendar-events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, startsAt: moved.startsAt, endsAt: moved.endsAt }),
      });
      const data = await response.json() as { error?: string; conflicts?: { id?: string; title?: string }[] };
      if (!response.ok) throw new Error(data.error || t("community.calendar.rescheduleError"));
      setNotice(data.conflicts?.length
        ? { kind: "warning", message: t(data.conflicts.length === 1 ? "community.calendar.rescheduledConflict" : "community.calendar.rescheduledConflicts", { count: data.conflicts.length }) }
        : { kind: "success", message: t("community.calendar.rescheduled") });
    } catch (error) {
      setEvents(previousEvents);
      const previousDate = validDate(item.startsAt);
      if (previousDate) {
        setSelectedDate(dateKey(previousDate));
      }
      setNotice({ kind: "error", message: t("community.calendar.reverted", { message: error instanceof Error ? error.message : t("community.calendar.rescheduleError") }) });
    } finally {
      setMovingEventId(null);
    }
  };

  const dropEvent = (target: Date) => {
    const item = events.find(event => event.id === draggingEventId);
    setDraggingEventId(null);
    setDropTargetDate(null);
    if (!item) return;
    selectDay(target);
    void reschedule(item, target);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(eventPayload(form)),
      });
      const data = await response.json() as { error?: string; conflicts?: { title?: string }[] };
      if (!response.ok) throw new Error(data.error || t("community.calendar.createError"));
      const eventDate = new Date(form.startsAt);
      setForm(emptyEventForm);
      setEditor(false);
      setVisibleMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
      setSelectedDate(dateKey(eventDate));
      setNotice(data.conflicts?.length
        ? { kind: "warning", message: t(data.conflicts.length === 1 ? "community.calendar.createdConflict" : "community.calendar.createdConflicts", { count: data.conflicts.length }) }
        : { kind: "success", message: t("community.calendar.created") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("community.calendar.createError") });
    } finally {
      setSaving(false);
    }
  };

  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEvent || !canManage) return;
    setSaving(true);
    try {
      const response = await fetch("/api/calendar-events", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(eventPayload(form, selectedEvent)),
      });
      const data = await response.json() as { error?: string; conflicts?: { title?: string }[] };
      if (!response.ok) throw new Error(data.error || t("community.calendar.updateError"));
      const eventDate = new Date(form.startsAt);
      setVisibleMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
      setSelectedDate(dateKey(eventDate));
      setEditingEvent(false);
      setNotice(data.conflicts?.length
        ? { kind: "warning", message: t(data.conflicts.length === 1 ? "community.calendar.updatedConflict" : "community.calendar.updatedConflicts", { count: data.conflicts.length }) }
        : { kind: "success", message: t("community.calendar.updated") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("community.calendar.updateError") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/calendar-events", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: deleteTarget.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("community.calendar.deleteError"));
      setSelectedEventId(null);
      setDeleteTarget(null);
      setNotice({ kind: "success", message: t("community.calendar.deleted") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("community.calendar.deleteError") });
    } finally { setDeleting(false); setDeleteTarget(null); }
  };

  const renderEventFields = (mode: "create" | "edit") => <div className={styles.formGrid}>
    <label className={styles.wide}><FormLabel icon={PencilLine}>{t("community.calendar.title")}</FormLabel><input ref={mode === "create" ? editorTitleRef : undefined} required maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder={t("community.calendar.titlePlaceholder")} /></label>
    <label><FormLabel icon={Shapes}>{t("community.calendar.type")}</FormLabel><select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}>{Object.entries(eventLabelKeys).map(([key, labelKey]) => <option key={key} value={key}>{t(labelKey)}</option>)}</select></label>
    <label><FormLabel icon={BookOpen}>{t("community.calendar.unit")}</FormLabel><select value={form.unitId} onChange={event => setForm(current => ({ ...current, unitId: event.target.value }))}><option value="">{t("community.calendar.general")}</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
    <label><FormLabel icon={Clock3}>{t("community.calendar.start")}</FormLabel><input required type="datetime-local" value={form.startsAt} onChange={event => setForm(current => ({ ...current, startsAt: event.target.value }))} /></label>
    <label><FormLabel icon={CalendarClock} optional>{t("community.calendar.end")}</FormLabel><input type="datetime-local" min={form.startsAt} value={form.endsAt} onChange={event => setForm(current => ({ ...current, endsAt: event.target.value }))} /></label>
    <label className={styles.wide}><FormLabel icon={MapPin} optional>{t("community.calendar.locationOptional")}</FormLabel><input maxLength={200} value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></label>
    <div className={`${styles.full} ${styles.richTextField}`}><FormLabel icon={FileText} optional>{t("community.calendar.descriptionLabel")}</FormLabel><RichTextEditor value={form.description} onChange={description => setForm(current => ({ ...current, description }))} ariaLabel={t("community.calendar.descriptionLabel")} maxLength={2000} minHeight="compact" onInvalidLink={() => setNotice({ kind: "warning", message: "Indica uma ligação válida iniciada por http://, https:// ou mailto:." })} /></div>
  </div>;

  const openCreateForSelectedDay = () => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    openCreateForDate(year && month && day ? new Date(year, month - 1, day) : today);
  };
  useFloatingAction(canManage && !editor && !selectedEvent ? { id: "new-calendar-event", label: t("community.calendar.add"), icon: FLOATING_CREATE_ICON, onClick: openCreateForSelectedDay } : null);

  return <AuthGuard><ModuleGuard moduleKey="calendar.events"><AppShell active="calendar" breadcrumb={t("community.calendar.breadcrumb")}>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    <SurfaceHeader
      standalone
      headingLevel="h1"
      icon={<CalendarDays />}
      eyebrow={t("community.calendar.eyebrow")}
      title={t("community.calendar.breadcrumb")}
    />

    <section className={styles.calendarShell} aria-label={t("community.calendar.breadcrumb")}>
      <div className={styles.toolbar}>
        <div className={styles.monthNavigation}>
          <button type="button" onClick={() => moveMonth(-1)} aria-label={t("community.calendar.previousMonth")}><ChevronLeft /></button>
          <button type="button" onClick={() => moveMonth(1)} aria-label={t("community.calendar.nextMonth")}><ChevronRight /></button>
          <button type="button" className={styles.todayButton} onClick={goToToday}>{t("community.calendar.today")}</button>
          <h2>{(() => { const parts = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).formatToParts(visibleMonth); const month = parts.find((part) => part.type === "month")?.value || ""; const year = parts.find((part) => part.type === "year")?.value || ""; return `${month.charAt(0).toLocaleUpperCase(locale)}${month.slice(1)} ${year}`.trim(); })()}</h2>
        </div>
        <div className={styles.toolbarActions}>
          {subscriptionEnabled && <ModuleGuard moduleKey="calendar.subscription"><CalendarSubscription units={units} /></ModuleGuard>}
          <div className={styles.viewSwitch} aria-label={t("community.calendar.view")}>
            <button type="button" className={view === "month" ? styles.activeView : ""} onClick={() => setView("month")} aria-pressed={view === "month"}><LayoutGrid />{t("community.calendar.month")}</button>
            <button type="button" className={view === "agenda" ? styles.activeView : ""} onClick={() => setView("agenda")} aria-pressed={view === "agenda"}><List />{t("community.calendar.agenda")}</button>
          </div>
        </div>
      </div>

      <FilterBar label={t("community.calendar.filters")}>
        <FilterSearch label={t("community.calendar.search")} value={searchQuery} onChange={setSearchQuery} placeholder={t("community.calendar.search")} />
        <FilterSelect label={t("community.calendar.filterType")} value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: t("community.calendar.allTypes") }, ...Object.entries(eventLabels).map(([key, label]) => ({ value: key, label }))]} />
        <FilterSelect label={t("community.calendar.filterUnit")} value={unitFilter} onChange={setUnitFilter} options={[{ value: "all", label: t("community.calendar.allUnits") }, ...units.map(unit => ({ value: unit.id, label: `${unit.code} · ${unit.name}` }))]} />
      </FilterBar>

      {loading ? <RecordSkeleton label={t("community.calendar.loading")} /> : view === "month" ? <div className={styles.calendarLayout}>
        <div className={styles.monthView}>
          <div className={styles.weekHeader}>{weekDays.map(day => <span key={day}>{day}</span>)}</div>
          <div className={styles.monthGrid}>
            {days.map(date => {
              const key = dateKey(date);
              const dayEvents = eventsByDay.get(key) || [];
              const outside = date.getMonth() !== visibleMonth.getMonth();
              const isToday = key === dateKey(today);
              const isSelected = key === selectedDate;
              return <div key={key} className={`${styles.dayCell} ${outside ? styles.outsideMonth : ""} ${isSelected ? styles.selectedDay : ""} ${canManage ? styles.creatableDay : ""} ${dropTargetDate === key ? styles.dropTarget : ""}`}
                onDragOver={event => { if (canManage && draggingEventId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetDate(key); } }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetDate(null); }}
                onDrop={event => { event.preventDefault(); if (canManage) dropEvent(date); }}>
                <button type="button" className={styles.daySelect} onClick={() => canManage ? openCreateForDate(date) : selectDay(date)} aria-label={`${t("community.calendar.daySummary", { date: date.toLocaleDateString(locale), count: dayEvents.length })}${canManage ? `. ${t("community.calendar.addOnDay")}` : ""}`} aria-pressed={isSelected}><span className={`${styles.dayNumber} ${isToday ? styles.today : ""}`}>{date.getDate()}</span></button>
                <span className={styles.dayEvents}>
                  {dayEvents.slice(0, 3).map(item => <button type="button" key={item.id} className={`${styles.eventPill} ${draggingEventId === item.id ? styles.draggingEvent : ""}`} data-event-type={item.type} draggable={canManage && movingEventId !== item.id}
                    onDragStart={event => { if (!canManage) return; event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggingEventId(item.id); }}
                    onDragEnd={() => { setDraggingEventId(null); setDropTargetDate(null); }}
                    onClick={event => { event.stopPropagation(); selectEvent(item); }}
                    aria-label={`${t("community.calendar.eventAria", { title: item.title, date: formatEventDate(item.startsAt) })}${canManage ? `. ${t("community.calendar.dragHint")}` : ""}`}>
                    <span className={styles.eventDot} />{movingEventId === item.id ? t("community.calendar.moving") : <>{formatEventDate(item.startsAt, false)} <strong>{item.title}</strong></>}
                  </button>)}
                  {dayEvents.length > 3 && <span className={styles.moreEvents}>{t("community.calendar.moreEvents", { count: dayEvents.length - 3 })}</span>}
                </span>
              </div>;
            })}
          </div>
        </div>

        <aside className={styles.dayPanel} aria-live="polite">
          <div className={styles.dayPanelHeading}>
            <span>{new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</span>
            <strong>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</strong>
          </div>
          {selectedEvents.length === 0 ? <div className={styles.emptyDay}><CalendarDays /><strong>{t("community.calendar.freeDay")}</strong><span>{t("community.calendar.noEvents")}</span></div> : <div className={styles.dayEventList}>{selectedEvents.map(item => <button type="button" key={item.id} className={styles.dayEventCard} onClick={() => selectEvent(item)} data-event-type={item.type}>
            <span className={styles.eventTime}>{formatEventDate(item.startsAt, false)}</span><span><strong>{item.title}</strong><small>{item.unitName || eventLabels[item.type] || item.type}</small></span><ChevronRight />
          </button>)}</div>}
          {selectedEvents.length === 0 && upcoming.length > 0 && <div className={styles.upcoming}><span>{t("community.calendar.next")}</span>{upcoming.slice(0, 3).map(item => <button type="button" key={item.id} onClick={() => selectEvent(item)}><time>{formatEventDate(item.startsAt)}</time><strong>{item.title}</strong></button>)}</div>}
        </aside>
      </div> : filtered.length === 0 ? <div className={styles.emptyState}><CalendarDays /><strong>{t("community.calendar.noFilteredEvents")}</strong></div> : <ul className={`${list.rows} ${styles.agendaRows}`}>
        {filtered.map(item => <li key={item.id} className={`${list.row} ${styles.agendaRow}`} data-event-type={item.type}>
          <span className={list.statusDot} aria-hidden="true" />
          <div className={list.rowMain}>
            <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("evento", item.id)} onClick={event => { event.preventDefault(); selectEvent(item); }}>{item.title}</a></h3>
            <p className={list.rowMeta}>{formatEventDate(item.startsAt)}{item.endsAt && `–${formatEventDate(item.endsAt, false)}`}{item.location && <> · {isExternalLocation(item.location) ? item.location : <Link className={styles.rowLink} href={campusSearchHref(item.location)} aria-label={t("community.calendar.openCampus", { location: item.location })}>{item.location}</Link>}</>}{item.unitName && <> · {item.unitId ? <Link className={styles.rowLink} href={unitHref(item.unitId)}>{item.unitName}</Link> : item.unitName}</>}</p>
          </div>
          <span className={`${list.statusPill} ${styles.typePill}`} data-event-type={item.type}>{eventLabels[item.type] || item.type}</span>
        </li>)}
      </ul>}
    </section>

    {canManage && editor && <div className="app-modal-backdrop" data-app-modal-backdrop role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) closeEditor(); }}>
      <form className={styles.eventForm} data-app-modal="modal" data-app-modal-size="wide" role="dialog" aria-modal="true" aria-labelledby="calendar-create-title" onSubmit={save}>
        <header className="app-modal-header" data-app-modal-header>
          <h2 id="calendar-create-title">Adicionar à agenda</h2>
          <FormCloseButton onClick={closeEditor} label="Fechar" disabled={saving} />
        </header>
        <div data-app-modal-body>{renderEventFields("create")}</div>
        <footer data-app-modal-footer>
          <button type="button" className="button button--secondary" data-app-modal-action="secondary" disabled={saving} onClick={closeEditor}>Cancelar</button>
          <button type="submit" className="button button--primary" data-app-modal-action="primary" disabled={saving || descriptionLength > 2000}>{saving ? "A guardar…" : "Guardar evento"}</button>
        </footer>
      </form>
    </div>}

    {selectedEvent && <div className="app-modal-backdrop" data-app-modal-backdrop role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving && movingEventId !== selectedEvent.id) { setEditingEvent(false); setSelectedEventId(null); } }}>
      {editingEvent && canManage ? <form className={styles.eventForm} data-app-modal="modal" data-app-modal-size="wide" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" onSubmit={update}>
        <header className="app-modal-header" data-app-modal-header>
          <h2 id="calendar-event-title">Editar evento</h2>
          <FormCloseButton onClick={() => { setEditingEvent(false); setForm(emptyEventForm); }} label="Fechar" disabled={saving} />
        </header>
        <div data-app-modal-body>{renderEventFields("edit")}</div>
        <footer data-app-modal-footer>
          <button type="button" className="button button--secondary" data-app-modal-action="secondary" disabled={saving} onClick={() => { setEditingEvent(false); setForm(emptyEventForm); }}>Cancelar</button>
          <button type="submit" className="button button--primary" data-app-modal-action="primary" disabled={saving || descriptionLength > 2000}>{saving ? "A guardar…" : "Guardar alterações"}</button>
        </footer>
      </form> : <article ref={readingRef} tabIndex={-1} className={styles.eventReading} data-app-modal="modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
        <header className="app-modal-header" data-app-modal-header>
          <span className={styles.typeCaption} data-event-type={selectedEvent.type}>{eventLabels[selectedEvent.type] || selectedEvent.type}</span>
          <FormCloseButton onClick={() => setSelectedEventId(null)} label="Fechar detalhe" disabled={movingEventId === selectedEvent.id} />
        </header>
        <div className={styles.readingInner} data-app-modal-body>
          <h2 id="calendar-event-title" className={styles.readingTitle}>{selectedEvent.title}</h2>
          <p className={styles.readingMeta}>
            <span><CalendarDays aria-hidden="true" />{formatDate(selectedEvent.startsAt, true, locale, t("community.calendar.dateUnknown"))}{selectedEvent.endsAt && `–${formatDate(selectedEvent.endsAt, !sameDay(selectedEvent.startsAt, selectedEvent.endsAt), locale, "")}`}</span>
            {selectedEvent.location && <span><MapPin aria-hidden="true" />{selectedEvent.location}</span>}
            {selectedEvent.unitName && <span><BookOpen aria-hidden="true" />{selectedEvent.unitId ? <Link className={styles.quietLink} href={unitHref(selectedEvent.unitId)}>{selectedEvent.unitName}</Link> : selectedEvent.unitName}</span>}
          </p>
          <span className={styles.readingRule} aria-hidden="true" />
          {selectedEvent.description && <RichTextContent value={selectedEvent.description} className={styles.readingBody} />}
        </div>
        {canManage && <footer data-app-modal-footer>
          <button type="button" className="button button--danger" data-app-modal-action="danger" disabled={movingEventId === selectedEvent.id} onClick={() => setDeleteTarget(selectedEvent)}><Trash2 aria-hidden="true" />Eliminar</button>
          <button type="button" className="button button--secondary" data-app-modal-action="secondary" onClick={() => beginEdit(selectedEvent)}><PencilLine aria-hidden="true" />Editar</button>
        </footer>}
      </article>}
    </div>}
    <ConfirmationDialog open={Boolean(deleteTarget)} eyebrow="Agenda partilhada" title="Eliminar este evento?" description={t("community.calendar.deleteConfirm")} subject={deleteTarget?.title} subjectLabel="Evento selecionado" warning="O evento deixa de estar visível para todos os utilizadores e esta ação não pode ser revertida." confirmLabel={deleting ? "A eliminar…" : "Eliminar evento"} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
  </AppShell></ModuleGuard></AuthGuard>;
}
