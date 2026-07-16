"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CalendarClock, Check, CheckCircle2, Clock3, Download, Eye, FlaskConical, LoaderCircle, Save, Search, Settings, ShieldCheck, Upload, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { FormLabel } from "@/components/form-label";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { adminDataLabel } from "@/lib/i18n-admin";
import { setTestMode } from "@/lib/test-mode";
import { parseStudentCsv } from "@/lib/student-csv";

type Role = "student" | "representative" | "admin";
type Status = "active" | "pending" | "suspended" | "banned";
type User = { id: string; email: string; full_name: string; role: Role; admin_override: number; class_representative: number; represented_class: number | null; status: Status; status_reason: string | null; status_until: number | null; commission_position: string | null; commission_department: string | null; email_verified_at: number; last_login_at: number | null; created_at: number; updated_at: number };
type Position = { code: string; label: string; authority_level: "supreme" | "core" | "moderator"; rank: number };
type Department = { code: string; label: string; rank: number };
type PreferenceWindow = { group: number; classes: string; openAt: string; closeAt: string };

const PAGE_SIZE = 10;

function fallbackDataLabel(code: string, label: string, locale: "pt-PT" | "en") {
  if (locale === "pt-PT") return label;
  return code.replaceAll("_", " ").replace(/\b\w/g, character => character.toLocaleUpperCase("en-GB"));
}

