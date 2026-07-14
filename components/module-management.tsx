"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Boxes, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { AppToast } from "@/components/app-toast";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";
import { adminDataLabel } from "@/lib/i18n-admin";
import styles from "./module-management.module.css";

const MODULE_MANAGER_EMAIL = "up202507850@up.pt";

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
  submodules: ManagedSubmodule[];
};

type ModulesResponse = { modules: ManagedModule[]; error?: string };
type SavingTarget = { moduleKey: string; submoduleKey?: string };
type Notice = { kind: "success" | "error"; message: string } | null;

function targetId(target: SavingTarget) {
  return `${target.moduleKey}:${target.submoduleKey || "_module"}`;
}

export function ModuleManagement() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const { synchronize } = useModules();
  const canManageModules = Boolean(user?.testMode || user?.email.toLowerCase() === MODULE_MANAGER_EMAIL);
  const [modules, setModules] = useState<ManagedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [savedTarget, setSavedTarget] = useState("");
  const [savingTargets, setSavingTargets] = useState<Set<string>>(() => new Set());

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
        synchronize(data.modules);
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
      synchronize(data.modules);
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

  return (<>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <section className={styles.panel} aria-labelledby="module-management-title">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true"><Boxes /></span>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>{t("admin.modules.eyebrow")}</span>
          <h2 id="module-management-title">{t("admin.modules.title")}</h2>
          <p>{t("admin.modules.description")}</p>
        </div>
        {!loading && !loadError && (
          <span className={styles.summary} aria-label={t("admin.modules.summary", { active: activeCount, total: settingCount })}>
            <strong>{activeCount}</strong> / {settingCount} {t("admin.modules.activeCount")}
          </span>
        )}
      </header>

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
        <div className={styles.moduleList}>
          {modules.map((module) => {
            const moduleLabel = adminDataLabel(locale, "module", module.key) || module.label;
            const moduleDescription = adminDataLabel(locale, "moduleDescription", module.key) || module.description;
            const moduleTarget = targetId({ moduleKey: module.key });
            const moduleSaving = savingTargets.has(moduleTarget);
            return (
              <article className={`${styles.moduleCard} ${!module.enabled ? styles.disabled : ""}`} key={module.key}>
                <div className={styles.moduleRow}>
                  <div className={styles.moduleCopy}>
                    <div className={styles.titleLine}>
                      <h3>{moduleLabel}</h3>
                      <span className={module.enabled ? styles.activeBadge : styles.inactiveBadge}>{module.enabled ? t("admin.modules.active") : t("admin.modules.inactive")}</span>
                    </div>
                    {moduleDescription && <p>{moduleDescription}</p>}
                  </div>
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
                </div>

                {module.submodules.length > 0 && (
                  <div className={styles.submoduleList} aria-label={t("admin.modules.submodules", { label: moduleLabel })}>
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
        </div>
      )}
    </section>
    </>
  );
}
