import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const block = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `bloco ${selector} em falta`);
  return source.slice(start, source.indexOf('\n}', start));
};
const colourTokens = (body) => new Set([...body.matchAll(/^\s*(--color-[a-z-]+)\s*:/gm)].map((match) => match[1]));

test('o modo escuro redefine todos os tokens de cor dos dois temas', async () => {
  const [globals, forum, dark] = await Promise.all([css('../app/globals.css'), css('../app/theme-forum.css'), css('../app/theme-dark.css')]);
  const darkBase = colourTokens(block(dark, 'html[data-color-scheme="dark"]'));
  for (const token of colourTokens(block(globals, ':root'))) assert.ok(darkBase.has(token), `${token} sem valor no modo escuro`);
  const darkForum = colourTokens(block(dark, 'html[data-theme="forum"][data-color-scheme="dark"]'));
  for (const token of colourTokens(block(forum, 'html[data-theme="forum"]'))) assert.ok(darkForum.has(token), `${token} sem valor no Tema Azul escuro`);
});

test('o esquema de cor é aplicado antes da primeira pintura', async () => {
  const layout = await css('../app/layout.tsx');
  assert.match(layout, /import "\.\/theme-dark\.css";/);
  assert.match(layout, /gestor-color-scheme/);
  assert.match(layout, /data-color-scheme="light"/);
});
