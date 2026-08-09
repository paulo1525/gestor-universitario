import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  globals: await readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  forumTheme: await readFile(new URL("../app/theme-forum.css", import.meta.url), "utf8"),
  guide: await readFile(new URL("../docs/AI-UI-DESIGN-GUIDE.md", import.meta.url), "utf8"),
  agents: await readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
  quizHub: await readFile(new URL("../components/quiz-hub.module.css", import.meta.url), "utf8"),
  quizAdmin: await readFile(new URL("../components/quiz-management.module.css", import.meta.url), "utf8"),
  unitsCatalog: await readFile(new URL("../components/curricular-unit-catalog.module.css", import.meta.url), "utf8"),
  unitsAdmin: await readFile(new URL("../components/curricular-units-management.module.css", import.meta.url), "utf8"),
  adminUi: await readFile(new URL("../components/admin-ui.module.css", import.meta.url), "utf8"),
  adminHome: await readFile(new URL("../components/admin-console-home.tsx", import.meta.url), "utf8"),
  adminPage: await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  adminControl: await readFile(new URL("../components/admin-control.tsx", import.meta.url), "utf8"),
  auditHistory: await readFile(new URL("../components/audit-history.tsx", import.meta.url), "utf8"),
  communityDashboard: await readFile(new URL("../components/community-admin-dashboard.tsx", import.meta.url), "utf8"),
  ticketAdmin: await readFile(new URL("../components/ticket-admin.tsx", import.meta.url), "utf8"),
  announcements: await readFile(new URL("../components/announcements-board.tsx", import.meta.url), "utf8"),
  polls: await readFile(new URL("../components/polls-hub.tsx", import.meta.url), "utf8"),
  pollsCss: await readFile(new URL("../components/polls-hub.module.css", import.meta.url), "utf8"),
  requests: await readFile(new URL("../components/requests-center.tsx", import.meta.url), "utf8"),
  requestsCss: await readFile(new URL("../components/requests-center.module.css", import.meta.url), "utf8"),
};

const featureStyles = [files.quizHub, files.quizAdmin, files.unitsCatalog, files.unitsAdmin];

test("future UI work is explicitly routed through the platform design guide", () => {
  assert.match(files.agents, /docs\/AI-UI-DESIGN-GUIDE\.md/);
  assert.match(files.guide, /\/admin\//);
  assert.match(files.guide, /turmas-dashboard\.tsx/);
  assert.match(files.guide, /app\/globals\.css/);
  assert.match(files.guide, /components\/admin-ui\.tsx/);
  assert.match(files.guide, /Anatomia obrigatória dos cartões/);
  assert.match(files.guide, /Arquitetura da administração/);
  assert.match(files.guide, /Processo obrigatório de QA visual/);
});

test("the administration landing page is a directory instead of an editing workspace", () => {
  assert.match(files.adminPage, /AdminConsoleHome/);
  assert.doesNotMatch(files.adminPage, /AdminControl/);
  assert.match(files.adminHome, /AdminMetricGrid/);
  assert.match(files.adminHome, /AdminSectionGrid/);
  assert.match(files.adminHome, /href="\/admin\/utilizadores"/);
  assert.match(files.adminHome, /href="\/admin\/configuracao"/);
});

test("shared administration surfaces use global light-theme tokens", () => {
  assert.match(files.adminUi, /background:\s*var\(--color-surface\)/);
  assert.match(files.adminUi, /border:\s*1px solid var\(--surface-card-border\)/);
  assert.match(files.adminUi, /border-radius:\s*var\(--surface-card-radius\)/);
  assert.match(files.adminUi, /box-shadow:\s*var\(--surface-card-shadow\)/);
  assert.doesNotMatch(files.adminUi, /linear-gradient|radial-gradient/i);
});

test("public and administrative cards share one theme-aware surface contract", () => {
  for (const token of ["--surface-card-border", "--surface-card-radius", "--surface-card-shadow", "--surface-header-accent-size"]) {
    assert.match(files.globals, new RegExp(token));
    assert.match(files.forumTheme, new RegExp(token));
  }
  assert.match(files.globals, /\.panel\s*\{[^}]*var\(--surface-card-border\)[^}]*var\(--surface-card-radius\)[^}]*var\(--surface-card-shadow\)/s);
  assert.match(files.adminUi, /var\(--surface-header-accent-size\)/);
  assert.match(files.forumTheme, /\[data-platform-surface-header\]/);
  assert.match(files.guide, /Contrato partilhado das superfícies/);
});

