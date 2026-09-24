import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js/dist/sql-asm.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const worker = read("worker/academic-hub.ts");
const tree = read("components/useful-links-tree.tsx");
const treeCss = read("components/useful-links-tree.module.css");
const editor = read("components/useful-link-editor.tsx");
const shell = read("components/app-shell.tsx");
const publicPage = read("app/links-uteis/page.tsx");
const managementPage = read("app/links-uteis/gerir/page.tsx");
const migration = read("migrations/0069_useful_links_requires_login.sql");
const messages = read("lib/i18n-links.ts");

const handler = worker.slice(worker.indexOf("async function usefulLinks("), worker.indexOf("async function personalDashboard("));
const anonymousScope = worker.match(/const USEFUL_LINKS_ANONYMOUS_SCOPE = "([^"]+)";/)?.[1];

test("a página pública de links é um linktree fora da AppShell e sem AuthGuard", () => {
  assert.match(publicPage, /<UsefulLinksTree \/>/);
  assert.doesNotMatch(tree, /AuthGuard|<AppShell|ModuleGuard/);
  assert.match(tree, /logo-comissao-curso-fmup-2025-2031-transparente\.png/);
  assert.match(tree, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(tree, /LoaderCircle|animation/);
  assert.doesNotMatch(treeCss, /animation|#[0-9a-f]{3,6}\b/i, "o linktree usa apenas tokens do tema");
  assert.match(treeCss, /max-width: 480px/);
  assert.match(treeCss, /:global\(html\[data-theme="forum"\]\) \.chip/);
});

test("a gestão acontece no próprio linktree, sem sair da página", () => {
  assert.match(managementPage, /redirect\(novo === "1" \? "\/links-uteis\/\?novo=1" : "\/links-uteis\/"\)/);
  assert.doesNotMatch(tree, /router\.push|href=\{?["`]\/links-uteis\/gerir/);
  assert.match(tree, /useFloatingAction\(state\.canManage && !editor \? \{ id: "new-link"/);
  assert.match(tree, /<UsefulLinkEditor /);
  assert.match(tree, /<ConfirmationDialog /);
  assert.doesNotMatch(tree, /archive/i, "arquivar deixou de existir na interface");
  assert.match(tree, /state\.canManage && item\.requiresLogin && <Lock/);
  // Row order: [chip + text link] [edit] [delete] [↗]; the actions are siblings of the links, never nested.
  assert.match(tree, /<a className=\{styles\.link\}[\s\S]*?<\/a>\s*\{state\.canManage && \(\s*<span className=\{styles\.itemActions\}>[\s\S]*?<Pencil[\s\S]*?<Trash2[\s\S]*?<\/span>\s*\)\}\s*<a className=\{styles\.arrowLink\}[^>]*tabIndex=\{-1\} aria-hidden="true"><ArrowUpRight/);
  assert.match(tree, /event\.stopPropagation\(\); openEdit\(item\)/);
  assert.match(tree, /useState\(wantsCreate\)/);
  // Always visible: no hover/opacity reveal.
  assert.doesNotMatch(treeCss, /hover: none|\.itemActions[^{]*\{[^}]*opacity/);
  assert.match(treeCss, /\.itemAction \{[^}]*width: 28px;[^}]*height: 28px;/);
});

test("o editor de links é um modal leve do sistema global", () => {
  assert.match(editor, /data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true"/);
  assert.match(editor, /data-app-modal-header/);
  assert.match(editor, /data-app-modal-body/);
  assert.match(editor, /data-app-modal-footer/);
  assert.match(editor, /useEscapeKey\(open, dismiss\)/);
  assert.match(editor, /keepFocusInside/);
  for (const key of ["links.field.title", "links.field.link", "links.field.description", "links.field.category", "links.field.requiresLogin", "links.field.ccOnly", "links.field.highlight"]) assert.match(editor, new RegExp(`t\\("${key.replaceAll(".", "\\.")}"\\)`));
  assert.doesNotMatch(editor, /<textarea|links\.field\.(priority|status|visibility|unit)|SurfaceHeader|lucide-react/);
  // Same family as the cookie preferences and ConfirmationDialog: shared frame and form actions.
  assert.match(editor, /className="app-modal-backdrop" data-app-modal-backdrop/);
  assert.match(editor, /<header className="app-modal-header" data-app-modal-header><h2 id=\{titleId\}>[^<]*<\/h2><FormCloseButton /);
  assert.match(editor, /<CancelButton [^>]*>\{t\("links\.cancel"\)\}<\/CancelButton>\s*<SubmitButton busy=\{busy\}>/);
  // The module only lays the form out; controls are styled by the global modal rules.
  assert.doesNotMatch(treeCss, /\.(field|check)[^{]*\b(input|select)\b[^{]*\{/);
  assert.doesNotMatch(treeCss, /^\.(backdrop|dialog|fieldLabel) \{/m);
});

test("a entrada lateral abre o linktree num novo separador", () => {
  assert.match(shell, /<a className=\{`\$\{adminNavigationStyles\.item\}[^`]*`\} href="\/links-uteis\/" target="_blank" rel="noopener noreferrer" onClick=\{\(\) => setOpen\(false\)\}><Link2\/><span>\{t\("links\.nav\.title"\)\}<\/span><ExternalLink /);
});

test("a migração acrescenta requires_login e torna os links existentes visíveis, exceto os da CC", () => {
  assert.match(migration, /ALTER TABLE useful_links ADD COLUMN requires_login INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /UPDATE useful_links SET requires_login = 1 WHERE visibility = 'cc'/);
  assert.match(migration, /UPDATE useful_links SET requires_login = 0, visibility = 'public' WHERE visibility <> 'cc'/);
});

test("o GET anónimo chega ao handler e filtra requires_login no servidor", () => {
  assert.ok(anonymousScope, "falta o filtro anónimo partilhado");
  assert.match(anonymousScope, /l\.requires_login=0/);
  assert.match(anonymousScope, /l\.status='published'/);
  assert.match(handler, /if \(!user && mutation\) return unauthenticated\(\);/);
  assert.doesNotMatch(handler.split("\n")[1], /if \(!user\) return unauthenticated\(\);/, "o GET anónimo não pode ser rejeitado antes do filtro");
  assert.match(handler, /const scope = !user \? USEFUL_LINKS_ANONYMOUS_SCOPE :/);
  assert.match(handler, /enabled\(management \? "useful_links\.management" : "useful_links\.library"\)/);
  assert.match(handler, /if \(mutation && !canManage\) return forbidden\(\);/);
  assert.match(handler, /requires_login=\?/);
  assert.match(worker, /path === "\/api\/useful-links"/);
});

test("o filtro anónimo só devolve links públicos publicados", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const createTable = read("migrations/0024_personal_dashboard_notifications_links.sql").match(/CREATE TABLE useful_links \([\s\S]*?\n\);/)?.[0];
  assert.ok(createTable);
  db.run(createTable);
  const insert = (id, visibility, status) => db.run("INSERT INTO useful_links(id,title,url,visibility,status,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,'u','u',0,0)", [id, id, `https://example.test/${id}`, visibility, status]);
  insert("legacy-public", "public", "published");
  insert("legacy-students", "students", "published");
  insert("legacy-cc", "cc", "published");
  db.run(migration);
  db.run("INSERT INTO useful_links(id,title,url,visibility,requires_login,status,created_by,updated_by,created_at,updated_at) VALUES ('open','open','https://example.test/open','public',0,'published','u','u',0,0),('login','login','https://example.test/login','students',1,'published','u','u',0,0),('draft','draft','https://example.test/draft','public',0,'draft','u','u',0,0)");
  const ids = [];
  const query = db.prepare(`SELECT l.id FROM useful_links l WHERE ${anonymousScope} ORDER BY l.id`);
  while (query.step()) ids.push(query.getAsObject().id);
  query.free();
  assert.deepEqual(ids, ["legacy-public", "legacy-students", "open"]);
});

test("os novos textos dos links existem em pt-PT e en", () => {
  for (const key of ["links.field.requiresLogin", "links.requiresLogin", "links.tree.signIn", "links.opensInNewTab", "links.field.link", "links.field.ccOnly", "links.field.highlight", "links.saveShort", "links.deleteTitle", "links.deleteWarning"]) {
    assert.equal(messages.split(`"${key}"`).length - 1, 2, `${key} deve existir em pt-PT e en`);
  }
});
