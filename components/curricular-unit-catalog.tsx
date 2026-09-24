"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  FolderOpen,
  GraduationCap,
  Mail,
  MapPin,
  Megaphone,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { SurfaceHeader } from "@/components/surface-header";
import { RecordSkeleton } from "@/components/record-list";
import list from "@/components/record-list.module.css";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { QuestionBankSection } from "@/components/question-bank-section";
import { RichTextContent } from "@/components/rich-text-editor";
import { useI18n } from "@/components/i18n-context";
import { UnitThumb } from "@/components/unit-thumb";
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
type ApiFacultyMember = {
  id?: string | number;
  fullName?: string;
  full_name?: string;
  title?: string | null;
  email?: string | null;
  office?: string | null;
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
  faculty?: ApiFacultyMember[] | null;
};
type Representative = { id: string; name: string; email: string; position: string };
type FacultyMember = { id: string; fullName: string; title: string; email: string; office: string };
type Unit = {
  id: string;
  code: string;
  name: string;
  description: string;
  ects: number;
  year: number;
  semester: number;
  representatives: Representative[];
  faculty: FacultyMember[];
};
type AcademicContent = {
  academicYear: string | null;
  availableYears: string[];
  profile: {
    description: string;
    attendanceRequired: boolean;
    attendancePolicy: string;
    absenceLimit: string;
    absencePolicy: string;
    attendanceNotes: string;
    status: "a_validar" | "verificado";
    lastValidatedAt?: number | null;
    lastValidatedBy?: string | null;
  } | null;
  evaluations: Array<{ id: string; title: string; weight: number | null; minimumScore: number | null; details: string }>;
  exams: Array<{ id: string; title: string; examType: string; notes: string; calendarEvent?: { startsAt?: number; location?: string | null } | null }>;
  sources: Array<{ id: string; title: string; sourceType: string; citation: string; pages: string; url?: string | null }>;
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
  academicContent: AcademicContent;
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
  const faculty = (item.faculty ?? []).map((member, index) => ({
    id: String(member.id ?? `faculty-${index + 1}`),
    fullName: member.fullName ?? member.full_name ?? "",
    title: member.title ?? "",
    email: member.email ?? "",
    office: member.office ?? "",
  })).filter((member) => member.fullName);
  return {
    id: String(item.id),
    code: item.code ?? "UC",
    name: item.name ?? defaultUnit,
    description: item.description ?? "",
    ects: Number(item.ects ?? item.credits ?? 0),
    year: Number(item.year ?? item.studyYear ?? item.study_year ?? 1),
    semester: Number(item.semester ?? 1),
    representatives,
    faculty,
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

function normaliseAcademicContent(value: unknown): AcademicContent {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const profileSource = source.profile && typeof source.profile === "object" && !Array.isArray(source.profile) ? source.profile as Record<string, unknown> : null;
  const textValue = (item: unknown) => typeof item === "string" ? item : "";
  const profile = profileSource ? {
    description: textValue(profileSource.description),
    attendanceRequired: profileSource.attendanceRequired === true,
    attendancePolicy: textValue(profileSource.attendancePolicy),
    absenceLimit: textValue(profileSource.absenceLimit),
    absencePolicy: textValue(profileSource.absencePolicy),
    attendanceNotes: textValue(profileSource.attendanceNotes),
    status: profileSource.status === "verificado" ? "verificado" as const : "a_validar" as const,
    lastValidatedAt: typeof profileSource.lastValidatedAt === "number" ? profileSource.lastValidatedAt : null,
    lastValidatedBy: textValue(profileSource.lastValidatedBy) || null,
  } : null;
  const evaluations = Array.isArray(source.evaluations) ? source.evaluations.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map(item => ({ id: textValue(item.id), title: textValue(item.title), weight: typeof item.weight === "number" ? item.weight : null, minimumScore: typeof item.minimumScore === "number" ? item.minimumScore : null, details: textValue(item.details) })) : [];
  const exams = Array.isArray(source.exams) ? source.exams.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map(item => ({ id: textValue(item.id), title: textValue(item.title), examType: textValue(item.examType), notes: textValue(item.notes), calendarEvent: item.calendarEvent && typeof item.calendarEvent === "object" && !Array.isArray(item.calendarEvent) ? { startsAt: typeof (item.calendarEvent as Record<string, unknown>).startsAt === "number" ? (item.calendarEvent as Record<string, unknown>).startsAt as number : undefined, location: textValue((item.calendarEvent as Record<string, unknown>).location) || null } : null })) : [];
  const sources = Array.isArray(source.sources) ? source.sources.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map(item => ({ id: textValue(item.id), title: textValue(item.title), sourceType: textValue(item.sourceType), citation: textValue(item.citation), pages: textValue(item.pages), url: textValue(item.url) || null })) : [];
  return { academicYear: textValue(source.academicYear) || null, availableYears: Array.isArray(source.availableYears) ? source.availableYears.filter((item): item is string => typeof item === "string") : [], profile, evaluations, exams, sources };
}

export function CurricularUnitCatalog() {
  const { locale, t } = useI18n();
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
  // Study plan order: grouped by year and semester, as in the materials picker.
  const groups = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const item of [...visible].sort((a, b) => a.year - b.year || a.semester - b.semester || a.name.localeCompare(b.name, locale))) {
      const key = t("community.units.yearSemester", { year: item.year, semester: item.semester });
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [locale, t, visible]);
  const filtersActive = Boolean(query.trim() || year !== "all");
  const clearFilters = () => { setQuery(""); setYear("all"); };
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="curricular_units.catalog">
        <AppShell active="curricular_units" breadcrumb={t("community.units.breadcrumb")}>
          <div className={styles.page}>
            <SurfaceHeader standalone headingLevel="h1" icon={<BookOpen />} eyebrow={t("community.units.eyebrow")} title={t("community.units.title")} />
            {error && (
              <AppToast
                kind="error"
                message={error}
                duration={0}
                onDismiss={() => setError("")}
              />
            )}
            <section className={`panel ${list.listPanel}`} aria-busy={loading}>
              {units.length > 0 && <FilterBar label={t("community.units.filters")}>
                <FilterSearch label={t("community.units.search")} value={query} onChange={setQuery} placeholder={t("community.units.searchPlaceholder")} />
                <FilterSelect label={t("community.units.filterYear")} value={year} onChange={setYear} options={[{ value: "all", label: t("community.units.allYears") }, ...[1, 2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: t("community.units.yearOption", { year: value }) }))]} />
              </FilterBar>}
              {loading ? <RecordSkeleton label={t("community.units.loading")} /> : visible.length === 0 ? (
                <div className={list.empty}>
                  {filtersActive ? <Search /> : <BookOpen />}
                  <strong>{t(filtersActive ? "community.units.empty" : "community.units.emptyInitial")}</strong>
                  {filtersActive && <button className={styles.emptyAction} type="button" onClick={clearFilters}><X />{t("community.units.clearFilters")}</button>}
                </div>
              ) : (
                groups.map(([group, items]) => <div className={list.group} key={group}>
                  <h3 className={list.groupTitle}>{group}</h3>
                  <ul className={list.rows}>
                    {items.map((item) => <li className={list.row} key={item.id}>
                      <UnitThumb id={item.id} code={item.code} name={item.name} />
                      <div className={list.rowMain}>
                        <h3><Link className={`link-quiet ${list.titleLink}`} href={`/unidades-curriculares/${encodeURIComponent(item.id)}`}>{item.name}</Link></h3>
                        <p className={list.rowMeta}>{[item.code, `${item.ects.toLocaleString(locale)} ECTS`, item.representatives.length ? item.representatives.map((representative) => representative.name).join(", ") : ""].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className={list.rowEnd}>
                        <Link className={list.rowAction} href={`/materiais/?uc=${encodeURIComponent(item.code.toLocaleUpperCase("pt-PT"))}`} aria-label={`${t("community.units.studyMaterials")} · ${item.name}`}><FolderOpen aria-hidden="true" /><span>{t("community.units.studyMaterials")}</span></Link>
                        <ArrowRight className={list.rowArrow} aria-hidden="true" />
                      </span>
                    </li>)}
                  </ul>
                </div>)
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
        academicContent?: unknown;
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
        academicContent: normaliseAcademicContent(raw.academicContent),
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
                <RecordSkeleton label={t("community.units.detailLoading")} />
              </section>
            ) : (
              data && (
                <>
                  <SurfaceHeader standalone headingLevel="h1" icon={<BookOpen />} eyebrow={data.unit.code} title={data.unit.name} />
                  <Link className={list.back} href="/unidades-curriculares/"><ChevronLeft aria-hidden="true" />{t("community.units.back")}</Link>
                  <section className={`${styles.panel} ${styles.summary}`} aria-label={data.unit.name}>
                    <UnitThumb id={data.unit.id} code={data.unit.code} name={data.unit.name} size="large" />
                    <dl className={styles.summaryFacts}>
                      <div><dt>{t("community.units.year")}</dt><dd>{data.unit.year}.º</dd></div>
                      <div><dt>{t("community.units.semester")}</dt><dd>{data.unit.semester}.º</dd></div>
                      <div><dt>{t("community.units.credits")}</dt><dd>{data.unit.ects.toLocaleString(locale)} ECTS</dd></div>
                      <div><dt>{t("community.units.representative")}</dt><dd>{data.unit.representatives.length ? data.unit.representatives.map((representative) => representative.name).join(", ") : t("community.units.noRepresentative")}</dd></div>
                    </dl>
                    <div className={styles.summaryActions}>
                      <Link className="button button--primary button--compact" href={`/materiais/?uc=${encodeURIComponent(data.unit.code.toLocaleUpperCase("pt-PT"))}`}><FolderOpen aria-hidden="true" />{t("community.units.studyMaterials")}</Link>
                      {data.unit.code === "NEURO" && <Link className="button button--secondary button--compact" href="/testes/"><ClipboardCheck aria-hidden="true" />{t("community.units.practiceTests")}</Link>}
                    </div>
                  </section>
                  {data.academicContent.profile && <AcademicContentPanel content={data.academicContent} locale={locale} />}
                  {data.unit.code === "NEURO" && <QuestionBankSection unitId={data.unit.id} unitCode={data.unit.code} />}
                  <div className={styles.columns}>
                    <div className={styles.page}>
                      <DetailSection
                        icon={<CalendarDays />}
                        title={t("community.units.upcoming")}
                       
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
                        icon={<Megaphone />}
                        title={t("community.units.notices")}
                       
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
                      {data.unit.faculty.length > 0 && <section className={styles.panel}>
                        <SurfaceHeader icon={<GraduationCap />} title={t("community.units.faculty")} actions={<Link className={styles.panelLink} href="/salas-docentes">{t("community.units.facultyDirectory")} <ArrowRight aria-hidden="true" /></Link>} />
                        <div className={`${styles.sectionBody} ${styles.representativeList}`}>
                          {data.unit.faculty.map((member) => <article className={styles.representativeCard} key={member.id}>
                            <div className={styles.cardTop}>
                              <span className={styles.avatar}>{member.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
                              {member.title && <span className={styles.tag}>{member.title}</span>}
                            </div>
                            <h3>{member.fullName}</h3>
                            {member.email && <div className={styles.metaRow}><Mail /><a href={`mailto:${member.email}`}>{member.email}</a></div>}
                            {member.office && <div className={styles.metaRow}><MapPin /><span>{t("campus.office")}: {member.office}</span></div>}
                          </article>)}
                        </div>
                      </section>}
                      {data.unit.representatives.length > 0 && <section className={styles.panel}>
                        <SurfaceHeader icon={<UserRound />} title={t("community.units.representative")} />
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
                        icon={<FileText />}
                        title={t("community.units.documents")}
                       
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

function ValidationBadge({ status }: { status: "a_validar" | "verificado" }) {
  const verified = status === "verificado";
  return <span className={`${styles.validationBadge} ${verified ? styles.validationVerified : styles.validationPending}`} data-status={status} title={verified ? "Informação verificada" : "Informação ainda por validar"}>
    {verified ? <BadgeCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
    {verified ? "Verificado" : "A validar"}
  </span>;
}

function AcademicContentPanel({ content, locale }: { content: AcademicContent; locale: string }) {
  const profile = content.profile;
  if (!profile) return null;
  const empty = <p className={styles.academicEmpty}>Ainda não foi adicionada informação para este bloco.</p>;
  const examLabels: Record<string, string> = { frequencia: "Frequência", normal: "Época normal", recurso: "Recurso", especial: "Época especial", melhoria: "Melhoria", outro: "Outro" };
  const sourceLabels: Record<string, string> = { oficial: "Oficial", recomendada: "Recomendada", regulamento: "Regulamento", bibliografia: "Bibliografia", outro: "Outra fonte" };
  return <section className={`${styles.panel} ${styles.academicPanel}`} aria-labelledby="academic-content-title">
    <SurfaceHeader icon={<GraduationCap />} title={`Informação académica${content.academicYear ? ` · ${content.academicYear}` : ""}`} headingId="academic-content-title" actions={<ValidationBadge status={profile.status} />} />
    <div className={styles.academicBlocks}>
      <article className={styles.academicBlock}>
        <h3>Descrição</h3>
        {profile.description ? <RichTextContent value={profile.description} className={styles.academicText} /> : empty}
      </article>
      <article className={styles.academicBlock}>
        <h3>Presenças e faltas</h3>
        <dl className={styles.academicFacts}>
          <div><dt>Presença obrigatória</dt><dd>{profile.attendanceRequired ? "Sim" : "Não indicada"}</dd></div>
          {profile.absenceLimit && <div><dt>Limite de faltas</dt><dd>{profile.absenceLimit}</dd></div>}
        </dl>
        {profile.attendancePolicy ? <RichTextContent value={profile.attendancePolicy} className={styles.academicText} /> : !profile.attendanceRequired && !profile.absenceLimit ? empty : null}
        {profile.absencePolicy && <RichTextContent value={profile.absencePolicy} className={styles.academicText} />}
        {profile.attendanceNotes && <RichTextContent value={profile.attendanceNotes} className={styles.academicText} />}
      </article>
      <article className={styles.academicBlock}>
        <h3>Avaliação</h3>
        {content.evaluations.length ? <div className={styles.academicRows}>{content.evaluations.map(item => <div className={styles.academicRow} key={item.id}><div><strong>{item.title}</strong>{item.details && <RichTextContent value={item.details} className={styles.academicText} />}</div><span>{item.weight === null ? "Peso não indicado" : `${item.weight}%`}{item.minimumScore === null ? "" : ` · mínimo ${item.minimumScore}/20`}</span></div>)}</div> : empty}
      </article>
      <article className={styles.academicBlock}>
        <h3>Frequências e exames</h3>
        {content.exams.length ? <div className={styles.academicRows}>{content.exams.map(item => <div className={styles.academicRow} key={item.id}><div><strong>{item.title}</strong><small>{examLabels[item.examType] || item.examType}{item.calendarEvent?.startsAt ? ` · ${new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(item.calendarEvent.startsAt))}` : ""}{item.calendarEvent?.location ? ` · ${item.calendarEvent.location}` : ""}</small>{item.notes && <RichTextContent value={item.notes} className={styles.academicText} />}</div>{item.calendarEvent && <Link href="/calendario">Calendário <CalendarClock aria-hidden="true" /></Link>}</div>)}</div> : empty}
      </article>
      <article className={styles.academicBlock}>
        <h3>Fontes e bibliografia</h3>
        {content.sources.length ? <div className={styles.academicRows}>{content.sources.map(item => <div className={styles.academicRow} key={item.id}><div><strong>{item.title}</strong><small>{sourceLabels[item.sourceType] || item.sourceType}{item.pages ? ` · ${item.pages}` : ""}</small>{item.citation && <p>{item.citation}</p>}</div>{item.url && <a href={item.url} target="_blank" rel="noreferrer">Abrir <ArrowRight aria-hidden="true" /></a>}</div>)}</div> : empty}
      </article>
    </div>
    {profile.status === "a_validar" && <p className={styles.validationNotice}><ShieldAlert aria-hidden="true" />Esta informação foi disponibilizada pela Comissão de Curso, mas ainda não foi formalmente validada. Confirma sempre as regras oficiais da unidade curricular.</p>}
  </section>;
}

function DetailSection({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <section className={styles.panel}>
      <SurfaceHeader icon={icon} title={title} meta={count ? String(count) : undefined} />
      {count ? (
        <div className={styles.sectionBody}>{children}</div>
      ) : (
        <p className={styles.sectionEmpty}>{empty}</p>
      )}
    </section>
  );
}
