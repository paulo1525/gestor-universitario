"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, PencilLine, Plus, Save, Search, ShieldAlert, Trash2, UsersRound, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import type { Turma } from "@/data/turmas";

type Student = { id: string; nome: string; numero: string; preferencia: string; isSelf: boolean };
type Detail = { class: { status: string }; students: Student[]; permissions: { edit: boolean } };
type Row = { id: string; fullName: string; studentNumber: string };
const blank = (): Row => ({ id: crypto.randomUUID(), fullName: "", studentNumber: "" });

export function TurmaDetail({ turma }: { turma: Turma; alunosIniciais: unknown[] }) {
  const { user } = useAuth(), readOnlyStudent = user?.role === "student" && !user.classRepresentative && !user.preview;
  const { locale, t } = useI18n();
  const [data, setData] = useState<Detail | null>(null), [rows, setRows] = useState<Row[]>([]), [query, setQuery] = useState(""), [notice, setNotice] = useState(""), [noticeError, setNoticeError] = useState(false), [saving, setSaving] = useState(false), [editingPublished, setEditingPublished] = useState(false), [correctionReason, setCorrectionReason] = useState("");
  const load = useCallback(async () => { const response = await fetch(`/api/classes/${turma.id}`, { cache: "no-store" }), next = await response.json() as Detail & { error?: string }; if (!response.ok) { setNoticeError(true); return setNotice(next.error || t("classes.detail.loadError")); } setData(next); setRows(next.students.map((student) => ({ id: student.id, fullName: student.nome, studentNumber: student.numero }))); }, [t, turma.id]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  const needle = query.trim().toLocaleLowerCase(locale), visibleRows = useMemo(() => needle ? rows.filter((row) => `${row.fullName} ${row.studentNumber}`.toLocaleLowerCase(locale).includes(needle)) : rows, [locale, needle, rows]);
  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const preferenceLabel = (value: string) => value === "Ficar" ? t("classes.common.stay") : value === "Mudar" ? t("classes.common.move") : t("classes.common.waiting");
  const preferenceBadge = (value: string) => <span className={`preference-badge ${value === "Ficar" ? "is-stay" : value === "Mudar" ? "is-move" : "is-pending"}`}>{preferenceLabel(value)}</span>;
  const isPublished = data?.class.status === "published";
  async function save() {
    setNotice(""); setNoticeError(false);
    const incomplete = rows.findIndex((row) => !row.fullName.trim() || !/^[0-9]{9}$/.test(row.studentNumber)), reason = correctionReason.trim();
    if (!rows.length) { setNoticeError(true); return setNotice(t("classes.detail.emptyError")); }
    if (incomplete >= 0) { setNoticeError(true); return setNotice(t("classes.detail.invalidStudent", { number: incomplete + 1 })); }
    if (isPublished && !reason) { setNoticeError(true); return setNotice(t("classes.detail.reasonError")); }
    setSaving(true);
    const response = await fetch(`/api/classes/${turma.id}/save`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ students: rows, ...(isPublished ? { reason } : {}) }) }), result = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) { setNoticeError(true); return setNotice(result.error || t("classes.detail.saveError")); }
    setNotice(isPublished ? t("classes.detail.correctionSuccess") : t("classes.detail.saveSuccess")); await load();
    if (isPublished) { setCorrectionReason(""); setEditingPublished(false); }
  }
  if (!data) return <AppShell active="turmas" breadcrumb={turma.nome}><p className="empty-state">{t("classes.detail.loading")}</p></AppShell>;
  const showEditor = data.permissions.edit && (!isPublished || editingPublished);
  const cancelPublishedEdit = () => { setRows(data.students.map((student) => ({ id: student.id, fullName: student.nome, studentNumber: student.numero }))); setQuery(""); setCorrectionReason(""); setEditingPublished(false); };
  return <AppShell active="turmas" breadcrumb={turma.nome} currentClassId={turma.id}><Link className="back-link" href="/"><ArrowLeft />{t("classes.detail.back")}</Link><section className="detail-heading"><div><span className="eyebrow">{t("classes.detail.academicYear")}</span><h1>{turma.nome}</h1><p>{rows.length} {rows.length === 1 ? t("classes.common.student") : t("classes.common.students")}</p></div><div className="detail-heading__actions"><span className={`status ${isPublished ? "status--success" : "status--neutral"}`}>{isPublished ? t("classes.detail.published") : t("classes.detail.composition")}</span>{isPublished && data.permissions.edit && <button type="button" className="button button--secondary button--compact" onClick={() => editingPublished ? cancelPublishedEdit() : setEditingPublished(true)}>{editingPublished ? <X /> : <PencilLine />}{editingPublished ? t("classes.detail.cancel") : t("classes.detail.managePublished")}</button>}</div></section>
    {notice && <AppToast key={`${noticeError ? "error" : "success"}:${notice}`} kind={noticeError ? "error" : "success"} message={notice} onDismiss={() => setNotice("")} />}
    {showEditor ? <section className="panel class-editor class-roster"><div className="panel__header"><div><span className="eyebrow">{isPublished ? t("classes.detail.admin") : t("classes.detail.composition")}</span><h2>{isPublished ? t("classes.detail.editPublished") : t("classes.detail.students")}</h2><p>{isPublished ? t("classes.detail.editDescription") : t("classes.detail.composeDescription")}</p></div><div className="roster-tools"><label className="search-field roster-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("classes.detail.searchPlaceholder")} /></label><div className="student-add-actions"><button className="student-add-primary" onClick={() => setRows((current) => [...current, blank()])}><Plus />{t("classes.detail.add")}</button><button className="student-add-batch" title={t("classes.detail.addFiveTitle")} aria-label={t("classes.detail.addFive")} onClick={() => setRows((current) => [...current, ...Array.from({ length: 5 }, blank)])}><UsersRound /><span>+5</span></button></div></div></div>
      {isPublished && <><div className="published-roster-notice"><ShieldAlert /><p><strong>{t("classes.detail.publishedWarning")}</strong> {t("classes.detail.publishedWarningHint")}</p></div><label className="published-roster-reason"><span>{t("classes.detail.reason")}</span><textarea required maxLength={500} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder={t("classes.detail.reasonPlaceholder")} /><small>{t("classes.detail.auditRequired")}</small></label></>}
      <div className="table-scroll roster-table"><table><thead><tr><th>{t("classes.common.studentLabel")} *</th><th>{t("classes.common.number")} *</th>{!isPublished && <th>{t("classes.common.decision")}</th>}<th><span className="sr-only">{t("classes.common.actions")}</span></th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id}><td data-label={t("classes.common.studentLabel")}><input required aria-label={t("classes.detail.fullNameAria", { number: index + 1 })} placeholder={t("classes.detail.fullName")} value={row.fullName} onChange={(event) => update(row.id, { fullName: event.target.value })} /></td><td data-label={t("classes.common.number")}><input required aria-label={t("classes.detail.numberAria", { number: index + 1 })} inputMode="numeric" maxLength={9} pattern="[0-9]{9}" placeholder="202500000" value={row.studentNumber} onChange={(event) => update(row.id, { studentNumber: event.target.value.replace(/\D/g, "") })} /></td>{!isPublished && <td data-label={t("classes.common.decision")}>{preferenceBadge(data.students.find((student) => student.id === row.id)?.preferencia || "")}</td>}<td className="roster-table__action"><button className="roster-delete" aria-label={t("classes.detail.removeAria", { number: index + 1 })} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 /></button></td></tr>)}</tbody></table>{!visibleRows.length && <p className="empty-state">{rows.length ? t("classes.detail.noMatch") : t("classes.detail.noStudentsAdded")}</p>}</div><footer className="batch-footer"><small>{isPublished ? t("classes.detail.updateNotice") : t("classes.detail.requiredNotice")}</small><button className="button button--primary button--compact" onClick={() => void save()} disabled={saving}><Save />{saving ? t("classes.detail.saving") : isPublished ? t("classes.detail.saveCorrection") : t("classes.detail.saveContinue")}</button></footer></section> : <Roster students={data.students} hideDecisions={readOnlyStudent || isPublished} published={isPublished} />}
  </AppShell>;
}

