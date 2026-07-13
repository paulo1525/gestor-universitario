import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/0023_material_submission_attachments.sql", import.meta.url), "utf8");
const backend = readFileSync(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const materials = readFileSync(new URL("../components/material-library.tsx", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../scripts/setup-local-test.mjs", import.meta.url), "utf8");

test("private exam photos use multiple attachments and stay out of the public library", () => {
  assert.match(migration, /CREATE TABLE material_submission_attachments/);
  assert.match(migration, /REFERENCES material_submissions\(id\) ON DELETE CASCADE/);
  assert.match(backend, /m\.material_type!='exam_photo'/);
  assert.match(backend, /submission\?\.material_type === "exam_photo" && status === "published"/);
  assert.match(backend, /photos\.slice\(1\)/);
  assert.match(materials, /MultiFileUploadField/);
  assert.match(materials, /Fotos de exame\/frequ/);
  assert.match(materials, /nunca aparecem na biblioteca/);
  assert.match(fixture, /local-exam-photo-3/);
});

test("photo batches enforce count, per-file and total limits", () => {
  assert.match(materials, /MAX_PHOTOS = 8/);
  assert.match(materials, /MAX_PHOTO_TOTAL_SIZE = 24 \* 1024 \* 1024/);
  assert.match(backend, /photos\.length > 8/);
  assert.match(backend, /item\.parsed\.bytes > 5 \* 1024 \* 1024/);
  assert.match(backend, /> 24 \* 1024 \* 1024/);
});
