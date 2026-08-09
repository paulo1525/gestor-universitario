import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHome = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const settingsPage = await readFile(new URL("../app/admin/configuracao/page.tsx", import.meta.url), "utf8");
const usersPage = await readFile(new URL("../app/admin/utilizadores/page.tsx", import.meta.url), "utf8");
const control = await readFile(new URL("../components/admin-control.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../components/admin-control.module.css", import.meta.url), "utf8");

test("the administration home no longer mixes platform settings and users", () => {
  assert.match(adminHome, /AdminConsoleHome/);
  assert.doesNotMatch(adminHome, /AdminControl/);
  assert.match(settingsPage, /<AdminControl view="settings"/);
  assert.match(usersPage, /<AdminControl view="users"/);
});

test("the legacy control workspace is exposed as two focused views", () => {
  assert.match(control, /view: "settings" \| "users"/);
  assert.match(control, /AdminPageHeader/);
  assert.match(control, /view === "settings"/);
  assert.match(control, /AdminMetricGrid/);
  assert.match(control, /AdminSection/);
  assert.match(styles, /\.settingsStack/);
  assert.match(styles, /\.userToolbar/);
  assert.match(styles, /\.userSection \.userToolbar\s*\{[^}]*display:\s*grid/s);
  assert.doesNotMatch(control, /preferenceWindows|preference_windows|class-deadline-settings/);
});
