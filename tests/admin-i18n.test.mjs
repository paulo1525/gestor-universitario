import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ADMIN_MESSAGES, adminDataLabel } from "../lib/i18n-admin.ts";

const COMPONENTS = [
  "components/audit-history.tsx",
  "components/module-management.tsx",
  "components/admin-control.tsx",
  "components/community-admin-dashboard.tsx",
];

test("admin message catalogues have matching keys", () => {
  const portugueseKeys = Object.keys(ADMIN_MESSAGES["pt-PT"]).sort();
  const englishKeys = Object.keys(ADMIN_MESSAGES.en).sort();
  assert.deepEqual(englishKeys, portugueseKeys);
  assert.ok(portugueseKeys.length >= 140);
});

test("technical audit and module labels are humanised in both languages", () => {
  assert.equal(adminDataLabel("pt-PT", "action", "distribution_manual_override"), "Destino final alterado manualmente");
  assert.equal(adminDataLabel("en", "action", "distribution_manual_override"), "Final destination manually changed");
  assert.equal(adminDataLabel("pt-PT", "detail", "commissionDepartment"), "Núcleo da Comissão de Curso");
  assert.equal(adminDataLabel("en", "detail", "commissionDepartment"), "Course Committee group");
  assert.equal(adminDataLabel("pt-PT", "value", "information_needed"), "A aguardar informação");
  assert.equal(adminDataLabel("en", "value", "information_needed"), "Awaiting information");
  assert.equal(adminDataLabel("en", "module", "materials.moderation"), "Materials moderation");
  assert.equal(adminDataLabel("en", "moduleDescription", "materials.moderation"), "Review, approve or reject before publication.");
});

test("all administrative components consume the shared i18n context", async () => {
  for (const path of COMPONENTS) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /useI18n\(\)/, `${path} must use the shared i18n context`);
    assert.match(source, /admin\./, `${path} must use administrative catalogue keys`);
  }
});
