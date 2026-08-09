"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ClipboardCheck,
  History,
  Settings,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AppShellActive } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";
import styles from "@/components/admin-navigation.module.css";

type AdminGroupId = "content" | "operations" | "platform" | "control";
type AdminItem = {
  active: AppShellActive;
  href: string;
  icon: typeof Settings;
  label: string;
  visible: boolean;
};

const ADMIN_ACTIVE_AREAS = new Set<AppShellActive>([
  "admin",
  "audit",
  "check",
  "dashboard",
  "modules",
  "placements",
  "quizzes_management",
  "tickets",
  "curricular_units_management",
]);

const ACTIVE_GROUP: Partial<Record<AppShellActive, AdminGroupId>> = {
  quizzes_management: "content",
  curricular_units_management: "content",
  placements: "operations",
  tickets: "operations",
  check: "operations",
  admin: "platform",
  modules: "platform",
  dashboard: "control",
  audit: "control",
};

const COPY = {
  "pt-PT": {
    navigation: "Navegação administrativa",
    back: "Voltar ao site",
    overview: "Visão geral",
    analytics: "Indicadores",
    content: "Conteúdo",
    operations: "Operações",
    platform: "Plataforma",
    control: "Controlo",
    quizzes: "Banco de perguntas",
    units: "Unidades curriculares",
    placements: "Colocações",
    users: "Utilizadores e acessos",
    settings: "Configuração da plataforma",
    modules: "Gestor de módulos",
    audit: "Histórico administrativo",
    expand: "Abrir secção {group}",
    collapse: "Fechar secção {group}",
  },
  en: {
    navigation: "Administration navigation",
    back: "Back to site",
    overview: "Overview",
    analytics: "Analytics",
    content: "Content",
    operations: "Operations",
    platform: "Platform",
    control: "Control",
    quizzes: "Question bank",
    units: "Course units",
    placements: "Placements",
    users: "Users and access",
    settings: "Platform settings",
    modules: "Module manager",
    audit: "Administration history",
    expand: "Open {group} section",
    collapse: "Close {group} section",
  },
} as const;

export function isAdministrativeArea(active: AppShellActive): boolean {
  return ADMIN_ACTIVE_AREAS.has(active);
}

export function AdminNavigation({ active, collapsed, onNavigate }: { active: AppShellActive; collapsed: boolean; onNavigate: () => void }) {
  const { access } = useModules();
  const { user } = useAuth();
  const { locale } = useI18n();
  const pathname = usePathname();
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  const copy = COPY[locale];
  const activeGroup = normalizedPathname === "/admin" ? null : normalizedPathname === "/admin/utilizadores" || normalizedPathname === "/admin/configuracao" ? "platform" : ACTIVE_GROUP[active] ?? null;
  const [openGroup, setOpenGroup] = useState<AdminGroupId | null>(activeGroup);
  const canManageModules = Boolean(!user?.testMode && user?.email.toLowerCase() === "up202507850@up.pt");
  const canManageUnits = Boolean(access["curricular_units.management"] && (user?.commissionDepartment === "management" || user?.email.toLowerCase() === "up202507850@up.pt"));

  const groups = useMemo<Array<{ id: AdminGroupId; label: string; icon: typeof Settings; items: AdminItem[] }>>(() => [
    {
      id: "content",
      label: copy.content,
      icon: BookOpen,
      items: [
        { active: "quizzes_management", href: "/admin/testes", icon: BrainCircuit, label: copy.quizzes, visible: Boolean(access["quizzes.management"]) },
        { active: "curricular_units_management", href: "/admin/unidades-curriculares", icon: BookOpen, label: copy.units, visible: canManageUnits },
      ],
    },
    {
      id: "operations",
      label: copy.operations,
      icon: ClipboardCheck,
      items: [
        { active: "placements", href: "/admin/colocacoes", icon: ClipboardCheck, label: copy.placements, visible: Boolean(access["classes.placements"]) },
      ],
    },
    {
      id: "platform",
      label: copy.platform,
      icon: SlidersHorizontal,
      items: [
        { active: "admin", href: "/admin/utilizadores", icon: UsersRound, label: copy.users, visible: true },
        { active: "admin", href: "/admin/configuracao", icon: Settings, label: copy.settings, visible: true },
        { active: "modules", href: "/admin/modulos", icon: Boxes, label: copy.modules, visible: canManageModules },
      ],
    },
    {
      id: "control",
      label: copy.control,
      icon: History,
      items: [
        { active: "dashboard", href: "/admin/dashboard", icon: BarChart3, label: copy.analytics, visible: Boolean(access["dashboard.analytics"]) },
        { active: "audit", href: "/admin/historico", icon: History, label: copy.audit, visible: true },
      ],
    },
  ], [access, canManageModules, canManageUnits, copy]);

  return <div className={styles.navigation} data-collapsed={collapsed}>
    <Link className={styles.backLink} href="/" title={collapsed ? copy.back : undefined} onClick={onNavigate}>
      <ArrowLeft aria-hidden="true" />
      <span>{copy.back}</span>
    </Link>
    <Link className={`${styles.overviewLink}${normalizedPathname === "/admin" ? ` ${styles.active}` : ""}`} href="/admin" aria-current={normalizedPathname === "/admin" ? "page" : undefined} title={collapsed ? copy.overview : undefined} onClick={onNavigate}>
      <BarChart3 aria-hidden="true" />
      <span>{copy.overview}</span>
    </Link>
    <span className="sr-only">{copy.navigation}</span>
    <div className={styles.groups}>
      {groups.map(group => {
        const items = group.items.filter(item => item.visible);
        if (!items.length) return null;
        const expanded = openGroup === group.id;
        const containsActive = items.some(item => normalizedPathname === item.href || (item.active === active && item.active !== "admin"));
        const GroupIcon = group.icon;
        return <section className={styles.group} key={group.id}>
          <button
            className={`${styles.groupButton}${containsActive ? ` ${styles.currentGroup}` : ""}`}
            type="button"
            aria-expanded={expanded}
            aria-controls={`admin-navigation-${group.id}`}
            aria-label={(expanded ? copy.collapse : copy.expand).replace("{group}", group.label)}
            onClick={() => setOpenGroup(current => current === group.id ? null : group.id)}
          >
            <GroupIcon aria-hidden="true" />
            <span>{group.label}</span>
            <ChevronDown className={expanded ? styles.chevronOpen : ""} aria-hidden="true" />
          </button>
          <div id={`admin-navigation-${group.id}`} className={`${styles.groupItems}${expanded ? "" : ` ${styles.groupItemsClosed}`}`} aria-hidden={!expanded && !collapsed}>
            {items.map(item => {
              const Icon = item.icon;
              const selected = normalizedPathname === item.href || (item.active === active && !["admin", "dashboard"].includes(item.active));
              return <Link className={`${styles.item}${selected ? ` ${styles.active}` : ""}`} href={item.href} aria-current={selected ? "page" : undefined} title={collapsed ? item.label : undefined} tabIndex={!expanded && !collapsed ? -1 : undefined} onClick={onNavigate} key={item.href}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>;
            })}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