test("editor triggers are compact and visually demote the close state", () => {
  assert.match(files.announcements, /button--compact[^\n]*editorOpen\s*\?\s*"button--secondary"\s*:\s*"button--primary"/);
  assert.match(files.polls, /button button--primary button--compact/);
  assert.match(files.requests, /button--compact[^\n]*composerOpen\s*\?\s*"button--secondary"\s*:\s*"button--primary"/);
});

test("long public collections use bordered rows inside one shared panel", () => {
  for (const css of [files.pollsCss, files.requestsCss]) {
    assert.match(css, /border-bottom:\s*1px solid var\(--surface-card-border\)/);
    assert.match(css, /border-radius:\s*0/);
    assert.match(css, /box-shadow:\s*none/);
  }
});

test("the new request composer stays compact and poll choice icons are optically centred", () => {
  assert.match(files.requestsCss, /\.form\s*\{[^}]*width:min\(1200px,100%\)/s);
  assert.match(files.requests, /minHeight="minimal"/);
  assert.match(files.pollsCss, /\.choiceMark svg\{[^}]*display:block[^}]*translateY\(-1\.5px\)/s);
});

test("the blue theme colours the upper edge of autonomous cards", () => {
  assert.match(files.forumTheme, /Autonomous cards[\s\S]*border-top-color:\s*var\(--surface-header-accent\)/);
});

test("administration cards stay on the shared primitives and equal-height grid", () => {
  assert.match(files.guide, /Contrato verificável dos cartões administrativos/);
  assert.match(files.guide, /mesma altura/);
  assert.match(files.adminUi, /\.sectionGrid\s*\{[^}]*align-items:\s*stretch/s);
  assert.match(files.adminUi, /\.section\s*\{[^}]*height:\s*100%/s);
  for (const component of [files.auditHistory, files.communityDashboard, files.ticketAdmin]) {
    assert.match(component, /AdminSection/);
    assert.match(component, /AdminEmptyState/);
    assert.doesNotMatch(component, /className=(?:"|\{`)[^"`]*(?:panel__header|empty-state)/);
  }
  assert.doesNotMatch(files.auditHistory, /className="panel audit-panel"/);
  assert.doesNotMatch(files.adminControl, /preferenceWindows|preference_windows|class-deadline-settings/);
});

test("quiz and curricular-unit headers do not introduce dark promotional heroes", () => {
  for (const css of featureStyles) {
    assert.doesNotMatch(css, /linear-gradient\([^)]*#173f5f/i);
    assert.doesNotMatch(css, /radial-gradient\(circle at 8[68]% 1?0?%/i);
    assert.doesNotMatch(css, /box-shadow:\s*0 1[4-9]px 2[4-9]px rgba\(23,\s*63,\s*95/i);
  }
});

test("page width remains stable when vertical overflow changes", () => {
  assert.match(files.globals, /html\s*\{[^}]*scrollbar-gutter:\s*stable/s);
});

test("quiz and curricular-unit pages use the same workspace alignment", () => {
  assert.match(files.quizHub, /^\.page\s*\{[^}]*width:\s*100%/s);
  assert.doesNotMatch(files.quizHub, /^\.page\s*\{[^}]*margin:\s*0 auto/s);
  assert.doesNotMatch(files.quizHub, /^\.page\s*\{[^}]*1320px/s);
});

test("new feature cards use the shared light surfaces and borders", () => {
  assert.match(files.quizHub, /\.modeCard\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)/s);
  assert.match(files.quizAdmin, /\.statGrid\s+:global\(\.stat-card\)\s*\{/s);
  assert.match(files.unitsCatalog, /\.card,\s*\.catalogCard\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)/s);
  assert.match(files.unitsAdmin, /\.unitGrid\s*\{[^}]*background:\s*var\(--surface\)/s);
  assert.match(files.unitsAdmin, /\.unit(?:Entry|Card)\s*\{[^}]*border-(?:top|bottom):\s*1px solid var\(--line\)/s);
});

test("the public curricular-unit catalogue follows the shared panel header anatomy", () => {
  assert.match(files.unitsCatalog, /\.catalogPanel\s*\{[^}]*var\(--surface-header-accent-size\)[^}]*var\(--surface-header-accent\)/s);
  assert.match(files.unitsCatalog, /\.panelIcon\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s);
  assert.match(files.unitsCatalog, /\.catalogToolbar\s*\{[^}]*grid-template-columns:/s);
});
