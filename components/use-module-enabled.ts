"use client";

import { useModules } from "@/components/module-context";

export function useModuleEnabled(moduleKey: string): boolean {
  const { access } = useModules();
  return access[moduleKey] === true;
}
