"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Download, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SurfaceHeader } from "@/components/surface-header";
import { ClassRosterImport } from "@/components/class-roster-import";
import { useAuth } from "@/components/auth-context";
import { FilterBar, FilterSearch } from "@/components/filter-bar";
import { useFloatingAction } from "@/components/floating-actions";
import { useI18n } from "@/components/i18n-context";
import { StudentPreferencePanel } from "@/components/student-preference-panel";
import type { EstadoTurma, Turma } from "@/data/turmas";
import styles from "@/components/turmas-dashboard.module.css";

type ApiClass = { id: number; status: string; submitted_at: number | null; representative: string | null; students: number; stays?: number; moves?: number };
const labels: Record<string, EstadoTurma> = { draft: "Em preenchimento", reopened: "Em preenchimento", submitted: "Submetida", review: "Submetida", validated: "Submetida", published: "Publicada" };
const FLOATING_PDF_ICON = <Download aria-hidden="true" />;

function downloadPublicPdf() {
  const link = document.createElement("a");
  link.href = "/api/classes/public-pdf";
  link.download = "";
  link.click();
}

export function TurmasDashboard() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const [classes, setClasses] = useState<Turma[]>([]), [search, setSearch] = useState(""), [loading, setLoading] = useState(true), [placementsPublished, setPlacementsPublished] = useState(false);
  const preferenceOnly = user?.role === "student" && !user.classRepresentative && !user.preview;
  const canImport = user?.role === "admin" || user?.commissionDepartment === "management";
  const load = useCallback(async () => { try { const response = await fetch("/api/classes", { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as { classes?: ApiClass[] }; setPlacementsPublished(Boolean(data.classes?.length && data.classes.every((item) => item.status === "published"))); setClasses((data.classes || []).map((item) => ({ id: item.id, nome: t("classes.common.class", { number: item.id }), representante: item.representative || t("classes.dashboard.unassigned"), alunos: Number(item.students), ficam: Number(item.stays || 0), mudam: Number(item.moves || 0), estado: labels[item.status] || "Em preenchimento" }))); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void load(); }, [load]);
  useFloatingAction(placementsPublished ? { id: "classes-public-pdf", label: t("classes.dashboard.pdf"), icon: FLOATING_PDF_ICON, onClick: downloadPublicPdf } : null);
  const visible = useMemo(() => { const term = search.toLocaleLowerCase(locale).trim(); return classes.filter((item) => `${item.nome} ${item.representante}`.toLocaleLowerCase(locale).includes(term)); }, [classes, locale, search]);
  const total = classes.reduce((count, item) => count + item.alunos, 0);
  const submitted = classes.filter((item) => item.estado === "Submetida" || item.estado === "Publicada").length;
  const showDecisions = !preferenceOnly && !placementsPublished;
  const preferencePanel = !loading && !placementsPublished ? <StudentPreferencePanel /> : null;
  const stateLabel = (state: EstadoTurma) => state === "Publicada" ? t("classes.dashboard.published") : state === "Submetida" ? t("classes.dashboard.submitted") : t("classes.dashboard.filling");
  const stateKey = (state: EstadoTurma) => state === "Publicada" ? "published" : state === "Submetida" ? "submitted" : "draft";
  const pageTitle = placementsPublished ? t("classes.dashboard.finalClasses") : preferenceOnly ? t("classes.dashboard.baseClasses") : t("classes.dashboard.yearClasses");
  const pageHeader = <SurfaceHeader standalone headingLevel="h1" icon={<Users />} eyebrow={t("classes.dashboard.year")} title={pageTitle} />;
  const classOverview = <section className={`panel ${styles.listPanel}`} aria-label={t("classes.dashboard.status")} aria-busy={loading}>
    <FilterBar label={t("classes.dashboard.search")}><FilterSearch label={t("classes.dashboard.search")} value={search} onChange={setSearch} placeholder={t("classes.dashboard.searchPlaceholder")} /></FilterBar>
    {loading ? <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("classes.dashboard.loading")}</span>{[0, 1, 2, 3].map((index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div>
      : !visible.length ? <div className={styles.empty}><Users aria-hidden="true" /><strong>{t("classes.dashboard.empty")}</strong></div>
      : <ul className={styles.rows}>{visible.map((item) => <li className={styles.row} key={item.id} data-status={stateKey(item.estado)}>
        <span className={styles.statusDot} aria-hidden="true" />
        <div className={styles.rowMain}>
          <h3><Link className={`link-quiet ${styles.titleLink}`} href={`/turmas/${item.id}`}>{item.nome}</Link></h3>
          <p className={styles.rowMeta}>{item.representante} · {item.alunos} {t("classes.dashboard.students").toLocaleLowerCase(locale)}{showDecisions && ` · ${t("classes.dashboard.stayCount", { count: item.ficam })} · ${t("classes.dashboard.moveCount", { count: item.mudam })}`}</p>
        </div>
        <span className={styles.statusPill}>{stateLabel(item.estado)}</span>
      </li>)}</ul>}
  </section>;
  if (preferenceOnly) return <AppShell active="turmas" breadcrumb="Turmas">{pageHeader}{preferencePanel}{classOverview}</AppShell>;
  return <AppShell active="turmas" breadcrumb="Turmas">{pageHeader}{preferencePanel}<section className="stats-grid classes-stats"><article className="stat-card"><span className="stat-card__icon stat-card__icon--ink"><Users /></span><div><span>{t("classes.dashboard.registered")}</span><strong>{total}</strong><small>{t("classes.dashboard.inClasses", { count: classes.length })}</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Building2 /></span><div><span>{t("classes.dashboard.created")}</span><strong>{classes.length}</strong><small>{t("classes.dashboard.available")}</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--green"><CheckCircle2 /></span><div><span>{t("classes.dashboard.submittedStat")}</span><strong>{submitted}/{classes.length}</strong><small>{t("classes.dashboard.delivered")}</small></div></article></section>{canImport && <ClassRosterImport onImported={load} />}{classOverview}</AppShell>;
}
