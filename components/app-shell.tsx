"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ClipboardCheck, FlaskConical, Grid3X3, History, LogOut, Menu, Settings, Ticket, Users, X } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { FontScale, useAuth } from "@/components/auth-context";
import {setTestPersona,TEST_PERSONAS,testPersona} from "@/lib/test-mode";

type Props = { children: ReactNode; active: "overview" | "turmas" | "admin" | "tickets" | "check" | "placements" | "audit"; breadcrumb?: string; currentClassId?: number };

export function AppShell({ children, active, breadcrumb = "Visão geral", currentClassId }: Props) {
  const [open, setOpen] = useState(false);
  const [testMenu,setTestMenu]=useState(false);
  const [classCount, setClassCount] = useState(20);
  const { user, logout, setFontScale } = useAuth();
  const visibleClassId = currentClassId ?? Number(breadcrumb.match(/^Turma (\d+)$/)?.[1] || 0);
  const ownActive = Boolean(user?.representedClass && visibleClassId === user.representedClass);
  const classesActive = (active === "overview" || active === "turmas") && !ownActive;
  const preferenceOnly = active === "overview" && user?.role === "student" && !user.classRepresentative && !user.preview;
  useEffect(()=>{if(preferenceOnly)return;const controller=new AbortController();fetch("/api/classes",{cache:"no-store",signal:controller.signal}).then(async response=>await response.json() as {classes?:unknown[]}).then(data=>setClassCount(data.classes?.length||20)).catch(()=>{});return()=>controller.abort()},[preferenceOnly]);
  const stopPreview = async () => {
    await fetch("/api/admin/preview-user", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: null }) });
    window.location.href = "/admin";
  };
  return <div className="app-shell">
    <a className="skip-link" href="#conteudo-principal">Saltar para o conteúdo</a>
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand"><span className="brand__logo-frame"><Image className="brand__logo" src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="Comissão de Curso FMUP" width={58} height={58} priority /></span><div><span className="brand__name">Gestor Universitário</span><span className="brand__context">Comissão de Curso</span></div><button className="icon-button sidebar__close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button></div>
      <nav className="nav-list" aria-label="Navegação principal">
        <div className="nav-section"><span className="nav-label">Gestão de turmas</span>{preferenceOnly ? <Link className={classesActive ? "is-active" : ""} href="/"><ClipboardCheck />Preferências</Link> : <Link className={classesActive ? "is-active" : ""} href="/"><Users />Turmas<span className="nav-count">{classCount}</span></Link>}{user?.representedClass && <Link className={ownActive ? "is-active" : ""} href={`/turmas/${user.representedClass}`}><Users />A minha turma<span className="nav-count">{user.representedClass}</span></Link>}</div>
        {user?.role === "admin" && <div className="nav-section"><span className="nav-label">Gestão administrativa</span><Link className={active === "admin" ? "is-active" : ""} href="/admin"><Settings />Controlo administrativo</Link><Link className={active === "tickets" ? "is-active" : ""} href="/admin/pedidos"><Ticket />Tickets</Link><Link className={active === "check" ? "is-active" : ""} href="/admin/verificacao"><ClipboardCheck />Verificador</Link><Link className={active === "placements" ? "is-active" : ""} href="/admin/colocacoes"><Grid3X3 />Colocações</Link><Link className={active === "audit" ? "is-active" : ""} href="/admin/historico"><History />Histórico de ações</Link></div>}
      </nav>
      <div className="sidebar__footer"><div className="text-size-setting"><span>Tamanho do texto</span><div>{([['small', 'A−'], ['normal', 'A'], ['large', 'A+']] as [FontScale, string][]).map(([value, label]) => <button key={value} className={user?.fontScale === value ? 'is-active' : ''} onClick={() => void setFontScale(value)}>{label}</button>)}</div></div><div className="profile"><span className="avatar">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.email}</strong><small>{user?.role === "admin" ? "Administrador" : user?.classRepresentative ? "Representante" : "Estudante"}</small></span>{!user?.preview&&!user?.testMode&&<button className="profile__logout" onClick={() => void logout()} aria-label="Terminar sessão"><LogOut /></button>}</div></div>
    </aside>
    {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" />}
    <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button><div className="breadcrumbs">{preferenceOnly ? <strong>As minhas preferências</strong> : <><Link href="/">Gestão de turmas</Link><ChevronRight /><strong>{breadcrumb}</strong></>}</div>{user?.testMode&&<div className="test-mode-control"><button type="button" className="test-mode-control__trigger" aria-expanded={testMenu} onClick={()=>setTestMenu(value=>!value)}><span className="test-mode-control__icon"><FlaskConical/></span><span><small>Ambiente de testes</small><strong>{TEST_PERSONAS.find(item=>item.id===testPersona())?.name}</strong></span><ChevronDown className={testMenu?"is-open":""}/></button>{testMenu&&<div className="test-mode-control__menu" role="menu"><header><strong>Visualizar como</strong><small>Os dados continuam a ser fictícios</small></header>{TEST_PERSONAS.map(persona=><button type="button" role="menuitem" key={persona.id} className={testPersona()===persona.id?"is-active":""} onClick={()=>setTestPersona(persona.id)}><span><strong>{persona.name}</strong><small>{persona.classId?`Aluno · Turma ${persona.classId}`:"Gestão administrativa"}</small></span>{testPersona()===persona.id&&<Check/>}</button>)}</div>}</div>}</header><main id="conteudo-principal" className={`main-content${preferenceOnly ? " main-content--preference" : ""}`}>{children}</main></div>
    {user?.preview&&<button className="preview-user-toggle" onClick={()=>void stopPreview()}><EyeLabel/><span><small>A visualizar como</small><strong>{user.fullName}</strong></span><b>Voltar ao meu perfil</b></button>}
  </div>;
}

function EyeLabel(){return <span className="preview-user-toggle__mark" aria-hidden="true">↪</span>}
