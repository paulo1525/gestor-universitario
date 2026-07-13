"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Boxes, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp, ClipboardCheck, ContactRound, FileText, FlaskConical, Grid3X3, History, Inbox, LayoutDashboard, Library, LogOut, Megaphone, Menu, Palette, Settings, Users, Vote, X } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { FontScale, useAuth } from "@/components/auth-context";
import { useModules } from "@/components/module-context";
import { UrgentAnnouncementBanner } from "@/components/urgent-announcement-banner";
import { TopbarGlobalSearch } from "@/components/topbar-global-search";
import {setTestPersona,TEST_PERSONAS,testPersona} from "@/lib/test-mode";

export type AppShellActive = "overview" | "turmas" | "admin" | "modules" | "tickets" | "check" | "placements" | "audit" | "announcements" | "curricular_units" | "curricular_units_management" | "calendar" | "documents" | "requests" | "directory" | "polls" | "dashboard" | "search" | "materials";
type Props = { children: ReactNode; active: AppShellActive; breadcrumb?: string; currentClassId?: number };
type SiteTheme = "cc" | "forum";

let cachedClassCount: number | null = null;
let classCountRequest: Promise<number> | null = null;

function loadClassCount(): Promise<number> {
  if (cachedClassCount !== null) return Promise.resolve(cachedClassCount);
  classCountRequest ??= fetch("/api/classes", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json() as { classes?: unknown[] };
      cachedClassCount = data.classes?.length || 0;
      return cachedClassCount;
    })
    .finally(() => { classCountRequest = null; });
  return classCountRequest;
}