function Roster({ students, hideDecisions = false, published = false }: { students: Student[]; hideDecisions?: boolean; published?: boolean }) {
  const { t } = useI18n();
  const preferenceLabel = (value: string) => value === "Ficar" ? t("classes.common.stay") : value === "Mudar" ? t("classes.common.move") : t("classes.common.waiting");
  return <section className="panel submitted-roster"><div className="panel__header"><div><span className="eyebrow">{published ? t("classes.roster.final") : t("classes.roster.view")}</span><h2>{t("classes.detail.composition")}</h2><p>{published ? t("classes.roster.publishedDescription") : hideDecisions ? t("classes.roster.hiddenDescription") : t("classes.roster.managedDescription")}</p></div></div><div className="table-scroll roster-table roster-table--read"><table><thead><tr><th>{t("classes.common.studentLabel")}</th><th>{t("classes.common.number")}</th>{!hideDecisions && <th>{t("classes.common.decision")}</th>}</tr></thead><tbody>{students.map((student) => <tr key={student.id}><td data-label={t("classes.common.studentLabel")}><strong>{student.nome}</strong>{student.isSelf && <small className="self-badge">{t("classes.roster.you")}</small>}</td><td data-label={t("classes.common.number")}>{student.numero}</td>{!hideDecisions && <td data-label={t("classes.common.decision")}><span className={`preference-badge ${student.preferencia === "Ficar" ? "is-stay" : student.preferencia === "Mudar" ? "is-move" : "is-pending"}`}>{preferenceLabel(student.preferencia)}</span></td>}</tr>)}</tbody></table>{!students.length && <p className="empty-state">{t("classes.roster.empty")}</p>}</div></section>;
}
