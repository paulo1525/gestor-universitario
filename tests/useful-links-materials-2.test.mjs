import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modules = readFileSync(new URL("../lib/app-modules.ts", import.meta.url), "utf8");
const links = readFileSync(new URL("../components/useful-links.tsx", import.meta.url), "utf8");
const materials = readFileSync(new URL("../components/material-library.tsx", import.meta.url), "utf8");
const messages = readFileSync(new URL("../lib/i18n-links.ts", import.meta.url), "utf8");

test("links úteis têm biblioteca e gestão independentes com filtros completos", () => {
  assert.match(links, /ModuleGuard moduleKey="useful_links\.library"/);
  assert.match(links, /useModuleEnabled\("useful_links\.management"\)/);
  for (const filter of ["query", "priorityFilter", "categoryFilter", "unitFilter", "visibilityFilter", "statusFilter"]) {
    assert.match(links, new RegExp(filter));
  }
  assert.match(links, /method: editingId \? "PUT" : "POST"/);
  assert.match(links, /method: action === "delete" \? "DELETE" : "PUT"/);
  assert.match(links, /rel="noopener noreferrer"/);
});

test("links úteis usam os valores validados pela API", () => {
  assert.match(links, /\["urgent", "important", "normal"\]/);
  assert.match(links, /\["academic", "platform", "curricular_unit", "support", "association", "other"\]/);
  assert.match(links, /\["students", "cc", "public"\]/);
});

test("materiais 2.0 separa favoritos, feedback e versões", () => {
  for (const key of ["materials.favorites", "materials.feedback", "materials.versioning"]) {
    assert.match(modules, new RegExp(`key: "${key.replaceAll(".", "\\.")}"`));
    assert.match(materials, new RegExp(`useModuleEnabled\\("${key.replaceAll(".", "\\.")}"\\)`));
  }
  assert.match(materials, /helpfulByMe/);
  assert.match(materials, /reportedOutdatedByMe/);
  assert.match(materials, /api\/material-favorites/);
  assert.match(materials, /api\/material-feedback/);
  assert.match(materials, /api\/material-submissions\/\$\{encodeURIComponent\(item\.id\)\}\/versions/);
  assert.match(materials, /method: "POST"/);
  assert.match(materials, /changeNote: versionNotes\.trim\(\)/);
});

test("novas áreas têm traduções portuguesas e inglesas", () => {
  for (const key of [
    "links.allVisibilities",
    "links.allStatuses",
    "links.category.curricular_unit",
    "community.materials.loadingVersions",
    "community.materials.versionsError",
  ]) {
    assert.equal(messages.split(`"${key}"`).length - 1, 2, `${key} deve existir em pt-PT e en`);
  }
});
