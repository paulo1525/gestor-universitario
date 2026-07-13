import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0020_modules_announcements_curricular_units.sql", import.meta.url), "utf8");
const definitions = readFileSync(new URL("../lib/app-modules.ts", import.meta.url), "utf8");
const moduleUi = readFileSync(new URL("../components/module-management.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const announcementsUi = readFileSync(new URL("../components/announcements-board.tsx", import.meta.url), "utf8");
const topbarSearch = readFileSync(new URL("../components/topbar-global-search.tsx", import.meta.url), "utf8");
const directoryUi = readFileSync(new URL("../components/commission-directory.tsx", import.meta.url), "utf8");
const urgentBanner = readFileSync(new URL("../components/urgent-announcement-banner.tsx", import.meta.url), "utf8");
const announcementContent = readFileSync(new URL("../lib/announcement-content.ts", import.meta.url), "utf8");
const curricularUi = readFileSync(new URL("../components/curricular-units-management.tsx", import.meta.url), "utf8");

function section(start, end) {
  const from = worker.indexOf(start), to = worker.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Secção em falta: ${start}`);
  assert.notEqual(to, -1, `Limite em falta: ${end}`);
  return worker.slice(from, to);
}

const modules = section("async function moduleStates", "function moduleDisabled");
const announcements = section("async function handleAnnouncements", "type CurricularUnitInput");
const curricularUnits = section("async function handleCurricularUnits", "async function routeApi");
const routes = section("async function routeApi", "export default");

test("módulos e submódulos têm controlo persistente e exclusivo do administrador principal", () => {
  assert.match(definitions, /parentKey: "classes"/);
  assert.match(definitions, /parentKey: "announcements"/);
  assert.match(definitions, /parentKey: "curricular_units"/);
  assert.match(modules, /normalizeEmail\(user\.email\) !== PERMANENT_ADMIN_EMAIL/);
  assert.match(modules, /app_module_updated/);
  assert.match(moduleUi, /up202507850@up\.pt/);
  assert.match(moduleUi, /Inativo por herança/);
  assert.match(migration, /CREATE TABLE app_module_settings/);
});

test("rotas existentes são bloqueadas no backend quando o respetivo submódulo está desligado", () => {
  assert.match(routes, /isModuleEnabled\(env,"classes\.preferences"\)/);
  assert.match(routes, /isModuleEnabled\(env,"classes\.rosters"\)/);
  assert.match(routes, /isModuleEnabled\(env,"classes\.placements"\)/);
  assert.match(routes, /moduleDisabled\(\)/);
  assert.match(shell, /moduleAccess\["classes\.placements"\]/);
  assert.match(shell, /hasCommunication&&<div className="nav-section"/);
  assert.match(shell, /hasAcademicLife&&<div className="nav-section"/);
  assert.match(shell, /hasCommunity&&<div className="nav-section"/);
});

test("qualquer membro com cargo CC pode publicar e o cargo fica registado no aviso", () => {
  assert.match(announcements, /user\.commissionPosition/);
  assert.match(announcements, /author_position_code,author_position_label/);
  assert.match(announcements, /user\.commissionPositionLabel \|\| user\.commissionPosition/);
  assert.match(announcements, /announcement_published/);
  assert.match(migration, /author_position_label TEXT NOT NULL/);
});

test("comunicados lideram a navegação, têm editor isolado e um urgente global descartável", () => {
  assert.ok(shell.indexOf('nav-label">Comunicação') < shell.indexOf('nav-label">Turmas'));
  assert.match(shell, /UrgentAnnouncementBanner/);
  assert.match(shell, /active !== "announcements"/);
  assert.match(urgentBanner, /dismissed-urgent-announcement/);
  assert.match(urgentBanner, /sessionStorage/);
  assert.match(urgentBanner, /Promise\.all/);
  assert.match(urgentBanner, /priority === "urgent"/);
  assert.match(announcementsUi, /contentEditable/);
  assert.match(announcementsUi, /!editorOpen && <section/);
  assert.doesNotMatch(announcementsUi, /Canal oficial da Comissão de Curso/);
  assert.match(announcementContent, /escapeHtmlText/);
  assert.match(announcementContent, /allowedTags\.has\(tag\)/);
  assert.match(announcementContent, /\[\^<\]\+\|</);
  assert.match(worker, /sanitizeAnnouncementHtml/);
});

test("comunicados podem ser pesquisados, filtrados e paginados", () => {
  assert.match(announcementsUi, /searchQuery/);
  assert.match(announcementsUi, /priorityFilter/);
  assert.match(announcementsUi, /authorFilter/);
  assert.match(announcementsUi, /paginatedAnnouncements/);
  assert.match(announcementsUi, /aria-label="Paginação dos comunicados"/);
  assert.match(announcementsUi, /Limpar filtros/);
});

test("a pesquisa global ocupa a barra superior e o diretório apresenta responsabilidades", () => {
  assert.match(shell, /TopbarGlobalSearch/);
  assert.doesNotMatch(shell, /href="\/pesquisa"><Search/);
  assert.match(topbarSearch, /role="search"/);
  assert.match(topbarSearch, /Ctrl K/);
  assert.match(directoryUi, /Unidades acompanhadas/);
  assert.match(directoryUi, /mailto:/);
});

test("unidades curriculares são geridas apenas pelo Núcleo e validam o representante CC", () => {
  assert.match(curricularUnits, /if \(!isManagementCore\(user\)\)/);
  assert.match(curricularUnits, /commission_position IS NOT NULL/);
  assert.match(curricularUnits, /curricular_unit_created/);
  assert.match(curricularUnits, /curricular_unit_updated/);
  assert.match(migration, /ects REAL NOT NULL CHECK \(ects > 0 AND ects <= 60\)/);
  assert.match(migration, /representative_user_id TEXT NOT NULL REFERENCES users\(id\)/);
  assert.match(curricularUi, /styles\.unitEntry/);
  assert.match(curricularUi, /<AppToast/);
  assert.match(moduleUi, /<AppToast/);
  assert.match(shell, /href="\/admin\/modulos"/);
});
