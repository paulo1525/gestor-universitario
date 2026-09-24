import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import {
  MATERIAL_FILE_LIMITS,
  kindFromFileName,
  sniffMaterialKind,
  suggestedCategory,
  titleFromFileName,
  zipCentralDirectoryLocation,
  zipEntryNames,
  zipStructureMatches,
} from "../lib/material-upload.ts";
import { ankiSubmissionIssues, inspectApkg } from "../lib/anki/inspect.ts";
import { buildMaterialApkg } from "../lib/anki/materials.ts";

const entriesOf = (archive) => {
  const location = zipCentralDirectoryLocation(archive.subarray(Math.max(0, archive.length - 65_557)), archive.length);
  assert.ok(location, "central directory must be found");
  return zipEntryNames(archive.subarray(location.offset, location.offset + location.size));
};

test("o tipo vem da extensão e o conteúdo tem de o confirmar", () => {
  assert.equal(kindFromFileName("Resumo aula 3.PDF"), "pdf");
  assert.equal(kindFromFileName("baralho.apkg"), "apkg");
  assert.equal(kindFromFileName("foto.jpeg"), "image");
  assert.equal(kindFromFileName("programa.exe"), null);
  assert.equal(sniffMaterialKind(strToU8("%PDF-1.7\n"), "pdf"), true);
  assert.equal(sniffMaterialKind(strToU8("isto não é pdf"), "pdf"), false);
  assert.equal(sniffMaterialKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image"), true);
  assert.equal(sniffMaterialKind(strToU8("RIFF\0\0\0\0WEBPVP8 "), "image"), true);
  assert.equal(sniffMaterialKind(strToU8("%PDF-1.7"), "apkg"), false);
});

test("limites e sugestões por tipo", () => {
  assert.equal(MATERIAL_FILE_LIMITS.apkg, 200 * 1024 * 1024);
  assert.equal(MATERIAL_FILE_LIMITS.pdf, 50 * 1024 * 1024);
  assert.equal(suggestedCategory("apkg"), "anki");
  assert.equal(suggestedCategory("image"), "exam");
  assert.equal(titleFromFileName("Resumo_Neuro  aula_3.pdf"), "Resumo Neuro aula 3");
});

test("a estrutura interna de documentos ZIP é verificada", () => {
  const docx = zipSync({ "[Content_Types].xml": strToU8("<x/>"), "word/document.xml": strToU8("<w/>") });
  const disguised = zipSync({ "readme.txt": strToU8("olá") });
  assert.equal(zipStructureMatches("docx", entriesOf(docx)), true);
  assert.equal(zipStructureMatches("docx", entriesOf(disguised)), false);
  assert.equal(zipStructureMatches("apkg", entriesOf(disguised)), false);
  assert.equal(zipStructureMatches("zip", entriesOf(disguised)), true);
});

async function sampleDeck() {
  return buildMaterialApkg({
    deckName: "Anatomia II::Aula 1",
    generatedAt: 1_760_000_000_000,
    cards: [
      { id: "a1", type: "short_answer", question: "Nervo do diafragma?", answer: "Frénico", tags: ["anat2", "aula1"] },
      { id: "a2", type: "short_answer", question: "Origem do frénico?", answer: "C3–C5", tags: ["anat2", "aula1"] },
    ],
  });
}

test("um baralho gerado pela plataforma é lido e aceite", async () => {
  const deck = await sampleDeck();
  assert.equal(zipStructureMatches("apkg", entriesOf(deck.bytes)), true);
  const inspection = await inspectApkg(deck.bytes);
  assert.equal(inspection.readable, true);
  assert.equal(inspection.noteCount, 2);
  assert.equal(inspection.cardCount, 2);
  assert.equal(inspection.reviewCount, 0);
  assert.ok(inspection.deckNames.includes("Anatomia II::Aula 1"));
  assert.deepEqual(ankiSubmissionIssues(inspection), []);
});

test("um baralho com histórico de estudo é recusado", async () => {
  const deck = await sampleDeck();
  const files = unzipSync(deck.bytes);
  const SQL = await initSqlJs();
  const db = new SQL.Database(files["collection.anki2"]);
  db.run("INSERT INTO revlog VALUES (1,1,-1,3,1,0,2500,1000,0)");
  files["collection.anki2"] = db.export();
  db.close();
  const inspection = await inspectApkg(zipSync(files));
  assert.equal(inspection.reviewCount, 1);
  assert.equal(ankiSubmissionIssues(inspection).find((issue) => issue.code === "scheduling")?.level, "error");
});

test("o formato recente do Anki é aceite mas assinalado para verificação", async () => {
  const archive = zipSync({ "collection.anki21b": new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]), "collection.anki2": new Uint8Array(0) });
  const inspection = await inspectApkg(archive);
  assert.equal(inspection.readable, false);
  assert.deepEqual(ankiSubmissionIssues(inspection).map((issue) => issue.level), ["warning"]);
});
