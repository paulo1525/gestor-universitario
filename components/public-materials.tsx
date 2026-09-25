"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Globe, House, Lock, LogIn, Search } from "lucide-react";
import { AppToast, type ToastKind } from "@/components/app-toast";
import { useI18n } from "@/components/i18n-context";
import { materialReaderHref } from "@/lib/material-reader";
import styles from "@/components/useful-links-tree.module.css";

export const PUBLIC_MATERIALS_PATH = "/materiais-do-ano/";
const SKELETON_ROWS = [0, 1, 2, 3, 4];

type Section = "summaries" | "notes" | "bibliography" | "anki" | "other";
// A locked entry carries only its section: the server never sends its title, id or link to visitors.
type Entry = { section: Section; locked: boolean; more?: number; id?: string; type?: "catalog" | "anki"; title?: string; href?: string; download?: string; isPublic?: boolean };
type Unit = { key: string; code: string; name: string; entries: Entry[] };
type State = { status: "loading" | "ready" | "unavailable"; units: Unit[]; authenticated: boolean; canManage: boolean };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
}

function initialDiscipline() {
  return typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("disciplina") ?? "";
}

/** Entries arrive ordered by section; this keeps that order and splits them under one label each. */
function sectionsOf(entries: Entry[]): Array<[Section, Entry[]]> {
  const groups = new Map<Section, Entry[]>();
  for (const entry of entries) groups.set(entry.section, [...(groups.get(entry.section) ?? []), entry]);
  return [...groups.entries()];
}

const LOCKED_PREVIEW = 2;

/** Open items first; restricted ones collapse into a couple of redacted rows plus "+N reservados". */
function compactLocked(entries: Entry[]): Entry[] {
  const open = entries.filter((entry) => !entry.locked), locked = entries.filter((entry) => entry.locked);
  if (locked.length <= LOCKED_PREVIEW + 1) return [...open, ...locked];
  return [...open, ...locked.slice(0, LOCKED_PREVIEW), { ...locked[0], more: locked.length - LOCKED_PREVIEW }];
}

const SECTION_INITIAL: Record<Section, string> = { summaries: "S", notes: "R", bibliography: "B", anki: "A", other: "·" };

