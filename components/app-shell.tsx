"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, BookOpen, Boxes, BrainCircuit, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ContactRound, ExternalLink, FileText, FlaskConical, History, Inbox, Languages, LayoutDashboard, Library, LogOut, Megaphone, Menu, Palette, Settings, Upload, Vote, X } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { FontScale, useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";
import { UrgentAnnouncementBanner } from "@/components/urgent-announcement-banner";
import { TopbarGlobalSearch } from "@/components/topbar-global-search";
import { useScrollLock } from "@/components/use-scroll-lock";
import {setTestPersona,TEST_PERSONAS,testPersona} from "@/lib/test-mode";

export type AppShellActive = "overview" | "turmas" | "quizzes" | "quizzes_management" | "notifications" | "useful_links" | "admin" | "modules" | "tickets" | "check" | "placements" | "audit" | "announcements" | "curricular_units" | "curricular_units_management" | "calendar" | "documents" | "requests" | "directory" | "polls" | "dashboard" | "search" | "materials";
type Props = { children: ReactNode; active: AppShellActive; breadcrumb?: string; currentClassId?: number };
type SiteTheme = "cc" | "forum";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "gestor-sidebar-collapsed";

export function AppShell({ children, active, breadcrumb = "Visão geral" }: Props) {
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [testMenu,setTestMenu]=useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [theme, setTheme] = useState<SiteTheme>(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "forum" ? "forum" : "cc");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { access: moduleAccess } = useModules();
  const { user, logout, setFontScale } = useAuth();
  const { breadcrumb: translateBreadcrumb, locale, setLocale, t } = useI18n();
  const hasCommunication = moduleAccess["announcements.feed"] || moduleAccess["requests.submission"] || moduleAccess["polls.voting"];
  const hasAcademicLife = moduleAccess["calendar.events"] || moduleAccess["curricular_units.catalog"] || moduleAccess["quizzes.practice"] || moduleAccess["documents.library"] || moduleAccess["materials.library"] || moduleAccess["materials.submission"] || moduleAccess["useful_links.library"] || moduleAccess["useful_links"];
  const hasCommunity = moduleAccess["directory.members"];
  const canManageModules = Boolean(!user?.testMode && user?.email.toLowerCase() === "up202507850@up.pt");
  useScrollLock(open);
  useEffect(() => {
    const syncPreference = (event?: StorageEvent) => {
      if (event && event.key !== SIDEBAR_COLLAPSED_STORAGE_KEY) return;
      try {
        setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
      } catch {
        setSidebarCollapsed(false);
      }
    };
    syncPreference();
    window.addEventListener("storage", syncPreference);
    return () => window.removeEventListener("storage", syncPreference);
  }, []);
  useEffect(() => {
    if (!moduleAccess["notifications.feed"]) return;
    let mounted = true;
    const loadUnread = () => { void (async () => { try {
      const response = await fetch("/api/notifications?limit=100&unreadOnly=true", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as Record<string, unknown>;
      if (!mounted) return;
      const notifications = Array.isArray(data.notifications) ? data.notifications as Record<string, unknown>[] : [];
      const count = Number(data.unreadCount ?? data.unread ?? notifications.filter(item => !item.read && !item.readAt).length);
      setUnreadNotifications(Number.isFinite(count) ? count : 0);
    } catch { /* O sino não deve interromper a navegação. */ } })(); };
    loadUnread(); window.addEventListener("notifications:changed", loadUnread);
    return () => { mounted = false; window.removeEventListener("notifications:changed", loadUnread); };
  }, [moduleAccess]);
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
  const toggleSidebar = () => {
    setProfileMenu(false);
    setSidebarCollapsed(current => {
      const next = !current;
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next)); } catch { /* A preferência visual não deve bloquear a navegação. */ }
      return next;
    });
  };
  const stopPreview = async () => {
    await fetch("/api/admin/preview-user", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: null }) });
    window.location.href = "/admin";
  };
  return <div className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}>
    <a className="skip-link" href="#conteudo-principal">{t("shell.skipToContent")}</a>
    <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}${open ? " sidebar--open" : ""}`}>
      <button className="sidebar__collapse" type="button" onClick={toggleSidebar} aria-label={t(sidebarCollapsed ? "shell.expandMenu" : "shell.collapseMenu")} aria-expanded={!sidebarCollapsed} aria-controls="primary-sidebar-navigation">
        {sidebarCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </button>
      <div className="brand"><span className="brand__logo-frame"><Image className="brand__logo" src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt={t("shell.brandAlt")} width={58} height={58} priority /></span><div><span className="brand__name">{t("shell.brandName")}</span><span className="brand__context">{t("shell.brandContext")}</span></div><button className="icon-button sidebar__close" onClick={() => setOpen(false)} aria-label={t("shell.closeMenu")}><X /></button></div>
      <nav id="primary-sidebar-navigation" className="nav-list" aria-label={t("shell.primaryNavigation")}>
        {moduleAccess["dashboard.personal"]&&<div className="nav-section"><Link className={active === "overview" ? "is-active" : ""} href="/dashboard" title={sidebarCollapsed ? t("nav.personalDashboard.title") : undefined}><LayoutDashboard/><span><strong>{t("nav.personalDashboard.title")}</strong><small>{t("nav.personalDashboard.description")}</small></span></Link></div>}
        {hasCommunication&&<div className="nav-section"><span className="nav-label">{t("nav.communication")}</span>
          {moduleAccess["announcements.feed"]&&<Link className={active === "announcements" ? "is-active" : ""} href="/avisos" title={sidebarCollapsed ? t("nav.announcements.title") : undefined}><Megaphone/><span><strong>{t("nav.announcements.title")}</strong><small>{t("nav.announcements.description")}</small></span></Link>}
          {moduleAccess["requests.submission"]&&<Link className={active === "requests" ? "is-active" : ""} href="/pedidos" title={sidebarCollapsed ? t("nav.requests.title") : undefined}><Inbox/><span><strong>{t("nav.requests.title")}</strong><small>{t("nav.requests.description")}</small></span></Link>}
          {moduleAccess["polls.voting"]&&<Link className={active === "polls" ? "is-active" : ""} href="/inqueritos" title={sidebarCollapsed ? t("nav.polls.title") : undefined}><Vote/><span><strong>{t("nav.polls.title")}</strong><small>{t("nav.polls.description")}</small></span></Link>}
        </div>}
        {hasAcademicLife&&<div className="nav-section"><span className="nav-label">{t("nav.academicLife")}</span>
          {moduleAccess["calendar.events"]&&<Link className={active === "calendar" ? "is-active" : ""} href="/calendario" title={sidebarCollapsed ? t("nav.calendar.title") : undefined}><CalendarDays/><span><strong>{t("nav.calendar.title")}</strong><small>{t("nav.calendar.description")}</small></span></Link>}
          {moduleAccess["curricular_units.catalog"]&&<Link className={active === "curricular_units" ? "is-active" : ""} href="/unidades-curriculares" title={sidebarCollapsed ? t("nav.curricularUnits.title") : undefined}><BookOpen/><span><strong>{t("nav.curricularUnits.title")}</strong><small>{t("nav.curricularUnits.description")}</small></span></Link>}
          {moduleAccess["quizzes.practice"]&&<Link className={active === "quizzes" ? "is-active" : ""} href="/testes" title={sidebarCollapsed ? t("nav.quizzes.title") : undefined}><BrainCircuit/><span><strong>{t("nav.quizzes.title")}</strong><small>{t("nav.quizzes.description")}</small></span></Link>}
          {moduleAccess["documents.library"]&&<Link className={active === "documents" ? "is-active" : ""} href="/documentos" title={sidebarCollapsed ? t("nav.documents.title") : undefined}><FileText/><span><strong>{t("nav.documents.title")}</strong><small>{t("nav.documents.description")}</small></span></Link>}
          {(moduleAccess["materials.library"]||moduleAccess["materials.submission"])&&<Link className={active === "materials" ? "is-active" : ""} href="/materiais" title={sidebarCollapsed ? t("nav.materials.title") : undefined}><Library/><span><strong>{t("nav.materials.title")}</strong><small>{t("nav.materials.description")}</small></span></Link>}
          {moduleAccess["useful_links.library"]&&<Link className={active === "useful_links" ? "is-active" : ""} href="/links-uteis" title={sidebarCollapsed ? t("links.nav.title") : undefined}><ExternalLink/><span><strong>{t("links.nav.title")}</strong><small>{t("links.nav.description")}</small></span></Link>}
        </div>}
        {hasCommunity&&<div className="nav-section"><span className="nav-label">{t("nav.community")}</span>
          {moduleAccess["directory.members"]&&<Link className={active === "directory" ? "is-active" : ""} href="/comissao" title={sidebarCollapsed ? t("nav.directory.title") : undefined}><ContactRound/><span><strong>{t("nav.directory.title")}</strong><small>{t("nav.directory.description")}</small></span></Link>}
        </div>}
        {user?.role === "admin" && <div className="nav-section">
          <span className="nav-label">{t("nav.administration")}</span>
          {moduleAccess["dashboard.analytics"]&&<Link className={active === "dashboard" ? "is-active" : ""} href="/admin/dashboard" title={sidebarCollapsed ? t("nav.dashboard.title") : undefined}><LayoutDashboard/><span><strong>{t("nav.dashboard.title")}</strong><small>{t("nav.dashboard.description")}</small></span></Link>}
          {canManageModules&&<Link className={active === "modules" ? "is-active" : ""} href="/admin/modulos" title={sidebarCollapsed ? t("nav.modules.title") : undefined}><Boxes/><span><strong>{t("nav.modules.title")}</strong><small>{t("nav.modules.description")}</small></span></Link>}
          {moduleAccess["quizzes.management"]&&<Link className={active === "quizzes_management" ? "is-active" : ""} href="/admin/testes" title={sidebarCollapsed ? t("nav.manageQuizzes.title") : undefined}><Upload/><span><strong>{t("nav.manageQuizzes.title")}</strong><small>{t("nav.manageQuizzes.description")}</small></span></Link>}
          {moduleAccess["curricular_units.management"]&&(user.commissionDepartment==="management"||user.email.toLowerCase()==="up202507850@up.pt")&&<Link className={active === "curricular_units_management" ? "is-active" : ""} href="/admin/unidades-curriculares" title={sidebarCollapsed ? t("nav.manageUnits.title") : undefined}><BookOpen/><span><strong>{t("nav.manageUnits.title")}</strong><small>{t("nav.manageUnits.description")}</small></span></Link>}
          <Link className={active === "admin" ? "is-active" : ""} href="/admin" title={sidebarCollapsed ? t("nav.settings.title") : undefined}><Settings /><span><strong>{t("nav.settings.title")}</strong><small>{t("nav.settings.description")}</small></span></Link>
          <Link className={active === "audit" ? "is-active" : ""} href="/admin/historico" title={sidebarCollapsed ? t("nav.audit.title") : undefined}><History /><span><strong>{t("nav.audit.title")}</strong><small>{t("nav.audit.description")}</small></span></Link>
        </div>}
      </nav>
      <div className="sidebar__footer">
        <div className="text-size-setting"><span>{t("shell.textSize")}</span><div>{([['small', 'A−'], ['normal', 'A'], ['large', 'A+']] as [FontScale, string][]).map(([value, label]) => <button key={value} className={user?.fontScale === value ? 'is-active' : ''} onClick={() => void setFontScale(value)}>{label}</button>)}</div></div>
        <div className="profile-menu-shell" ref={profileMenuRef}>
          {profileMenu&&<div className="profile-menu" role="menu" aria-label={t("profile.menuLabel")}>
            <header><span className="avatar">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.fullName || user?.email}</strong><small>{user?.email}</small></span></header>
            <section role="group" aria-labelledby="profile-theme-label">
              <span id="profile-theme-label" className="profile-menu__label"><Palette/>{t("profile.themeLabel")}</span>
              <button type="button" className={`profile-theme-option${theme === "cc" ? " is-active" : ""}`} role="menuitemradio" aria-checked={theme === "cc"} onClick={() => selectTheme("cc")}>
                <span className="profile-theme-option__preview profile-theme-option__preview--cc"><i/><i/><i/></span><span><strong>{t("profile.themeCc")}</strong><small>{t("profile.themeCcDescription")}</small></span>{theme === "cc"&&<Check/>}
              </button>
              <button type="button" className={`profile-theme-option${theme === "forum" ? " is-active" : ""}`} role="menuitemradio" aria-checked={theme === "forum"} onClick={() => selectTheme("forum")}>
                <span className="profile-theme-option__preview profile-theme-option__preview--forum"><i/><i/><i/></span><span><strong>{t("profile.themeBlue")}</strong><small>{t("profile.themeBlueDescription")}</small></span>{theme === "forum"&&<Check/>}
              </button>
            </section>
            <section role="group" aria-labelledby="profile-language-label">
              <span id="profile-language-label" className="profile-menu__label"><Languages/>{t("profile.languageLabel")}</span>
              <div className="profile-language-options">
                <button type="button" className={locale === "pt-PT" ? "is-active" : ""} role="menuitemradio" aria-checked={locale === "pt-PT"} onClick={() => setLocale("pt-PT")}><span>PT</span><strong>{t("profile.languagePt")}</strong>{locale === "pt-PT"&&<Check/>}</button>
                <button type="button" className={locale === "en" ? "is-active" : ""} role="menuitemradio" aria-checked={locale === "en"} onClick={() => setLocale("en")}><span>EN</span><strong>{t("profile.languageEn")}</strong>{locale === "en"&&<Check/>}</button>
              </div>
            </section>
            {!user?.preview&&!user?.testMode&&<button type="button" className="profile-menu__logout" role="menuitem" onClick={() => void logout()}><LogOut/><span><strong>{t("profile.logout")}</strong><small>{t("profile.logoutDescription")}</small></span></button>}
          </div>}
          <button type="button" className="profile" aria-label={t("profile.menuLabel")} aria-haspopup="menu" aria-expanded={profileMenu} title={sidebarCollapsed ? t("profile.menuLabel") : undefined} onClick={() => setProfileMenu(value => !value)}><span className="avatar">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.email}</strong><small>{user?.role === "admin" ? t("profile.roleAdmin") : user?.classRepresentative ? t("profile.roleRepresentative") : t("profile.roleStudent")}</small></span><ChevronUp className={profileMenu ? "is-open" : ""}/></button>
        </div>
      </div>
    </aside>
    {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label={t("shell.closeMenu")} />}
    <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label={t("shell.openMenu")}><Menu /></button><div className="breadcrumbs"><Link href="/">{t("shell.home")}</Link><ChevronRight /><strong>{translateBreadcrumb(breadcrumb)}</strong></div>{moduleAccess["search.global"]&&<TopbarGlobalSearch/>}{moduleAccess["notifications.feed"]&&<Link href="/notificacoes" className={`icon-button topbar-notifications${unreadNotifications ? " has-notification" : ""}`} aria-label={`${t("nav.notifications.title")}${unreadNotifications ? ` (${unreadNotifications})` : ""}`}><Bell />{unreadNotifications > 0 && <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</Link>}{user?.testMode&&<div className="test-mode-control"><button type="button" className="test-mode-control__trigger" aria-expanded={testMenu} onClick={()=>setTestMenu(value=>!value)}><span className="test-mode-control__icon"><FlaskConical/></span><span><small>{t("test.environment")}</small><strong>{TEST_PERSONAS.find(item=>item.id===testPersona())?.name}</strong></span><ChevronDown className={testMenu?"is-open":""}/></button>{testMenu&&<div className="test-mode-control__menu" role="menu"><header><strong>{t("test.viewAs")}</strong><small>{t("test.fictionalData")}</small></header>{TEST_PERSONAS.map(persona=><button type="button" role="menuitem" key={persona.id} className={testPersona()===persona.id?"is-active":""} onClick={()=>setTestPersona(persona.id)}><span><strong>{persona.name}</strong><small>{persona.classId?t("test.studentClass", { classId: persona.classId }):t("test.administration")}</small></span>{testPersona()===persona.id&&<Check/>}</button>)}</div>}</div>}</header><UrgentAnnouncementBanner enabled={active !== "announcements" && moduleAccess["announcements.feed"]}/><main id="conteudo-principal" className="main-content">{children}</main></div>
    {user?.preview&&<button className="preview-user-toggle" onClick={()=>void stopPreview()}><EyeLabel/><span><small>{t("preview.viewingAs")}</small><strong>{user.fullName}</strong></span><b>{t("preview.backToProfile")}</b></button>}
  </div>;
}

function EyeLabel(){return <span className="preview-user-toggle__mark" aria-hidden="true">↪</span>}
