"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accessibility,
  ArrowUpRight,
  Building2,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  Mail,
  MapPinned,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { SurfaceHeader } from "@/components/surface-header";
import { useAuth } from "@/components/auth-context";
import { useEscapeKey } from "@/components/use-escape-key";
import { useI18n } from "@/components/i18n-context";
import { useModuleEnabled } from "@/components/use-module-enabled";
import { useScrollLock } from "@/components/use-scroll-lock";
import styles from "./campus-directory.module.css";

type Room = {
  id: string;
  code: string;
  name: string;
  room_type: string;
  capacity: number | null;
  directions: string;
  accessibility_notes: string;
  building_id: string;
  building_name: string;
  building_code: string;
  building_address: string;
  building_map_url: string | null;
  building_accessibility_notes: string;
  level: string;
  floor_label: string;
};
type Faculty = {
  id: string;
  full_name: string;
  title: string;
  email: string | null;
  office: string | null;
  notes: string;
  units: Array<{ id: string; code: string; name: string }>;
};
type Building = {
  id: string;
  name: string;
  code: string;
  address: string;
  map_url: string | null;
  accessibility_notes: string;
};
type Notice = { kind: ToastKind; message: string } | null;
type Editor = "building" | "faculty";
type DirectoryForm = {
  name: string;
  code: string;
  email: string;
  title: string;
  office: string;
  address: string;
  mapUrl: string;
  accessibilityNotes: string;
};

const emptyForm: DirectoryForm = {
  name: "",
  code: "",
  email: "",
  title: "",
  office: "",
  address: "",
  mapUrl: "",
  accessibilityNotes: "",
};

function externalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function unitHref(id: string) {
  return `/unidades-curriculares/${encodeURIComponent(id)}`;
}

