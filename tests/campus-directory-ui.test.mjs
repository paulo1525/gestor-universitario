import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const campus = await readFile(new URL("../components/campus-directory.tsx", import.meta.url), "utf8");
const campusStyles = await readFile(new URL("../components/campus-directory.module.css", import.meta.url), "utf8");
const backend = await readFile(new URL("../worker/campus.ts", import.meta.url), "utf8");

test("o diretório liga docentes às unidades curriculares e preserva metadados do campus", () => {
  assert.match(backend, /EXISTS \(SELECT 1 FROM campus_faculty_units/);
  assert.match(backend, /cu\.code LIKE \? OR cu\.name LIKE \?/);
  assert.match(backend, /b\.map_url AS building_map_url/);
  assert.match(backend, /b\.accessibility_notes AS building_accessibility_notes/);
  assert.match(campus, /href=\{unitHref\(unit\.id\)\}/);
  assert.match(campus, /externalUrl\(room\.building_map_url\)/);
});

test("o diretório usa padrões acessíveis para tabs, carregamento e editor", () => {
  assert.match(campus, /role="tablist"/);
  assert.match(campus, /aria-selected=\{tab === "rooms"\}/);
  assert.match(campus, /role="tabpanel"/);
  assert.match(campus, /role="status" aria-live="polite"/);
  assert.match(campus, /role="dialog" aria-modal="true"/);
  assert.match(campus, /useEscapeKey\(Boolean\(editor\), closeEditor\)/);
  assert.match(campus, /useScrollLock\(Boolean\(editor\)\)/);
  assert.match(campusStyles, /prefers-reduced-motion/);
  assert.match(campusStyles, /var\(--surface-card-border\)/);
});
