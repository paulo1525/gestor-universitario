import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quizManagement = await readFile(new URL("../components/quiz-management.tsx", import.meta.url), "utf8");
const unitManagement = await readFile(new URL("../components/curricular-units-management.tsx", import.meta.url), "utf8");
const quizStyles = await readFile(new URL("../components/quiz-management.module.css", import.meta.url), "utf8");

test("quiz administration separates the main jobs into one local navigation", () => {
  assert.match(quizManagement, /type Section = "questions" \| "editor" \| "themes" \| "import" \| "activity"/);
  assert.match(quizManagement, /aria-label="Secções da gestão de testes"/);
  assert.match(quizManagement, />Perguntas<\/button>/);
  assert.match(quizManagement, />Temas<\/button>/);
  assert.match(quizManagement, />Importar CSV<\/button>/);
  assert.match(quizManagement, />Atividade<\/button>/);
  assert.match(quizManagement, /section === "questions" && <section/);
  assert.match(quizManagement, /section === "editor" && showEditor && <section/);
  assert.match(quizManagement, /section === "import" && <section/);
});

test("curricular-unit administration does not mix list and editor views", () => {
  assert.match(unitManagement, /useState<"list" \| "create" \| "edit">\("list"\)/);
  assert.match(unitManagement, /view === "create" && <section/);
  assert.match(unitManagement, /view === "edit" && editingId && <section/);
  assert.match(unitManagement, /view === "list" && <AdminSection/);
  assert.match(unitManagement, /representativeUserIds: \[\]/);
});

test("administrative subnavigation reuses the shared light surface", () => {
  assert.match(quizStyles, /\.sectionNav\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)/s);
  assert.doesNotMatch(quizStyles, /\.sectionNav\s*\{[^}]*linear-gradient/s);
});