export function CampusDirectory() {
  const { t } = useI18n();
  const { user } = useAuth();
  const managementEnabled = useModuleEnabled("campus.management");
  const canManage = managementEnabled && (user?.role === "admin" || user?.commissionDepartment === "management");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"rooms" | "faculty">("rooms");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DirectoryForm>(emptyForm);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("q")?.trim();
    // The query is an external navigation input; copy it once after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (preset) setQuery(current => current || preset.slice(0, 100));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/campus?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as { rooms?: Room[]; faculty?: Faculty[]; buildings?: Building[]; error?: string };
      if (!response.ok) throw new Error(data.error || t("campus.loadError"));
      setRooms(data.rooms || []);
      setFaculty(data.faculty || []);
      setBuildings(data.buildings || []);
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("campus.loadError") });
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditor(null);
    setForm(emptyForm);
  }, [saving]);

  useEscapeKey(Boolean(editor), closeEditor);
  useScrollLock(Boolean(editor));

  useEffect(() => {
    if (!editor) return;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [editor]);

  const openEditor = (nextEditor: Editor) => {
    setForm(emptyForm);
    setEditor(nextEditor);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      const payload = editor === "building"
        ? {
            entity: editor,
            name: form.name,
            code: form.code,
            address: form.address,
            mapUrl: form.mapUrl,
            accessibilityNotes: form.accessibilityNotes,
          }
        : {
            entity: editor,
            fullName: form.name,
            email: form.email,
            title: form.title,
            office: form.office,
          };
      const response = await fetch("/api/campus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("campus.loadError"));
      closeEditor();
      setNotice({ kind: "success", message: t("campus.saved") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("campus.loadError") });
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => ({ rooms: rooms.length, faculty: faculty.length, buildings: buildings.length }), [buildings.length, faculty.length, rooms.length]);
  const buildingCards = useMemo(() => buildings.map((building) => ({ ...building, mapHref: externalUrl(building.map_url) })), [buildings]);

  return <AuthGuard><ModuleGuard moduleKey="campus.directory"><AppShell active="campus" breadcrumb={t("campus.breadcrumb")}>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    <SurfaceHeader
      standalone
      headingLevel="h1"
      icon={<MapPinned />}
      eyebrow={t("campus.eyebrow")}
      title={t("campus.title")}
      description={t("campus.intro")}
      actions={canManage ? <div className={styles.actions}>
        <button className="button button--secondary button--compact" type="button" onClick={() => openEditor("building")}><Building2 aria-hidden="true" />{t("campus.newBuilding")}</button>
        <button className="button button--primary button--compact" type="button" onClick={() => openEditor("faculty")}><GraduationCap aria-hidden="true" />{t("campus.newFaculty")}</button>
      </div> : undefined}
    />

    <section className={styles.summary} aria-label={t("campus.title")}>
      <div className={styles.summaryItem}><Building2 aria-hidden="true" /><span><strong>{counts.buildings}</strong><small>{t("campus.buildings")}</small></span></div>
      <div className={styles.summaryItem}><MapPinned aria-hidden="true" /><span><strong>{counts.rooms}</strong><small>{t("campus.rooms")}</small></span></div>
      <div className={styles.summaryItem}><GraduationCap aria-hidden="true" /><span><strong>{counts.faculty}</strong><small>{t("campus.faculty")}</small></span></div>
    </section>

    {buildingCards.length > 0 && <section className={styles.buildings} aria-labelledby="campus-buildings-title">
      <SurfaceHeader icon={<Building2 />} title={t("campus.buildings")} headingId="campus-buildings-title" meta={counts.buildings} />
      <div className={styles.buildingGrid}>
        {buildingCards.map((building) => <article className={styles.buildingCard} key={building.id}>
          <span className={styles.buildingIcon} aria-hidden="true"><Building2 /></span>
          <div className={styles.buildingBody}>
            <div className={styles.rowHeading}><strong>{building.code} · {building.name}</strong>{building.mapHref && <a className={styles.inlineLink} href={building.mapHref} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{t("campus.openMap")}</a>}</div>
            {building.address && <p>{building.address}</p>}
            {building.accessibility_notes && <small className={styles.accessibility}><Accessibility aria-hidden="true" />{building.accessibility_notes}</small>}
          </div>
        </article>)}
      </div>
    </section>}

    <section className={styles.panel} aria-label={t("campus.title")}>
      <SurfaceHeader icon={<MapPinned />} title={t("campus.title")} />
      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor="campus-directory-search"><span className="sr-only">{t("campus.search")}</span><Search aria-hidden="true" /><input id="campus-directory-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("campus.searchPlaceholder")} /></label>
        <div className={styles.tabs} role="tablist" aria-label={t("campus.title")}>
          <button id="campus-rooms-tab" role="tab" type="button" aria-selected={tab === "rooms"} aria-controls="campus-rooms-panel" className={tab === "rooms" ? styles.activeTab : ""} onClick={() => setTab("rooms")}>{t("campus.rooms")} <b>{counts.rooms}</b></button>
          <button id="campus-faculty-tab" role="tab" type="button" aria-selected={tab === "faculty"} aria-controls="campus-faculty-panel" className={tab === "faculty" ? styles.activeTab : ""} onClick={() => setTab("faculty")}>{t("campus.faculty")} <b>{counts.faculty}</b></button>
        </div>
      </div>

      {loading ? <div className={styles.empty} role="status" aria-live="polite"><LoaderCircle className={styles.spin} aria-hidden="true" /><span>{t("community.common.loading")}</span></div> : tab === "rooms" ? <div id="campus-rooms-panel" role="tabpanel" aria-labelledby="campus-rooms-tab" tabIndex={0}>
        {rooms.length ? <div className={styles.list}>{rooms.map(room => {
          const mapHref = externalUrl(room.building_map_url);
          return <article className={styles.row} key={room.id}>
            <span className={styles.rowIcon} aria-hidden="true"><MapPinned /></span>
            <div className={styles.rowBody}>
              <div className={styles.rowHeading}><strong>{room.code} · {room.name}</strong>{room.room_type && <span className={styles.tag}>{room.room_type}</span>}</div>
              <p>{room.building_code} · {room.building_name} · {t("campus.floor", { level: room.floor_label || room.level })}{room.capacity ? ` · ${t("campus.capacity", { capacity: room.capacity })}` : ""}</p>
              {room.building_address && <p className={styles.secondaryLine}>{room.building_address}</p>}
              {room.directions && <small>{room.directions}</small>}
              {(room.accessibility_notes || room.building_accessibility_notes) && <small className={styles.accessibility}><Accessibility aria-hidden="true" />{room.accessibility_notes || room.building_accessibility_notes}</small>}
              {mapHref && <div className={styles.rowActions}><a className={styles.inlineLink} href={mapHref} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{t("campus.openMap")}</a></div>}
            </div>
          </article>;
        })}</div> : <div className={styles.empty}><MapPinned aria-hidden="true" /><strong>{t("campus.noRooms")}</strong></div>}
      </div> : <div id="campus-faculty-panel" role="tabpanel" aria-labelledby="campus-faculty-tab" tabIndex={0}>
        {faculty.length ? <div className={styles.list}>{faculty.map(item => <article className={styles.row} key={item.id}>
          <span className={styles.rowIcon} aria-hidden="true"><GraduationCap /></span>
          <div className={styles.rowBody}>
            <div className={styles.rowHeading}><strong>{item.full_name}</strong>{item.title && <span className={styles.tag}>{item.title}</span>}</div>
            {item.office && <p>{t("campus.office")}: {item.office}</p>}
            {item.email && <a className={styles.contactLink} href={`mailto:${item.email}`}><Mail aria-hidden="true" />{item.email}</a>}
            {item.notes && <small>{item.notes}</small>}
            {item.units.length > 0 && <div className={styles.unitLinks}><span>{t("campus.units")}</span>{item.units.map(unit => <Link href={unitHref(unit.id)} key={unit.id}>{unit.code} · {unit.name}<ArrowUpRight aria-hidden="true" /></Link>)}</div>}
          </div>
        </article>)}</div> : <div className={styles.empty}><GraduationCap aria-hidden="true" /><strong>{t("campus.noFaculty")}</strong></div>}
      </div>}
    </section>

    {editor && <div className={styles.dialog} role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) closeEditor(); }}>
      <section className={styles.dialogPanel} role="dialog" aria-modal="true" aria-labelledby="campus-editor-title">
        <header className={styles.dialogHeader}><div><span className="eyebrow">{t("campus.manage")}</span><h2 id="campus-editor-title">{editor === "building" ? t("campus.newBuilding") : t("campus.newFaculty")}</h2></div><button className={styles.dialogClose} type="button" onClick={closeEditor} disabled={saving} aria-label={t("common.close")}><X aria-hidden="true" /></button></header>
        <form className={styles.dialogForm} onSubmit={save}>
          <label htmlFor="campus-name">{t("campus.name")}<input id="campus-name" ref={firstFieldRef} required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
          {editor === "building" && <>
            <label htmlFor="campus-code">{t("campus.code")}<input id="campus-code" required value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></label>
            <label htmlFor="campus-address">{t("campus.address")}<input id="campus-address" value={form.address} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} /></label>
            <label htmlFor="campus-map-url">{t("campus.mapUrl")}<input id="campus-map-url" type="url" value={form.mapUrl} onChange={event => setForm(current => ({ ...current, mapUrl: event.target.value }))} placeholder="https://…" /></label>
            <label htmlFor="campus-accessibility">{t("campus.accessibility")}<textarea id="campus-accessibility" rows={3} value={form.accessibilityNotes} onChange={event => setForm(current => ({ ...current, accessibilityNotes: event.target.value }))} /></label>
          </>}
          {editor === "faculty" && <>
            <label htmlFor="campus-email">{t("campus.email")}<input id="campus-email" type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label>
            <label htmlFor="campus-title">{t("campus.titleField")}<input id="campus-title" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label>
            <label htmlFor="campus-office">{t("campus.office")}<input id="campus-office" value={form.office} onChange={event => setForm(current => ({ ...current, office: event.target.value }))} /></label>
          </>}
          <footer><button className="button button--secondary" type="button" onClick={closeEditor} disabled={saving}>{t("campus.cancel")}</button><button className="button button--primary" type="submit" disabled={saving}>{saving && <LoaderCircle className={styles.spin} aria-hidden="true" />}{t("campus.save")}</button></footer>
        </form>
      </section>
    </div>}
  </AppShell></ModuleGuard></AuthGuard>;
}
