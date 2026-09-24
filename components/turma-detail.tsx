"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, PencilLine, Save, ShieldAlert, Trash2, UsersRound, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useFloatingAction } from "@/components/floating-actions";
import { SurfaceHeader } from "@/components/surface-header";
import { FilterBar, FilterSearch } from "@/components/filter-bar";
import styles from "@/components/turma-detail.module.css";
import { AppToast } from "@/components/app-toast";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";
import type { Turma } from "@/data/turmas";
import { STUDENT_STATUS_OPTIONS, studentStatusLabel, type StudentSpecialStatus } from "@/lib/student-status";

type Student = { id: string; nome: string; numero: string; preferencia: string; isSelf: boolean; specialStatus?: StudentSpecialStatus };
type Detail = { class: { status: string }; students: Student[]; permissions: { edit: boolean } };
type Row = { id: string; fullName: string; studentNumber: string; specialStatus: StudentSpecialStatus };
const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;
const FLOATING_BATCH_ICON = <UsersRound aria-hidden="true" />;
const FLOATING_MANAGE_ICON = <PencilLine aria-hidden="true" />;
const FLOATING_CANCEL_ICON = <X aria-hidden="true" />;
const blank = (): Row => ({ id: crypto.randomUUID(), fullName: "", studentNumber: "", specialStatus: "none" });

