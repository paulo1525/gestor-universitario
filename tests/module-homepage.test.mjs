import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { APP_MODULES } from "../lib/app-modules.ts";
import { resolveModuleHomepage } from "../lib/module-homepages.ts";

const enabledStates = Object.fromEntries(APP_MODULES.map((module) => [module.key, true]));
const disabledStates = Object.fromEntries(APP_MODULES.map((module) => [module.key, false]));

test("uses an active configured module as the homepage", () => {
  assert.deepEqual(resolveModuleHomepage("calendar", enabledStates), {
    configuredModuleKey: "calendar",
    resolvedModuleKey: "calendar",
    href: "/calendario",
    mode: "configured",
  });
});

test("falls back automatically when the configured landing page is disabled", () => {
  const states = { ...enabledStates, "calendar.events": false };
  const result = resolveModuleHomepage("calendar", states);
  assert.equal(result.configuredModuleKey, null);
  assert.equal(result.resolvedModuleKey, "dashboard");
  assert.equal(result.href, "/dashboard");
  assert.equal(result.mode, "automatic");
});

test("automatic selection prefers Dashboard and then the first available module", () => {
  assert.equal(resolveModuleHomepage(null, enabledStates).href, "/dashboard");
  const withoutDashboard = { ...enabledStates, dashboard: false, "dashboard.personal": false };
  assert.equal(resolveModuleHomepage(null, withoutDashboard).href, "/notificacoes");
});

test("all-disabled state opens module management only for its administrator", () => {
  assert.deepEqual(resolveModuleHomepage(null, disabledStates, { canManageModules: true }), {
    configuredModuleKey: null,
    resolvedModuleKey: null,
    href: "/admin/modulos",
    mode: "manager",
  });
  assert.equal(resolveModuleHomepage(null, disabledStates).href, null);
  assert.equal(resolveModuleHomepage(null, disabledStates).mode, "unavailable");
});

test("classes homepage respects the role-specific landing submodule", () => {
  const states = { ...disabledStates, classes: true, "classes.rosters": true, "classes.preferences": false };
  assert.equal(resolveModuleHomepage("classes", states).href, "/turmas");
  assert.equal(resolveModuleHomepage("classes", states, { preferenceOnly: true }).href, null);
});

test("root resolver, canonical Dashboard and settings endpoint remain wired", async () => {
  const [root, dashboard, resolver, manager, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/homepage-resolver.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/module-management.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(root, /HomepageResolver/);
  assert.doesNotMatch(root, /dashboard\.personal/);
  assert.match(dashboard, /moduleKey="dashboard\.personal"/);
  assert.match(resolver, /router\.replace\(home\.href\)/);
  assert.match(manager, /\/api\/admin\/modules\/home/);
  assert.match(manager, /admin\.modules\.homeAutomatic/);
  assert.match(worker, /home_module_key/);
  assert.match(worker, /app_homepage_updated/);
});