/** Public, Linktree-style page with the year's materials (sumários, resumos, bibliografia, Anki). */
export function PublicMaterials() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading", units: [], authenticated: false, canManage: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: ToastKind; message: string } | null>(null);
  const [query, setQuery] = useState("");
  // The chosen subject lives in the address (?disciplina=NEURO) so a filtered link can be shared.
  const [discipline, setDiscipline] = useState(initialDiscipline);
  const chooseDiscipline = (key: string) => {
    setDiscipline(key);
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("disciplina", key); else url.searchParams.delete("disciplina");
    window.history.replaceState(window.history.state, "", url);
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/public-materials", { cache: "no-store", credentials: "same-origin", signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as { units?: Unit[]; authenticated?: boolean; canManage?: boolean };
      setState({ status: "ready", units: (data.units ?? []).filter((unit) => unit.entries.length), authenticated: data.authenticated === true, canManage: data.canManage === true });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setState((current) => ({ ...current, status: current.status === "ready" ? "ready" : "unavailable" }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

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

  const unitKey = (unit: Unit) => unit.code || unit.key;
  const term = normalize(query.trim());
  // Search matches titles, sections and subject names; redacted entries have no title, so they leave the list while searching.
  const visibleUnits = useMemo(() => state.units
    .filter((unit) => !discipline || unitKey(unit) === discipline)
    .map((unit) => ({ ...unit, entries: term ? unit.entries.filter((entry) => !entry.locked && normalize(`${entry.title ?? ""} ${t(`publicMaterials.section.${entry.section}` as "publicMaterials.section.summaries")} ${unit.code} ${unit.name}`).includes(term)) : unit.entries }))
    .filter((unit) => unit.entries.length), [discipline, state.units, t, term]);
  const signInHref = `/login/?next=${encodeURIComponent(PUBLIC_MATERIALS_PATH)}`;
  const hasLocked = state.units.some((unit) => unit.entries.some((entry) => entry.locked));
  const sectionLabel = (section: Section) => t(`publicMaterials.section.${section}` as "publicMaterials.section.summaries");
  // Signed-in users read PDFs in the annotator; visitors open the public file directly.
  const openHref = (entry: Entry) => state.authenticated && entry.type === "catalog" && entry.id && entry.href?.endsWith("/view") ? materialReaderHref(entry.id) : entry.href ?? "#";

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <nav className={styles.topRow} aria-label={t("publicMaterials.title")}>
          {state.authenticated && <Link className={styles.iconLink} href="/" aria-label={t("links.tree.home")} title={t("links.tree.home")}><House aria-hidden="true" /></Link>}
          <span className={styles.spacer} />
          {state.status === "ready" && !state.authenticated && hasLocked && <Link className={styles.signIn} href={signInHref}><LogIn aria-hidden="true" />{t("links.tree.signIn")}</Link>}
        </nav>

        <header className={styles.header}>
          <span className={styles.logoFrame}><Image className={styles.logo} src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt={t("shell.brandAlt")} width={88} height={88} priority /></span>
          <h1 className={styles.title}>{t("publicMaterials.title")}</h1>
          <p className={styles.brand}>{t("links.tree.brand")}</p>
        </header>

        {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

        {state.status === "loading" ? (
          <div className={styles.list} aria-busy="true" aria-label={t("publicMaterials.title")}>
            {SKELETON_ROWS.map((row) => <span className={`${styles.row} ${styles.skeleton}`} key={row}><span className={styles.link}><span className={styles.chip} /><span className={styles.copy}><span className={styles.skeletonLine} /><span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} /></span></span></span>)}
          </div>
        ) : state.status === "unavailable" ? (
          <p className={styles.message} role="status">{t("links.tree.unavailable")}</p>
        ) : state.units.length === 0 ? (
          <p className={styles.message}>{t("publicMaterials.empty")}</p>
        ) : (
          <>
          <div className={styles.filters}>
            <label className={styles.search}>
              <Search aria-hidden="true" />
              <span className="sr-only">{t("publicMaterials.search")}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("publicMaterials.searchPlaceholder")} />
            </label>
            {state.units.length > 1 && <div className={styles.disciplines} role="group" aria-label={t("publicMaterials.disciplines")}>
              <button type="button" aria-pressed={!discipline} onClick={() => chooseDiscipline("")}>{t("publicMaterials.allDisciplines")}</button>
              {state.units.map((unit) => <button type="button" key={unit.key} aria-pressed={discipline === unitKey(unit)} onClick={() => chooseDiscipline(unitKey(unit))} title={unit.name}>{unit.code || unit.name || t("publicMaterials.general")}</button>)}
            </div>}
          </div>
          {visibleUnits.length === 0 ? <p className={styles.message} role="status">{t("publicMaterials.noResults")}</p> : <div className={styles.groups}>
            {visibleUnits.map((unit) => {
              const label = unit.code ? `${unit.code} · ${unit.name}` : unit.name || t("publicMaterials.general");
              return <section className={styles.group} key={unit.key} aria-label={label}>
                <h2 className={styles.groupLabel}>{label}</h2>
                {sectionsOf(unit.entries).map(([section, entries]) => <div className={styles.subgroup} key={section}>
                <h3 className={styles.subgroupLabel}>{sectionLabel(section)}</h3>
                <ul className={styles.list}>
                  {compactLocked(entries).map((entry, index) => entry.locked ? (
                    <li className={`${styles.row} ${styles.lockedRow}`} key={`locked-${index}`}>
                      <Link className={styles.link} href={signInHref}>
                        <span className={styles.chip} aria-hidden="true"><Lock /></span>
                        <span className={styles.copy}>
                          <span className={styles.redacted} aria-hidden="true" />
                          <small>{entry.more ? t("publicMaterials.moreLocked", { count: entry.more }) : t("links.tree.lockedHint")}</small>
                          <span className="sr-only">{t("links.tree.locked")}</span>
                        </span>
                      </Link>
                    </li>
                  ) : (
                    <li className={styles.row} key={`${entry.type}-${entry.id}`}>
                      <a className={styles.link} href={openHref(entry)} target="_blank" rel="noopener">
                        <span className={styles.chip} aria-hidden="true">{SECTION_INITIAL[entry.section]}</span>
                        <span className={styles.copy}>
                          <strong>{entry.title}</strong>
                        </span>
                        <span className="sr-only"> ({t("links.opensInNewTab")})</span>
                      </a>
                      {state.canManage && (
                        <span className={styles.itemActions}>
                          <button className={styles.itemAction} type="button" disabled={busy === entry.id} onClick={() => void toggle(entry)} aria-pressed={entry.isPublic === true} aria-label={`${t(entry.isPublic ? "publicMaterials.isPublic" : "publicMaterials.isPrivate")}: ${entry.title}`} title={t(entry.isPublic ? "publicMaterials.isPublic" : "publicMaterials.isPrivate")}>
                            {entry.isPublic ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
                          </button>
                        </span>
                      )}
                      {entry.download && <a className={styles.arrowLink} href={entry.download} download aria-label={`${t("publicMaterials.download")}: ${entry.title}`} title={t("publicMaterials.download")}><Download className={styles.arrow} aria-hidden="true" /></a>}
                    </li>
                  ))}
                </ul>
                </div>)}
              </section>;
            })}
          </div>}
          </>
        )}
      </div>
    </main>
  );
}
