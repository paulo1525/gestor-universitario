import * as materialFolders from '../lib/material-folders.ts';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import typescript from "typescript";
import { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory } from "../lib/material-categories.ts";

const source = readFileSync(new URL("../worker/materials-catalog.ts", import.meta.url), "utf8");
const compiled = typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText;
const exported = {};
vm.runInNewContext(compiled, {
  exports: exported,
  require(specifier) {
    if (specifier === "@/lib/material-folders") return materialFolders;
    if (specifier === "@/lib/material-categories") return { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory };
    if (specifier === "./material-views") return { materialViewCounts: async () => null };
    if (specifier === "@/worker/google-drive") return { driveConfigured: () => false, driveSyncStatus: async () => ({ configured: false }) };
    return {};
  },
  Request, Response, URL, crypto, TextEncoder, TextDecoder,
});

function database() {
  const catalog = MATERIAL_RESOURCE_CATEGORIES.map((category, index) => ({ id: `file-${index}`, title: `Original ${category}`, material_kind: "other", other_format: "slides", resource_category: category, mime_type: "application/pdf", storage_backend: "r2", storage_state: "ready", public_access: 0, unit_id: "unit-1", unit_code: "FIS1", unit_name: "Fisiologia I", study_year: 2, semester: 1 }));
  catalog.push({ ...catalog[0], id: "legacy", resource_category: null, title: "Legacy slides" });
  catalog.push({ ...catalog[0], id: "sebenta", resource_category: null, other_format: null, study_category: "sebenta", title: "Sebenta de Fisiologia I" });
  catalog.push({ ...catalog[0], id: "compendium", resource_category: null, other_format: "compendium", title: "Compêndio de Fisiologia I" });
  return { prepare(sql) { return { bind() { return this; }, async first() { return catalog[0]; }, async all() { return { results: sql.includes("FROM material_catalog m") ? catalog : [] }; } }; } };
}

test("as novas categorias prevalecem sobre slides e as categorias antigas mantêm-se", async () => {
  const url = new URL("https://example.test/api/public-materials");
  const response = await exported.handleMaterialsCatalogRoute(new Request(url), { DB: database() }, url, { id: "student", role: "student" }, async () => true);
  assert.equal(response.status, 200);
  const { units } = await response.json();
  const entries = units[0].entries;
  for (const category of MATERIAL_RESOURCE_CATEGORIES) assert.equal(entries.find((entry) => entry.title === `Original ${category}`).section, category);
  assert.equal(entries.find((entry) => entry.id === "legacy").section, "slides");
  assert.equal(entries.find((entry) => entry.id === "sebenta").section, "sebentas");
  assert.equal(entries.find((entry) => entry.id === "compendium").section, "compendiums");
});

test("os materiais docentes continuam protegidos para visitantes sem sessão", async () => {
  const url = new URL("https://example.test/api/public-materials");
  const response = await exported.handleMaterialsCatalogRoute(new Request(url), { DB: database() }, url, null, async () => true);
  const { units } = await response.json();
  for (const entry of units[0].entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["locked", "section"]);
    assert.equal(entry.locked, true);
  }
});

test("um link de download novo continua a exigir sessão", async () => {
  const url = new URL("https://example.test/api/material-catalog/file-0/download");
  const response = await exported.handleMaterialsCatalogRoute(new Request(url), { DB: database() }, url, null, async () => true);
  assert.equal(response.status, 401);
});
