"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-context";

export function AuthGuard({ children, allowDuringMaintenance = false }: { children: ReactNode; allowDuringMaintenance?: boolean }) {
  const { user, loading } = useAuth();
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, router, user]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" }).then(async (response) => await response.json() as { maintenanceMode?: boolean }).then((config) => setMaintenance(config.maintenanceMode === true)).catch(() => setMaintenance(true));
  }, []);

  useEffect(() => {
    if (!loading && user && maintenance && user.role !== "admin" && !allowDuringMaintenance) router.replace("/manutencao/");
  }, [allowDuringMaintenance, loading, maintenance, router, user]);

  if (loading || !user || maintenance === null || (maintenance && user.role !== "admin" && !allowDuringMaintenance)) return <main className="auth-loading"><ShieldCheck size={28} aria-hidden="true" /><strong>A validar a sessão segura…</strong></main>;
  return children;
}
