import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0031_curricular_unit_representatives.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const hub = await readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const seed = await readFile(new URL("../scripts/setup-local-test.mjs", import.meta.url), "utf8");

test("representatives are a zero-to-two relational assignment with a migrated legacy primary", () => {
  assert.match(migration, /CREATE TABLE curricular_unit_representatives/);
  assert.match(migration, /position INTEGER NOT NULL CHECK \(position IN \(1, 2\)\)/);
  assert.match(migration, /PRIMARY KEY \(curricular_unit_id, position\)/);
  assert.match(migration, /UNIQUE \(curricular_unit_id, user_id\)/);
  assert.match(migration, /SELECT id, representative_user_id, 1/);
  assert.match(migration, /DROP COLUMN representative_user_id/);
  assert.match(migration, /ADD COLUMN representative_user_id TEXT REFERENCES users/);
});

test("admin UC management accepts compatibility singular values and validates the collection", () => {
  assert.match(worker, /representativeUserIds/);
  assert.match(worker, /new Set\(representativeUserIds\)\.size !== representativeUserIds\.length/);
  assert.match(worker, /representativeUserIds\.length > 2/);
  assert.match(worker, /validCurricularUnitRepresentatives/);
  assert.match(worker, /representativeUserId: input\.representativeUserIds\[0\] \|\| null/);
  assert.match(worker, /DELETE FROM curricular_unit_representatives WHERE curricular_unit_id=\?/);
});

test("public catalog, details and directory membership use all assigned representatives", () => {
  assert.match(hub, /FROM curricular_unit_representatives cur/);
  assert.match(hub, /representatives, representativeUserIds/);
  assert.match(hub, /units\.filter\(\(unit\) => unit\.user_id === row\.id\)/);
  assert.match(hub, /department: representative\.department_label/);
});

test("local seed clears and exercises both representative positions", () => {
  assert.match(seed, /DELETE FROM curricular_unit_representatives/);
  assert.match(seed, /'local-primary-admin',1/);
  assert.match(seed, /'local-admin',2/);
});
