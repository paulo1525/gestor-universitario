import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const moduleUri = (code) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
const unitsUri = moduleUri(await readFile(new URL("../lib/material-compendium-units.ts", import.meta.url), "utf8"));
const pdfUri = moduleUri((await readFile(new URL("../lib/material-compendium-pdf.ts", import.meta.url), "utf8")).replaceAll('"jspdf"', JSON.stringify(import.meta.resolve("jspdf"))).replaceAll('"@/lib/material-compendium-units"', JSON.stringify(unitsUri)));
const { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } = await import(unitsUri);
const { buildMaterialCompendiumPdf, loadMaterialQuestionBank } = await import(pdfUri);

test("question bank loader follows the published pagination contract", async () => {
  const requested = [];
  const pages = new Map([
    [1, { questions: [{ id: "q1", prompt: "Pergunta 1", answer: "Resposta 1", responseType: "short_answer", topic: { title: "Tema", chapterNumber: "2" }, source: { page: "12", question: "1", assessment: "AT1" } }], pagination: { totalPages: 2 }, source: { label: "Folha validada" } }],
    [2, { questions: [{ id: "q2", prompt: "Pergunta 2", answer: "Resposta 2", responseType: "multiple_choice", options: [{ text: "Resposta 2", isCorrect: true }, { text: "Outra resposta", isCorrect: false }], topic: { title: "Tema 2", chapterNumber: "3" }, source: { page: "18", question: "2", assessment: "AP1" } }], pagination: { totalPages: 2 }, source: { label: "Folha validada" } }],
  ]);
  const result = await loadMaterialQuestionBank("unit-neuro", async (url) => {
    const page = Number(new URL(url, "https://example.test").searchParams.get("page"));
    requested.push(url);
    return { ok: true, async json() { return pages.get(page); } };
  });
  assert.equal(result.sourceLabel, "Folha validada");
  assert.deepEqual(result.entries.map((entry) => [entry.id, entry.type, entry.chapter, entry.source, entry.assessment, entry.sourcePage]), [
    ["question-bank:q1", "short_answer", "2", "Folha validada", "AT1", "12"],
    ["question-bank:q2", "multiple_choice", "3", "Folha validada", "AP1", "18"],
  ]);
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => new URL(url, "https://example.test").searchParams.get("pageSize") === "50"));
});

test("the second-year unit registry resolves every prepared portrait cover", async () => {
  assert.equal(MATERIAL_COMPENDIUM_UNITS.length, 11);
  assert.equal(resolveMaterialCompendiumUnit("DECIDES II")?.coverUrl, "/decides-ii-compendio-cover-v2.png");
  assert.equal(resolveMaterialCompendiumUnit("curricular-mi251")?.shortTitle, "Histologia II. Embriologia");
  assert.equal(resolveMaterialCompendiumUnit("Imunologia Básica · Compêndio personalizado")?.code, "IMUNO BAS");
  assert.notEqual(resolveMaterialCompendiumUnit("DECIDES I")?.coverUrl, resolveMaterialCompendiumUnit("DECIDES II")?.coverUrl);
  assert.equal(new Set(MATERIAL_COMPENDIUM_UNITS.map((unit) => unit.coverUrl)).size, MATERIAL_COMPENDIUM_UNITS.length);
  for (const unit of MATERIAL_COMPENDIUM_UNITS) {
    const bytes = await readFile(new URL(`../public${unit.coverUrl}`, import.meta.url));
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.ok(width / height > 0.64 && width / height < 0.72, `${unit.code} cover must remain suitable for an A4 portrait crop`);
  }
});

test("the curricular-unit catalog reuses prepared A4 covers without importing PDF generation", async () => {
  const catalog = await readFile(new URL("../components/curricular-unit-catalog.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(catalog, /material-compendium-pdf/);
  // Lists and headers use the light WebP thumbnails, never the 2.5 MB A4 covers.
  const thumb = await readFile(new URL("../components/unit-thumb.tsx", import.meta.url), "utf8");
  assert.match(thumb, /from "@\/lib\/material-compendium-units"/);
  const listStyles = await readFile(new URL("../components/record-list.module.css", import.meta.url), "utf8");
  assert.match(catalog, /<UnitThumb /);
  assert.doesNotMatch(catalog, /compendiumUnit\.coverUrl/);
  assert.match(thumb, /src=\{unit\.thumbUrl\}/);
  assert.match(listStyles, /\.thumb\s*\{[^}]*aspect-ratio:\s*1055\s*\/\s*1492/s);
  for (const unit of MATERIAL_COMPENDIUM_UNITS) {
    const bytes = await readFile(new URL(`../public${unit.thumbUrl}`, import.meta.url));
    assert.ok(bytes.length < 40_000, `${unit.code} thumbnail must stay light`);
  }
});

test("compendium PDF contains the uniform cover and respects solution visibility", async () => {
  const logo = new Uint8Array(await readFile(new URL("../public/logo-comissao-curso-fmup-2025-2031-transparente.png", import.meta.url)));
  const cover = new Uint8Array(await readFile(new URL("../public/neuroanatomia-compendio-cover-v2.png", import.meta.url)));
  const entries = [{ id: "q1", lesson: "AT1", topic: "Tema", chapter: "2", type: "multiple_choice", question: "Qual é a resposta?", answer: "A resposta certa", source: "AT1", sourcePage: "12", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }] }];
  const loadImage = async (src) => src.includes("compendio-cover") ? cover : logo;
  const withSolutions = await buildMaterialCompendiumPdf(entries, { loadImage, includeSolutions: true, compress: false });
  assert.ok(withSolutions.byteLength > 1000);
  const outputWithSolutions = Buffer.from(withSolutions).toString("latin1");
  assert.match(outputWithSolutions, /Neuroanatomia/);
  assert.match(outputWithSolutions, /Solu/);
  if (process.env.COMPENDIUM_PDF_QA_OUTPUT) await writeFile(process.env.COMPENDIUM_PDF_QA_OUTPUT, Buffer.from(withSolutions));
  const withoutSolutions = await buildMaterialCompendiumPdf(entries, { loadImage, includeSolutions: false, compress: false });
  const outputWithoutSolutions = Buffer.from(withoutSolutions).toString("latin1");
  assert.doesNotMatch(outputWithoutSolutions, /A resposta certa/);
});

test("compendium PDF moves long card text to a fresh A4 page", async () => {
  const logo = new Uint8Array(await readFile(new URL("../public/logo-comissao-curso-fmup-2025-2031-transparente.png", import.meta.url)));
  const cover = new Uint8Array(await readFile(new URL("../public/neuroanatomia-compendio-cover-v2.png", import.meta.url)));
  const loadImage = async (src) => src.includes("compendio-cover") ? cover : logo;
  const longText = "Uma descrição clínica suficientemente extensa para verificar o fluxo de paginação do compêndio. ".repeat(180);
  const bytes = await buildMaterialCompendiumPdf([{ id: "long", type: "short_answer", question: longText, answer: longText, source: "Folha validada" }], { loadImage, includeSolutions: true, compress: false });
  const output = Buffer.from(bytes).toString("latin1");
  const pageCount = (output.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pageCount >= 3, `expected cover plus at least two content pages, got ${pageCount}`);
});
