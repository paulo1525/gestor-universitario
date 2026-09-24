import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/0023_material_submission_attachments.sql", import.meta.url), "utf8");
const backend = readFileSync(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const uploadForm = readFileSync(new URL("../components/material-upload-form.tsx", import.meta.url), "utf8");
const uploadRules = readFileSync(new URL("../lib/material-upload.ts", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../scripts/setup-local-test.mjs", import.meta.url), "utf8");

test("private exam photos use multiple attachments and stay out of the public library", () => {
  assert.match(migration, /CREATE TABLE material_submission_attachments/);
  assert.match(migration, /REFERENCES material_submissions\(id\) ON DELETE CASCADE/);
  assert.match(backend, /m\.material_type!='exam_photo'/);
  assert.match(backend, /submission\?\.material_type === "exam_photo" && status === "published"/);
  assert.match(backend, /photos\.slice\(1\)/);
  assert.match(uploadForm, /community\.materials\.category\.exam/);
  assert.match(uploadForm, /row\.kind === "image"[^\n]*community\.materials\.privateNotice/);
  assert.match(fixture, /local-exam-photo-3/);
});

test("photo batches enforce count and per-file limits", () => {
  assert.match(uploadRules, /MATERIAL_MAX_EXAM_PHOTOS = 20/);
  assert.match(uploadRules, /image: 10 \* MB/);
  // The legacy inline endpoint keeps its own stricter limits.
  assert.match(backend, /photos\.length > 8/);
  assert.match(backend, /item\.parsed\.bytes > 5 \* 1024 \* 1024/);
  assert.match(backend, /> 24 \* 1024 \* 1024/);
});
