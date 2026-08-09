import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/admin-navigation.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../components/admin-navigation.module.css", import.meta.url), "utf8");

test("administration is reached from the profile menu instead of the academic navigation", () => {
  assert.match(shell, /user\?\.role === "admin"[^<]*&& <Link[^>]*href="\/admin"[^>]*role="menuitem"/s);
  assert.doesNotMatch(shell, /<span className="nav-label">\{t\("nav\.administration"\)\}<\/span>/);
  assert.match(shell, /administrativeContext \? <AdminNavigation active=\{active\} collapsed=\{sidebarCollapsed && !open\}/);
});

test("administrative navigation uses real routes and hierarchical groups", () => {
  for (const route of [
    "/admin/testes",
    "/admin/unidades-curriculares",
    "/admin/utilizadores",
    "/admin/configuracao",
    "/admin/modulos",
    "/admin/historico",
  ]) assert.match(navigation, new RegExp(`href: "${route}"`));
  assert.match(navigation, /aria-expanded=\{expanded\}/);
  assert.match(navigation, /aria-controls=\{`admin-navigation-\$\{group\.id\}`\}/);
  assert.match(navigation, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(navigation, /href="\/"[^>]*title=\{collapsed \? copy\.back/);
  assert.match(navigation, /const normalizedPathname = pathname\.replace\(\/\\\/\+\$\//);
});

test("collapsed and mobile navigation keep usable links", () => {
  assert.match(styles, /@media \(min-width: 821px\)/);
  assert.match(styles, /:global\(\.sidebar--collapsed\) \.groupItemsClosed\s*\{[^}]*display: grid/s);
  assert.match(styles, /min-height: 42px/);
  assert.match(styles, /max-height: 420px/);
  assert.match(styles, /\.groupItemsClosed\s*\{[^}]*max-height: 0[^}]*visibility: hidden/s);
  assert.match(styles, /\.profileAdminLink\s*\{[^}]*background: var\(--color-surface\)/s);
  assert.doesNotMatch(styles, /\.profileAdminLink\s*\{[^}]*background: var\(--color-accent-soft\)/s);
  assert.match(styles, /\.adminSidebar :global\(\.icon-button\.sidebar__close\)\s*\{[^}]*display: inline-grid !important/s);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.navigation > \.groups:first-child\s*\{[^}]*border-top: 0/s);
});
