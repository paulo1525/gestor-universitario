import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const materialLibrary = await readFile(new URL("../components/material-library.tsx", import.meta.url), "utf8");

test("Aula prática 1 não aparece como exame na lista de materiais", () => {
  assert.doesNotMatch(materialLibrary, /interactiveStudyVisible/);
  assert.doesNotMatch(materialLibrary, /Neuroanatomia · Aula prática 1/);
  assert.match(materialLibrary, /const libraryCount = visible\.length;/);
});
