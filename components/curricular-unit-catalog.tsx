"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  FileText,
  Filter,
  GraduationCap,
  LoaderCircle,
  Mail,
  Megaphone,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { ModuleGuard } from "@/components/module-guard";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/curricular-unit-catalog.module.css";

type ApiRepresentative = {
  id?: string | number;
  name?: string;
  fullName?: string;
  full_name?: string;
  email?: string;
  position?: string;
  commissionPositionLabel?: string;
};
type ApiUnit = {
  id: string | number;
  code?: string;
  name?: string;
  description?: string | null;
  ects?: number;
  credits?: number;
  year?: number;
  studyYear?: number;
  study_year?: number;
  semester?: number;
  representative?: ApiRepresentative | null;
  representatives?: ApiRepresentative[] | null;
  representativeName?: string;
  representative_name?: string;
  representativeEmail?: string;
  representative_email?: string;
};
type Representative = { id: string; name: string; email: string; position: string };
type Unit = {
  id: string;
  code: string;
  name: string;
  description: string;
  ects: number;
  year: number;
  semester: number;
  representatives: Representative[];
};
type Detail = {
  unit: Unit;
  announcements: Array<{ id: string; title: string; publishedAt: string }>;
  documents: Array<{
    id: string;
    title: string;
    url?: string;
    type?: string;
    category?: never;
  }>;
  events: Array<{ id: string; title: string; startsAt: string; kind?: string }>;
  materials: Array<{
    id: string;
    title: string;
    url?: string;
    category?: string;
    type?: never;
  }>;
};
function unit(item: ApiUnit, defaultUnit: string, defaultRepresentative: string): Unit {
  const legacyRepresentative = item.representative ?? (item.representativeName || item.representative_name ? {
    name: item.representativeName ?? item.representative_name,
    email: item.representativeEmail ?? item.representative_email,
  } : null);
  const representatives = (item.representatives?.length ? item.representatives : legacyRepresentative ? [legacyRepresentative] : [])
    .map((representative, index) => ({
      id: String(representative.id ?? `representative-${index + 1}`),
      name: representative.name ?? representative.fullName ?? representative.full_name ?? "",
      email: representative.email ?? "",
      position: representative.position ?? representative.commissionPositionLabel ?? defaultRepresentative,
    }))
    .filter((representative) => representative.name)
    .slice(0, 2);
  return {
    id: String(item.id),
    code: item.code ?? "UC",
    name: item.name ?? defaultUnit,
    description: item.description ?? "",
    ects: Number(item.ects ?? item.credits ?? 0),
    year: Number(item.year ?? item.studyYear ?? item.study_year ?? 1),
    semester: Number(item.semester ?? 1),
    representatives,
  };
}
async function readUnits(defaultUnit: string, defaultRepresentative: string, loadError: string) {
  let response = await fetch("/api/curricular-units", { cache: "no-store" });
  if (response.status === 404 || response.status === 405)
    response = await fetch("/api/admin/curricular-units", {
      cache: "no-store",
    });
  const data = (await response.json()) as { units?: ApiUnit[]; error?: string };
  if (!response.ok)
    throw new Error(
      data.error || loadError,
    );
  return (data.units ?? []).map((item) => unit(item, defaultUnit, defaultRepresentative));
}
function date(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}