export function AdminControl() {
  const { user: sessionUser } = useAuth();
  const { locale, t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [maintenance, setMaintenance] = useState(true);
  const [message, setMessage] = useState("");
  const [userNotice, setUserNotice] = useState("");
  const [userNoticeError, setUserNoticeError] = useState(false);
  const [maintenanceNotice, setMaintenanceNotice] = useState("");
  const [maintenanceNoticeError, setMaintenanceNoticeError] = useState(false);
  const [deadlineNotice, setDeadlineNotice] = useState("");
  const [deadlineNoticeError, setDeadlineNoticeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preferenceWindows, setPreferenceWindows] = useState<PreferenceWindow[]>(Array.from({ length: 4 }, (_, index) => ({ group: index + 1, classes: `${index * 5 + 1}–${index * 5 + 5}`, openAt: `2026-07-${String(20 + index).padStart(2, "0")}T09:00`, closeAt: `2026-07-${String(20 + index).padStart(2, "0")}T23:00` })));
  const [positions, setPositions] = useState<Position[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<"maintenance" | "preference_windows" | null>(null);
  const [savedSection, setSavedSection] = useState<"maintenance" | "preference_windows" | null>(null);
  const [page, setPage] = useState(1);
  const [importClass, setImportClass] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [importError, setImportError] = useState(false);

  const statusLabels = useMemo<Record<Status, string>>(() => ({
    active: t("admin.control.statusActive"),
    pending: t("admin.control.statusPending"),
    suspended: t("admin.control.statusSuspended"),
    banned: t("admin.control.statusBanned"),
  }), [t]);

  const load = useCallback(async () => {
    const [usersResponse, settingsResponse] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/admin/settings", { cache: "no-store" }),
    ]);
    if (usersResponse.status === 403) { setLoading(false); return; }
    const userData = await usersResponse.json() as { users: User[]; positions: Position[]; departments: Department[] };
    const settingsData = await settingsResponse.json() as { maintenanceMode: boolean; maintenanceMessage: string; preferenceWindows?: PreferenceWindow[] };
    setUsers(userData.users);
    setPositions(userData.positions);
    setDepartments(userData.departments);
    setMaintenance(settingsData.maintenanceMode);
    setMessage(settingsData.maintenanceMessage);
    const local = (value: string) => new Date(value).toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" }).slice(0, 16);
    if (settingsData.preferenceWindows?.length) setPreferenceWindows(settingsData.preferenceWindows.map((window) => ({ ...window, openAt: local(window.openAt), closeAt: local(window.closeAt) })));
    setLoading(false);
  }, []);

  // A função inicia I/O antes de atualizar o estado com a resposta.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => users.filter((user) => (filter === "all" || user.status === filter) && `${user.full_name} ${user.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [filter, query, users]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);
  const pagedUsers = visible.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);
  const updateLocal = (id: string, patch: Partial<User>) => setUsers((all) => all.map((user) => user.id === id ? { ...user, ...patch } : user));

  const saveUser = async (user: User) => {
    setSavingUserId(user.id); setSavedUserId(null); setUserNotice(""); setUserNoticeError(false);
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: user.id, fullName: user.full_name, adminOverride: user.admin_override === 1, classRepresentative: user.class_representative === 1, representedClass: user.represented_class, status: user.status, reason: user.status_reason, statusUntil: user.status_until, commissionPosition: user.commission_position, commissionDepartment: user.commission_department }) });
      const data = await response.json() as { error?: string };
      setUserNoticeError(!response.ok);
      setUserNotice(response.ok ? t("admin.control.userSaved", { email: user.email }) : data.error || t("admin.common.saveFailed"));
      if (response.ok) {
        setSavedUserId(user.id);
        void load();
        window.setTimeout(() => setSavedUserId((id) => id === user.id ? null : id), 2500);
      }
    } catch {
      setUserNoticeError(true); setUserNotice(t("admin.common.saveFailed"));
    } finally { setSavingUserId(null); }
  };

  const previewUser = async (id: string) => {
    const response = await fetch("/api/admin/preview-user", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: id }) });
    if (response.ok) window.location.href = "/";
    else { setUserNoticeError(true); setUserNotice(t("admin.control.previewFailed")); }
  };

  const saveSettings = async (section: "maintenance" | "preference_windows") => {
    const setSectionNotice = section === "maintenance" ? setMaintenanceNotice : setDeadlineNotice;
    const setSectionError = section === "maintenance" ? setMaintenanceNoticeError : setDeadlineNoticeError;
    setSavingSection(section); setSavedSection(null); setSectionNotice(""); setSectionError(false);
    try {
      const payload = section === "maintenance" ? { section, maintenanceMode: maintenance, maintenanceMessage: message } : { section, windows: preferenceWindows.map((window) => ({ openAt: new Date(window.openAt).toISOString(), closeAt: new Date(window.closeAt).toISOString() })) };
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      setSectionError(!response.ok);
      setSectionNotice(response.ok ? section === "maintenance" ? t("admin.control.availabilitySaved") : t("admin.control.calendarSaved") : data.error || t("admin.common.saveFailed"));
      if (response.ok) {
        setSavedSection(section);
        window.setTimeout(() => setSavedSection((current) => current === section ? null : current), 2500);
      }
    } catch {
      setSectionError(true); setSectionNotice(t("admin.common.saveFailed"));
    } finally { setSavingSection(null); }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true); setImportNotice(""); setImportError(false);
    try {
      if (!file.name.toLocaleLowerCase().endsWith(".csv") || file.size > 1_000_000) throw new Error("Seleciona um ficheiro .csv com até 1 MB.");
      const students = parseStudentCsv(await file.text());
      const response = await fetch(`/api/classes/${importClass}/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ students }) });
      const data = await response.json() as { error?: string; imported?: number };
      if (!response.ok) throw new Error(data.error || "Não foi possível importar o CSV.");
      setImportNotice(`${data.imported || students.length} estudantes adicionados à Turma ${importClass}.`);
    } catch (error) { setImportError(true); setImportNotice(error instanceof Error ? error.message : "Não foi possível importar o CSV."); }
    finally { setImporting(false); }
  };

  if (sessionUser?.role !== "admin") return <main className="auth-loading"><ShieldCheck size={28} /><strong>{t("admin.control.adminOnly")}</strong></main>;

  const roleLabel = (role: Role) => role === "admin" ? t("admin.control.administrator") : role === "representative" ? t("admin.control.representative") : t("admin.control.student");
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";

  return <AppShell active="admin" breadcrumb={t("admin.control.breadcrumb")}>
    {maintenanceNotice && <AppToast key={`${maintenanceNoticeError ? "error" : "success"}:${maintenanceNotice}`} kind={maintenanceNoticeError ? "error" : "success"} message={maintenanceNotice} onDismiss={() => setMaintenanceNotice("")} />}
    {deadlineNotice && <AppToast key={`${deadlineNoticeError ? "error" : "success"}:${deadlineNotice}`} kind={deadlineNoticeError ? "error" : "success"} message={deadlineNotice} onDismiss={() => setDeadlineNotice("")} />}
    {userNotice && <AppToast key={`${userNoticeError ? "error" : "success"}:${userNotice}`} kind={userNoticeError ? "error" : "success"} message={userNotice} onDismiss={() => setUserNotice("")} />}
    <div className="admin-heading"><div><span className="eyebrow">{t("admin.control.eyebrow")}</span><h1>{t("admin.control.title")}</h1><p>{t("admin.control.description")}</p></div>{!sessionUser.testMode && <div className="admin-heading-actions"><button className="button button--secondary" type="button" onClick={() => { window.location.href = "/api/admin/export-decisions"; }}><Download />{t("admin.control.export")}</button></div>}</div>

    <section className={`panel admin-settings test-mode-setting${sessionUser.testMode ? " is-active" : ""}`}><div className="admin-settings__header"><span className="admin-settings__icon"><FlaskConical /></span><div><span className="eyebrow">{t("admin.control.testEyebrow")}</span><h2>{t("admin.control.testTitle")}</h2><p>{sessionUser.testMode ? t("admin.control.testActiveDescription") : t("admin.control.testDescription")}</p></div><label className="switch"><input type="checkbox" checked={Boolean(sessionUser.testMode)} onChange={(event) => { setTestMode(event.target.checked); window.location.href = event.target.checked ? "/" : "/admin"; }} /><span><strong>{sessionUser.testMode ? t("admin.control.testActive") : t("admin.control.testEnable")}</strong><small>{sessionUser.testMode ? t("admin.control.testDisableHint") : t("admin.control.testEnableHint")}</small></span></label></div></section>

    <section className="admin-stats"><article><Users /><div><strong>{users.length}</strong><span>{t("admin.control.users")}</span></div></article><article><CheckCircle2 /><div><strong>{users.filter((user) => user.status === "active").length}</strong><span>{t("admin.control.active")}</span></div></article><article><Clock3 /><div><strong>{users.filter((user) => user.status === "pending").length}</strong><span>{t("admin.control.pending")}</span></div></article><article><Ban /><div><strong>{users.filter((user) => ["banned", "suspended"].includes(user.status)).length}</strong><span>{t("admin.control.blocked")}</span></div></article></section>

    <section className="panel admin-settings"><div className="admin-settings__header"><span className="admin-settings__icon"><Settings /></span><div><span className="eyebrow">{t("admin.control.configuration")}</span><h2>{t("admin.control.availability")}</h2><p>{t("admin.control.availabilityDescription")}</p></div><label className="switch"><input type="checkbox" checked={maintenance} onChange={(event) => setMaintenance(event.target.checked)} /><span><strong>{maintenance ? t("admin.control.maintenanceActive") : t("admin.control.siteAvailable")}</strong><small>{maintenance ? t("admin.control.publicSuspended") : t("admin.control.publicAllowed")}</small></span></label></div>{maintenanceNotice && <p className="admin-notice" role="status">{maintenanceNotice}</p>}<label className="maintenance-editor"><span><strong>{t("admin.control.maintenanceNotice")}</strong><small>{message.length}/500</small></span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder={t("admin.control.maintenancePlaceholder")} /></label><div className="admin-settings__actions"><button className="button button--primary button--compact" onClick={() => void saveSettings("maintenance")} disabled={savingSection === "maintenance"}>{savingSection === "maintenance" ? <><LoaderCircle className="spin" />{t("admin.common.saving")}</> : savedSection === "maintenance" ? <><Check />{t("admin.common.saved")}</> : <><Save />{t("admin.control.saveAvailability")}</>}</button></div></section>

    <section className="panel admin-settings class-deadline-settings"><div className="admin-settings__header"><span className="admin-settings__icon"><CalendarClock /></span><div><span className="eyebrow">{t("admin.control.stagedCalendar")}{sessionUser.testMode ? ` · ${t("admin.control.testSuffix")}` : ""}</span><h2>{t("admin.control.preferenceWindows")}</h2><p>{sessionUser.testMode ? t("admin.control.preferenceWindowsTestDescription") : t("admin.control.preferenceWindowsDescription")}</p></div></div>{deadlineNotice && <p className="admin-notice" role="status">{deadlineNotice}</p>}<div className="preference-window-grid">{preferenceWindows.map((window, index) => <fieldset key={window.group}><legend><strong>{t("admin.control.block", { number: window.group })}</strong><span>{t("admin.control.classes", { classes: window.classes })}</span></legend><div className="deadline-fields"><label><FormLabel icon={CalendarClock}>{t("admin.control.opens")}</FormLabel><input type="datetime-local" value={window.openAt} onChange={(event) => setPreferenceWindows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, openAt: event.target.value } : item))} /><small>{t("admin.control.lisbonTime")}</small></label><label><FormLabel icon={Clock3}>{t("admin.control.closes")}</FormLabel><input type="datetime-local" min={window.openAt} value={window.closeAt} onChange={(event) => setPreferenceWindows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, closeAt: event.target.value } : item))} /><small>{t("admin.control.lisbonTime")}</small></label></div></fieldset>)}</div><div className="admin-settings__actions"><button className="button button--primary button--compact" onClick={() => void saveSettings("preference_windows")} disabled={savingSection === "preference_windows"}>{savingSection === "preference_windows" ? <><LoaderCircle className="spin" />{t("admin.common.saving")}</> : savedSection === "preference_windows" ? <><Check />{t("admin.common.saved")}</> : <><Save />{t("admin.control.saveCalendar")}</>}</button></div></section>

    <section className="panel admin-settings"><div className="admin-settings__header"><span className="admin-settings__icon"><Upload /></span><div><span className="eyebrow">Importação de pautas</span><h2>Adicionar estudantes por CSV</h2><p>Seleciona a turma e um ficheiro CSV. Os estudantes são adicionados sem remover os existentes.</p></div></div>{importNotice && <p className={`admin-notice${importError ? " is-error" : ""}`} role="status">{importNotice}</p>}<div className="deadline-fields"><label><FormLabel icon={Users}>Turma de destino</FormLabel><select value={importClass} onChange={(event) => setImportClass(Number(event.target.value))}>{Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={index + 1}>{t("admin.common.class", { number: index + 1 })}</option>)}</select></label><label><FormLabel icon={Upload}>Ficheiro CSV</FormLabel><input type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => { void importCsv(event.target.files?.[0]); event.currentTarget.value = ""; }} /><small>Máximo 1 MB · apenas as colunas nome e n_mecanografico.</small></label></div>{importing && <p className="admin-notice" role="status"><LoaderCircle className="spin" />A importar estudantes…</p>}</section>

    <section className="panel admin-users"><div className="panel__header"><div className="admin-card-heading"><span className="admin-settings__icon"><Users /></span><div><span className="eyebrow">{t("admin.control.accounts")}</span><h2>{t("admin.control.usersPermissions")}</h2></div></div><div className="panel-tools"><label className="search-field"><Search size={16} /><input placeholder={t("admin.control.searchUsers")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><select value={filter} onChange={(event) => { setFilter(event.target.value as Status | "all"); setPage(1); }}><option value="all">{t("admin.control.allStatuses")}</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      {userNotice && <p className="admin-notice" role="status">{userNotice}</p>}
      {loading ? <p className="admin-empty">{t("admin.control.loadingUsers")}</p> : <><div className="admin-table-wrap"><table><thead><tr><th>{t("admin.control.user")}</th><th>{t("admin.control.role")}</th><th>{t("admin.control.committeeRole")}</th><th>{t("admin.control.department")}</th><th>{t("admin.control.classRepresentative")}</th><th>{t("admin.control.adminAccess")}</th><th>{t("admin.control.status")}</th><th>{t("admin.control.blockReason")}</th><th>{t("admin.control.blockEnd")}</th><th>{t("admin.control.lastAccess")}</th><th>{t("admin.control.actions")}</th></tr></thead><tbody>{pagedUsers.map((user) => <tr key={user.id}>
        <td><input className="admin-name" value={user.full_name} onChange={(event) => updateLocal(user.id, { full_name: event.target.value })} /><small>{user.email}</small></td>
        <td><span className={`admin-role admin-role--${user.role}`}>{roleLabel(user.role)}</span></td>
        <td><select value={user.commission_position || ""} onChange={(event) => updateLocal(user.id, { commission_position: event.target.value || null })}><option value="">{t("admin.control.noRole")}</option>{positions.map((position) => <option key={position.code} value={position.code}>{adminDataLabel(locale, "position", position.code) || fallbackDataLabel(position.code, position.label, locale)}</option>)}</select></td>
        <td><select value={user.commission_department || ""} onChange={(event) => updateLocal(user.id, { commission_department: event.target.value || null })}><option value="">{t("admin.control.noDepartment")}</option>{departments.map((department) => <option key={department.code} value={department.code}>{adminDataLabel(locale, "department", department.code) || fallbackDataLabel(department.code, department.label, locale)}</option>)}</select></td>
        <td><div className="class-representative"><label className="admin-access"><input type="checkbox" checked={user.class_representative === 1} onChange={(event) => updateLocal(user.id, { class_representative: event.target.checked ? 1 : 0, represented_class: event.target.checked ? (user.represented_class || 1) : null })} />{t("admin.control.yes")}</label>{user.class_representative === 1 && <select aria-label={t("admin.control.representedClass")} value={user.represented_class || 1} onChange={(event) => updateLocal(user.id, { represented_class: Number(event.target.value) })}>{Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={index + 1}>{t("admin.common.class", { number: index + 1 })}</option>)}</select>}</div></td>
        <td><label className="admin-access"><input type="checkbox" checked={user.email === "up202507850@up.pt" || user.commission_department === "management" || user.admin_override === 1} disabled={user.email === "up202507850@up.pt" || user.commission_department === "management"} onChange={(event) => updateLocal(user.id, { admin_override: event.target.checked ? 1 : 0 })} />{t("admin.control.administrator")}</label></td>
        <td><select value={user.status} onChange={(event) => updateLocal(user.id, { status: event.target.value as Status })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
        <td><input placeholder={t("admin.control.reasonPlaceholder")} value={user.status_reason || ""} onChange={(event) => updateLocal(user.id, { status_reason: event.target.value })} /></td>
        <td>{user.status === "suspended" ? <input type="datetime-local" aria-label={t("admin.control.blockEnd")} value={user.status_until ? new Date(user.status_until - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(event) => updateLocal(user.id, { status_until: event.target.value ? new Date(event.target.value).getTime() : null })} /> : <span className="admin-not-applicable">—</span>}</td>
        <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString(dateLocale) : t("admin.control.never")}</td>
        <td><div className="admin-row-actions"><button className="admin-save-user" onClick={() => void previewUser(user.id)} title={t("admin.control.previewTitle")}><Eye size={15} />{t("admin.control.usePermissions")}</button><button className={`admin-save-user ${savedUserId === user.id ? "is-saved" : ""}`} onClick={() => void saveUser(user)} disabled={savingUserId === user.id}>{savingUserId === user.id ? <LoaderCircle className="spin" size={15} /> : savedUserId === user.id ? <Check size={15} /> : <Save size={15} />}</button></div></td>
      </tr>)}</tbody></table>{visible.length === 0 && <p className="admin-empty">{t("admin.control.noUsers")}</p>}</div>{visible.length > 0 && <div className="admin-pagination"><span>{(effectivePage - 1) * PAGE_SIZE + 1}–{Math.min(effectivePage * PAGE_SIZE, visible.length)} {t("admin.common.of")} {visible.length}</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={effectivePage === 1}>{t("admin.common.previous")}</button><strong>{effectivePage} / {pageCount}</strong><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={effectivePage === pageCount}>{t("admin.common.next")}</button></div></div>}</>}
    </section>
  </AppShell>;
}
