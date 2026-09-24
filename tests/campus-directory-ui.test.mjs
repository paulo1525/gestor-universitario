import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const campus = await readFile(new URL("../components/campus-directory.tsx", import.meta.url), "utf8");
const backend = await readFile(new URL("../worker/campus.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0071_campus_spaces.sql", import.meta.url), "utf8");
const messages = await readFile(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("salas e docentes é uma lista simples: sala, edifício (CIM ou Hospital São João), docente opcional e turmas", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS campus_spaces/);
  assert.match(migration, /building TEXT NOT NULL CHECK \(building IN \('cim', 'hsj'\)\)/);
  assert.match(migration, /teacher TEXT,/);
  assert.match(backend, /if \(entity === "space"\)/);
  assert.match(backend, /\["cim", "hsj"\]\.includes\(building\)/);
  assert.match(backend, /value >= 1 && value <= 20/);
  assert.match(campus, /t\("campus\.spaces\.room"\)/);
  assert.match(campus, /t\("campus\.spaces\.teacher"\)} <small>\(\{t\("common\.optional"\)\}\)<\/small>/);
  assert.match(campus, /t\("campus\.spaces\.classes"\)/);
  assert.match(messages, /"campus\.eyebrow": "Faculdade de Medicina"/);
  assert.match(messages, /"campus\.spaces\.building\.hsj": "Hospital São João"/);
});

test("salas e docentes segue o modelo lista → cartão, com gestão no menu flutuante", () => {
  assert.match(campus, /useHashRecord\("sala"\)/);
  assert.match(campus, /<RecordSkeleton /);
  assert.match(campus, /useFloatingAction\(canManage && !editor && !openId \? \{ id: "new-space"/);
  assert.match(campus, /<ConfirmationDialog/);
  assert.match(campus, /data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true"/);
  assert.match(campus, /useEscapeKey\(true, onClose\)/);
  assert.match(campus, /new URLSearchParams\(window\.location\.search\)\.get\("q"\)/);
});