export function AppShell({ children, active, breadcrumb = "Visão geral", currentClassId }: Props) {
  const [open, setOpen] = useState(false);
  const [testMenu,setTestMenu]=useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [theme, setTheme] = useState<SiteTheme>(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "forum" ? "forum" : "cc");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [classCount, setClassCount] = useState<number | null>(() => cachedClassCount);
  const { access: moduleAccess } = useModules();
  const { user, logout, setFontScale } = useAuth();
  const visibleClassId = currentClassId ?? Number(breadcrumb.match(/^Turma (\d+)$/)?.[1] || 0);
  const ownActive = Boolean(user?.representedClass && visibleClassId === user.representedClass);
  const classesActive = (active === "overview" || active === "turmas") && !ownActive;
  const preferenceOnly = active === "overview" && user?.role === "student" && !user.classRepresentative && !user.preview;
  const hasCommunication = moduleAccess["announcements.feed"] || moduleAccess["requests.submission"] || moduleAccess["polls.voting"];
  const hasAcademicLife = moduleAccess["calendar.events"] || moduleAccess["curricular_units.catalog"] || moduleAccess["documents.library"] || moduleAccess["materials.library"] || moduleAccess["materials.submission"];
  const hasCommunity = moduleAccess["directory.members"];
  const canManageModules = Boolean(user?.testMode || user?.email.toLowerCase() === "up202507850@up.pt");
  useEffect(()=>{if(preferenceOnly||!moduleAccess["classes.rosters"])return;let mounted=true;void loadClassCount().then(count=>{if(mounted)setClassCount(count)}).catch(()=>{});return()=>{mounted=false}},[preferenceOnly,moduleAccess]);
  useEffect(() => {
    if (!profileMenu) return;
    const closeMenu = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenu(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenu]);
  const selectTheme = (nextTheme: SiteTheme) => {
    setTheme(nextTheme);
    window.localStorage.setItem("gestor-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };
  const stopPreview = async () => {
    await fetch("/api/admin/preview-user", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: null }) });
    window.location.href = "/admin";
  };
  return <div className="app-shell">
    <a className="skip-link" href="#conteudo-principal">Saltar para o conteúdo</a>
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand"><span className="brand__logo-frame"><Image className="brand__logo" src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt="Comissão de Curso FMUP" width={58} height={58} priority /></span><div><span className="brand__name">Gestor Universitário</span><span className="brand__context">Comissão de Curso</span></div><button className="icon-button sidebar__close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button></div>
      <nav className="nav-list" aria-label="Navegação principal">
        {hasCommunication&&<div className="nav-section"><span className="nav-label">Comunicação</span>
          {moduleAccess["announcements.feed"]&&<Link className={active === "announcements" ? "is-active" : ""} href="/avisos"><Megaphone/><span><strong>Avisos e comunicados</strong><small>Informação da Comissão de Curso</small></span></Link>}
          {moduleAccess["requests.submission"]&&<Link className={active === "requests" ? "is-active" : ""} href="/pedidos"><Inbox/><span><strong>Pedidos e sugestões</strong><small>Envio identificado ou anónimo</small></span></Link>}
          {moduleAccess["polls.voting"]&&<Link className={active === "polls" ? "is-active" : ""} href="/inqueritos"><Vote/><span><strong>Inquéritos</strong><small>Participar e consultar resultados</small></span></Link>}
        </div>}
        {hasAcademicLife&&<div className="nav-section"><span className="nav-label">Vida académica</span>
          {moduleAccess["calendar.events"]&&<Link className={active === "calendar" ? "is-active" : ""} href="/calendario"><CalendarDays/><span><strong>Calendário</strong><small>Avaliações, entregas e eventos</small></span></Link>}
          {moduleAccess["curricular_units.catalog"]&&<Link className={active === "curricular_units" ? "is-active" : ""} href="/unidades-curriculares"><BookOpen/><span><strong>Unidades curriculares</strong><small>Áreas, créditos e representantes</small></span></Link>}
          {moduleAccess["documents.library"]&&<Link className={active === "documents" ? "is-active" : ""} href="/documentos"><FileText/><span><strong>Documentos e atas</strong><small>Arquivo da Comissão de Curso</small></span></Link>}
          {(moduleAccess["materials.library"]||moduleAccess["materials.submission"])&&<Link className={active === "materials" ? "is-active" : ""} href="/materiais"><Library/><span><strong>Materiais de estudo</strong><small>Exames, resumos e sebentas</small></span></Link>}
        </div>}
        <div className="nav-section"><span className="nav-label">Turmas</span>{preferenceOnly ? moduleAccess["classes.preferences"]&&<Link className={classesActive ? "is-active" : ""} href="/"><ClipboardCheck /><span><strong>Preferências</strong><small>Escolher ou manter turma</small></span></Link> : moduleAccess["classes.rosters"]&&<Link className={classesActive ? "is-active" : ""} href="/"><Users /><span><strong>Lista de turmas</strong><small>Composição e submissões</small></span>{classCount !== null && <span className="nav-count">{classCount}</span>}</Link>}{moduleAccess["classes.rosters"]&&user?.representedClass && <Link className={ownActive ? "is-active" : ""} href={`/turmas/${user.representedClass}`}><Users /><span><strong>A minha turma</strong><small>Composição da Turma {user.representedClass}</small></span></Link>}{moduleAccess["classes.placements"]&&user?.role==="admin"&&<Link className={active === "placements"||active === "check" ? "is-active" : ""} href="/admin/colocacoes"><Grid3X3 /><span><strong>Colocações</strong><small>Validar, calcular e publicar</small></span></Link>}</div>
        {hasCommunity&&<div className="nav-section"><span className="nav-label">Comunidade</span>
          {moduleAccess["directory.members"]&&<Link className={active === "directory" ? "is-active" : ""} href="/comissao"><ContactRound/><span><strong>Comissão de Curso</strong><small>Membros, cargos e contactos</small></span></Link>}
        </div>}
        {user?.role === "admin" && <div className="nav-section"><span className="nav-label">Administração</span>{moduleAccess["dashboard.analytics"]&&<Link className={active === "dashboard" ? "is-active" : ""} href="/admin/dashboard"><LayoutDashboard/><span><strong>Dashboard</strong><small>Indicadores e ações pendentes</small></span></Link>}{canManageModules&&<Link className={active === "modules" ? "is-active" : ""} href="/admin/modulos"><Boxes/><span><strong>Gestor de módulos</strong><small>Ativar áreas e funcionalidades</small></span></Link>}{moduleAccess["curricular_units.management"]&&(user.commissionDepartment==="management"||user.email.toLowerCase()==="up202507850@up.pt")&&<Link className={active === "curricular_units_management" ? "is-active" : ""} href="/admin/unidades-curriculares"><BookOpen/><span><strong>Gerir unidades</strong><small>Créditos e representantes CC</small></span></Link>}<Link className={active === "admin" ? "is-active" : ""} href="/admin"><Settings /><span><strong>Configuração</strong><small>Utilizadores e calendário</small></span></Link><Link className={active === "audit" ? "is-active" : ""} href="/admin/historico"><History /><span><strong>Histórico</strong><small>Ações administrativas</small></span></Link></div>}
      </nav>
      <div className="sidebar__footer">
        <div className="text-size-setting"><span>Tamanho do texto</span><div>{([['small', 'A−'], ['normal', 'A'], ['large', 'A+']] as [FontScale, string][]).map(([value, label]) => <button key={value} className={user?.fontScale === value ? 'is-active' : ''} onClick={() => void setFontScale(value)}>{label}</button>)}</div></div>
        <div className="profile-menu-shell" ref={profileMenuRef}>
          {profileMenu&&<div className="profile-menu" role="menu" aria-label="Perfil e aparência">
            <header><span className="avatar">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.fullName || user?.email}</strong><small>{user?.email}</small></span></header>
            <section role="group" aria-labelledby="profile-theme-label">
              <span id="profile-theme-label" className="profile-menu__label"><Palette/>Tema do site</span>
              <button type="button" className={`profile-theme-option${theme === "cc" ? " is-active" : ""}`} role="menuitemradio" aria-checked={theme === "cc"} onClick={() => selectTheme("cc")}>
                <span className="profile-theme-option__preview profile-theme-option__preview--cc"><i/><i/><i/></span><span><strong>Tema CC</strong><small>Identidade da Comissão de Curso</small></span>{theme === "cc"&&<Check/>}
              </button>
              <button type="button" className={`profile-theme-option${theme === "forum" ? " is-active" : ""}`} role="menuitemradio" aria-checked={theme === "forum"} onClick={() => selectTheme("forum")}>
                <span className="profile-theme-option__preview profile-theme-option__preview--forum"><i/><i/><i/></span><span><strong>Tema FCP</strong><small>Azul, branco e estrutura compacta</small></span>{theme === "forum"&&<Check/>}
              </button>
            </section>
            {!user?.preview&&!user?.testMode&&<button type="button" className="profile-menu__logout" role="menuitem" onClick={() => void logout()}><LogOut/><span><strong>Terminar sessão</strong><small>Sair com segurança desta conta</small></span></button>}
          </div>}
          <button type="button" className="profile" aria-haspopup="menu" aria-expanded={profileMenu} onClick={() => setProfileMenu(value => !value)}><span className="avatar">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.email}</strong><small>{user?.role === "admin" ? "Administrador" : user?.classRepresentative ? "Representante" : "Estudante"}</small></span><ChevronUp className={profileMenu ? "is-open" : ""}/></button>
        </div>
      </div>
    </aside>
    {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" />}
    <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button><div className="breadcrumbs">{preferenceOnly ? <strong>As minhas preferências</strong> : <><Link href="/">Gestão de turmas</Link><ChevronRight /><strong>{breadcrumb}</strong></>}</div>{moduleAccess["search.global"]&&<TopbarGlobalSearch/>}{user?.testMode&&<div className="test-mode-control"><button type="button" className="test-mode-control__trigger" aria-expanded={testMenu} onClick={()=>setTestMenu(value=>!value)}><span className="test-mode-control__icon"><FlaskConical/></span><span><small>Ambiente de testes</small><strong>{TEST_PERSONAS.find(item=>item.id===testPersona())?.name}</strong></span><ChevronDown className={testMenu?"is-open":""}/></button>{testMenu&&<div className="test-mode-control__menu" role="menu"><header><strong>Visualizar como</strong><small>Os dados continuam a ser fictícios</small></header>{TEST_PERSONAS.map(persona=><button type="button" role="menuitem" key={persona.id} className={testPersona()===persona.id?"is-active":""} onClick={()=>setTestPersona(persona.id)}><span><strong>{persona.name}</strong><small>{persona.classId?`Aluno · Turma ${persona.classId}`:"Gestão administrativa"}</small></span>{testPersona()===persona.id&&<Check/>}</button>)}</div>}</div>}</header><UrgentAnnouncementBanner enabled={active !== "announcements" && moduleAccess["announcements.feed"]}/><main id="conteudo-principal" className={`main-content${preferenceOnly ? " main-content--preference" : ""}`}>{children}</main></div>
    {user?.preview&&<button className="preview-user-toggle" onClick={()=>void stopPreview()}><EyeLabel/><span><small>A visualizar como</small><strong>{user.fullName}</strong></span><b>Voltar ao meu perfil</b></button>}
  </div>;
}

function EyeLabel(){return <span className="preview-user-toggle__mark" aria-hidden="true">↪</span>}
