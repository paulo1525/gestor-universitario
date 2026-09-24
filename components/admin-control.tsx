"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, CheckCircle2, ChevronLeft, Clock3, Eye, FlaskConical, LoaderCircle, Save, Settings, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { RichTextEditor } from "@/components/rich-text-editor";
import { richTextPlainText } from "@/lib/announcement-content";
import { adminDataLabel } from "@/lib/i18n-admin";
import { setTestMode, TEST_MODE_AVAILABLE } from "@/lib/test-mode";
import styles from "@/components/admin-control.module.css";
import { FilterSearch, FilterSelect } from "@/components/filter-bar";
import { AdminEmptyState, AdminMetric, AdminMetricGrid, AdminPage, AdminPageHeader, AdminSection, AdminToolbar } from "@/components/admin-ui";
import { useFloatingAction } from "@/components/floating-actions";
import { clampPage, Pagination } from "@/components/pagination";

type Role = "student" | "representative" | "admin";
type Status = "active" | "pending" | "suspended" | "banned";
type User = { id: string; email: string; full_name: string; role: Role; admin_override: number; status: Status; status_reason: string | null; status_until: number | null; commission_position: string | null; commission_department: string | null; email_verified_at: number; last_login_at: number | null; created_at: number; updated_at: number };
type Position = { code: string; label: string; authority_level: "supreme" | "core" | "moderator"; rank: number };
type Department = { code: string; label: string; rank: number };

const PAGE_SIZE = 10;
const FLOATING_PREVIEW_ICON = <Eye aria-hidden="true" />;

