"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, CheckCircle2, ChevronRight, Download, Search, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { StudentPreferencePanel } from "@/components/student-preference-panel";
import type { EstadoTurma, Turma } from "@/data/turmas";

type ApiClass = { id: number; status: string; submitted_at: number | null; representative: string | null; students: number; stays?: number; moves?: number };
const labels: Record<string, EstadoTurma> = { draft: "Em preenchimento", reopened: "Em preenchimento", submitted: "Submetida", review: "Submetida", validated: "Submetida", published: "Publicada" };

export function TurmasDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const [classes, setClasses] = useState<Turma[]>([]), [search, setSearch] = useState(""), [loading, setLoading] = useState(true), [placementsPublished, setPlacementsPublished] = useState(false);
  const preferenceOnly = user?.role === "student" && !user.classRepresentative && !user.preview;
  useEffect(() => { void (async () => { try { const response = await fetch("/api/classes", { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as { classes?: ApiClass[] }; setPlacementsPublished(Boolean(data.classes?.length && data.classes.every((item) => item.status === "published"))); setClasses((data.classes || []).map((item) => ({ id: item.id, nome: t("classes.common.class", { number: item.id }), representante: item.representative || t("classes.dashboard.unassigned"), alunos: Number(item.students), ficam: Number(item.stays || 0), mudam: Number(item.moves || 0), estado: labels[item.status] || "Em preenchimento" }))); } finally { setLoading(false); } })(); }, [t]);
  const visible = useMemo(() => { const term = search.toLocaleLowerCase(locale).trim(); return classes.filter((item) => `${item.nome} ${item.representante}`.toLocaleLowerCase(locale).includes(term)); }, [classes, locale, search]);
  const total = classes.reduce((count, item) => count + item.alunos, 0);
  const submitted = classes.filter((item) => item.estado === "Submetida" || item.estado === "Publicada").length;
  const showDecisions = !preferenceOnly && !placementsPublished;
  const stateLabel = (state: EstadoTurma) => state === "Publicada" ? t("classes.dashboard.published") : state === "Submetida" ? t("classes.dashboard.submitted") : t("classes.dashboard.filling");
  const classOverview = <section className="panel overview-panel">
    <div className="panel__header">
      <div><span className="eyebrow">{placementsPublished ? t("classes.dashboard.yearClasses") : t("classes.dashboard.current")}</span><div className="published-heading"><h2>{placementsPublished ? t("classes.dashboard.finalClasses") : preferenceOnly ? t("classes.dashboard.baseClasses") : t("classes.dashboard.status")}</h2>{placementsPublished && <span className="published-badge"><CheckCircle2 />{t("classes.dashboard.publishedBadge")}</span>}</div><p>{placementsPublished ? t("classes.dashboard.finalDescription") : preferenceOnly ? t("classes.dashboard.baseDescription") : t("classes.dashboard.statusDescription")}</p></div>
      <div className="overview-panel__tools"><label className="search-field"><Search size={18} /><span className="sr-only">{t("classes.dashboard.search")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("classes.dashboard.searchPlaceholder")} /></label>{placementsPublished && <Link className="button button--secondary overview-panel__pdf" href="/api/classes/public-pdf" prefetch={false} download><Download />{t("classes.dashboard.pdf")}</Link>}</div>
    </div>
    <div className="table-scroll class-overview-table"><table><thead><tr><th>{t("classes.dashboard.class")}</th><th>{t("classes.dashboard.representative")}</th><th>{t("classes.dashboard.students")}</th>{showDecisions && <th>{t("classes.dashboard.decisions")}</th>}<th>{t("classes.dashboard.state")}</th><th /></tr></thead><tbody>{visible.map((item) => <tr className="class-row" tabIndex={0} key={item.id} onClick={() => router.push(`/turmas/${item.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/turmas/${item.id}`); } }}><td className="class-overview-table__name" data-label={t("classes.dashboard.class")}><strong>{item.nome}</strong></td><td className="class-overview-table__representative" data-label={t("classes.dashboard.representative")}>{item.representante}</td><td data-label={t("classes.dashboard.students")}>{item.alunos}</td>{showDecisions && <td className="class-overview-table__decisions" data-label={t("classes.dashboard.decisions")}><div className="preference-counts preference-counts--inline"><span><i className="dot dot--green" />{t("classes.dashboard.stayCount", { count: item.ficam })}</span><span><i className="dot dot--gold" />{t("classes.dashboard.moveCount", { count: item.mudam })}</span></div></td>}<td data-label={t("classes.dashboard.state")}><span className={`status ${placementsPublished ? "status--success" : "status--neutral"}`}>{stateLabel(item.estado)}</span></td><td className="class-overview-table__action" aria-hidden="true"><ChevronRight size={18} /></td></tr>)}</tbody></table>{loading && <div className="empty-state">{t("classes.dashboard.loading")}</div>}{!loading && !visible.length && <div className="empty-state">{t("classes.dashboard.empty")}</div>}</div>
  </section>;
  if (preferenceOnly) return <AppShell active="turmas" breadcrumb="Turmas">{!loading && !placementsPublished && <StudentPreferencePanel />}{classOverview}</AppShell>;
  return <AppShell active="turmas" breadcrumb="Turmas"><section className="page-heading page-heading--simple"><div><span className="eyebrow">{t("classes.dashboard.year")}</span><h1>{t("classes.dashboard.yearClasses")}</h1></div></section><section className="stats-grid"><article className="stat-card"><span className="stat-card__icon stat-card__icon--ink"><Users /></span><div><span>{t("classes.dashboard.registered")}</span><strong>{total}</strong><small>{t("classes.dashboard.inClasses", { count: classes.length })}</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Building2 /></span><div><span>{t("classes.dashboard.created")}</span><strong>{classes.length}</strong><small>{t("classes.dashboard.available")}</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--green"><CheckCircle2 /></span><div><span>{t("classes.dashboard.submittedStat")}</span><strong>{submitted}/{classes.length}</strong><small>{t("classes.dashboard.delivered")}</small></div></article></section>{classOverview}</AppShell>;
}
