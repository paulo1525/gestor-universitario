import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const componentsDirectory = new URL("../components/", import.meta.url);
const componentNames = (await readdir(componentsDirectory)).filter((name) => /\.tsx?$/.test(name));
const componentSources = await Promise.all(componentNames.map(async (name) => [name, await readFile(new URL(name, componentsDirectory), "utf8")]));
const source = Object.fromEntries(componentSources);

test("application components do not use native browser confirmation or alert dialogs", () => {
  for (const [name, contents] of componentSources) {
    assert.doesNotMatch(contents, /\b(?:window\.)?(?:confirm|alert)\s*\(/, `${name} must use the shared confirmation UI`);
  }
});

test("custom modal and off-canvas layers use the shared Escape stack", () => {
  for (const name of [
    "academic-calendar.tsx",
    "app-shell.tsx",
    "audit-history.tsx",
    "class-roster-import.tsx",
    "placement-workbench.tsx",
    "polls-hub.tsx",
    "requests-center.tsx",
  ]) assert.match(source[name], /useEscapeKey/);

  assert.doesNotMatch(source["app-shell.tsx"], /addEventListener\(["']keydown/);
  assert.doesNotMatch(source["academic-calendar.tsx"], /addEventListener\(["']keydown/);
  assert.match(source["use-escape-key.ts"], /escapeStack\.at\(-1\)/);
  assert.match(source["use-escape-key.ts"], /stopImmediatePropagation/);
});

test("the shared confirmation dialog exposes modal semantics and keyboard focus containment", () => {
  const dialog = source["confirmation-dialog.tsx"];
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /aria-describedby=\{descriptionId\}/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /previousFocus\?\.focus\(\)/);
  assert.match(dialog, /useEscapeKey\(open, dismiss\)/);
});
