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
    "components/useful-links.tsx",
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
    ["components/global-search.tsx", /<section className=\{styles\.panel\}>\s*<SurfaceHeader[\s\S]*?<form className=\{styles\.toolbar\}/],
    ["components/campus-directory.tsx", /<section className=\{styles\.panel\}[^>]*>\s*<SurfaceHeader[\s\S]*?<div className=\{styles\.toolbar\}/],
    ["components/notifications-center.tsx", /<section className=\{styles\.panel\}>\s*<SurfaceHeader[\s\S]*?<div className=\{styles\.toolbar\}/],
    ["components/polls-hub.tsx", /<section className=\{styles\.workspace\}>\s*<SurfaceHeader[\s\S]*?<div className=\{styles\.toolbar\}/],
    ["components/material-catalog.tsx", /<SurfaceHeader[\s\S]*?<div className=\{styles\.toolbar\}/],
    ["components/placement-workbench.tsx", /title="Estudantes e resultados"[\s\S]*?actions=\{<label className="search-field"/],
    ["components/turmas-dashboard.tsx", /<SurfaceHeader[\s\S]*?className="search-field"/],
  ];

  for (const [path, pattern] of checks) {
    assert.match(read(path), pattern, `${path} deve apresentar título antes dos controlos`);
  }
});

test("ferramentas e secções aninhadas reutilizam o mesmo cabeçalho", () => {
  for (const path of [
    "components/calendar-subscription.tsx",
    "components/class-roster-import.tsx",
    "components/material-compendium-export.tsx",
    "components/question-bank-section.tsx",
    "components/student-preference-panel.tsx",
  ]) {
    assert.match(read(path), /<SurfaceHeader/, `${path} deve usar SurfaceHeader`);
  }

  assert.match(read("app/cookies/page.tsx"), /<SurfaceHeader/);
  assert.match(read("app/regulamento-distribuicao/page.tsx"), /<SurfaceHeader/);
});
