"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, BookOpen, BrainCircuit, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ContactRound, ExternalLink, FileText, FlaskConical, Inbox, Languages, LayoutDashboard, Library, LogOut, Megaphone, Menu, Palette, ShieldCheck, Vote, X } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { AdminNavigation, isAdministrativeArea } from "@/components/admin-navigation";
import adminNavigationStyles from "@/components/admin-navigation.module.css";
import { FontScale, useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";
import { UrgentAnnouncementBanner } from "@/components/urgent-announcement-banner";
import { TopbarGlobalSearch } from "@/components/topbar-global-search";
import { useScrollLock } from "@/components/use-scroll-lock";
import { useEscapeKey } from "@/components/use-escape-key";
import {setTestPersona,TEST_PERSONAS,testPersona} from "@/lib/test-mode";

export type AppShellActive = "overview" | "turmas" | "quizzes" | "quizzes_management" | "notifications" | "useful_links" | "admin" | "modules" | "tickets" | "check" | "placements" | "audit" | "announcements" | "curricular_units" | "curricular_units_management" | "calendar" | "documents" | "requests" | "directory" | "polls" | "dashboard" | "search" | "materials";
type Props = { children: ReactNode; active: AppShellActive; breadcrumb?: string; currentClassId?: number; focusMode?: boolean };
type SiteTheme = "cc" | "forum";
type SiteNavigationGroup = "communication" | "academic" | "community";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "gestor-sidebar-collapsed";

export function AppShell({ children, active, breadcrumb = "Visão geral", focusMode = false }: Props) {
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
  const hasAcademicLife = moduleAccess["calendar.events"] || moduleAccess["curricular_units.catalog"] || moduleAccess["quizzes.practice"] || moduleAccess["quizzes.learning"] || moduleAccess["documents.library"] || moduleAccess["materials.library"] || moduleAccess["materials.submission"] || moduleAccess["useful_links.library"] || moduleAccess["useful_links"];
  const hasCommunity = moduleAccess["directory.members"];
  const [openSiteGroup, setOpenSiteGroup] = useState<SiteNavigationGroup | null>(() => ["announcements", "requests", "polls", "notifications"].includes(active) ? "communication" : ["calendar", "curricular_units", "quizzes", "documents", "materials", "useful_links"].includes(active) ? "academic" : active === "directory" ? "community" : null);
  const administrativeContext = Boolean(user?.role === "admin" && isAdministrativeArea(active));
  useScrollLock(open);
  useEscapeKey(open, () => setOpen(false));
  useEscapeKey(profileMenu, () => setProfileMenu(false));
  useEscapeKey(testMenu, () => setTestMenu(false));
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
    document.addEventListener("mousedown", closeMenu);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
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
  return <div className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}${focusMode ? " app-shell--focus" : ""}`}>
    <a className="skip-link" href="#conteudo-principal">{t("shell.skipToContent")}</a>
    <aside className={`sidebar${administrativeContext ? ` ${adminNavigationStyles.adminSidebar}` : ""}${sidebarCollapsed ? " sidebar--collapsed" : ""}${open ? " sidebar--open" : ""}`}>
      <button className="sidebar__collapse" type="button" onClick={toggleSidebar} aria-label={t(sidebarCollapsed ? "shell.expandMenu" : "shell.collapseMenu")} aria-expanded={!sidebarCollapsed} aria-controls="primary-sidebar-navigation">
        {sidebarCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </button>
      <div className="brand"><span className="brand__logo-frame"><Image className="brand__logo" src="/logo-comissao-curso-fmup-2025-2031-transparente.png" alt={t("shell.brandAlt")} width={58} height={58} priority /></span><div><span className="brand__name">{t("shell.brandName")}</span><span className="brand__context">{administrativeContext ? locale === "en" ? "Administration panel" : "Painel administrativo" : t("shell.brandContext")}</span></div><button className="icon-button sidebar__close" onClick={() => setOpen(false)} aria-label={t("shell.closeMenu")}><X /></button></div>
      <nav id="primary-sidebar-navigation" className="nav-list" aria-label={administrativeContext ? locale === "en" ? "Administration navigation" : "Navegação administrativa" : t("shell.primaryNavigation")}>
        {administrativeContext ? <AdminNavigation active={active} collapsed={sidebarCollapsed && !open} onNavigate={() => setOpen(false)} /> : <div className={adminNavigationStyles.navigation}>
          {moduleAccess["dashboard.personal"]&&<Link className={`${adminNavigationStyles.overviewLink} ${active === "overview" ? adminNavigationStyles.active : ""}`} href="/dashboard" title={sidebarCollapsed ? t("nav.personalDashboard.title") : undefined} onClick={() => setOpen(false)}><LayoutDashboard/><span>{t("nav.personalDashboard.title")}</span></Link>}
          <div className={adminNavigationStyles.groups}>
            {hasCommunication&&<section className={adminNavigationStyles.group}>
              <button className={`${adminNavigationStyles.groupButton} ${["announcements","requests","polls","notifications"].includes(active) ? adminNavigationStyles.currentGroup : ""}`} type="button" aria-expanded={openSiteGroup === "communication"} aria-controls="site-navigation-communication" onClick={() => setOpenSiteGroup((current) => current === "communication" ? null : "communication")}><Megaphone/><span>{t("nav.communication")}</span><ChevronDown className={openSiteGroup === "communication" ? adminNavigationStyles.chevronOpen : ""}/></button>
              <div id="site-navigation-communication" className={`${adminNavigationStyles.groupItems} ${openSiteGroup !== "communication" ? adminNavigationStyles.groupItemsClosed : ""}`}>
                {moduleAccess["announcements.feed"]&&<Link className={`${adminNavigationStyles.item} ${active === "announcements" ? adminNavigationStyles.active : ""}`} href="/avisos" onClick={() => setOpen(false)}><Megaphone/><span>{t("nav.announcements.title")}</span></Link>}
                {moduleAccess["requests.submission"]&&<Link className={`${adminNavigationStyles.item} ${active === "requests" ? adminNavigationStyles.active : ""}`} href="/pedidos" onClick={() => setOpen(false)}><Inbox/><span>{t("nav.requests.title")}</span></Link>}
                {moduleAccess["polls.voting"]&&<Link className={`${adminNavigationStyles.item} ${active === "polls" ? adminNavigationStyles.active : ""}`} href="/inqueritos" onClick={() => setOpen(false)}><Vote/><span>{t("nav.polls.title")}</span></Link>}
              </div>
            </section>}
            {hasAcademicLife&&<section className={adminNavigationStyles.group}>
              <button className={`${adminNavigationStyles.groupButton} ${["calendar","curricular_units","quizzes","documents","materials","useful_links"].includes(active) ? adminNavigationStyles.currentGroup : ""}`} type="button" aria-expanded={openSiteGroup === "academic"} aria-controls="site-navigation-academic" onClick={() => setOpenSiteGroup((current) => current === "academic" ? null : "academic")}><BookOpen/><span>{t("nav.academicLife")}</span><ChevronDown className={openSiteGroup === "academic" ? adminNavigationStyles.chevronOpen : ""}/></button>
              <div id="site-navigation-academic" className={`${adminNavigationStyles.groupItems} ${openSiteGroup !== "academic" ? adminNavigationStyles.groupItemsClosed : ""}`}>
                {moduleAccess["calendar.events"]&&<Link className={`${adminNavigationStyles.item} ${active === "calendar" ? adminNavigationStyles.active : ""}`} href="/calendario" onClick={() => setOpen(false)}><CalendarDays/><span>{t("nav.calendar.title")}</span></Link>}
                {moduleAccess["curricular_units.catalog"]&&<Link className={`${adminNavigationStyles.item} ${active === "curricular_units" ? adminNavigationStyles.active : ""}`} href="/unidades-curriculares" onClick={() => setOpen(false)}><BookOpen/><span>{t("nav.curricularUnits.title")}</span></Link>}
                {moduleAccess["quizzes.practice"]?<Link className={`${adminNavigationStyles.item} ${active === "quizzes" ? adminNavigationStyles.active : ""}`} href="/testes" onClick={() => setOpen(false)}><BrainCircuit/><span>{t("nav.quizzes.title")}</span></Link>:moduleAccess["quizzes.learning"]?<Link className={`${adminNavigationStyles.item} ${active === "quizzes" ? adminNavigationStyles.active : ""}`} href="/testes/aprender" onClick={() => setOpen(false)}><BrainCircuit/><span>{t("nav.quizzes.title")}</span></Link>:null}
                {moduleAccess["documents.library"]&&<Link className={`${adminNavigationStyles.item} ${active === "documents" ? adminNavigationStyles.active : ""}`} href="/documentos" onClick={() => setOpen(false)}><FileText/><span>{t("nav.documents.title")}</span></Link>}
                {(moduleAccess["materials.library"]||moduleAccess["materials.submission"])&&<Link className={`${adminNavigationStyles.item} ${active === "materials" ? adminNavigationStyles.active : ""}`} href="/materiais" onClick={() => setOpen(false)}><Library/><span>{t("nav.materials.title")}</span></Link>}
                {moduleAccess["useful_links.library"]&&<Link className={`${adminNavigationStyles.item} ${active === "useful_links" ? adminNavigationStyles.active : ""}`} href="/links-uteis" onClick={() => setOpen(false)}><ExternalLink/><span>{t("links.nav.title")}</span></Link>}
              </div>
            </section>}
            {hasCommunity&&<section className={adminNavigationStyles.group}>
              <button className={`${adminNavigationStyles.groupButton} ${active === "directory" ? adminNavigationStyles.currentGroup : ""}`} type="button" aria-expanded={openSiteGroup === "community"} aria-controls="site-navigation-community" onClick={() => setOpenSiteGroup((current) => current === "community" ? null : "community")}><ContactRound/><span>{t("nav.community")}</span><ChevronDown className={openSiteGroup === "community" ? adminNavigationStyles.chevronOpen : ""}/></button>
              <div id="site-navigation-community" className={`${adminNavigationStyles.groupItems} ${openSiteGroup !== "community" ? adminNavigationStyles.groupItemsClosed : ""}`}>
                {moduleAccess["directory.members"]&&<Link className={`${adminNavigationStyles.item} ${active === "directory" ? adminNavigationStyles.active : ""}`} href="/comissao" onClick={() => setOpen(false)}><ContactRound/><span>{t("nav.directory.title")}</span></Link>}
              </div>
            </section>}
          </div>
        </div>}
      </nav>
      <div className="sidebar__footer">
        <div className="text-size-setting"><span>{t("shell.textSize")}</span><div>{([['small', 'A−'], ['normal', 'A'], ['large', 'A+']] as [FontScale, string][]).map(([value, label]) => <button key={value} className={user?.fontScale === value ? 'is-active' : ''} onClick={() => void setFontScale(value)}>{label}</button>)}</div></div>
        <div className="profile-menu-shell" ref={profileMenuRef}>
          {profileMenu&&<div className="profile-menu" role="menu" aria-label={t("profile.menuLabel")}>
            <header><span className="avatar">{user?.email.slice(0, 2).toUpperCase()}</span><span><strong>{user?.fullName || user?.email}</strong><small>{user?.email}</small></span></header>
            {user?.role === "admin" && <Link className={adminNavigationStyles.profileAdminLink} href="/admin" role="menuitem" onClick={() => { setProfileMenu(false); setOpen(false); }}><ShieldCheck aria-hidden="true"/><span><strong>{locale === "en" ? "Administration panel" : "Painel administrativo"}</strong><small>{locale === "en" ? "Manage content, platform and activity" : "Gerir conteúdo, plataforma e atividade"}</small></span><ChevronRight aria-hidden="true"/></Link>}
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
    <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label={t("shell.openMenu")}><Menu /></button><div className="breadcrumbs"><Link href="/">{t("shell.home")}</Link><ChevronRight /><strong>{translateBreadcrumb(breadcrumb)}</strong></div>{moduleAccess["search.global"]&&<TopbarGlobalSearch/>}{moduleAccess["notifications.feed"]&&<Link href="/notificacoes" className={`icon-button topbar-notifications${unreadNotifications ? " has-notification" : ""}`} aria-label={`${t("nav.notifications.title")}${unreadNotifications ? ` (${unreadNotifications})` : ""}`}><Bell />{unreadNotifications > 0 && <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</Link>}{user?.testMode&&<div className="test-mode-control"><button type="button" className="test-mode-control__trigger" aria-expanded={testMenu} onClick={()=>setTestMenu(value=>!value)}><span className="test-mode-control__icon"><FlaskConical/></span><span><small>{t("test.environment")}</small><strong>{TEST_PERSONAS.find(item=>item.id===testPersona())?.name}</strong></span><ChevronDown className={testMenu?"is-open":""}/></button>{testMenu&&<div className="test-mode-control__menu" role="menu"><header><strong>{t("test.viewAs")}</strong><small>{t("test.fictionalData")}</small></header>{TEST_PERSONAS.map(persona=><button type="button" role="menuitem" key={persona.id} className={testPersona()===persona.id?"is-active":""} onClick={()=>setTestPersona(persona.id)}><span><strong>{persona.name}</strong><small>{persona.classId?t("test.studentClass", { classId: persona.classId }):t("test.administration")}</small></span>{testPersona()===persona.id&&<Check/>}</button>)}</div>}</div>}</header><UrgentAnnouncementBanner enabled={!focusMode && active !== "announcements" && moduleAccess["announcements.feed"]}/><main id="conteudo-principal" className="main-content">{children}</main></div>
    {user?.preview&&<button className="preview-user-toggle" onClick={()=>void stopPreview()}><EyeLabel/><span><small>{t("preview.viewingAs")}</small><strong>{user.fullName}</strong></span><b>{t("preview.backToProfile")}</b></button>}
  </div>;
}

function EyeLabel(){return <span className="preview-user-toggle__mark" aria-hidden="true">↪</span>}
