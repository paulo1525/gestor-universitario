"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, CheckCircle2, Clock3, Eye, FlaskConical, LoaderCircle, Save, Search, Settings, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { RichTextEditor } from "@/components/rich-text-editor";
import { richTextPlainText } from "@/lib/announcement-content";
import { adminDataLabel } from "@/lib/i18n-admin";
import { setTestMode, TEST_MODE_AVAILABLE } from "@/lib/test-mode";
import styles from "@/components/admin-control.module.css";
import { AdminDataRegion, AdminEmptyState, AdminMetric, AdminMetricGrid, AdminPage, AdminPageHeader, AdminSection, AdminToolbar } from "@/components/admin-ui";

type Role = "student" | "representative" | "admin";
type Status = "active" | "pending" | "suspended" | "banned";
type User = { id: string; email: string; full_name: string; role: Role; admin_override: number; status: Status; status_reason: string | null; status_until: number | null; commission_position: string | null; commission_department: string | null; email_verified_at: number; last_login_at: number | null; created_at: number; updated_at: number };
type Position = { code: string; label: string; authority_level: "supreme" | "core" | "moderator"; rank: number };
type Department = { code: string; label: string; rank: number };

const PAGE_SIZE = 10;

function fallbackDataLabel(code: string, label: string, locale: "pt-PT" | "en") {
  if (locale === "pt-PT") return label;
  return code.replaceAll("_", " ").replace(/\b\w/g, character => character.toLocaleUpperCase("en-GB"));
}

