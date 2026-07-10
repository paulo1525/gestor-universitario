"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, LayoutDashboard, Menu, Settings2, ShieldCheck, Users, X } from "lucide-react";
import { ReactNode, useState } from "react";

type AppShellProps = {
  children: ReactNode;
  active: "overview" | "turmas";
  breadcrumb?: string;
};

export function AppShell({ children, active, breadcrumb = "Visão geral" }: AppShellProps) {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">Saltar para o conteúdo</a>

      <aside className={`sidebar ${menuAberto ? "sidebar--open" : ""}`} aria-label="Navegação principal">
        <div className="brand">
          <span className="brand__logo-frame">
            <Image className="brand__logo" src="/logo-comissao-curso-fmup-2025-2031.png" alt="Comissão de Curso FMUP 2025–2031" width={58} height={58} priority />
          </span>
          <div><span className="brand__name">Gestor Universitário</span><span className="brand__context">Comissão de Curso</span></div>
          <button className="icon-button sidebar__close" type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu"><X aria-hidden="true" size={20} /></button>
        </div>

        <nav className="nav-list" aria-label="Gestão de turmas">
          <span className="nav-label">Gestão de turmas</span>
          <Link className={active === "overview" ? "is-active" : ""} href="/" aria-current={active === "overview" ? "page" : undefined}>
            <LayoutDashboard aria-hidden="true" size={19} />Visão geral
          </Link>
          <Link className={active === "turmas" ? "is-active" : ""} href="/#turmas" aria-current={active === "turmas" ? "page" : undefined}>
            <Users aria-hidden="true" size={19} />Turmas<span className="nav-count">20</span>
          </Link>
        </nav>

        <div className="sidebar__footer">
          <div className="security-note"><ShieldCheck aria-hidden="true" size={18} /><div><strong>Protótipo visual</strong><span>Todos os dados são fictícios</span></div></div>
          <button className="profile" type="button"><span className="avatar" aria-hidden="true">CC</span><span><strong>Comissão de Curso</strong><small>Administrador</small></span><ChevronRight aria-hidden="true" size={17} /></button>
        </div>
      </aside>

      {menuAberto && <button className="sidebar-backdrop" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />}

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu aria-hidden="true" size={22} /></button>
          <div className="breadcrumbs" aria-label="Localização atual"><Link href="/">Gestão de turmas</Link><ChevronRight aria-hidden="true" size={15} /><strong>{breadcrumb}</strong></div>
          <div className="topbar__actions"><button className="icon-button has-notification" type="button" aria-label="Notificações: 2 novas"><Bell aria-hidden="true" size={20} /></button><button className="icon-button" type="button" aria-label="Definições"><Settings2 aria-hidden="true" size={20} /></button></div>
        </header>
        <div className="announcement" role="status"><span><strong>Fase visual:</strong> regras e fluxos ainda sujeitos a validação final.</span></div>
        <main id="conteudo-principal" className="main-content">{children}</main>
      </div>
    </div>
  );
}
