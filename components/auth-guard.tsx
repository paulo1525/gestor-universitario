"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-context";

let cachedMaintenance: boolean | null = null;
let maintenanceRequest: Promise<boolean> | null = null;

function getMaintenanceMode(): Promise<boolean> {
  if (cachedMaintenance !== null) return Promise.resolve(cachedMaintenance);
  maintenanceRequest ??= fetch("/api/config", { cache: "no-store" })
    .then(async (response) => await response.json() as { maintenanceMode?: boolean })
    .then((config) => config.maintenanceMode === true)
    .catch(() => true)
    .then((maintenance) => {
      cachedMaintenance = maintenance;
      return maintenance;
    });
  return maintenanceRequest;
}

export function AuthGuard({ children, allowDuringMaintenance = false }: { children: ReactNode; allowDuringMaintenance?: boolean }) {
  const { user, loading } = useAuth();
  const [maintenance, setMaintenance] = useState<boolean | null>(() => cachedMaintenance);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, router, user]);

  useEffect(() => {
    void getMaintenanceMode().then(setMaintenance);
  }, []);

  useEffect(() => {
    if (!loading && user && maintenance && user.role !== "admin" && !allowDuringMaintenance) router.replace("/manutencao/");
  }, [allowDuringMaintenance, loading, maintenance, router, user]);

  if (loading || !user || maintenance === null || (maintenance && user.role !== "admin" && !allowDuringMaintenance)) return <main className="auth-loading"><ShieldCheck size={28} aria-hidden="true" /><strong>A validar a sessão segura…</strong></main>;
  return children;
}
