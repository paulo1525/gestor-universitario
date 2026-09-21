import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const confirmation = await readFile(new URL("../components/confirmation-dialog.tsx", import.meta.url), "utf8");
const calendar = await readFile(new URL("../components/academic-calendar.tsx", import.meta.url), "utf8");
const polls = await readFile(new URL("../components/polls-hub.tsx", import.meta.url), "utf8");
const requests = await readFile(new URL("../components/requests-center.tsx", import.meta.url), "utf8");
const campus = await readFile(new URL("../components/campus-directory.tsx", import.meta.url), "utf8");
const roster = await readFile(new URL("../components/class-roster-import.tsx", import.meta.url), "utf8");
const audit = await readFile(new URL("../components/audit-history.tsx", import.meta.url), "utf8");
const study = await readFile(new URL("../components/neuroanatomia-study.tsx", import.meta.url), "utf8");

test("o sistema modal partilha backdrop, superfície, cabeçalho, ações e foco visual", () => {
  assert.match(globals, /Unified application modal system/);
  assert.match(globals, /\[data-app-modal="modal"\]\[role="dialog"\]/);
  assert.match(globals, /\[data-app-modal-footer\] \.button--primary/);
  assert.match(globals, /\[data-app-modal-action="secondary"\]/);
  assert.match(globals, /\.confirm-dialog\[role="dialog"\]/);
  assert.match(globals, /\.audit-modal\[role="dialog"\]/);
  assert.match(globals, /dialog\[data-app-modal-native\]::backdrop/);
});

test("as modais principais usam o chrome comum", () => {
  for (const source of [confirmation, calendar, campus, roster, audit]) {
    assert.match(source, /data-app-modal="modal"/);
    assert.match(source, /data-app-modal-header/);
  }
  assert.match(confirmation, /data-app-modal-footer/);
  assert.match(calendar, /data-app-modal-footer/);
  assert.match(campus, /data-app-modal-footer="embedded"/);
  assert.match(roster, /data-app-modal-body/);
  assert.match(audit, /data-app-modal-body/);
});

test("confirmações de inquéritos e pedidos reutilizam o componente modal comum", () => {
  assert.match(polls, /<ConfirmationDialog/);
  assert.match(requests, /<ConfirmationDialog/);
  assert.doesNotMatch(polls, /className=\{styles\.confirmBackdrop\}/);
  assert.doesNotMatch(requests, /className=\{styles\.dialogBackdrop\}/);
});

test("as modais do calendário usam ações compactas e cancelamento sem ícone redundante", () => {
  assert.match(calendar, /data-app-modal-size="wide"/);
  assert.doesNotMatch(calendar, /<X \/>Cancelar<\/button>/);
  assert.match(calendar, />Cancelar<\/button>/);
  assert.match(calendar, /Guardar evento/);
});

test("os diálogos de estudo mantêm o comportamento nativo com backdrop comum", () => {
  assert.match(study, /data-app-modal-native/);
  assert.match(study, /data-app-modal-lightbox/);
});
