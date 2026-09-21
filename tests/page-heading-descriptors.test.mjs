import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = Object.fromEntries(await Promise.all([
  "academic-calendar",
  "announcements-board",
  "campus-directory",
  "documents-library",
  "learning-hub",
  "material-library",
  "notifications-center",
  "personal-dashboard",
  "placement-workbench",
  "polls-hub",
  "requests-center",
  "useful-links",
  "global-search",
  "curricular-unit-catalog",
  "admin-ui",
].map(async (name) => [name, await readFile(new URL(`../components/${name}.tsx`, import.meta.url), "utf8")])));

test("os cabeçalhos principais não mostram descritores por baixo do título", () => {
  const forbidden = [
    ["academic-calendar", /community\.calendar\.description/],
    ["announcements-board", /announcements\.intro/],
    ["campus-directory", /campus\.intro/],
    ["learning-hub", /Uma explicação curta, um exercício relacionado/],
    ["material-library", /community\.materials\.description/],
    ["notifications-center", /notifications\.description/],
    ["personal-dashboard", /personalDashboard\.description/],
    ["polls-hub", /polls\.intro/],
    ["requests-center", /requests\.intro/],
    ["useful-links", /links\.description/],
    ["global-search", /search\.intro/],
    ["placement-workbench", /Seleciona um rascunho e revê os estudantes desse cenário|Resolve os bloqueadores, compara rascunhos privados/],
  ];

  for (const [name, pattern] of forbidden) {
    assert.doesNotMatch(sources[name], pattern, `${name} voltou a renderizar um descritor de página`);
  }

  assert.doesNotMatch(sources["documents-library"], /Consulta atas, regulamentos, formulários e outros documentos úteis/);
  assert.doesNotMatch(sources["curricular-unit-catalog"], /community\.units\.detailDescription/);
  assert.doesNotMatch(sources["admin-ui"], /description && <p>\{description\}<\/p>/);
});
