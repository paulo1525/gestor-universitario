import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (name) => readFile(new URL(`../components/${name}.tsx`, import.meta.url), "utf8");

test("os cabeçalhos principais mantêm o desenho atual sem descritores", async () => {
  const checks = [
    ["academic-calendar", /description=\{<>{t\("community\.calendar\.description"\)/],
    ["announcements-board", /description=\{t\("announcements\.intro"\)\}/],
    ["campus-directory", /description=\{t\("campus\.intro"\)\}/],
    ["material-library", /description=\{t\("community\.materials\.description"\)\}/],
    ["notifications-center", /description=\{t\("notifications\.description"\)\}/],
    ["polls-hub", /description=\{t\("polls\.intro"\)\}/],
    ["requests-center", /description=\{t\("requests\.intro"\)\}/],
    ["useful-links", /description=\{t\("links\.description"\)\}/],
    ["global-search", /description=\{t\("search\.intro"\)\}/],
  ];
  for (const [name, pattern] of checks) assert.doesNotMatch(await read(name), pattern, `${name} voltou a mostrar o descritor principal`);

  const documents = await read("documents-library");
  assert.doesNotMatch(documents, /description="Consulta atas, regulamentos, formulários e outros documentos úteis\."/);

  const learning = await read("learning-hub");
  assert.doesNotMatch(learning, /description="Uma explicação curta, um exercício relacionado, e depois o ciclo seguinte\."/);
});

test("a Área pessoal conserva o cabeçalho anterior e só perde o texto descritivo", async () => {
  const dashboard = await read("personal-dashboard");
  assert.match(dashboard, /<header className=\{styles\.heading\}>/);
  assert.match(dashboard, /className=\{styles\.headingIcon\}/);
  assert.doesNotMatch(dashboard, /personalDashboard\.description/);
});
