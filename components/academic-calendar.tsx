"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  LayoutGrid,
  List,
  LoaderCircle,
  MapPin,
  PencilLine,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { ModuleGuard } from "@/components/module-guard";
import { useModuleEnabled } from "@/components/use-module-enabled";
import styles from "@/components/academic-calendar.module.css";

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

const eventLabels: Record<string, string> = {
  assessment: "Avaliação",
  exam: "Exame",
  deadline: "Entrega",
  academic: "Evento académico",
  meeting: "Reunião",
};

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function value(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (source[key] != null) return source[key];
  return undefined;
}

function dateInput(raw: unknown): DateInput {
  return typeof raw === "number" ? raw : String(raw || "");
}

function normaliseEvent(raw: Record<string, unknown>): CalendarEvent {
  const unit = (raw.unit && typeof raw.unit === "object" ? raw.unit : {}) as Record<string, unknown>;
  return {
    id: String(value(raw, "id") || ""),
    title: String(value(raw, "title", "name") || "Evento"),
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

function formatDate(input: DateInput, includeDate = true) {
  const date = validDate(input);
  if (!date) return "Data por confirmar";
  return new Intl.DateTimeFormat("pt-PT", includeDate
    ? { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(date);
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
  const managementEnabled = useModuleEnabled("calendar.management");
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [movingEventId, setMovingEventId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState<EventForm>(emptyEventForm);
  const editorTitleRef = useRef<HTMLInputElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/calendar-events", { cache: "no-store" });
      const data = await response.json() as { events?: Record<string, unknown>[]; calendarEvents?: Record<string, unknown>[]; units?: Record<string, unknown>[]; curricularUnits?: Record<string, unknown>[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o calendário.");
      setEvents((data.events || data.calendarEvents || []).map(normaliseEvent));
      setUnits((data.units || data.curricularUnits || []).map(normaliseUnit));
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível carregar o calendário." });
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!editor) return;
    const frame = window.requestAnimationFrame(() => {
      editorTitleRef.current?.focus();
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditor(false);
        setForm(emptyEventForm);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [editor]);

  useEffect(() => {
    if (!selectedEventId) return;
    modalCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingEvent(false);
        setSelectedEventId(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedEventId]);

  const filtered = useMemo(() => events
    .filter(item => (typeFilter === "all" || item.type === typeFilter) && (unitFilter === "all" || item.unitId === unitFilter))
    .sort((a, b) => (validDate(a.startsAt)?.getTime() || Number.MAX_SAFE_INTEGER) - (validDate(b.startsAt)?.getTime() || Number.MAX_SAFE_INTEGER)),
  [events, typeFilter, unitFilter]);

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
  const upcoming = useMemo(() => filtered.filter(item => {
    const date = validDate(item.startsAt);
    return date && date >= today;
  }).slice(0, 5), [filtered, today]);
  const activeFilterCount = Number(typeFilter !== "all") + Number(unitFilter !== "all");

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
      setRescheduleDate(dateKey(date));
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
      setNotice({ kind: "error", message: "Este evento não tem uma data válida para reagendar." });
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
      if (!response.ok) throw new Error(data.error || "Não foi possível reagendar o evento.");
      setRescheduleDate(dateKey(target));
      setNotice(data.conflicts?.length
        ? { kind: "warning", message: `Evento reagendado, mas coincide com ${data.conflicts.length} ${data.conflicts.length === 1 ? "outra avaliação" : "outras avaliações"}.` }
        : { kind: "success", message: "Evento reagendado com sucesso." });
    } catch (error) {
      setEvents(previousEvents);
      const previousDate = validDate(item.startsAt);
      if (previousDate) {
        setSelectedDate(dateKey(previousDate));
        setRescheduleDate(dateKey(previousDate));
      }
      setNotice({ kind: "error", message: error instanceof Error ? `${error.message} A alteração foi revertida.` : "Não foi possível reagendar o evento. A alteração foi revertida." });
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
      if (!response.ok) throw new Error(data.error || "Não foi possível criar o evento.");
      const eventDate = new Date(form.startsAt);
      setForm(emptyEventForm);
      setEditor(false);
      setVisibleMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
      setSelectedDate(dateKey(eventDate));
      setNotice(data.conflicts?.length
        ? { kind: "warning", message: `Evento guardado, mas coincide com ${data.conflicts.length} ${data.conflicts.length === 1 ? "outra avaliação" : "outras avaliações"}.` }
        : { kind: "success", message: "Evento adicionado ao calendário." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível criar o evento." });
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
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o evento.");
      const eventDate = new Date(form.startsAt);
      setVisibleMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
      setSelectedDate(dateKey(eventDate));
      setEditingEvent(false);
      setNotice(data.conflicts?.length
        ? { kind: "warning", message: `Evento atualizado, mas coincide com ${data.conflicts.length} ${data.conflicts.length === 1 ? "outra avaliação" : "outras avaliações"}.` }
        : { kind: "success", message: "Evento atualizado com sucesso." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível atualizar o evento." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Eliminar este evento do calendário?")) return;
    try {
      const response = await fetch("/api/calendar-events", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível eliminar o evento.");
      setSelectedEventId(null);
      setNotice({ kind: "success", message: "Evento eliminado." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível eliminar o evento." });
    }
  };

  const renderEventFields = (mode: "create" | "edit") => <div className={styles.formGrid}>
    <label className={styles.wide}><span className={styles.fieldLabel}><PencilLine />Título</span><input ref={mode === "create" ? editorTitleRef : undefined} required maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: Frequência de Anatomia II" /></label>
    <label><span className={styles.fieldLabel}><Tag />Tipo</span><select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}>{Object.entries(eventLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label><span className={styles.fieldLabel}><BookOpen />Unidade curricular</span><select value={form.unitId} onChange={event => setForm(current => ({ ...current, unitId: event.target.value }))}><option value="">Geral / não aplicável</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
    <label><span className={styles.fieldLabel}><Clock3 />Início</span><input required type="datetime-local" value={form.startsAt} onChange={event => setForm(current => ({ ...current, startsAt: event.target.value }))} /></label>
    <label><span className={styles.fieldLabel}><CalendarClock />Fim <small>(opcional)</small></span><input type="datetime-local" min={form.startsAt} value={form.endsAt} onChange={event => setForm(current => ({ ...current, endsAt: event.target.value }))} /></label>
    <label className={styles.wide}><span className={styles.fieldLabel}><MapPin />Local ou ligação <small>(opcional)</small></span><input maxLength={200} value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></label>
    <label className={styles.full}><span className={styles.fieldLabel}><FileText />Descrição <small>(opcional)</small></span><textarea rows={4} maxLength={2000} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
  </div>;

  return <AuthGuard><ModuleGuard moduleKey="calendar.events"><AppShell active="calendar" breadcrumb="Calendário académico">
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    <header className={styles.pageHeader}>
      <div className={styles.headerIcon}><CalendarDays /></div>
      <div>
        <span className="eyebrow">Agenda do curso</span>
        <h1>Calendário académico</h1>
        <p>Avaliações, entregas e acontecimentos importantes numa agenda partilhada.{canManage && " Seleciona um dia para adicionar um evento."}</p>
      </div>
    </header>

    <section className={styles.calendarShell} aria-label="Calendário académico">
      <div className={styles.toolbar}>
        <div className={styles.monthNavigation}>
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft /></button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Mês seguinte"><ChevronRight /></button>
          <button type="button" className={styles.todayButton} onClick={goToToday}>Hoje</button>
          <h2>{new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(visibleMonth)}</h2>
        </div>
        <div className={styles.viewSwitch} aria-label="Vista do calendário">
          <button type="button" className={view === "month" ? styles.activeView : ""} onClick={() => setView("month")} aria-pressed={view === "month"}><LayoutGrid />Mês</button>
          <button type="button" className={view === "agenda" ? styles.activeView : ""} onClick={() => setView("agenda")} aria-pressed={view === "agenda"}><List />Agenda</button>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterTitle}><Filter /><span>Filtros</span>{activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}</div>
        <label><span className={styles.srOnly}>Filtrar por tipo</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">Todos os tipos</option>{Object.entries(eventLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label><span className={styles.srOnly}>Filtrar por unidade curricular</span><select value={unitFilter} onChange={event => setUnitFilter(event.target.value)}><option value="all">Todas as unidades curriculares</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
        {activeFilterCount > 0 && <button type="button" className={styles.clearFilters} onClick={() => { setTypeFilter("all"); setUnitFilter("all"); }}>Limpar</button>}
      </div>

      {loading ? <div className={styles.loading}><LoaderCircle className={styles.spin} /><span>A carregar calendário…</span></div> : view === "month" ? <div className={styles.calendarLayout}>
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
                <button type="button" className={styles.daySelect} onClick={() => canManage ? openCreateForDate(date) : selectDay(date)} aria-label={`${date.toLocaleDateString("pt-PT")}, ${dayEvents.length} eventos${canManage ? ". Adicionar evento neste dia" : ""}`} aria-pressed={isSelected}><span className={`${styles.dayNumber} ${isToday ? styles.today : ""}`}>{date.getDate()}</span></button>
                <span className={styles.dayEvents}>
                  {dayEvents.slice(0, 3).map(item => <button type="button" key={item.id} className={`${styles.eventPill} ${draggingEventId === item.id ? styles.draggingEvent : ""}`} data-event-type={item.type} draggable={canManage && movingEventId !== item.id}
                    onDragStart={event => { if (!canManage) return; event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggingEventId(item.id); }}
                    onDragEnd={() => { setDraggingEventId(null); setDropTargetDate(null); }}
                    onClick={event => { event.stopPropagation(); selectEvent(item); }}
                    aria-label={`${item.title}, ${formatDate(item.startsAt)}${canManage ? ". Pode arrastar para outro dia ou abrir para reagendar com o teclado." : ""}`}>
                    <span className={styles.eventDot} />{movingEventId === item.id ? "A mover…" : <>{formatDate(item.startsAt, false)} <strong>{item.title}</strong></>}
                  </button>)}
                  {dayEvents.length > 3 && <span className={styles.moreEvents}>+{dayEvents.length - 3} eventos</span>}
                </span>
              </div>;
            })}
          </div>
        </div>

        <aside className={styles.dayPanel} aria-live="polite">
          <div className={styles.dayPanelHeading}>
            <span>{new Intl.DateTimeFormat("pt-PT", { weekday: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</span>
            <strong>{new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</strong>
          </div>
          {selectedEvents.length === 0 ? <div className={styles.emptyDay}><CalendarDays /><strong>Dia livre</strong><span>Não existem eventos agendados.</span></div> : <div className={styles.dayEventList}>{selectedEvents.map(item => <button type="button" key={item.id} className={styles.dayEventCard} onClick={() => selectEvent(item)} data-event-type={item.type}>
            <span className={styles.eventTime}>{formatDate(item.startsAt, false)}</span><span><strong>{item.title}</strong><small>{item.unitName || eventLabels[item.type] || item.type}</small></span><ChevronRight />
          </button>)}</div>}
          {selectedEvents.length === 0 && upcoming.length > 0 && <div className={styles.upcoming}><span>Próximos</span>{upcoming.slice(0, 3).map(item => <button type="button" key={item.id} onClick={() => selectEvent(item)}><time>{formatDate(item.startsAt)}</time><strong>{item.title}</strong></button>)}</div>}
        </aside>
      </div> : filtered.length === 0 ? <div className={styles.emptyState}><CalendarDays /><strong>Sem eventos para apresentar</strong><span>Experimenta alterar os filtros.</span></div> : <div className={styles.agendaList}>
        {filtered.map(item => { const starts = validDate(item.startsAt); return <article key={item.id} className={styles.agendaItem} data-event-type={item.type}>
          <time dateTime={starts?.toISOString()}><strong>{starts?.getDate() ?? "—"}</strong><span>{starts ? new Intl.DateTimeFormat("pt-PT", { month: "short" }).format(starts) : "data"}</span></time>
          <div className={styles.agendaBody}><div className={styles.badgeRow}><span className={styles.typeBadge}>{eventLabels[item.type] || item.type}</span>{item.unitName && <span className={styles.unitBadge}>{item.unitName}</span>}</div><h3>{item.title}</h3><p><Clock3 />{formatDate(item.startsAt)}{item.endsAt && ` — ${formatDate(item.endsAt)}`}</p>{item.location && <p><MapPin />{item.location}</p>}{item.description && <div className={styles.description}>{item.description}</div>}</div>
          {canManage && <button type="button" className={styles.deleteButton} onClick={() => void remove(item.id)} aria-label={`Eliminar ${item.title}`}><Trash2 /></button>}
        </article>; })}
      </div>}
    </section>

    {canManage && editor && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) closeEditor(); }}>
      <article className={`${styles.eventModal} ${styles.createModal}`} role="dialog" aria-modal="true" aria-labelledby="calendar-create-title" aria-describedby="calendar-create-context">
        <header className={styles.modalHeader}>
          <div className={styles.modalHeading}>
            <span className={styles.kicker}>Criar evento</span>
            <h2 id="calendar-create-title">Adicionar à agenda</h2>
            <p id="calendar-create-context">As datas são apresentadas no fuso horário de Lisboa.</p>
          </div>
          <div className={styles.modalHeaderActions}><button type="button" className={styles.modalClose} disabled={saving} onClick={closeEditor} aria-label="Fechar criação de evento"><X /></button></div>
        </header>
        <div className={styles.modalBody}>
          <form className={styles.modalEditForm} onSubmit={save}>
            {renderEventFields("create")}
            <div className={styles.modalEditActions}><button type="button" className="button button--secondary" disabled={saving} onClick={closeEditor}><X />Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? <LoaderCircle className={styles.spin} /> : <Check />}{saving ? "A guardar…" : "Guardar evento"}</button></div>
          </form>
        </div>
      </article>
    </div>}

    {selectedEvent && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) { setEditingEvent(false); setSelectedEventId(null); } }}>
      <article className={styles.eventModal} role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" aria-describedby="calendar-event-context">
        <header className={styles.modalHeader}>
          <div className={styles.modalHeading}>
            <div className={styles.badgeRow}><span className={styles.typeBadge} data-event-type={selectedEvent.type}>{eventLabels[selectedEvent.type] || selectedEvent.type}</span>{selectedEvent.unitName && <span className={styles.unitBadge}>{selectedEvent.unitName}</span>}</div>
            <h2 id="calendar-event-title">{editingEvent ? "Editar evento" : selectedEvent.title}</h2>
            <p id="calendar-event-context">{editingEvent ? `A atualizar “${selectedEvent.title}”` : "Detalhes completos do evento académico"}</p>
          </div>
          <div className={styles.modalHeaderActions}>
            {canManage && !editingEvent && <button type="button" className={styles.modalEdit} onClick={() => beginEdit(selectedEvent)}><PencilLine />Editar</button>}
            <button ref={modalCloseRef} type="button" className={styles.modalClose} onClick={() => { setEditingEvent(false); setSelectedEventId(null); }} aria-label="Fechar detalhe"><X /></button>
          </div>
        </header>

        <div className={styles.modalBody}>
          {editingEvent && canManage ? <form className={styles.modalEditForm} onSubmit={update}>
            {renderEventFields("edit")}
            <div className={styles.modalEditActions}><button type="button" className="button button--secondary" disabled={saving} onClick={() => { setEditingEvent(false); setForm(emptyEventForm); }}><X />Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? <LoaderCircle className={styles.spin} /> : <Check />}{saving ? "A guardar…" : "Guardar alterações"}</button></div>
          </form> : <div className={styles.modalOverview}>
            <section className={styles.modalMeta} aria-label="Informação do evento">
              <p><Clock3 /><span><strong>Data e hora</strong>{formatDate(selectedEvent.startsAt)}{selectedEvent.endsAt && ` — ${formatDate(selectedEvent.endsAt)}`}</span></p>
              <p><MapPin /><span><strong>Local</strong>{selectedEvent.location || "Não indicado"}</span></p>
            </section>
            <section className={styles.modalDescriptionSection}><span>Descrição</span><p className={styles.modalDescription}>{selectedEvent.description || "Este evento não tem uma descrição adicional."}</p></section>
            {canManage && <section className={styles.quickReschedule}><div><CalendarClock /><span><strong>Reagendamento rápido</strong><small>Mantém a hora e a duração atuais.</small></span></div><div className={styles.rescheduleControl}><label className={styles.srOnly} htmlFor="event-reschedule-date">Nova data</label><input id="event-reschedule-date" type="date" value={rescheduleDate} onChange={event => setRescheduleDate(event.target.value)} /><button type="button" disabled={!rescheduleDate || movingEventId === selectedEvent.id} onClick={() => { const target = new Date(`${rescheduleDate}T12:00:00`); if (!Number.isNaN(target.getTime())) void reschedule(selectedEvent, target); }}>{movingEventId === selectedEvent.id ? "A guardar…" : "Alterar data"}</button></div></section>}
          </div>}
        </div>

        {canManage && <footer className={styles.modalFooter}><span>As alterações ficam imediatamente visíveis na agenda partilhada.</span><button type="button" className={styles.modalDelete} disabled={movingEventId === selectedEvent.id || saving} onClick={() => void remove(selectedEvent.id)}><Trash2 />Eliminar evento</button></footer>}
      </article>
    </div>}
  </AppShell></ModuleGuard></AuthGuard>;
}
