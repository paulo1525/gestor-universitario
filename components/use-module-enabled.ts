"use client";

import { useEffect, useState } from "react";

type ModuleNode = { key: string; enabled?: boolean; effectiveEnabled?: boolean; submodules?: ModuleNode[] };

export function useModuleEnabled(moduleKey: string): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/modules", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() as Promise<{ modules?: ModuleNode[] }> : Promise.reject(new Error()))
      .then(data => {
        const modules = (data.modules || []).flatMap(item => [item, ...(item.submodules || [])]);
        const target = modules.find(item => item.key === moduleKey);
        setEnabled(Boolean(target && (target.effectiveEnabled ?? target.enabled !== false)));
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setEnabled(false); });
    return () => controller.abort();
  }, [moduleKey]);
  return enabled;
}
