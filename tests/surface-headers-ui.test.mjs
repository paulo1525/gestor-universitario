import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("o cabeçalho comum tem contrato semântico e suporte dos dois temas", () => {
  const component = read("components/surface-header.tsx");
  const globalStyles = read("app/globals.css");
  const forumStyles = read("app/theme-forum.css");

  assert.match(component, /data-platform-surface-header/);
  assert.match(component, /surface-header--standalone/);
  assert.match(component, /surface-header__icon/);
  assert.match(component, /surface-header__meta/);
  assert.match(globalStyles, /--surface-header-icon-color:/);
  assert.match(globalStyles, /\.surface-header\s*\{/);
  assert.match(globalStyles, /\.surface-header--standalone\s*\{/);
  assert.match(forumStyles, /--surface-header-accent-size:\s*3px/);
  assert.match(forumStyles, /--surface-header-icon-background:\s*#dceff8/);
});

test("todas as páginas principais no AppShell usam o cabeçalho comum ou o equivalente administrativo", () => {
  const publicComponents = [
    "components/academic-calendar.tsx",
    "components/announcements-board.tsx",
    "components/campus-directory.tsx",
    "components/commission-directory.tsx",
    "components/curricular-unit-catalog.tsx",
    "components/documents-library.tsx",
    "components/global-search.tsx",
    "components/learning-hub.tsx",
    "components/material-library.tsx",
    "components/notifications-center.tsx",
    "components/personal-dashboard.tsx",
    "components/placement-workbench.tsx",
    "components/polls-hub.tsx",
    "components/quiz-hub.tsx",
    "components/requests-center.tsx",
    "components/turma-detail.tsx",
    "components/turmas-dashboard.tsx",
  ];

  const adminComponents = [
    "components/admin-console-home.tsx",
    "components/admin-control.tsx",
    "components/audit-history.tsx",
    "components/community-admin-dashboard.tsx",
    "components/curricular-unit-academic-content-management.tsx",
    "components/curricular-units-management.tsx",
    "components/module-management-page.tsx",
    "components/quiz-management.tsx",
  ];

  for (const path of publicComponents) {
    const source = read(path);
    assert.match(source, /<AppShell/);
    assert.match(source, /<SurfaceHeader/, `${path} deve usar SurfaceHeader`);
  }

  for (const path of adminComponents) {
    const source = read(path);
    assert.match(source, /<AppShell/);
    assert.match(source, /<AdminPageHeader/, `${path} deve usar AdminPageHeader`);
  }
});

test("pesquisa, filtros e separadores não substituem o título das superfícies principais", () => {
  const checks = [
    ["components/global-search.tsx", /<section className=\{`panel \$\{list\.listPanel\}`\}[^>]*>\s*<form className=\{styles\.toolbar\}/],
    ["components/campus-directory.tsx", /<section className=\{`panel \$\{list\.listPanel\}`\}[^>]*>\s*<FilterBar /],
    ["components/notifications-center.tsx", /<section className=\{`panel \$\{list\.listPanel\}`\}[^>]*>\s*<FilterBar /],
    ["components/polls-hub.tsx", /<section className=\{`panel \$\{list\.listPanel\}`\}[^>]*>\s*<FilterBar /],
    ["components/documents-library.tsx", /<section className=\{`panel \$\{list\.listPanel\}`\}[^>]*>\s*<FilterBar /],
    ["components/commission-directory.tsx", /<section className=\{`panel \$\{list\.listPanel\}`\}[^>]*>\s*<FilterBar /],
    ["components/material-library.tsx", /examsPanel=\{<div aria-busy=\{loading\}>\s*<FilterBar /],
    ["components/material-catalog.tsx", /role="tabpanel"[\s\S]*?<FilterBar /],
    ["components/placement-workbench.tsx", /title="Estudantes e resultados"[\s\S]*?actions=\{<label className="search-field"/],
    ["components/turmas-dashboard.tsx", /<section className=\{`panel \$\{styles\.listPanel\}`\}[^>]*>\s*<FilterBar /],
  ];

  for (const [path, pattern] of checks) {
    assert.match(read(path), pattern, `${path} deve apresentar título antes dos controlos`);
  }
});

test("ferramentas e secções aninhadas reutilizam o mesmo cabeçalho", () => {
  for (const path of [
    "components/class-roster-import.tsx",
    "components/material-compendium-export.tsx",
    "components/question-bank-section.tsx",
    "components/student-preference-panel.tsx",
  ]) {
    assert.match(read(path), /<SurfaceHeader/, `${path} deve usar SurfaceHeader`);
  }

  assert.match(read("components/calendar-subscription.tsx"), /className=\{styles\.trigger\}/);
  assert.match(read("components/calendar-subscription.tsx"), /role="dialog"/);

  assert.match(read("app/cookies/page.tsx"), /<SurfaceHeader/);
  assert.match(read("app/regulamento-distribuicao/page.tsx"), /<SurfaceHeader/);
});
