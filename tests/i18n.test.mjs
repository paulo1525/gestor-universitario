import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  dictionaries,
  formatMessage,
  LANGUAGE_STORAGE_KEY,
  normalizeLocale,
  SUPPORTED_LOCALES,
  translateBreadcrumb,
} from "../lib/i18n.ts";

test("the i18n catalogue has complete Portuguese and English dictionaries", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["pt-PT", "en"]);
  assert.deepEqual(
    Object.keys(dictionaries.en).sort(),
    Object.keys(dictionaries["pt-PT"]).sort(),
  );
  assert.ok(Object.keys(dictionaries.en).length > 100);
});

test("messages interpolate values and locale values are normalized safely", () => {
  assert.equal(
    formatMessage("en", "nav.myClass.description", { classId: 12 }),
    "Members of Class 12",
  );
  assert.equal(
    formatMessage("pt-PT", "search.noResults", { query: "anatomia" }),
    "Sem resultados para “anatomia”.",
  );
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("pt"), "pt-PT");
  assert.equal(normalizeLocale(null), "pt-PT");
});

test("known and dynamic breadcrumbs are translated without changing unknown labels", () => {
  assert.equal(translateBreadcrumb("Turma 17", "en"), "Class 17");
  assert.equal(translateBreadcrumb("Calendário académico", "en"), "Academic calendar");
  assert.equal(translateBreadcrumb("Custom page", "en"), "Custom page");
  assert.equal(translateBreadcrumb("Calendário académico", "pt-PT"), "Calendário académico");
});

test("the provider and shell persist a selectable language and expose both options", async () => {
  const [provider, shell, layout] = await Promise.all([
    readFile(new URL("../components/i18n-context.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(provider, new RegExp(`localStorage\\.setItem\\(LANGUAGE_STORAGE_KEY`));
  assert.match(provider, /document\.documentElement\.lang = locale/);
  assert.match(shell, /setLocale\("pt-PT"\)/);
  assert.match(shell, /setLocale\("en"\)/);
  assert.match(shell, /profile\.themeBlue/);
  assert.doesNotMatch(shell, /Tema FCP/);
  assert.match(layout, new RegExp(LANGUAGE_STORAGE_KEY));
});

test("public interaction modules use the shared bilingual catalogue", async () => {
  const [catalogue, announcements, requests, search, polls] = await Promise.all([
    readFile(new URL("../lib/i18n-public.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/announcements-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/requests-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/global-search.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/polls-hub.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(announcements, /useI18n\(\)/);
  assert.match(announcements, /announcements\.feed\.title/);
  assert.match(requests, /useI18n\(\)/);
  assert.match(requests, /requests\.delete\.confirm/);
  assert.match(search, /search\.results\.title/);
  assert.match(polls, /polls\.vote\.submit/);
  assert.match(catalogue, /"announcements\.feed\.title": "Recent announcements"/);
  assert.match(catalogue, /"requests\.form\.send": "Send request"/);
  assert.match(catalogue, /"search\.title": "Global search"/);
  assert.match(catalogue, /"polls\.editor\.edit": "Edit survey"/);
});

test("the classes dashboard interpolates the class number", async () => {
  const dashboard = await readFile(
    new URL("../components/turmas-dashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    dashboard,
    /t\("classes\.common\.class", \{ number: item\.id \}\)/,
  );
  assert.doesNotMatch(
    dashboard,
    /t\("classes\.common\.class", \{ id: item\.id \}\)/,
  );
});
