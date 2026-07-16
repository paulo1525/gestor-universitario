import { moduleEffectiveEnabled, type AppModuleKey } from "./app-modules.ts";

export type HomeModuleKey = Extract<AppModuleKey,
  | "dashboard"
  | "notifications"
  | "announcements"
  | "requests"
  | "polls"
  | "calendar"
  | "curricular_units"
  | "documents"
  | "materials"
  | "useful_links"
  | "classes"
  | "directory"
  | "search"
>;

export type ModuleHomepageTarget = {
  moduleKey: HomeModuleKey;
  href: string;
  landingKeys: readonly AppModuleKey[];
};

export type HomepageProfile = {
  canManageModules?: boolean;
  preferenceOnly?: boolean;
};

export type ResolvedModuleHomepage = {
  configuredModuleKey: HomeModuleKey | null;
  resolvedModuleKey: HomeModuleKey | null;
  href: string | null;
  mode: "configured" | "automatic" | "manager" | "unavailable";
};

export const MODULE_HOMEPAGES: readonly ModuleHomepageTarget[] = [
  { moduleKey: "dashboard", href: "/dashboard", landingKeys: ["dashboard.personal"] },
  { moduleKey: "notifications", href: "/notificacoes", landingKeys: ["notifications.feed"] },
  { moduleKey: "announcements", href: "/avisos", landingKeys: ["announcements.feed"] },
  { moduleKey: "requests", href: "/pedidos", landingKeys: ["requests.submission"] },
  { moduleKey: "polls", href: "/inqueritos", landingKeys: ["polls.voting"] },
  { moduleKey: "calendar", href: "/calendario", landingKeys: ["calendar.events"] },
  { moduleKey: "curricular_units", href: "/unidades-curriculares", landingKeys: ["curricular_units.catalog"] },
  { moduleKey: "documents", href: "/documentos", landingKeys: ["documents.library"] },
  { moduleKey: "materials", href: "/materiais", landingKeys: ["materials.library", "materials.submission"] },
  { moduleKey: "useful_links", href: "/links-uteis", landingKeys: ["useful_links.library"] },
  { moduleKey: "classes", href: "/turmas", landingKeys: ["classes.rosters", "classes.preferences"] },
  { moduleKey: "directory", href: "/comissao", landingKeys: ["directory.members"] },
  { moduleKey: "search", href: "/pesquisa", landingKeys: ["search.global"] },
] as const;

export function moduleHomepageTarget(moduleKey: string | null | undefined): ModuleHomepageTarget | null {
  return MODULE_HOMEPAGES.find((target) => target.moduleKey === moduleKey) ?? null;
}

export function moduleHomepageAvailable(moduleKey: string, states: Record<string, boolean>, profile: HomepageProfile = {}): boolean {
  const target = moduleHomepageTarget(moduleKey);
  if (!target || !moduleEffectiveEnabled(target.moduleKey, states)) return false;
  if (target.moduleKey === "classes") {
    const landingKey = profile.preferenceOnly ? "classes.preferences" : "classes.rosters";
    return moduleEffectiveEnabled(landingKey, states);
  }
  return target.landingKeys.some((key) => moduleEffectiveEnabled(key, states));
}

export function resolveModuleHomepage(configuredModuleKey: string | null | undefined, states: Record<string, boolean>, profile: HomepageProfile = {}): ResolvedModuleHomepage {
  const configured = moduleHomepageTarget(configuredModuleKey);
  if (configured && moduleHomepageAvailable(configured.moduleKey, states, profile)) {
    return { configuredModuleKey: configured.moduleKey, resolvedModuleKey: configured.moduleKey, href: configured.href, mode: "configured" };
  }

  const automatic = MODULE_HOMEPAGES.find((target) => moduleHomepageAvailable(target.moduleKey, states, profile));
  if (automatic) {
    return { configuredModuleKey: null, resolvedModuleKey: automatic.moduleKey, href: automatic.href, mode: "automatic" };
  }

  if (profile.canManageModules) {
    return { configuredModuleKey: null, resolvedModuleKey: null, href: "/admin/modulos", mode: "manager" };
  }
  return { configuredModuleKey: null, resolvedModuleKey: null, href: null, mode: "unavailable" };
}
