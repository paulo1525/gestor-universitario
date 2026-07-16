"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bell, BookOpen, CalendarDays, Check, ChevronDown, ContactRound, ExternalLink, Files, House, LayoutDashboard, Library, LoaderCircle, Megaphone, MessageSquareText, RefreshCw, Search, UsersRound, Vote, type LucideIcon } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { AppToast } from "@/components/app-toast";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";
import { adminDataLabel } from "@/lib/i18n-admin";
import type { ResolvedModuleHomepage } from "@/lib/module-homepages";
import styles from "./module-management.module.css";

const MODULE_MANAGER_EMAIL = "up202507850@up.pt";

const MODULE_ICONS: Record<string, LucideIcon> = {
  classes: UsersRound,
  announcements: Megaphone,
  curricular_units: BookOpen,
  calendar: CalendarDays,
  documents: Files,
  requests: MessageSquareText,
  directory: ContactRound,
  polls: Vote,
  dashboard: LayoutDashboard,
  notifications: Bell,
  search: Search,
  materials: Library,
  useful_links: ExternalLink,
};

export type ManagedSubmodule = {
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  effectiveEnabled: boolean;
  inheritedDisabled?: boolean;
};

export type ManagedModule = {
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  homepageEligible?: boolean;
  isHomepage?: boolean;
  submodules: ManagedSubmodule[];
};

type ModulesResponse = { modules: ManagedModule[]; home?: ResolvedModuleHomepage | null; error?: string };
type SavingTarget = { moduleKey: string; submoduleKey?: string };
type Notice = { kind: "success" | "error"; message: string } | null;
type ModuleFilter = "all" | "active" | "inactive";

function targetId(target: SavingTarget) {
  return `${target.moduleKey}:${target.submoduleKey || "_module"}`;
}

