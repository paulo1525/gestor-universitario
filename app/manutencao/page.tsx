"use client";

import Image from "next/image";
import { Clock3, LogOut, ShieldCheck } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";

function MaintenanceContent() {
  const { user, logout } = useAuth();
  return <main className="maintenance-page"><section className="maintenance-card"><Image src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="Comissão de Curso FMUP 2025–2031" width={76} height={76} priority /><span className="maintenance-status"><Clock3 size={16} />Plataforma em preparação</span><h1>Inscrição concluída</h1><p>A sua conta institucional está ativa. A área de gestão ainda se encontra em manutenção e será disponibilizada quando estiver pronta.</p><div className="maintenance-account"><ShieldCheck size={18} /><div><strong>{user?.email}</strong><span>Email confirmado</span></div></div><button className="button button--secondary" type="button" onClick={() => void logout()}><LogOut size={17} />Terminar sessão</button></section></main>;
}

export default function MaintenancePage() { return <AuthGuard allowDuringMaintenance><MaintenanceContent /></AuthGuard>; }
