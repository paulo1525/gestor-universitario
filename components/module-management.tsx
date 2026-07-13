"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Boxes, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { AppToast } from "@/components/app-toast";
import { useModules } from "@/components/module-context";
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

function switchLabel(enabled: boolean) {
  return enabled ? "Ativo" : "Inativo";
}

export function ModuleManagement() {
  const { user } = useAuth();
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
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar os módulos.");
        return data;
      })
      .then((data) => {
        setModules(data.modules);
        synchronize(data.modules);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os módulos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [canManageModules, requestVersion, synchronize]);

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
      if (!response.ok) throw new Error(data.error || "Não foi possível guardar a alteração.");
      setModules(data.modules);
      synchronize(data.modules);
      setSavedTarget(id);
      const parent = modules.find((module) => module.key === target.moduleKey);
      const label = target.submoduleKey ? parent?.submodules.find((submodule) => submodule.key === target.submoduleKey)?.label : parent?.label;
      setNotice({ kind: "success", message: `Definição “${label || "Módulo"}” atualizada: ${enabled ? "ativa" : "inativa"}.` });
      window.setTimeout(() => setSavedTarget((current) => current === id ? "" : current), 2500);
    } catch (error: unknown) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível guardar a alteração." });
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
          <span className={styles.eyebrow}>Funcionalidades</span>
          <h2 id="module-management-title">Módulos ativos</h2>
          <p>Ativa ou desativa áreas da aplicação e as respetivas funcionalidades.</p>
        </div>
        {!loading && !loadError && (
          <span className={styles.summary} aria-label={`${activeCount} de ${settingCount} opções ativas`}>
            <strong>{activeCount}</strong> / {settingCount} ativas
          </span>
        )}
      </header>

      {loading ? (
        <div className={styles.state} role="status">
          <LoaderCircle className={styles.spin} aria-hidden="true" />
          <span>A carregar módulos…</span>
        </div>
      ) : loadError ? (
        <div className={`${styles.state} ${styles.error}`} role="alert">
          <AlertCircle aria-hidden="true" />
          <div><strong>Não foi possível carregar os módulos.</strong><span>{loadError}</span></div>
          <button type="button" onClick={retry}><RefreshCw aria-hidden="true" />Tentar novamente</button>
        </div>
      ) : modules.length === 0 ? (
        <div className={styles.state} role="status">Ainda não existem módulos configurados.</div>
      ) : (
        <div className={styles.moduleList}>
          {modules.map((module) => {
            const moduleTarget = targetId({ moduleKey: module.key });
            const moduleSaving = savingTargets.has(moduleTarget);
            return (
              <article className={`${styles.moduleCard} ${!module.enabled ? styles.disabled : ""}`} key={module.key}>
                <div className={styles.moduleRow}>
                  <div className={styles.moduleCopy}>
                    <div className={styles.titleLine}>
                      <h3>{module.label}</h3>
                      <span className={module.enabled ? styles.activeBadge : styles.inactiveBadge}>{switchLabel(module.enabled)}</span>
                    </div>
                    {module.description && <p>{module.description}</p>}
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={module.enabled}
                      disabled={moduleSaving}
                      onChange={(event) => void updateModule({ moduleKey: module.key }, event.target.checked)}
                      aria-label={`${module.enabled ? "Desativar" : "Ativar"} o módulo ${module.label}`}
                    />
                    <span aria-hidden="true" />
                    <small>{moduleSaving ? "A guardar…" : savedTarget === moduleTarget ? "Guardado" : switchLabel(module.enabled)}</small>
                    {moduleSaving ? <LoaderCircle className={styles.switchStatusIcon} aria-hidden="true" /> : savedTarget === moduleTarget ? <Check className={styles.switchStatusIcon} aria-hidden="true" /> : null}
                  </label>
                </div>

                {module.submodules.length > 0 && (
                  <div className={styles.submoduleList} aria-label={`Submódulos de ${module.label}`}>
                    {module.submodules.map((submodule) => {
                      const submoduleTarget = targetId({ moduleKey: module.key, submoduleKey: submodule.key });
                      const saving = savingTargets.has(submoduleTarget);
                      const inheritedDisabled = !module.enabled || Boolean(submodule.inheritedDisabled);
                      return (
                        <div className={styles.submoduleRow} key={submodule.key}>
                          <div className={styles.submoduleCopy}>
                            <div className={styles.titleLine}>
                              <h4>{submodule.label}</h4>
                              {inheritedDisabled && submodule.enabled && <span className={styles.inheritedBadge}>Inativo por herança</span>}
                            </div>
                            {submodule.description && <p>{submodule.description}</p>}
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={submodule.enabled}
                              disabled={saving}
                              onChange={(event) => void updateModule({ moduleKey: module.key, submoduleKey: submodule.key }, event.target.checked)}
                              aria-label={`${submodule.enabled ? "Desativar" : "Ativar"} o submódulo ${submodule.label}`}
                            />
                            <span aria-hidden="true" />
                            <small>{saving ? "A guardar…" : savedTarget === submoduleTarget ? "Guardado" : inheritedDisabled && submodule.enabled ? "Configurado como ativo" : switchLabel(submodule.effectiveEnabled)}</small>
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
