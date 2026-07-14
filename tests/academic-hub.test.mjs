import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/0021_academic_hub.sql", import.meta.url), "utf8");
const modules = readFileSync(new URL("../lib/app-modules.ts", import.meta.url), "utf8");
const backend = readFileSync(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const requests = readFileSync(new URL("../components/requests-center.tsx", import.meta.url), "utf8");
const requestStyles = readFileSync(new URL("../components/requests-center.module.css", import.meta.url), "utf8");
const materials = readFileSync(new URL("../components/material-library.tsx", import.meta.url), "utf8");
const polls = readFileSync(new URL("../components/polls-hub.tsx", import.meta.url), "utf8");
const directory = readFileSync(new URL("../components/commission-directory.tsx", import.meta.url), "utf8");
const unitCatalog = readFileSync(new URL("../components/curricular-unit-catalog.tsx", import.meta.url), "utf8");
const search = readFileSync(new URL("../components/global-search.tsx", import.meta.url), "utf8");
const topbarSearch = readFileSync(new URL("../components/topbar-global-search.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../components/academic-calendar.tsx", import.meta.url), "utf8");

test("o hub académico está dividido em módulos e submódulos independentes", () => {
  for (const key of [
    "calendar.events", "calendar.management", "documents.library", "documents.management",
    "requests.submission", "requests.management", "directory.members", "curricular_units.detail",
    "polls.voting", "polls.management", "dashboard.analytics", "search.global",
    "materials.library", "materials.submission", "materials.moderation",
  ]) assert.match(modules, new RegExp(`key: "${key.replaceAll(".", "\\.")}"`));
  assert.ok(shell.indexOf('href="/avisos"') < shell.indexOf('href="/pedidos"'));
  assert.match(shell, /overflow-y: auto|nav-list/);
});

test("a migration cria calendário, arquivo, pedidos, inquéritos e materiais moderados", () => {
  for (const table of ["academic_events", "academic_documents", "course_requests", "polls", "poll_questions", "poll_options", "poll_participations", "poll_votes", "material_submissions"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  }
  assert.match(migration, /anonymous INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration, /voter_hash TEXT NOT NULL/);
});

test("pedidos e materiais suportam anonimato sem expor normalmente a identidade", () => {
  assert.match(backend, /row\.anonymous === 1 && isPrimary\(viewer\)/);
  assert.match(backend, /row\.anonymous === 1 && isPrimary\(user\)/);
  assert.match(requests, /requests\.form\.anonymous/);
  assert.match(requests, /requests\.form\.identified/);
  assert.match(materials, /community\.materials\.anonymous/);
  assert.match(materials, /community\.materials\.moderationInfo/);
  assert.match(backend, /materials\.moderation/);
});

test("pedidos podem ser apagados pelo gestor ou pelo autor com confirmação e auditoria", () => {
  assert.match(backend, /SELECT id,subject,submitted_by FROM course_requests WHERE id=\?/);
  assert.match(backend, /if \(!managing && !owns\)/);
  assert.match(backend, /DELETE FROM course_requests WHERE id=\? AND submitted_by=\?/);
  assert.match(backend, /JSON\.stringify\(\{ id, subject: String\(current\.subject\) \}\)/);
  assert.match(backend, /course_request_deleted/);
  assert.match(requests, /method: "DELETE"/);
  assert.match(requests, /requests\.delete\.confirm/);
  assert.match(requests, /deleteTarget/);
  assert.match(requestStyles, /\.dialogBackdrop/);
  assert.match(requestStyles, /\.deleteConfirm/);
});

test("os votos são anónimos, impedem duplicados e validam opções", () => {
  assert.match(backend, /async function voterHash/);
  assert.match(backend, /INSERT INTO poll_participations/);
  assert.match(backend, /Já respondeu a este inquérito/);
  assert.match(backend, /Opção de resposta inválida/);
  assert.match(polls, /polls\.anonymousVote/);
});

test("a gestão de inquéritos permite edição segura sem corromper votos", () => {
  assert.match(backend, /request\.method === "PATCH" \|\| request\.method === "PUT"/);
  assert.match(backend, /As opções e o tipo de resposta não podem ser alterados depois de existirem votos/);
  assert.match(backend, /poll_updated/);
  assert.match(polls, /polls\.editor\.edit/);
  assert.match(polls, /optionsLocked/);
  assert.match(polls, /polls\.save\.updated/);
  assert.match(backend, /request\.method === "DELETE"/);
  assert.match(backend, /poll_deleted/);
  assert.match(polls, /polls\.delete\.confirm/);
  assert.match(polls, /deleteTarget/);
});

test("diretório e áreas de UC usam users e agregam informação académica", () => {
  assert.match(backend, /u\.email/);
  assert.match(backend, /representative_user_id/);
  assert.match(backend, /announcement_curricular_units/);
  assert.match(directory, /community\.directory\.sync/);
  assert.match(unitCatalog, /community\.units\.upcoming/);
  assert.match(unitCatalog, /community\.units\.documents/);
});

test("calendário, dashboard e pesquisa têm contratos funcionais e ligações reais", () => {
  assert.match(backend, /function timestamp/);
  assert.match(backend, /conflicts:/);
  assert.match(backend, /activeAnnouncements/);
  assert.match(backend, /engagement:/);
  assert.match(backend, /hrefs/);
  assert.match(backend, /\/unidades-curriculares\//);
  assert.match(backend, /'class' AS type/);
  assert.match(backend, /\/turmas\//);
  assert.match(search, /api\/search\?q=/);
  assert.match(search, /search\.type\.class/);
  assert.match(topbarSearch, /class: "Turma"/);
  assert.match(topbarSearch, /return "Turmas"/);
});

test("calendar supports optimistic drag-and-drop rescheduling with an accessible fallback", () => {
  assert.match(calendar, /draggable=\{canManage/);
  assert.match(calendar, /onDrop=/);
  assert.match(calendar, /method: "PATCH"/);
  assert.match(calendar, /setEvents\(previousEvents\)/);
  assert.match(calendar, /type="date"/);
  assert.match(calendar, /community\.calendar\.reverted/);
});
