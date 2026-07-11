"use client";

import Image from "next/image";
import { Clock3, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";

function MaintenanceContent() {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState("A plataforma encontra-se temporariamente em manutenção.");
  useEffect(() => { void fetch("/api/config", { cache: "no-store" }).then((r) => r.json()).then((value: unknown) => { const c = value as { maintenanceMessage?: string }; if (c.maintenanceMessage) setMessage(c.maintenanceMessage); }); }, []);
  return <main className="maintenance-page"><section className="maintenance-card"><Image src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="Comissão de Curso FMUP 2025–2031" width={76} height={76} priority /><span className="maintenance-status"><Clock3 size={16} />Manutenção programada</span><h1>Voltamos em breve</h1><p>{message}</p><div className="maintenance-account"><ShieldCheck size={18} /><div><strong>{user?.email}</strong><span>Conta institucional confirmada</span></div></div><button className="button button--secondary" type="button" onClick={() => void logout()}><LogOut size={17} />Terminar sessão</button></section></main>;
}

export default function MaintenancePage() { return <AuthGuard allowDuringMaintenance><MaintenanceContent /></AuthGuard>; }
