import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const backend = await readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const searchUi = await readFile(new URL("../components/global-search.tsx", import.meta.url), "utf8");
const topbarSearch = await readFile(new URL("../components/topbar-global-search.tsx", import.meta.url), "utf8");
const messages = await readFile(new URL("../lib/i18n-public.ts", import.meta.url), "utf8");

test("a pesquisa global inclui salas, edifícios e docentes quando o diretório está ativo", () => {
  assert.match(backend, /enabled\("campus\.directory"\)/);
  for (const table of ["campus_buildings", "campus_rooms", "campus_faculty"]) {
    assert.match(backend, new RegExp(`FROM ${table}`));
  }
  for (const type of ["campus_building", "campus_room", "faculty"]) {
    assert.match(backend, new RegExp(`'${type}' AS type`));
    assert.ok(backend.includes(`${type}: campusHref`), `${type} needs a directory destination`);
  }
  assert.match(backend, /campusRows\.results/);
  for (const key of ["search.type.campusBuilding", "search.type.campusRoom", "search.type.faculty"]) {
    assert.match(searchUi, new RegExp(key.replaceAll(".", "\\.")));
    assert.match(topbarSearch, new RegExp(key.replaceAll(".", "\\.")));
    assert.match(messages, new RegExp(`"${key.replaceAll(".", "\\.")}"`));
  }
});
