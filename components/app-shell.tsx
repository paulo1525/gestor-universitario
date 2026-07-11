"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, LayoutDashboard, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { FontScale, useAuth } from "@/components/auth-context";

type AppShellProps = {
  children: ReactNode;
  active: "overview" | "turmas" | "admin";
  breadcrumb?: string;
};

export function AppShell({ children, active, breadcrumb = "Visão geral" }: AppShellProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const { user, logout, setFontScale } = useAuth();
  const roleLabel = user?.role === "admin" ? "Administrador" : user?.role === "representative" ? "Representante" : "Estudante";
  const stopPreview=async()=>{await fetch("/api/admin/preview-user",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({userId:null})});window.location.href="/admin"};

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">Saltar para o conteúdo</a>

      <aside className={`sidebar ${menuAberto ? "sidebar--open" : ""}`} aria-label="Navegação principal">
        <div className="brand">
          <span className="brand__logo-frame">
            <Image className="brand__logo" src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="Comissão de Curso FMUP 2025–2031" width={58} height={58} priority />
          </span>
          <div><span className="brand__name">Gestor Universitário</span><span className="brand__context">Comissão de Curso</span></div>
          <button className="icon-button sidebar__close" type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu"><X aria-hidden="true" size={20} /></button>
        </div>

        <nav className="nav-list" aria-label="Gestão de turmas">
          <span className="nav-label">Gestão de turmas</span>
          <Link className={active === "overview" ? "is-active" : ""} href="/" aria-current={active === "overview" ? "page" : undefined}>
            <LayoutDashboard aria-hidden="true" size={19} />Resumo
          </Link>
          {user?.representedClass&&<Link href={`/turmas/${user.representedClass}`}><Users aria-hidden="true" size={19}/>A minha turma <span className="nav-count">{user.representedClass}</span></Link>}
          <Link className={active === "turmas" ? "is-active" : ""} href="/#turmas" aria-current={active === "turmas" ? "page" : undefined}>
            <Users aria-hidden="true" size={19} />Turmas<span className="nav-count">20</span>
          </Link>
          {user?.role === "admin" && <Link className={active === "admin" ? "is-active" : ""} href="/admin" aria-current={active === "admin" ? "page" : undefined}><Settings aria-hidden="true" size={19} />Controlo administrativo</Link>}
        </nav>

        <div className="sidebar__footer">
          <div className="text-size-setting"><span>Tamanho do texto</span><div role="group" aria-label="Tamanho do texto">{([['small','A−'],['normal','A'],['large','A+']] as [FontScale,string][]).map(([value,label])=><button key={value} type="button" className={user?.fontScale===value?'is-active':''} onClick={()=>void setFontScale(value)} aria-pressed={user?.fontScale===value}>{label}</button>)}</div></div>
          <div className="profile"><span className="avatar" aria-hidden="true">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.email}</strong><small>{roleLabel}</small></span><button className="profile__logout" type="button" onClick={() => void logout()} title="Terminar sessão" aria-label="Terminar sessão"><LogOut aria-hidden="true" size={17} /></button></div>
        </div>
      </aside>

      {menuAberto && <button className="sidebar-backdrop" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />}

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu aria-hidden="true" size={22} /></button>
          <div className="breadcrumbs" aria-label="Localização atual"><Link href="/">Gestão de turmas</Link><ChevronRight aria-hidden="true" size={15} /><strong>{breadcrumb}</strong></div>
        </header>
        <main id="conteudo-principal" className="main-content">{children}</main>
      </div>
      {user?.preview&&<button className="preview-user-toggle" onClick={()=>void stopPreview()}><span>A ver como</span><strong>{user.fullName}</strong><small>Voltar ao meu perfil</small></button>}
    </div>
  );
}
