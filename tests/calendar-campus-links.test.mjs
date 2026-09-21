import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const calendar = await readFile(new URL("../components/academic-calendar.tsx", import.meta.url), "utf8");
const campus = await readFile(new URL("../components/campus-directory.tsx", import.meta.url), "utf8");
const messages = await readFile(new URL("../lib/i18n-community.ts", import.meta.url), "utf8");

test("calendário liga locais físicos ao diretório de salas", () => {
  assert.match(calendar, /campusSearchHref\(location: string\)/);
  assert.match(calendar, /href=\{campusSearchHref\(item\.location\)\}/);
  assert.match(calendar, /community\.calendar\.openCampus/);
  assert.match(calendar, /isExternalLocation\(item\.location\)/);
  assert.match(campus, /new URLSearchParams\(window\.location\.search\)\.get\("q"\)/);
  assert.match(campus, /setQuery\(current => current \|\| preset\.slice\(0, 100\)\)/);
  assert.match(messages, /community\.calendar\.openCampus/);
});

test("eventos associados a uma unidade curricular abrem o respetivo detalhe", () => {
  assert.match(calendar, /unitHref\(unitId: string\)/);
  assert.match(calendar, /href=\{unitHref\(item\.unitId\)\}/);
  assert.match(calendar, /href=\{unitHref\(selectedEvent\.unitId\)\}/);
});


test("criação de eventos não expõe texto auxiliar sobre o fuso horário", () => {
  assert.doesNotMatch(calendar, /fuso horário de Lisboa/i);
});
