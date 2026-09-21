import assert from "node:assert/strict";
import test from "node:test";
import { isExamWorkflowTransitionAllowed } from "../lib/exam-workflow.mjs";

test("o fluxo de transcrição só avança ou recua uma etapa", () => {
  for (const [current, next] of [
    ["received", "transcribing"],
    ["transcribing", "reviewing"],
    ["reviewing", "imported"],
    ["imported", "archived"],
    ["reviewing", "transcribing"],
    ["imported", "reviewing"],
  ]) assert.equal(isExamWorkflowTransitionAllowed(current, next), true, `${current} → ${next}`);

  for (const [current, next] of [
    ["received", "imported"],
    ["transcribing", "imported"],
    ["reviewing", "archived"],
    ["archived", "reviewing"],
    ["unknown", "reviewing"],
  ]) assert.equal(isExamWorkflowTransitionAllowed(current, next), false, `${current} → ${next}`);
});

test("repetir a etapa atual é idempotente", () => {
  for (const status of ["received", "transcribing", "reviewing", "imported", "archived"]) {
    assert.equal(isExamWorkflowTransitionAllowed(status, status), true, status);
  }
});