export function ModuleManagement() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const { synchronize } = useModules();
  const canManageModules = Boolean(user?.testMode || user?.email.toLowerCase() === MODULE_MANAGER_EMAIL);
  const [modules, setModules] = useState<ManagedModule[]>([]);
  const [home, setHome] = useState<ResolvedModuleHomepage | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [savedTarget, setSavedTarget] = useState("");
  const [savingTargets, setSavingTargets] = useState<Set<string>>(() => new Set());
  const [savingHome, setSavingHome] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set(["classes"]));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ModuleFilter>("all");

  useEffect(() => {
    if (!canManageModules) return;
    const controller = new AbortController();

    fetch("/api/admin/modules", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as ModulesResponse;
        if (!response.ok) throw new Error(data.error || t("admin.modules.loadError"));
        return data;
      })
      .then((data) => {
        setModules(data.modules);
        setHome(data.home ?? null);
        synchronize(data.modules, data.home ?? null);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : t("admin.modules.loadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [canManageModules, requestVersion, synchronize, t]);

  const activeCount = useMemo(
    () => modules.reduce((total, module) => total + Number(module.enabled) + module.submodules.filter((item) => item.effectiveEnabled).length, 0),
    [modules],
  );
  const settingCount = useMemo(
    () => modules.reduce((total, module) => total + 1 + module.submodules.length, 0),
    [modules],
  );

  if (!canManageModules) return null;

  const retry = () => {
    setLoading(true);
    setLoadError("");
    setRequestVersion((version) => version + 1);
  };

  const updateModule = async (target: SavingTarget, enabled: boolean) => {
    const id = targetId(target);
    setSavingTargets((current) => new Set(current).add(id));
    setNotice(null);
    setSavedTarget("");

    try {
      const response = await fetch("/api/admin/modules", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...target, enabled }),
      });
      const data = await response.json() as ModulesResponse;
      if (!response.ok) throw new Error(data.error || t("admin.modules.saveError"));
      setModules(data.modules);
      setHome(data.home ?? null);
      synchronize(data.modules, data.home ?? null);
      setSavedTarget(id);
      const parent = modules.find((module) => module.key === target.moduleKey);
      const item = target.submoduleKey ? parent?.submodules.find((submodule) => submodule.key === target.submoduleKey) : parent;
      const itemKey = target.submoduleKey || target.moduleKey;
      const label = adminDataLabel(locale, "module", itemKey) || item?.label || t("admin.modules.fallbackLabel");
      setNotice({ kind: "success", message: t("admin.modules.updated", { label, state: enabled ? t("admin.modules.stateActive") : t("admin.modules.stateInactive") }) });
      window.setTimeout(() => setSavedTarget((current) => current === id ? "" : current), 2500);
    } catch (error: unknown) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("admin.modules.saveError") });
    } finally {
      setSavingTargets((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const updateHomepage = async (moduleKey: string | null) => {
    setSavingHome(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/modules/home", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleKey }),
      });
      const data = await response.json() as ModulesResponse;
      if (!response.ok) throw new Error(data.error || t("admin.modules.homeSaveError"));
      setModules(data.modules);
      setHome(data.home ?? null);
      synchronize(data.modules, data.home ?? null);
      setNotice({ kind: "success", message: t("admin.modules.homeUpdated") });
    } catch (error: unknown) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("admin.modules.homeSaveError") });
    } finally {
      setSavingHome(false);
    }
  };

  const resolvedHomeModule = modules.find((module) => module.key === home?.resolvedModuleKey);
  const resolvedHomeLabel = resolvedHomeModule
    ? adminDataLabel(locale, "module", resolvedHomeModule.key) || resolvedHomeModule.label
    : "";
  const homeStatus = home?.mode === "configured"
    ? t("admin.modules.homeConfigured", { label: resolvedHomeLabel })
    : home?.mode === "automatic"
      ? t("admin.modules.homeAutomaticStatus", { label: resolvedHomeLabel })
      : home?.mode === "manager"
        ? t("admin.modules.homeManagerStatus")
        : t("admin.modules.homeUnavailableStatus");

  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const visibleModules = modules.filter((module) => {
    if (filter === "active" && !module.enabled) return false;
    if (filter === "inactive" && module.enabled) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      adminDataLabel(locale, "module", module.key) || module.label,
      adminDataLabel(locale, "moduleDescription", module.key) || module.description || "",
      ...module.submodules.flatMap((submodule) => [
        adminDataLabel(locale, "module", submodule.key) || submodule.label,
        adminDataLabel(locale, "moduleDescription", submodule.key) || submodule.description || "",
      ]),
    ].join(" ").toLocaleLowerCase(locale);
    return searchable.includes(normalizedQuery);
  });

  const toggleExpanded = (moduleKey: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  return (<>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <section className={styles.panel} aria-label={t("admin.modules.title")}>
      {loading ? (
        <div className={styles.state} role="status">
          <LoaderCircle className={styles.spin} aria-hidden="true" />
          <span>{t("admin.modules.loading")}</span>
        </div>
      ) : loadError ? (
        <div className={`${styles.state} ${styles.error}`} role="alert">
          <AlertCircle aria-hidden="true" />
          <div><strong>{t("admin.modules.loadError")}</strong><span>{loadError}</span></div>
          <button type="button" onClick={retry}><RefreshCw aria-hidden="true" />{t("admin.modules.retry")}</button>
        </div>
      ) : modules.length === 0 ? (
        <div className={styles.state} role="status">{t("admin.modules.empty")}</div>
      ) : (
        <>
        <div className={styles.homeSetting}>
          <span className={styles.homeIcon} aria-hidden="true"><House /></span>
          <div className={styles.homeCopy}>
            <label htmlFor="module-homepage">{t("admin.modules.homeTitle")}</label>
            <p>{t("admin.modules.homeDescription")}</p>
            <small>{homeStatus}</small>
          </div>
          <div className={styles.homeControl}>
            <select
              id="module-homepage"
              aria-label={t("admin.modules.homeSelect")}
              value={home?.configuredModuleKey ?? ""}
              disabled={savingHome}
              onChange={(event) => void updateHomepage(event.target.value || null)}
            >
              <option value="">{t("admin.modules.homeAutomatic")}</option>
              {modules.filter((module) => module.homepageEligible).map((module) => (
                <option value={module.key} key={module.key}>{adminDataLabel(locale, "module", module.key) || module.label}</option>
              ))}
            </select>
            {savingHome && <LoaderCircle className={styles.spin} aria-hidden="true" />}
          </div>
        </div>
        <div className={styles.toolbar}>
          <label className={`search-field ${styles.searchControl}`}>
            <Search aria-hidden="true" />
            <span className="sr-only">{t("admin.modules.search")}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.modules.searchPlaceholder")} />
          </label>
          <div className={styles.filters} role="group" aria-label={t("admin.modules.filterLabel")}>
            {(["all", "active", "inactive"] as ModuleFilter[]).map((value) => (
              <button type="button" key={value} className={filter === value ? styles.selectedFilter : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(`admin.modules.filter.${value}`)}</button>
            ))}
          </div>
          <span className={styles.summary} aria-label={t("admin.modules.summary", { active: activeCount, total: settingCount })}>
            <strong>{activeCount}</strong> / {settingCount} {t("admin.modules.activeCount")}
          </span>
        </div>
        <div className={styles.moduleList}>
          {visibleModules.map((module) => {
            const moduleLabel = adminDataLabel(locale, "module", module.key) || module.label;
            const moduleDescription = adminDataLabel(locale, "moduleDescription", module.key) || module.description;
            const moduleTarget = targetId({ moduleKey: module.key });
            const moduleSaving = savingTargets.has(moduleTarget);
            const expanded = expandedModules.has(module.key);
            const ModuleIcon = MODULE_ICONS[module.key] || LayoutDashboard;
            const enabledFeatures = module.submodules.filter((submodule) => submodule.effectiveEnabled).length;
            return (
              <article className={`${styles.moduleCard} ${!module.enabled ? styles.disabled : ""} ${expanded ? styles.expanded : ""}`} key={module.key}>
                <div className={styles.moduleRow}>
                  <span className={styles.moduleIcon} data-enabled={module.enabled} aria-hidden="true"><ModuleIcon /></span>
                  <div className={styles.moduleCopy}>
                    <div className={styles.titleLine}>
                      <h3>{moduleLabel}</h3>
                      {home?.resolvedModuleKey === module.key && <span className={styles.homeBadge}><House aria-hidden="true" />{t("admin.modules.homeBadge")}</span>}
                    </div>
                    {moduleDescription && <p>{moduleDescription}</p>}
                    {module.submodules.length > 0 && <small className={styles.featureCount}>{t("admin.modules.featureCount", { active: enabledFeatures, total: module.submodules.length })}</small>}
                  </div>
                  <div className={styles.moduleControls}>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={module.enabled}
                        disabled={moduleSaving}
                        onChange={(event) => void updateModule({ moduleKey: module.key }, event.target.checked)}
                        aria-label={t(module.enabled ? "admin.modules.disable" : "admin.modules.enable", { label: moduleLabel })}
                      />
                      <span aria-hidden="true" />
                      <small>{moduleSaving ? t("admin.common.saving") : savedTarget === moduleTarget ? t("admin.common.saved") : module.enabled ? t("admin.modules.active") : t("admin.modules.inactive")}</small>
                      {moduleSaving ? <LoaderCircle className={styles.switchStatusIcon} aria-hidden="true" /> : savedTarget === moduleTarget ? <Check className={styles.switchStatusIcon} aria-hidden="true" /> : null}
                    </label>
                    {module.submodules.length > 0 && <button className={styles.expandControl} type="button" aria-expanded={expanded} aria-controls={`submodules-${module.key}`} aria-label={t(expanded ? "admin.modules.hideSubmodules" : "admin.modules.showSubmodules", { label: moduleLabel })} onClick={() => toggleExpanded(module.key)}><ChevronDown aria-hidden="true" /></button>}
                  </div>
                </div>

                {module.submodules.length > 0 && expanded && (
                  <div id={`submodules-${module.key}`} className={styles.submoduleList} aria-label={t("admin.modules.submodules", { label: moduleLabel })}>
                    {module.submodules.map((submodule) => {
                      const submoduleTarget = targetId({ moduleKey: module.key, submoduleKey: submodule.key });
                      const submoduleLabel = adminDataLabel(locale, "module", submodule.key) || submodule.label;
                      const submoduleDescription = adminDataLabel(locale, "moduleDescription", submodule.key) || submodule.description;
                      const saving = savingTargets.has(submoduleTarget);
                      const inheritedDisabled = !module.enabled || Boolean(submodule.inheritedDisabled);
                      return (
                        <div className={styles.submoduleRow} key={submodule.key}>
                          <div className={styles.submoduleCopy}>
                            <div className={styles.titleLine}>
                              <h4>{submoduleLabel}</h4>
                              {inheritedDisabled && submodule.enabled && <span className={styles.inheritedBadge}>{t("admin.modules.inheritedInactive")}</span>}
                            </div>
                            {submoduleDescription && <p>{submoduleDescription}</p>}
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={submodule.enabled}
                              disabled={saving}
                              onChange={(event) => void updateModule({ moduleKey: module.key, submoduleKey: submodule.key }, event.target.checked)}
                              aria-label={t(submodule.enabled ? "admin.modules.disableSubmodule" : "admin.modules.enableSubmodule", { label: submoduleLabel })}
                            />
                            <span aria-hidden="true" />
                            <small>{saving ? t("admin.common.saving") : savedTarget === submoduleTarget ? t("admin.common.saved") : inheritedDisabled && submodule.enabled ? t("admin.modules.configuredActive") : submodule.effectiveEnabled ? t("admin.modules.active") : t("admin.modules.inactive")}</small>
                            {saving ? <LoaderCircle className={styles.switchStatusIcon} aria-hidden="true" /> : savedTarget === submoduleTarget ? <Check className={styles.switchStatusIcon} aria-hidden="true" /> : null}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
          {visibleModules.length === 0 && <div className={styles.noResults}>{t("admin.modules.noResults")}</div>}
        </div>
        </>
      )}
    </section>
    </>
  );
}