export function TurmaDetail({ turma }: { turma: Turma; alunosIniciais: unknown[] }) {
  const { user } = useAuth(), readOnlyStudent = user?.role === "student" && !user.classRepresentative && !user.preview;
  const { locale, t } = useI18n();
  const { access } = useModules();
  const specialStatusesEnabled = access["classes.special_statuses"] === true;
  const [data, setData] = useState<Detail | null>(null), [rows, setRows] = useState<Row[]>([]), [query, setQuery] = useState(""), [notice, setNotice] = useState(""), [noticeError, setNoticeError] = useState(false), [saving, setSaving] = useState(false), [editingPublished, setEditingPublished] = useState(false), [correctionReason, setCorrectionReason] = useState(""), [removeTarget, setRemoveTarget] = useState<Row | null>(null);
  const load = useCallback(async () => { const response = await fetch(`/api/classes/${turma.id}`, { cache: "no-store" }), next = await response.json() as Detail & { error?: string }; if (!response.ok) { setNoticeError(true); return setNotice(next.error || t("classes.detail.loadError")); } setData(next); setRows(next.students.map((student) => ({ id: student.id, fullName: student.nome, studentNumber: student.numero, specialStatus: student.specialStatus || "none" }))); }, [t, turma.id]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  const needle = query.trim().toLocaleLowerCase(locale), visibleRows = useMemo(() => needle ? rows.filter((row) => `${row.fullName} ${row.studentNumber}`.toLocaleLowerCase(locale).includes(needle)) : rows, [locale, needle, rows]);
  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const preferenceLabel = (value: string) => value === "Ficar" ? t("classes.common.stay") : value === "Mudar" ? t("classes.common.move") : t("classes.common.waiting");
  const preferenceBadge = (value: string, specialStatus: StudentSpecialStatus) => { const effectiveStatus = specialStatusesEnabled ? specialStatus : "none"; return <span className={`preference-badge ${effectiveStatus !== "none" ? "is-special" : value === "Ficar" ? "is-stay" : value === "Mudar" ? "is-move" : "is-pending"}`}>{effectiveStatus !== "none" ? t("classes.common.specialStatus") : preferenceLabel(value)}</span>; };
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
  const addPublishedStudent = () => { if (!data) return; setRows([...data.students.map((student) => ({ id: student.id, fullName: student.nome, studentNumber: student.numero, specialStatus: student.specialStatus || "none" as StudentSpecialStatus })), blank()]); setQuery(""); setCorrectionReason(""); setEditingPublished(true); };
  const addStudentRow = () => setRows((current) => [...current, blank()]);
  const addFiveStudentRows = () => setRows((current) => [...current, ...Array.from({ length: 5 }, blank)]);
  const requestRemove = (row: Row) => { if (row.fullName.trim() || row.studentNumber.trim()) setRemoveTarget(row); else setRows((current) => current.filter((item) => item.id !== row.id)); };
  const confirmRemove = () => { if (removeTarget) setRows((current) => current.filter((item) => item.id !== removeTarget.id)); setRemoveTarget(null); };
  const canEditRoster = Boolean(data?.permissions.edit);
  const showEditor = canEditRoster && (!isPublished || editingPublished);
  useFloatingAction(isPublished && data?.permissions.edit && !editingPublished ? { id: "add-published-student", label: t("classes.detail.addPublished"), icon: FLOATING_CREATE_ICON, onClick: addPublishedStudent } : null);
  useFloatingAction(showEditor ? { id: "add-class-student", label: t("classes.detail.add"), icon: FLOATING_CREATE_ICON, onClick: addStudentRow } : null);
  useFloatingAction(showEditor ? { id: "add-class-students-batch", label: t("classes.detail.addFive"), icon: FLOATING_BATCH_ICON, onClick: addFiveStudentRows } : null);
  const cancelPublishedEdit = () => { if (!data) return; setRows(data.students.map((student) => ({ id: student.id, fullName: student.nome, studentNumber: student.numero, specialStatus: student.specialStatus || "none" }))); setQuery(""); setCorrectionReason(""); setEditingPublished(false); };
  useFloatingAction(isPublished && data?.permissions.edit ? { id: "manage-published-roster", label: editingPublished ? t("classes.detail.cancel") : t("classes.detail.managePublished"), icon: editingPublished ? FLOATING_CANCEL_ICON : FLOATING_MANAGE_ICON, onClick: () => { if (editingPublished) cancelPublishedEdit(); else setEditingPublished(true); } } : null);
  const pageHeader = <SurfaceHeader standalone headingLevel="h1" icon={<UsersRound />} eyebrow={data ? `${t("classes.detail.academicYear")} · ${isPublished ? t("classes.detail.published") : t("classes.detail.composition")}` : t("classes.detail.academicYear")} title={turma.nome} />;
  if (!data) return <AppShell active="turmas" breadcrumb={turma.nome}><Link className="back-link" href="/"><ArrowLeft />{t("classes.detail.back")}</Link>{pageHeader}<section className={`panel ${styles.skeleton}`} aria-busy="true"><span className="sr-only" role="status">{t("classes.detail.loading")}</span>{[0, 1, 2, 3].map((index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</section></AppShell>;
  return <AppShell active="turmas" breadcrumb={turma.nome} currentClassId={turma.id}><Link className="back-link" href="/"><ArrowLeft />{t("classes.detail.back")}</Link>{pageHeader}
    {notice && <AppToast key={`${noticeError ? "error" : "success"}:${notice}`} kind={noticeError ? "error" : "success"} message={notice} onDismiss={() => setNotice("")} />}
    {showEditor ? <section className="panel class-editor class-roster" aria-label={isPublished ? t("classes.detail.editPublished") : t("classes.detail.students")}><FilterBar label={t("classes.detail.searchPlaceholder")}><FilterSearch label={t("classes.detail.searchPlaceholder")} value={query} onChange={setQuery} placeholder={t("classes.detail.searchPlaceholder")} /></FilterBar><p className="surface-note">{isPublished ? t("classes.detail.editDescription") : t("classes.detail.composeDescription")}</p>
      {isPublished && <><div className="published-roster-notice"><ShieldAlert /><p><strong>{t("classes.detail.publishedWarning")}</strong> {t("classes.detail.publishedWarningHint")}</p></div><label className="published-roster-reason"><span>{t("classes.detail.reason")}</span><textarea required maxLength={500} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder={t("classes.detail.reasonPlaceholder")} /><small>{t("classes.detail.auditRequired")}</small></label></>}
      <div className="table-scroll roster-table"><table><thead><tr><th>{t("classes.common.studentLabel")} *</th><th>{t("classes.common.number")} *</th>{specialStatusesEnabled && <th>{t("classes.common.status")}</th>}{!isPublished && <th>{t("classes.common.decision")}</th>}<th><span className="sr-only">{t("classes.common.actions")}</span></th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id}><td data-label={t("classes.common.studentLabel")}><input required aria-label={t("classes.detail.fullNameAria", { number: index + 1 })} placeholder={t("classes.detail.fullName")} value={row.fullName} onChange={(event) => update(row.id, { fullName: event.target.value })} /></td><td data-label={t("classes.common.number")}><input required aria-label={t("classes.detail.numberAria", { number: index + 1 })} inputMode="numeric" maxLength={9} pattern="[0-9]{9}" placeholder="202500000" value={row.studentNumber} onChange={(event) => update(row.id, { studentNumber: event.target.value.replace(/\D/g, "") })} /></td>{specialStatusesEnabled && <td data-label={t("classes.common.status")}><select aria-label={t("classes.detail.statusAria", { number: index + 1 })} value={row.specialStatus} onChange={(event) => update(row.id, { specialStatus: event.target.value as StudentSpecialStatus })}>{STUDENT_STATUS_OPTIONS.map((option) => <option value={option.value} key={option.value}>{studentStatusLabel(option.value, locale)}</option>)}</select></td>}{!isPublished && <td data-label={t("classes.common.decision")}>{preferenceBadge(data.students.find((student) => student.id === row.id)?.preferencia || "", row.specialStatus)}</td>}<td className="roster-table__action"><button className="roster-delete" aria-label={t("classes.detail.removeAria", { number: index + 1 })} onClick={() => requestRemove(row)}><Trash2 /></button></td></tr>)}</tbody></table>{!visibleRows.length && <p className="empty-state">{rows.length ? t("classes.detail.noMatch") : t("classes.detail.noStudentsAdded")}</p>}</div><footer className="batch-footer"><small>{isPublished ? t("classes.detail.updateNotice") : t("classes.detail.requiredNotice")}</small><button className="button button--primary button--compact" onClick={() => void save()} disabled={saving}><Save />{saving ? t("classes.detail.saving") : isPublished ? t("classes.detail.saveCorrection") : t("classes.detail.saveContinue")}</button></footer></section> : <Roster students={data.students} hideDecisions={readOnlyStudent || isPublished} published={isPublished} />}
    <ConfirmationDialog open={Boolean(removeTarget)} eyebrow="" title={t("classes.detail.removeTitle")} description="" subject={removeTarget ? [removeTarget.fullName.trim(), removeTarget.studentNumber].filter(Boolean).join(" · ") : undefined} subjectLabel={t("classes.common.studentLabel")} confirmLabel={t("classes.detail.removeConfirm")} cancelLabel={t("classes.common.cancel")} onClose={() => setRemoveTarget(null)} onConfirm={confirmRemove} />
  </AppShell>;
}

function Roster({ students, hideDecisions = false, published = false }: { students: Student[]; hideDecisions?: boolean; published?: boolean }) {
  const { t } = useI18n();
  const preferenceLabel = (value: string) => value === "Ficar" ? t("classes.common.stay") : value === "Mudar" ? t("classes.common.move") : t("classes.common.waiting");
  return <section className="panel submitted-roster"><SurfaceHeader icon={<UsersRound />} eyebrow={published ? t("classes.roster.final") : t("classes.roster.view")} title={t("classes.detail.composition")} /><div className="table-scroll roster-table roster-table--read"><table><thead><tr><th>{t("classes.common.studentLabel")}</th><th>{t("classes.common.number")}</th>{!hideDecisions && <th>{t("classes.common.decision")}</th>}</tr></thead><tbody>{students.map((student) => <tr key={student.id}><td data-label={t("classes.common.studentLabel")}><strong>{student.nome}</strong>{student.isSelf && <small className="self-badge">{t("classes.roster.you")}</small>}</td><td data-label={t("classes.common.number")}>{student.numero}</td>{!hideDecisions && <td data-label={t("classes.common.decision")}><span className={`preference-badge ${student.preferencia === "Ficar" ? "is-stay" : student.preferencia === "Mudar" ? "is-move" : "is-pending"}`}>{preferenceLabel(student.preferencia)}</span></td>}</tr>)}</tbody></table>{!students.length && <p className="empty-state">{t("classes.roster.empty")}</p>}</div></section>;
}
