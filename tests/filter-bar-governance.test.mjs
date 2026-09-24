import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const filterPages = [
  "components/announcements-board.tsx",
  "components/documents-library.tsx",
  "components/curricular-unit-catalog.tsx",
  "components/academic-calendar.tsx",
  "components/requests-center.tsx",
  "components/notifications-center.tsx",
  "components/commission-directory.tsx",
  "components/material-catalog.tsx",
  "components/material-library.tsx",
  "components/polls-hub.tsx",
  "components/campus-directory.tsx",
];

test("as listagens usam a barra de filtros partilhada", async () => {
  for (const path of filterPages) {
    const source = await read(path);
    assert.match(source, /from "@\/components\/filter-bar"/, `${path} deve importar a barra de filtros partilhada`);
    assert.match(source, /<FilterBar /, `${path} deve usar FilterBar`);
  }
  const adminUi = await read("components/admin-ui.tsx");
  assert.match(adminUi, /export function AdminToolbar[\s\S]*?<FilterBar /, "AdminToolbar deve partilhar a anatomia dos filtros");
});

test("os filtros mantêm labels associadas a cada controlo", async () => {
  const component = await read("components/filter-bar.tsx");
  assert.match(component, /<label className="filter-field__label" htmlFor=\{id\}>/);
  for (const path of filterPages) {
    const source = await read(path);
    assert.doesNotMatch(source, /<span className=\{styles\.srOnly\}>\{t\("[^"]*filter/i, `${path} tem um filtro sem label visível`);
  }
});

test("a barra de filtros consome apenas tokens do tema", async () => {
  const globals = await read("app/globals.css");
  const start = globals.indexOf("/* Shared filters (components/filter-bar.tsx)");
  const end = globals.indexOf(".panel { border:", start);
  assert.ok(start > 0 && end > start, "secção de filtros partilhados em falta");
  const section = globals.slice(start, end);
  assert.doesNotMatch(section, /#[0-9a-f]{3,6}\b/i, "a barra de filtros não pode fixar cores");
  assert.doesNotMatch(section, /font-size:\s*\d/, "a barra de filtros usa a escala tipográfica");
  assert.match(section, /\.filter-bar--collapsible:not\(\.is-expanded\) \.filter-field--secondary \{ display: none; \}/);
});

test("a escala tipográfica não desce abaixo do mínimo legível", async () => {
  const globals = await read("app/globals.css");
  assert.match(globals, /--font-size-caption: 10px;/);
  assert.match(globals, /--font-size-body: 11px;/);
  const cssFiles = [
    "app/globals.css",
    "app/theme-forum.css",
    ...(await readdir(new URL("../components", import.meta.url))).filter((name) => name.endsWith(".css")).map((name) => `components/${name}`),
  ];
  for (const path of cssFiles) {
    const css = await read(path);
    for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(match[1]) >= 10 || Number(match[1]) === 0, `${path} fixa ${match[0]}; usar os tokens --font-size-*`);
    }
  }
});
