import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const directory = readFileSync(new URL("../components/commission-directory.tsx", import.meta.url), "utf8");
const directoryStyles = readFileSync(new URL("../components/commission-directory.module.css", import.meta.url), "utf8");
const materials = readFileSync(new URL("../components/material-library.tsx", import.meta.url), "utf8");
const materialStyles = readFileSync(new URL("../components/material-library.module.css", import.meta.url), "utf8");
const cookies = readFileSync(new URL("../app/cookies/page.tsx", import.meta.url), "utf8");
const cookieStyles = readFileSync(new URL("../app/cookies/cookies.module.css", import.meta.url), "utf8");

test("o diretório expõe filtros acessíveis, limpeza contextual e cartões sem overflow", () => {
  assert.match(directory, /aria-pressed=\{department === "all"\}/);
  assert.match(directory, /filtersActive &&/);
  assert.match(directory, /<ul className=\{styles\.unitList\}>/);
  assert.match(directoryStyles, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(320px, 100%\), 1fr\)\)/);
  assert.match(directoryStyles, /text-overflow:\s*ellipsis/);
  assert.match(directoryStyles, /@media \(max-width: 440px\)/);
});

test("a biblioteca de materiais tem filtro identificado, editor isolado e registos compactos", () => {
  assert.match(materials, /className=\{styles\.filterLabel\}/);
  assert.match(materials, /filter !== "all" &&/);
  assert.match(materials, /setFilter\("all"\)/);
  assert.match(materials, /className=\{styles\.formWorkspace\}/);
  assert.match(materials, /\{!editor && <section className=\{styles\.panel\}>/);
  assert.match(materials, /className=\{styles\.materialHeader\}/);
  assert.match(materials, /className=\{styles\.cardActions\}/);
  assert.match(materials, /button--compact \$\{styles\.openMaterial\}/);
  assert.match(materialStyles, /\.stateIcon/);
  assert.match(materialStyles, /\.materialGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(materialStyles, /\.material\s*\{[^}]*grid-template-columns:\s*112px minmax\(0, 1fr\)/s);
  assert.match(materialStyles, /\.formWorkspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.4fr\) minmax\(320px, \.6fr\)/s);
  assert.match(materialStyles, /\.feedbackButton, \.versionActions button, \.materialBody \.cardActions > \.openMaterial\s*\{[^}]*min-height:\s*34px;[^}]*padding:\s*0 9px;[^}]*border-radius:\s*9px;[^}]*font-size:\s*9px/s);
  assert.match(materialStyles, /\.feedbackButton svg, \.versionActions svg, \.materialBody \.cardActions > \.openMaterial svg\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px/s);
  assert.doesNotMatch(materialStyles, /grid-template-rows:\s*155px 1fr/);
});

test("a política de cookies mantém o conteúdo e usa tabela semântica responsiva", () => {
  assert.match(cookies, /O Gestor Universitário utiliza cookies próprios necessários/);
  assert.match(cookies, /<table>/);
  assert.match(cookies, /<th scope="row"><code>__Host-gu_session<\/code><\/th>/);
  assert.match(cookies, /<th scope="row"><code>gu-placement-filters-v1<\/code><\/th>/);
  assert.match(cookies, /Não guarda pesquisas livres, nomes ou números de estudantes/);
  assert.match(cookies, /SameSite=Strict/);
  assert.match(cookieStyles, /@media \(max-width: 420px\)/);
  assert.match(cookieStyles, /\.tableWrap td::before/);
});
