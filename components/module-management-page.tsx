"use client";

import { Boxes, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { ModuleManagement } from "@/components/module-management";

export function ModuleManagementPage() {
  const { user } = useAuth();
  if (user?.email.toLowerCase() !== "up202507850@up.pt") return <main className="auth-loading"><ShieldCheck size={28}/><strong>Acesso reservado ao administrador principal.</strong></main>;
  return <AppShell active="modules" breadcrumb="Gestor de módulos">
    <header className="page-heading"><div><span className="eyebrow">Administração principal</span><h1>Gestor de módulos</h1><p>Controla as áreas disponíveis na aplicação e cada uma das respetivas funcionalidades.</p></div><span className="page-heading__icon"><Boxes/></span></header>
    <ModuleManagement />
  </AppShell>;
}