export function CurricularUnitCatalog() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [year, setYear] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUnits(await readUnits(t("community.common.curricularUnit"), t("community.units.representative"), t("community.units.loadError")));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("community.units.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    return units.filter(
      (item) =>
        (year === "all" || item.year === Number(year)) &&
        (!term ||
          `${item.code} ${item.name} ${item.representatives.map((representative) => representative.name).join(" ")}`
            .toLocaleLowerCase(locale)
            .includes(term)),
    );
  }, [locale, units, query, year]);
  const filtersActive = Boolean(query.trim() || year !== "all");
  const activeFilterCount = [query.trim(), year !== "all"].filter(Boolean).length;
  const clearFilters = () => { setQuery(""); setYear("all"); };
  const canManageUnits = user?.role === "admin" && (user.commissionDepartment === "management" || user.email.toLowerCase() === "up202507850@up.pt");
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="curricular_units.catalog">
        <AppShell active="curricular_units" breadcrumb={t("community.units.breadcrumb")}>
          <div className={styles.page}>
            <header className={`page-heading page-heading--simple ${styles.hero}`}>
              <div className={styles.heroCopy}>
                <div>
                  <span className="eyebrow">{t("community.units.eyebrow")}</span>
                  <h1>{t("community.units.title")}</h1>
                  <p>{t("community.units.description")}</p>
                </div>
              </div>
              {canManageUnits && <Link className={`button button--primary ${styles.manageCta}`} href="/admin/unidades-curriculares"><Plus />Gerir e adicionar UCs</Link>}
            </header>
            {error && (
              <AppToast
                kind="error"
                message={error}
                duration={0}
                onDismiss={() => setError("")}
              />
            )}
            <section className={`${styles.panel} ${styles.catalogPanel}`}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t("community.units.catalog")}</h2>
                  <p>{t("community.units.organized")}</p>
                </div>
                {!loading && (
                  <span className={styles.count}>
                    {visible.length}{" "}
                    {visible.length === 1 ? t("community.units.unit") : t("community.units.unitPlural")}
                  </span>
                )}
              </div>
              <div className={styles.catalogToolbar} aria-label={t("community.units.filters")}>
                <div className={styles.filterHeading}>
                  <div className={styles.filterTitle}><span><Filter /></span><div><strong>{t("community.units.filters")}</strong><small>{t("community.units.filtersHint")}</small></div></div>
                  <div className={styles.filterActions}>{filtersActive && <span className={styles.activeFilters}>{activeFilterCount} {t(activeFilterCount === 1 ? "community.units.activeFilter" : "community.units.activeFilters")}</span>}{filtersActive && <button className={styles.clearFilters} type="button" onClick={clearFilters}><X />{t("community.units.clearFilters")}</button>}</div>
                </div>
                <div className={styles.catalogFilterGrid}>
                  <label className={`${styles.filterField} ${styles.catalogSearch}`}>
                    <span><Search />{t("community.units.search")}</span>
                    <div><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("community.units.searchPlaceholder")} /></div>
                  </label>
                  <label className={styles.filterField}>
                    <span><GraduationCap />{t("community.units.filterYear")}</span>
                    <select value={year} onChange={(event) => setYear(event.target.value)}>
                      <option value="all">{t("community.units.allYears")}</option>
                      {[1, 2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{t("community.units.yearOption", { year: value })}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              {loading ? (
                <div className={styles.state}>
                  <LoaderCircle className={styles.spin} />
                  <strong>{t("community.units.loading")}</strong>
                </div>
              ) : visible.length === 0 ? (
                <div className={`${styles.state} ${styles.emptyState}`}>
                  <Search />
                  <strong>{t("community.units.empty")}</strong>
                  {filtersActive ? <><p>{t("community.units.emptyHint")}</p><button className={styles.emptyAction} type="button" onClick={clearFilters}><X />{t("community.units.clearFilters")}</button></> : <><p>Quando existirem unidades curriculares, poderá consultá-las por ano, tema ou representante.</p>{canManageUnits && <Link className="button button--secondary button--compact" href="/admin/unidades-curriculares"><Plus />Adicionar a primeira UC</Link>}</>}
                </div>
              ) : (
                <div className={`${styles.grid} ${styles.catalogGrid}`}>
                  {visible.map((item) => (
                    <Link
                      className={`${styles.card} ${styles.catalogCard}`}
                      href={`/unidades-curriculares/${encodeURIComponent(item.id)}`}
                      key={item.id}
                    >
                      <div className={styles.cardTop}>
                        <span className={styles.unitCode}>{item.code}</span>
                        <span className={styles.tag}>
                          {t("community.units.yearSemester", { year: item.year, semester: item.semester })}
                        </span>
                      </div>
                      <div>
                        <h3>{item.name}</h3>
                        {item.description && <p>{item.description}</p>}
                      </div>
                      <div className={styles.metrics}>
                        <div className={styles.metric}>
                          <span>{t("community.units.credits")}</span>
                          <strong>
                            {item.ects.toLocaleString(locale)} ECTS
                          </strong>
                        </div>
                        <div className={styles.metric}>
                          <span>{t("community.units.year")}</span>
                          <strong>{item.year}.º</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>{t("community.units.semester")}</span>
                          <strong>{item.semester}.º</strong>
                        </div>
                      </div>
                      {item.representatives.length > 0 && <div className={styles.metaRow}>
                        <UserRound />
                        <span>{item.representatives.map((representative) => representative.name).join(" · ")}</span>
                      </div>}
                      <span className={styles.linkHint}>
                        {t("community.units.openArea")} <ArrowRight />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}

export function CurricularUnitDetail({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/curricular-units/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const raw = (await response.json()) as {
        unit?: ApiUnit;
        announcements?: Array<{
          id: string | number;
          title: string;
          publishedAt?: string;
          published_at?: string;
        }>;
        documents?: Array<{
          id: string | number;
          title: string;
          url?: string;
          type?: string;
          attachmentDataUrl?: string;
        }>;
        events?: Array<{
          id: string | number;
          title: string;
          startsAt?: string;
          starts_at?: string;
          kind?: string;
        }>;
        upcomingEvents?: Array<{
          id: string | number;
          title: string;
          startsAt?: string;
          starts_at?: string;
          kind?: string;
        }>;
        materials?: Array<{
          id: string | number;
          title: string;
          url?: string;
          category?: string;
          type?: string;
          attachmentDataUrl?: string;
        }>;
        error?: string;
      };
      if (!response.ok || !raw.unit)
        throw new Error(
          raw.error || t("community.units.detailLoadError"),
        );
      setData({
        unit: unit(raw.unit, t("community.common.curricularUnit"), t("community.units.representative")),
        announcements: (raw.announcements ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          publishedAt:
            item.publishedAt ?? item.published_at ?? new Date().toISOString(),
        })),
        documents: (raw.documents ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          type: item.type,
          url: item.url ?? item.attachmentDataUrl,
        })),
        events: (raw.events ?? raw.upcomingEvents ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          startsAt: item.startsAt ?? item.starts_at ?? new Date().toISOString(),
          kind: item.kind,
        })),
        materials: (raw.materials ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          category:
            item.category ??
            (item.type === "exam_photo"
              ? t("community.units.material.exam")
              : item.type === "summary"
                ? t("community.units.material.summary")
                : item.type === "notes"
                  ? t("community.units.material.notes")
                  : t("community.units.material.other")),
          url: item.url ?? item.attachmentDataUrl,
        })),
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("community.units.detailLoadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [id, t]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="curricular_units.detail">
        <AppShell
          active="curricular_units"
          breadcrumb={data?.unit.name ?? t("community.common.curricularUnit")}
        >
          <div className={styles.page}>
            {error && (
              <AppToast
                kind="error"
                message={error}
                duration={0}
                onDismiss={() => setError("")}
              />
            )}{" "}
            {loading ? (
              <section className={styles.panel}>
                <div className={styles.state}>
                  <LoaderCircle className={styles.spin} />
                  <strong>{t("community.units.detailLoading")}</strong>
                </div>
              </section>
            ) : (
              data && (
                <>
                  <section className={`${styles.panel} ${styles.detailHero}`}>
                    <div>
                      <span className={styles.unitCode}>{data.unit.code}</span>
                      <h1>{data.unit.name}</h1>
                      <p>
                        {data.unit.description ||
                          t("community.units.detailDescription")}
                      </p>
                    </div>
                    <div className={styles.detailStats}>
                      <div className={styles.metric}>
                        <span>{t("community.units.credits")}</span>
                        <strong>{data.unit.ects} ECTS</strong>
                      </div>
                      <div className={styles.metric}>
                        <span>{t("community.units.year")}</span>
                        <strong>{data.unit.year}.º</strong>
                      </div>
                      <div className={styles.metric}>
                        <span>{t("community.units.semester")}</span>
                        <strong>{data.unit.semester}.º</strong>
                      </div>
                    </div>
                  </section>
                  <div className={styles.columns}>
                    <div className={styles.page}>
                      <DetailSection
                        title={t("community.units.upcoming")}
                        description={t("community.units.upcomingDescription")}
                        empty={t("community.units.upcomingEmpty")}
                      >
                        {data.events.map((item) => (
                          <div className={styles.listItem} key={item.id}>
                            <span className={styles.listIcon}>
                              <CalendarDays />
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                {date(item.startsAt, locale)}
                                {item.kind ? ` · ${item.kind}` : ""}
                              </small>
                            </span>
                          </div>
                        ))}
                      </DetailSection>
                      <DetailSection
                        title={t("community.units.notices")}
                        description={t("community.units.noticesDescription")}
                        empty={t("community.units.noticesEmpty")}
                      >
                        {data.announcements.map((item) => (
                          <div className={styles.listItem} key={item.id}>
                            <span className={styles.listIcon}>
                              <Megaphone />
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>{date(item.publishedAt, locale)}</small>
                            </span>
                            <Link href="/avisos">{t("community.units.consult")}</Link>
                          </div>
                        ))}
                      </DetailSection>
                    </div>
                    <div className={styles.page}>
                      {data.unit.representatives.length > 0 && <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                          <div>
                            <h2>{t("community.units.representative")}</h2>
                            <p>{t("community.units.representativeDescription")}</p>
                          </div>
                        </div>
                        <div className={`${styles.sectionBody} ${styles.representativeList}`}>
                          {data.unit.representatives.map((representative) => <article className={styles.representativeCard} key={representative.id}>
                            <div className={styles.cardTop}>
                              <span className={styles.avatar}>
                                {representative.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
                              </span>
                              <span className={styles.tag}>{representative.position}</span>
                            </div>
                            <h3>{representative.name}</h3>
                            {representative.email && <div className={styles.metaRow}><Mail /><span>{representative.email}</span></div>}
                          </article>)}
                        </div>
                      </section>}
                      <DetailSection
                        title={t("community.units.documents")}
                        description={t("community.units.documentsDescription")}
                        empty={t("community.units.documentsEmpty")}
                      >
                        {[...data.documents, ...data.materials].map((item) => (
                          <div className={styles.listItem} key={item.id}>
                            <span className={styles.listIcon}>
                              <FileText />
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                {"type" in item ? item.type : item.category}
                              </small>
                            </span>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t("community.units.open")}
                              </a>
                            )}
                          </div>
                        ))}
                      </DetailSection>
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}

function DetailSection({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {count ? (
        <div className={styles.sectionBody}>{children}</div>
      ) : (
        <div className={styles.state}>
          <BookOpen />
          <strong>{empty}</strong>
        </div>
      )}
    </section>
  );
}
