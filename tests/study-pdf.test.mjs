import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const moduleUri = (code) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
const data = JSON.parse(await readFile(new URL("../lib/study/neuroanatomia-ap1.json", import.meta.url), "utf8"));
const contentUri = moduleUri("export default " + JSON.stringify(data));
const studyUri = moduleUri((await readFile(new URL("../lib/neuroanatomia-study.ts", import.meta.url), "utf8")).replace("@/lib/study/neuroanatomia-ap1.json", contentUri));
const sanitizerUri = moduleUri(await readFile(new URL("../lib/announcement-content.ts", import.meta.url), "utf8"));
const pdfUri = moduleUri((await readFile(new URL("../lib/study-pdf.ts", import.meta.url), "utf8")).replaceAll("@/lib/neuroanatomia-study", studyUri).replaceAll("@/lib/announcement-content", sanitizerUri).replaceAll('"jspdf"', JSON.stringify(import.meta.resolve("jspdf"))));
const { paragraphPdfRuns, buildStudyPdf } = await import(pdfUri);

test("PDF highlights exact quotes across bold boundaries and ignores outdated anchors", () => {
  const paragraph = { parts: [{ text: "Uma " }, { text: "frase", bold: true }, { text: " completa." }] };
  const marks = [{ paragraphId: "p", start: 2, end: 12, quote: "a frase co", color: "blue" }, { paragraphId: "p", start: 0, end: 3, quote: "Old", color: "pink" }];
  const runs = paragraphPdfRuns(paragraph, "p", marks);
  assert.equal(runs.map(run => run.text).join(""), "Uma frase completa.");
  assert.equal(runs.filter(run => run.color).map(run => run.text).join(""), "a frase co");
  assert.ok(runs.some(run => run.text === "frase" && run.bold && run.color === "blue"));
  assert.ok(runs.every(run => run.color !== "pink"));
});

test("PDF exports the full lesson, all figures, highlights and rich notes", async () => {
  const first = data.sections[0].topics[0].paragraphs[0];
  const text = first.parts.map(part => part.text).join("");
  const loaded = [];
  const pdf = await buildStudyPdf([{ paragraphId: first.id, start: 0, end: 35, quote: text.slice(0, 35), color: "yellow", note: "<p><strong>Nota de teste</strong></p><ul><li>Rever amanhã.</li></ul>" }], {
    compress: false,
    async loadImage(src) { loaded.push(src); return new Uint8Array(await readFile(new URL("../public" + src, import.meta.url))); },
  });
  assert.equal(loaded.length, 20);
  assert.ok(pdf.getNumberOfPages() > 10);
  const output = pdf.output();
  for (const word of ["Neuroanatomia", "Bibliografia", "Apontamentos", "Nota", "teste"]) assert.ok(output.includes(word), word);
  if (process.env.STUDY_PDF_QA_OUTPUT) await writeFile(process.env.STUDY_PDF_QA_OUTPUT, Buffer.from(pdf.output("arraybuffer")));
});
