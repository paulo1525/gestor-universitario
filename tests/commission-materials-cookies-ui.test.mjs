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
  assert.match(directory, /<FilterSegmented label=\{t\("community\.directory\.filter"\)\} value=\{department\}/);
  assert.match(directory, /filtersActive &&/);
  assert.match(directory, /<ul className=\{styles\.unitList\}>/);
  // One row per member in a single panel; the member's details open in a reading card.
  assert.match(directory, /<ul className=\{list\.rows\}>/);
  assert.match(directory, /className=\{`panel \$\{list\.reading\}`\}/);
  assert.match(directoryStyles, /text-overflow:\s*ellipsis/);
});

test("a biblioteca de materiais tem filtro identificado, editor isolado e registos compactos", () => {
  assert.match(materials, /<FilterSelect label=\{t\("community\.materials\.filter"\)\} value=\{filter\}/);
  assert.match(materials, /filter !== "all" \|\| query/);
  assert.match(materials, /setFilter\("all"\)/);
  assert.match(materials, /<MaterialUploadForm/);
  // Submissions: search + filter on top of one panel, one row per material, detail at #material-<id>.
  assert.match(materials, /\{activeTab === "exams" && !editor && !openId && <section className=\{`panel \$\{list\.listPanel\}`\}/);
  assert.match(materials, /<FilterSearch label=\{t\("community\.materials\.search"\)\}/);
  assert.match(materials, /href=\{recordHref\("material", item\.id\)\}/);
  assert.match(materials, /className=\{`panel \$\{list\.reading\}`\}/);
  assert.match(materials, /loadError/);
  assert.match(materials, /community\.materials\.catalog\.retry/);
  assert.match(materials, /<RecordSkeleton label=\{t\("community\.materials\.loading"\)\} \/>/);
  assert.doesNotMatch(materials, /LoaderCircle/);
  assert.match(materialStyles, /\.feedbackButton/);
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
