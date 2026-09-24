import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const backend = await readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const catalog = await readFile(new URL("../components/curricular-unit-catalog.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0058_community_campus_workflows.sql", import.meta.url), "utf8");

test("a curricular unit detail exposes active faculty linked to that unit", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS campus_faculty_units/);
  assert.match(backend, /FROM campus_faculty_units cfu JOIN campus_faculty f/);
  assert.match(backend, /cfu\.curricular_unit_id=\?/);
  assert.match(backend, /f\.active=1/);
  assert.match(backend, /facultyResult/);
  assert.match(backend, /faculty, representativeUserIds/);
});

test("the curricular unit page renders faculty contacts and links to the directory", () => {
  assert.match(catalog, /data\.unit\.faculty\.length > 0/);
  assert.match(catalog, /<SurfaceHeader icon=\{<GraduationCap \/>\} title=\{t\("community\.units\.faculty"\)\}/);
  assert.doesNotMatch(catalog, /community\.units\.facultyDescription/);
  assert.match(catalog, /href="\/salas-docentes"/);
  assert.match(catalog, /mailto:\$\{member\.email\}/);
  assert.match(catalog, /campus\.office/);
});
