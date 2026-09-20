import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0056_curricular_unit_academic_content.sql", import.meta.url), "utf8");
const backend = await readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const modules = await readFile(new URL("../lib/app-modules.ts", import.meta.url), "utf8");
const publicUnit = await readFile(new URL("../components/curricular-unit-catalog.tsx", import.meta.url), "utf8");
const adminUnit = await readFile(new URL("../components/curricular-unit-academic-content-management.tsx", import.meta.url), "utf8");

test("a migration cria perfis por ano letivo, avaliação, exames e fontes", () => {
  for (const table of ["curricular_unit_academic_profiles", "curricular_unit_evaluations", "curricular_unit_exams", "curricular_unit_sources"]) assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  assert.match(migration, /UNIQUE \(curricular_unit_id, academic_year\)/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'a_validar'/);
  assert.match(migration, /CHECK \(status IN \('a_validar', 'verificado'\)\)/);
  assert.match(migration, /calendar_event_id TEXT REFERENCES academic_events/);
  assert.match(migration, /last_validated_at INTEGER/);
  assert.match(migration, /last_validated_by TEXT REFERENCES users/);
});

test("a frente académica tem módulos independentes para consulta e gestão", () => {
  assert.match(modules, /key: "curricular_units\.content"/);
  assert.match(modules, /key: "curricular_units\.content\.management"/);
  assert.match(backend, /curricular_units\.content\.management/);
  assert.match(backend, /curricular_units\.content/);
});

test("a API valida permissões, estado, fontes HTTPS, eventos da mesma UC e audita alterações", () => {
  assert.match(backend, /if \(management && !canManageCore\(user\)\) return forbidden\(\)/);
  assert.match(backend, /ACADEMIC_CONTENT_STATUSES/);
  assert.match(backend, /Cada exame tem de estar ligado a um evento do calendário da mesma unidade curricular/);
  assert.match(backend, /curricular_unit_academic_content_created/);
  assert.match(backend, /curricular_unit_academic_content_updated/);
  assert.match(backend, /curricular_unit_academic_content_verified/);
  assert.match(backend, /optionalHttps/);
  assert.match(backend, /\/api\/admin\/curricular-unit-content/);
  assert.match(backend, /academic-content/);
});

test("a UC pública expõe blocos com estado de validação e ligação ao calendário", () => {
  assert.match(publicUnit, /academicContent/);
  assert.match(publicUnit, /Informação académica/);
  assert.match(publicUnit, /ValidationBadge/);
  assert.match(publicUnit, /Presenças e faltas/);
  assert.match(publicUnit, /Frequências e exames/);
  assert.match(publicUnit, /Fontes e bibliografia/);
  assert.match(publicUnit, /href="\/calendario"/);
});

test("a gestão administrativa permite editar o perfil, avaliações, exames e fontes", () => {
  assert.match(adminUnit, /AdminSection/);
  assert.match(adminUnit, /attendanceRequired/);
  assert.match(adminUnit, /evaluations/);
  assert.match(adminUnit, /exams/);
  assert.match(adminUnit, /sources/);
  assert.match(adminUnit, /Guardar informação académica/);
  assert.match(adminUnit, /\/api\/admin\/curricular-unit-content/);
});
