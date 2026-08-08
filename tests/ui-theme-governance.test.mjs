import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  globals: await readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  guide: await readFile(new URL("../docs/AI-UI-DESIGN-GUIDE.md", import.meta.url), "utf8"),
  agents: await readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
  quizHub: await readFile(new URL("../components/quiz-hub.module.css", import.meta.url), "utf8"),
  quizAdmin: await readFile(new URL("../components/quiz-management.module.css", import.meta.url), "utf8"),
  unitsCatalog: await readFile(new URL("../components/curricular-unit-catalog.module.css", import.meta.url), "utf8"),
  unitsAdmin: await readFile(new URL("../components/curricular-units-management.module.css", import.meta.url), "utf8"),
};

const featureStyles = [files.quizHub, files.quizAdmin, files.unitsCatalog, files.unitsAdmin];

test("future UI work is explicitly routed through the platform design guide", () => {
  assert.match(files.agents, /docs\/AI-UI-DESIGN-GUIDE\.md/);
  assert.match(files.guide, /\/admin\//);
  assert.match(files.guide, /turmas-dashboard\.tsx/);
  assert.match(files.guide, /app\/globals\.css/);
  assert.match(files.guide, /Anatomia obrigatória dos cartões/);
  assert.match(files.guide, /Processo obrigatório de QA visual/);
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

test("new feature cards use the shared light surfaces and borders", () => {
  assert.match(files.quizHub, /\.modeCard\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)/s);
  assert.match(files.quizAdmin, /\.statGrid\s+:global\(\.stat-card\)\s*\{/s);
  assert.match(files.unitsCatalog, /\.card,\s*\.catalogCard\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)/s);
  assert.match(files.unitsAdmin, /\.unitGrid\s*\{[^}]*background:\s*var\(--surface\)/s);
  assert.match(files.unitsAdmin, /\.unitEntry\s*\{[^}]*border-bottom:\s*1px solid var\(--line\)/s);
});
