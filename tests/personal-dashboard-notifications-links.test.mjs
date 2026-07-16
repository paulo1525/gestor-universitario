import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0024_personal_dashboard_notifications_links.sql", import.meta.url), "utf8");
const modules = await readFile(new URL("../lib/app-modules.ts", import.meta.url), "utf8");

test("new personal hub routes are reachable through both router stages", () => {
  for (const path of [
    "/api/dashboard/personal", "/api/notifications", "/api/notification-preferences",
    "/api/calendar-subscription", "/api/calendar-feed.ics", "/api/material-favorites",
    "/api/material-feedback", "/api/useful-links",
  ]) {
    assert.ok(worker.split(path).length >= 3, `${path} must be present in path detection and dispatch`);
  }
  assert.match(worker, /const versions = pathname\.match\(/);
  assert.ok(worker.includes("/versions$/)"), "version route must be dispatched by a dynamic material id");
});

test("migration owns the complete expansion schema and module switches", () => {
  for (const table of [
    "notification_states", "notification_preferences", "calendar_subscription_tokens",
    "material_favorites", "material_feedback", "material_versions", "useful_links",
  ]) assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  for (const key of [
    "dashboard.personal", "notifications.feed", "notifications.preferences", "calendar.subscription",
    "materials.favorites", "materials.feedback", "materials.versioning", "useful_links.library", "useful_links.management",
  ]) {
    assert.ok(migration.includes(`('${key}', 1`), `migration missing ${key}`);
    assert.ok(modules.includes(`\"${key}\"`), `module registry missing ${key}`);
  }
  assert.doesNotMatch(worker, /CREATE TABLE IF NOT EXISTS notification_states/);
});

test("useful links SQL constraints match the public API vocabulary", () => {
  assert.match(migration, /priority IN \('urgent', 'important', 'normal'\)/);
  assert.match(migration, /category IN \('academic', 'platform', 'curricular_unit', 'support', 'association', 'other'\)/);
  assert.match(migration, /visibility IN \('public', 'students', 'cc'\)/);
  assert.match(worker, /canManageCore/);
  assert.match(worker, /useful_link_status_updated/);
  assert.match(worker, /'useful_link' AS type/);
});

test("personal dashboard and notifications expose frontend compatibility aliases", () => {
  for (const alias of [
    "unreadNotifications", "recentAnnouncements", "activePolls", "recentRequests", "favoriteMaterials",
    "classInfo", "classPreferences", "notificationId", "enabledCategories", "curricularUnitIds",
  ]) assert.ok(worker.includes(alias), `missing API alias ${alias}`);
  assert.match(worker, /mark_all_read/);
  assert.match(worker, /notificationId \?\? item\.id/);
});

test("materials return private feedback state, totals and version history", () => {
  for (const field of ["helpfulByMe", "reportedOutdatedByMe", "helpfulCount", "outdatedCount", "versions"]) {
    assert.ok(worker.includes(field), `missing material field ${field}`);
  }
  assert.match(worker, /enabled\("materials\.feedback"\)/);
  assert.match(worker, /materialVersionDto/);
});