export function AdminControl({ view }: { view: "settings" | "users" }) {
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
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [page, setPage] = useState(1);

  const statusLabels = useMemo<Record<Status, string>>(() => ({
    active: t("admin.control.statusActive"),
    pending: t("admin.control.statusPending"),
    suspended: t("admin.control.statusSuspended"),
    banned: t("admin.control.statusBanned"),
  }), [t]);

  const load = useCallback(async () => {
    setLoading(true);
    if (view === "users") {
      const usersResponse = await fetch("/api/admin/users", { cache: "no-store" });
      if (usersResponse.status === 403) { setLoading(false); return; }
      const userData = await usersResponse.json() as { users: User[]; positions: Position[]; departments: Department[] };
      setUsers(userData.users);
      setPositions(userData.positions);
      setDepartments(userData.departments);
    } else {
      const settingsResponse = await fetch("/api/admin/settings", { cache: "no-store" });
      const settingsData = await settingsResponse.json() as { maintenanceMode: boolean; maintenanceMessage: string };
      setMaintenance(settingsData.maintenanceMode);
      setMessage(settingsData.maintenanceMessage);
    }
    setLoading(false);
  }, [view]);

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
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: user.id, fullName: user.full_name, adminOverride: user.admin_override === 1, status: user.status, reason: user.status_reason, statusUntil: user.status_until, commissionPosition: user.commission_position, commissionDepartment: user.commission_department }) });
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

  const saveSettings = async () => {
    setSavingSettings(true); setSettingsSaved(false); setMaintenanceNotice(""); setMaintenanceNoticeError(false);
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "maintenance", maintenanceMode: maintenance, maintenanceMessage: message }) });
      const data = await response.json() as { error?: string };
      setMaintenanceNoticeError(!response.ok);
      setMaintenanceNotice(response.ok ? t("admin.control.availabilitySaved") : data.error || t("admin.common.saveFailed"));
      if (response.ok) {
        setSettingsSaved(true);
        window.setTimeout(() => setSettingsSaved(false), 2500);
      }
    } catch {
      setMaintenanceNoticeError(true); setMaintenanceNotice(t("admin.common.saveFailed"));
    } finally { setSavingSettings(false); }
  };

  if (sessionUser?.role !== "admin") return <main className="auth-loading"><ShieldCheck size={28} /><strong>{t("admin.control.adminOnly")}</strong></main>;

  const roleLabel = (role: Role) => role === "admin" ? t("admin.control.administrator") : role === "representative" ? t("admin.control.representative") : t("admin.control.student");
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const messageLength = richTextPlainText(message).length;
  const viewCopy = view === "users"
    ? locale === "en"
      ? { eyebrow: "Accounts", title: "Users and permissions", description: "Search accounts, review access and update user status." }
      : { eyebrow: "Contas", title: "Utilizadores e permissões", description: "Pesquisa contas, revê acessos e altera o estado dos utilizadores." }
    : locale === "en"
      ? { eyebrow: "Platform", title: "Platform settings", description: "Manage public availability and the safe test environment." }
      : { eyebrow: "Plataforma", title: "Configuração da plataforma", description: "Gere a disponibilidade pública e o ambiente seguro de testes." };

  const activeUsers = users.filter((user) => user.status === "active").length;
  const pendingUsers = users.filter((user) => user.status === "pending").length;
  const blockedUsers = users.filter((user) => ["banned", "suspended"].includes(user.status)).length;

  return <AppShell active="admin" breadcrumb={viewCopy.title}><AdminPage>
    {maintenanceNotice && <AppToast key={`${maintenanceNoticeError ? "error" : "success"}:${maintenanceNotice}`} kind={maintenanceNoticeError ? "error" : "success"} message={maintenanceNotice} onDismiss={() => setMaintenanceNotice("")} />}
    {userNotice && <AppToast key={`${userNoticeError ? "error" : "success"}:${userNotice}`} kind={userNoticeError ? "error" : "success"} message={userNotice} onDismiss={() => setUserNotice("")} />}
    <AdminPageHeader eyebrow={viewCopy.eyebrow} title={viewCopy.title} description={viewCopy.description} />

    {view === "settings" ? <div className={styles.settingsStack}>
      {TEST_MODE_AVAILABLE && <AdminSection
        className={sessionUser.testMode ? styles.testModeActive : undefined}
        icon={<FlaskConical />}
        eyebrow={t("admin.control.testEyebrow")}
        title={t("admin.control.testTitle")}
        description={sessionUser.testMode ? t("admin.control.testActiveDescription") : t("admin.control.testDescription")}
        actions={<label className={`switch ${styles.sectionSwitch}`}><input type="checkbox" checked={Boolean(sessionUser.testMode)} onChange={(event) => { setTestMode(event.target.checked); window.location.href = event.target.checked ? "/" : "/admin/configuracao"; }} /><span><strong>{sessionUser.testMode ? t("admin.control.testActive") : t("admin.control.testEnable")}</strong><small>{sessionUser.testMode ? t("admin.control.testDisableHint") : t("admin.control.testEnableHint")}</small></span></label>}
      />}
      <AdminSection
        icon={<Settings />}
        eyebrow={t("admin.control.configuration")}
        title={t("admin.control.availability")}
        description={t("admin.control.availabilityDescription")}
        actions={<label className={`switch ${styles.sectionSwitch}`}><input type="checkbox" checked={maintenance} disabled={loading} onChange={(event) => setMaintenance(event.target.checked)} /><span><strong>{maintenance ? t("admin.control.maintenanceActive") : t("admin.control.siteAvailable")}</strong><small>{maintenance ? t("admin.control.publicSuspended") : t("admin.control.publicAllowed")}</small></span></label>}
      >
        <div className={styles.editorBody}>
          <label className={styles.editorLabel}><span><strong>{t("admin.control.maintenanceNotice")}</strong><small>{messageLength}/500</small></span><RichTextEditor value={message} onChange={setMessage} ariaLabel={t("admin.control.maintenanceNotice")} placeholder={t("admin.control.maintenancePlaceholder")} maxLength={500} minHeight="compact" disabled={loading} onInvalidLink={() => { setMaintenanceNoticeError(true); setMaintenanceNotice(t("admin.control.invalidLink")); }} /></label>
        </div>
        <footer className={styles.sectionFooter}><button className="button button--primary button--compact" onClick={() => void saveSettings()} disabled={loading || savingSettings || messageLength === 0 || messageLength > 500}>{savingSettings ? <><LoaderCircle className="spin" />{t("admin.common.saving")}</> : settingsSaved ? <><Check />{t("admin.common.saved")}</> : <><Save />{t("admin.control.saveAvailability")}</>}</button></footer>
      </AdminSection>
    </div> : <>
      <AdminMetricGrid label={t("admin.control.accounts")}>
        <AdminMetric icon={<Users />} label={t("admin.control.users")} value={users.length} loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
        <AdminMetric icon={<CheckCircle2 />} label={t("admin.control.active")} value={activeUsers} tone="success" loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
        <AdminMetric icon={<Clock3 />} label={t("admin.control.pending")} value={pendingUsers} tone={pendingUsers ? "warning" : "success"} loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
        <AdminMetric icon={<Ban />} label={t("admin.control.blocked")} value={blockedUsers} tone={blockedUsers ? "warning" : "neutral"} loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
      </AdminMetricGrid>

      <AdminSection className={styles.userSection} icon={<Users />} eyebrow={t("admin.control.accounts")} title={t("admin.control.usersPermissions")} description={viewCopy.description}>
        <AdminToolbar className={styles.userToolbar} label={t("admin.control.searchUsers")}>
          <label className={`search-field ${styles.userSearch}`}><Search size={16} /><span className="sr-only">{t("admin.control.searchUsers")}</span><input type="search" placeholder={t("admin.control.searchUsers")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <select className={styles.statusFilter} aria-label={t("admin.control.allStatuses")} value={filter} onChange={(event) => { setFilter(event.target.value as Status | "all"); setPage(1); }}><option value="all">{t("admin.control.allStatuses")}</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </AdminToolbar>
        {loading ? <AdminEmptyState className={styles.loadingState} icon={<LoaderCircle className="spin" />} title={t("admin.control.loadingUsers")} /> : visible.length ? <>
          <AdminDataRegion className={`admin-table-wrap ${styles.userTableRegion}`} label={t("admin.control.usersPermissions")}><table><thead><tr><th>{t("admin.control.user")}</th><th>{t("admin.control.role")}</th><th>{t("admin.control.committeeRole")}</th><th>{t("admin.control.department")}</th><th>{t("admin.control.adminAccess")}</th><th>{t("admin.control.status")}</th><th>{t("admin.control.lastAccess")}</th><th>{t("admin.control.actions")}</th></tr></thead><tbody>{pagedUsers.map((user) => <tr key={user.id}>
            <td data-label={t("admin.control.user")}><input className={styles.nameInput} aria-label={`${t("admin.control.user")}: ${user.email}`} value={user.full_name} onChange={(event) => updateLocal(user.id, { full_name: event.target.value })} /><small>{user.email}</small></td>
            <td data-label={t("admin.control.role")}><span className="admin-role">{roleLabel(user.role)}</span></td>
            <td data-label={t("admin.control.committeeRole")}><select value={user.commission_position || ""} onChange={(event) => updateLocal(user.id, { commission_position: event.target.value || null })}><option value="">{t("admin.control.noRole")}</option>{positions.map((position) => <option key={position.code} value={position.code}>{adminDataLabel(locale, "position", position.code) || fallbackDataLabel(position.code, position.label, locale)}</option>)}</select></td>
            <td data-label={t("admin.control.department")}><select value={user.commission_department || ""} onChange={(event) => updateLocal(user.id, { commission_department: event.target.value || null })}><option value="">{t("admin.control.noDepartment")}</option>{departments.map((department) => <option key={department.code} value={department.code}>{adminDataLabel(locale, "department", department.code) || fallbackDataLabel(department.code, department.label, locale)}</option>)}</select></td>
            <td data-label={t("admin.control.adminAccess")}><label className="admin-access"><input type="checkbox" checked={user.email === "up202507850@up.pt" || user.commission_department === "management" || user.admin_override === 1} disabled={user.email === "up202507850@up.pt" || user.commission_department === "management"} onChange={(event) => updateLocal(user.id, { admin_override: event.target.checked ? 1 : 0 })} />{t("admin.control.administrator")}</label></td>
            <td data-label={t("admin.control.status")}><div className={styles.statusCell}><select value={user.status} onChange={(event) => updateLocal(user.id, { status: event.target.value as Status })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{["banned", "suspended"].includes(user.status) && <input aria-label={t("admin.control.blockReason")} placeholder={t("admin.control.reasonPlaceholder")} value={user.status_reason || ""} onChange={(event) => updateLocal(user.id, { status_reason: event.target.value })} />}{user.status === "suspended" && <input type="datetime-local" aria-label={t("admin.control.blockEnd")} value={user.status_until ? new Date(user.status_until - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(event) => updateLocal(user.id, { status_until: event.target.value ? new Date(event.target.value).getTime() : null })} />}</div></td>
            <td data-label={t("admin.control.lastAccess")}>{user.last_login_at ? new Date(user.last_login_at).toLocaleString(dateLocale) : t("admin.control.never")}</td>
            <td data-label={t("admin.control.actions")}><div className="admin-row-actions"><button className="admin-save-user" onClick={() => void previewUser(user.id)} title={t("admin.control.previewTitle")}><Eye size={15} />{t("admin.control.usePermissions")}</button><button className={`admin-save-user ${savedUserId === user.id ? "is-saved" : ""}`} aria-label={t("admin.common.saved")} onClick={() => void saveUser(user)} disabled={savingUserId === user.id}>{savingUserId === user.id ? <LoaderCircle className="spin" size={15} /> : savedUserId === user.id ? <Check size={15} /> : <Save size={15} />}</button></div></td>
          </tr>)}</tbody></table></AdminDataRegion>
          <div className="admin-pagination"><span>{(effectivePage - 1) * PAGE_SIZE + 1}–{Math.min(effectivePage * PAGE_SIZE, visible.length)} {t("admin.common.of")} {visible.length}</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={effectivePage === 1}>{t("admin.common.previous")}</button><strong>{effectivePage} / {pageCount}</strong><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={effectivePage === pageCount}>{t("admin.common.next")}</button></div></div>
        </> : <AdminEmptyState icon={<Users />} title={t("admin.control.noUsers")} />}
      </AdminSection>
    </>}
  </AdminPage></AppShell>;
}