function userIdFromHash() {
  const match = /^#utilizador-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

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
  const [savedStatuses, setSavedStatuses] = useState<Record<string, Status>>({});
  const [blockTarget, setBlockTarget] = useState<User | null>(null);
  // The open user lives in #utilizador-<id> so it can be linked and the back button works.
  const [openUserId, setOpenUserId] = useState<string | null>(() => typeof window === "undefined" ? null : userIdFromHash());

  useEffect(() => {
    const sync = () => setOpenUserId(userIdFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openUser = (id: string | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `utilizador-${id}` : "";
    window.history.pushState(null, "", url);
    setOpenUserId(id);
    window.scrollTo({ top: 0 });
  };

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
      setSavedStatuses(Object.fromEntries(userData.users.map((user) => [user.id, user.status])));
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
  const effectivePage = clampPage(page, visible.length, PAGE_SIZE);
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

  const requestSaveUser = (user: User) => {
    const blocking = user.status === "banned" || user.status === "suspended";
    if (blocking && savedStatuses[user.id] !== user.status) setBlockTarget(user); else void saveUser(user);
  };

  const previewUser = async (id: string) => {
    const response = await fetch("/api/admin/preview-user", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: id }) });
    if (response.ok) window.location.assign("/");
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

  const openUserItem = view === "users" && openUserId ? users.find((user) => user.id === openUserId) ?? null : null;
  useFloatingAction(openUserItem ? { id: "preview-user", label: t("admin.control.usePermissions"), icon: FLOATING_PREVIEW_ICON, onClick: () => void previewUser(openUserItem.id) } : null);

  if (sessionUser?.role !== "admin") return <main className="auth-loading"><ShieldCheck size={28} /><strong>{t("admin.control.adminOnly")}</strong></main>;

  const roleLabel = (role: Role) => role === "admin" ? t("admin.control.administrator") : role === "representative" ? t("admin.control.representative") : t("admin.control.student");
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const positionLabel = (code: string | null) => code ? adminDataLabel(locale, "position", code) || fallbackDataLabel(code, positions.find((position) => position.code === code)?.label || code, locale) : "";
  const skeleton = (count: number) => <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("admin.control.loadingUsers")}</span>{Array.from({ length: count }, (_, index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div>;
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
    <AdminPageHeader icon={<SlidersHorizontal />} eyebrow={viewCopy.eyebrow} title={viewCopy.title} />

    {view === "settings" ? <div className={styles.settingsStack}>
      {TEST_MODE_AVAILABLE && <AdminSection
        className={sessionUser.testMode ? styles.testModeActive : undefined}
        icon={<FlaskConical />}
        eyebrow={t("admin.control.testEyebrow")}
        title={t("admin.control.testTitle")}
       
        actions={<label className={`switch ${styles.sectionSwitch}`}><input type="checkbox" checked={Boolean(sessionUser.testMode)} onChange={(event) => { setTestMode(event.target.checked); window.location.href = event.target.checked ? "/" : "/admin/configuracao"; }} /><span><strong>{sessionUser.testMode ? t("admin.control.testActive") : t("admin.control.testEnable")}</strong><small>{sessionUser.testMode ? t("admin.control.testDisableHint") : t("admin.control.testEnableHint")}</small></span></label>}
      />}
      <AdminSection
        icon={<Settings />}
        eyebrow={t("admin.control.configuration")}
        title={t("admin.control.availability")}
       
        actions={<label className={`switch ${styles.sectionSwitch}`}><input type="checkbox" checked={maintenance} disabled={loading} onChange={(event) => setMaintenance(event.target.checked)} /><span><strong>{maintenance ? t("admin.control.maintenanceActive") : t("admin.control.siteAvailable")}</strong><small>{maintenance ? t("admin.control.publicSuspended") : t("admin.control.publicAllowed")}</small></span></label>}
      >
        <div className={styles.editorBody}>
          <label className={styles.editorLabel}><span><strong>{t("admin.control.maintenanceNotice")}</strong><small>{messageLength}/500</small></span><RichTextEditor value={message} onChange={setMessage} ariaLabel={t("admin.control.maintenanceNotice")} placeholder={t("admin.control.maintenancePlaceholder")} maxLength={500} minHeight="compact" disabled={loading} onInvalidLink={() => { setMaintenanceNoticeError(true); setMaintenanceNotice(t("admin.control.invalidLink")); }} /></label>
        </div>
        <footer className={styles.sectionFooter}><button className="button button--primary button--compact" onClick={() => void saveSettings()} disabled={loading || savingSettings || messageLength === 0 || messageLength > 500}>{savingSettings ? <><LoaderCircle className="spin" />{t("admin.common.saving")}</> : settingsSaved ? <><Check />{t("admin.common.saved")}</> : <><Save />{t("admin.control.saveAvailability")}</>}</button></footer>
      </AdminSection>
    </div> : <>
      {!openUserId && <AdminMetricGrid label={t("admin.control.accounts")}>
        <AdminMetric icon={<Users />} label={t("admin.control.users")} value={users.length} loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
        <AdminMetric icon={<CheckCircle2 />} label={t("admin.control.active")} value={activeUsers} tone="success" loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
        <AdminMetric icon={<Clock3 />} label={t("admin.control.pending")} value={pendingUsers} tone={pendingUsers ? "warning" : "success"} loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
        <AdminMetric icon={<Ban />} label={t("admin.control.blocked")} value={blockedUsers} tone={blockedUsers ? "warning" : "neutral"} loading={loading} loadingLabel={t("admin.control.loadingUsers")} />
      </AdminMetricGrid>}

      {!openUserId && <section className={`panel ${styles.listPanel}`} aria-label={t("admin.control.userList")} aria-busy={loading}>
        <AdminToolbar label={t("admin.control.searchUsers")}>
          <FilterSearch label={t("admin.control.searchUsers")} value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder={t("admin.control.searchUsers")} />
          <FilterSelect label={t("admin.control.status")} value={filter} onChange={(value) => { setFilter(value as Status | "all"); setPage(1); }} options={[{ value: "all", label: t("admin.control.allStatuses") }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
        </AdminToolbar>
        {loading ? skeleton(4) : visible.length ? <ul className={styles.rows}>{pagedUsers.map((user) => <li className={styles.row} key={user.id} data-status={user.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div className={styles.rowMain}>
            <h3><a className={`link-quiet ${styles.titleLink}`} href={`#utilizador-${encodeURIComponent(user.id)}`} onClick={(event) => { event.preventDefault(); openUser(user.id); }}>{user.full_name || user.email}</a></h3>
            <p className={styles.rowMeta}>{[user.email, roleLabel(user.role), positionLabel(user.commission_position), user.last_login_at ? new Date(user.last_login_at).toLocaleString(dateLocale) : t("admin.control.never")].filter(Boolean).join(" · ")}</p>
          </div>
          <span className={styles.statusPill}>{statusLabels[user.status]}</span>
        </li>)}</ul> : <AdminEmptyState icon={<Users />} title={t("admin.control.noUsers")} />}
        {!loading && <Pagination page={effectivePage} totalItems={visible.length} pageSize={PAGE_SIZE} onChange={setPage} />}
      </section>}

      {openUserId && <>
        <button className={styles.back} type="button" onClick={() => openUser(null)}><ChevronLeft aria-hidden="true" />{t("admin.control.back")}</button>
        <article className={`panel ${styles.reading}`} data-status={openUserItem?.status} aria-busy={loading}>
          {loading ? skeleton(2) : !openUserItem ? <AdminEmptyState icon={<Users />} title={t("admin.control.userNotFound")} /> : <>
            <header className={styles.byline}>
              <div>
                <p className={styles.bylineName}>{openUserItem.email}</p>
                <p className={styles.bylineMeta}>{roleLabel(openUserItem.role)} · {t("admin.control.lastAccess")}: {openUserItem.last_login_at ? new Date(openUserItem.last_login_at).toLocaleString(dateLocale) : t("admin.control.never")}</p>
              </div>
              <span className={styles.statusPill}>{statusLabels[openUserItem.status]}</span>
            </header>
            <h2 className={styles.readingTitle}>{openUserItem.full_name || openUserItem.email}</h2>
            <span className={styles.readingRule} aria-hidden="true" />
            <footer className={styles.manageArea}>
              <div className={styles.manageFields}>
                <label><span>{t("admin.control.user")}</span><input value={openUserItem.full_name} onChange={(event) => updateLocal(openUserItem.id, { full_name: event.target.value })} /></label>
                <label><span>{t("admin.control.committeeRole")}</span><select value={openUserItem.commission_position || ""} onChange={(event) => updateLocal(openUserItem.id, { commission_position: event.target.value || null })}><option value="">{t("admin.control.noRole")}</option>{positions.map((position) => <option key={position.code} value={position.code}>{adminDataLabel(locale, "position", position.code) || fallbackDataLabel(position.code, position.label, locale)}</option>)}</select></label>
                <label><span>{t("admin.control.department")}</span><select value={openUserItem.commission_department || ""} onChange={(event) => updateLocal(openUserItem.id, { commission_department: event.target.value || null })}><option value="">{t("admin.control.noDepartment")}</option>{departments.map((department) => <option key={department.code} value={department.code}>{adminDataLabel(locale, "department", department.code) || fallbackDataLabel(department.code, department.label, locale)}</option>)}</select></label>
                <label><span>{t("admin.control.status")}</span><select value={openUserItem.status} onChange={(event) => updateLocal(openUserItem.id, { status: event.target.value as Status })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {["banned", "suspended"].includes(openUserItem.status) && <label><span>{t("admin.control.blockReason")}</span><input placeholder={t("admin.control.reasonPlaceholder")} value={openUserItem.status_reason || ""} onChange={(event) => updateLocal(openUserItem.id, { status_reason: event.target.value })} /></label>}
                {openUserItem.status === "suspended" && <label><span>{t("admin.control.blockEnd")}</span><input type="datetime-local" value={openUserItem.status_until ? new Date(openUserItem.status_until - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(event) => updateLocal(openUserItem.id, { status_until: event.target.value ? new Date(event.target.value).getTime() : null })} /></label>}
              </div>
              <label className={styles.adminCheck}><input type="checkbox" checked={openUserItem.commission_position === "principal_admin" || openUserItem.commission_department === "management" || openUserItem.admin_override === 1} disabled={openUserItem.commission_position === "principal_admin" || openUserItem.commission_department === "management"} onChange={(event) => updateLocal(openUserItem.id, { admin_override: event.target.checked ? 1 : 0 })} />{t("admin.control.adminAccess")}</label>
              <div className={styles.manageActions}><button className="button button--primary button--compact" type="button" onClick={() => requestSaveUser(openUserItem)} disabled={savingUserId === openUserItem.id}>{savingUserId === openUserItem.id ? <LoaderCircle className="spin" /> : savedUserId === openUserItem.id ? <Check /> : <Save />}{savedUserId === openUserItem.id ? t("admin.common.saved") : t("admin.control.saveUser")}</button></div>
            </footer>
          </>}
        </article>
      </>}
    </>}

    <ConfirmationDialog open={Boolean(blockTarget)} eyebrow="" title={t(blockTarget?.status === "banned" ? "admin.control.banTitle" : "admin.control.suspendTitle")} description="" subject={blockTarget ? blockTarget.full_name || blockTarget.email : undefined} subjectLabel={t("admin.control.user")} confirmLabel={t(blockTarget?.status === "banned" ? "admin.control.banConfirm" : "admin.control.suspendConfirm")} cancelLabel={t("common.cancel")} icon={<Ban />} onClose={() => setBlockTarget(null)} onConfirm={() => { if (blockTarget) void saveUser(blockTarget); setBlockTarget(null); }} />
  </AdminPage></AppShell>;
}
