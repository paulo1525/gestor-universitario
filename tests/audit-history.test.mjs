import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminDataLabel } from "../lib/i18n-admin.ts";

const auditHistory = readFileSync("components/audit-history.tsx", "utf8");

test("o histórico explica ações e detalhes administrativos nos dois idiomas", () => {
  for (const action of [
    "material_submission_moderated",
    "course_request_updated",
    "course_request_deleted",
    "app_module_updated",
    "academic_event_rescheduled",
    "distribution_published",
    "student_preferences_admin_updated",
  ]) {
    assert.ok(adminDataLabel("pt-PT", "action", action));
    assert.ok(adminDataLabel("en", "action", action));
  }

  assert.equal(adminDataLabel("pt-PT", "detail", "moduleKey"), "Módulo");
  assert.equal(adminDataLabel("en", "detail", "moduleKey"), "Module");
  assert.equal(adminDataLabel("pt-PT", "detail", "responseVisibility"), "Visibilidade da resposta");
  assert.equal(adminDataLabel("en", "detail", "responseVisibility"), "Response visibility");
  assert.equal(adminDataLabel("pt-PT", "detail", "proposalId"), "Proposta de colocação");
  assert.equal(adminDataLabel("en", "detail", "proposalId"), "Placement proposal");
  assert.match(auditHistory, /function flattenDetails/);
  assert.match(auditHistory, /t\("admin\.audit\.details"\)/);
  assert.match(auditHistory, /t\("admin\.audit\.actionDetails"\)/);
  assert.doesNotMatch(auditHistory, />Ver log</);
  assert.doesNotMatch(auditHistory, /<pre>/);
});
