#!/usr/bin/env node

/**
 * Stages the versioned Neuroanatomia downloads for R2 without doing any work
 * in a request. The source files stay on the developer machine; the output is
 * an ignored directory that can be uploaded by the project's release flow.
 *
 * Examples (PowerShell):
 *   node scripts/prepare-material-artifacts.mjs --check-only
 *   node scripts/prepare-material-artifacts.mjs --with-summary-covers
 *
 * The bibliography ZIP and APKGs are staged after checksum validation. The
 * package author confirmed redistribution rights for their included media.
 * Summary cover PDFs remain opt-in derivatives requiring separate review.
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { unzipSync } from "fflate";

const PACKAGE = "Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip";
const ESSENTIAL = "Neuroanatomia_AT1_AT5_AP1_AP3_PACK_ESSENCIAL_FINAL.apkg";
const COMPLETE = "Neuroanatomia_AT1_AT5_AP1_AP3_PACK_COMPLETO_FINAL.apkg";
const LOGO = "public/logo-comissao-curso-fmup-2025-2031-transparente.png";
const FORBIDDEN = /mimed/i;
const MAX_STAGING_BYTES = 1 * 1024 * 1024 * 1024;
const MAX_STAGING_OBJECTS = 1000;

const expected = [
  {
    sourceName: ESSENTIAL,
    storageKey: `materials/neuroanatomia/anki/${ESSENTIAL}`,
    kind: "anki",
    mimeType: "application/apkg",
    uploadStatus: "ready",
    bytes: 16473756,
    sha256: "da717fcfdd2c34c3c6e8c7dd0d48dccf116ff8adb212453a80238af09477ff88",
  },
  {
    sourceName: COMPLETE,
    storageKey: `materials/neuroanatomia/anki/${COMPLETE}`,
    kind: "anki",
    mimeType: "application/apkg",
    uploadStatus: "ready",
    bytes: 16543230,
    sha256: "a59c4addb772d08f97d828de8e0ffa2291ce327aa25887a6154cdb488e07756f",
  },
  {
    sourceName: PACKAGE,
    storageKey: `materials/neuroanatomia/bibliografia/${PACKAGE}`,
    kind: "bibliography-package",
    mimeType: "application/zip",
    uploadStatus: "ready",
    bytes: 191131120,
    sha256: "06082cc89302320f484e64c04d068a472ae0c8f9f3b796dee663a44ef4a3539f",
  },
];

function parseArgs(argv) {
  const options = {
    sourceDir: join(homedir(), "Downloads"),
    outputDir: join("temporary-resources", "neuroanatomia", "generated"),
    checkOnly: false,
    withSummaryCovers: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check-only") options.checkOnly = true;
    else if (argument === "--with-summary-covers") options.withSummaryCovers = true;
    else if (argument === "--source-dir") options.sourceDir = argv[++index] || options.sourceDir;
    else if (argument === "--output-dir") options.outputDir = argv[++index] || options.outputDir;
    else if (argument === "--help" || argument === "-h") {
      console.log("Uso: node scripts/prepare-material-artifacts.mjs [--check-only] [--with-summary-covers] [--source-dir PATH] [--output-dir PATH]");
      process.exit(0);
    } else throw new Error(`Opção desconhecida: ${argument}`);
  }
  return { ...options, sourceDir: resolve(options.sourceDir), outputDir: resolve(options.outputDir) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSafeName(name) {
  if (FORBIDDEN.test(name)) throw new Error(`Fonte recusada por conter MIMED: ${name}`);
}

function assertInside(root, candidate) {
  const rootPath = resolve(root) + sep;
  const candidatePath = resolve(candidate);
  if (!candidatePath.startsWith(rootPath)) throw new Error(`Caminho fora da pasta de saída: ${candidatePath}`);
  return candidatePath;
}

async function validateAndCopySource(sourceDir, outputDir, item, checkOnly) {
  assertSafeName(item.sourceName);
  const sourcePath = join(sourceDir, item.sourceName);
  const bytes = await readFile(sourcePath);
  const actual = { bytes: bytes.byteLength, sha256: sha256(bytes) };
  if (actual.bytes !== item.bytes || actual.sha256 !== item.sha256) {
    throw new Error(`${item.sourceName}: esperado ${item.bytes} bytes/${item.sha256}, obtido ${actual.bytes} bytes/${actual.sha256}`);
  }
  // ZIP/APKG entries are recorded in their central directory. Scanning the
  // compressed bytes catches a forbidden source name without extracting the
  // 190 MB bibliography bundle on every validation run.
  if (FORBIDDEN.test(bytes.toString("latin1"))) throw new Error(`${item.sourceName}: o pacote contém uma referência MIMED e foi recusado.`);
  const destination = assertInside(outputDir, join(outputDir, item.storageKey.replaceAll("/", sep)));
  if (!checkOnly) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
  }
  return {
    ...item,
    sourcePath: item.sourceName,
    outputPath: relative(outputDir, destination).replaceAll(sep, "/"),
    ...actual,
  };
}

async function stageCatalogEntries(sourceDir, outputDir, checkOnly) {
  const catalogSql = await readFile("migrations/0057_materials_catalog_anki.sql", "utf8");
  const catalogEntries = catalogSql.split("\n").map((line) => {
    const match = line.match(/SELECT '(material-(?:summary|biblio)-[^']+)',.*? '([^']+\.(?:pdf|txt))', '(?:application\/pdf|text\/plain)', 'r2', '(materials\/neuroanatomia\/[^']+)'/);
    return match && { id: match[1], sourceName: match[2], storageKey: match[3] };
  }).filter(Boolean);
  if (catalogEntries.length !== 32) throw new Error(`Esperados 32 ficheiros individuais no catálogo; encontrados ${catalogEntries.length}.`);
  const archive = unzipSync(await readFile(join(sourceDir, PACKAGE)));
  const results = [];
  for (const item of catalogEntries) {
    const candidates = Object.entries(archive)
      .filter(([name]) => name.split(/[\\/]/).at(-1) === item.sourceName)
      .sort(([left], [right]) => left.localeCompare(right, "en"));
    if (candidates.length === 0) throw new Error(`Ficheiro não encontrado no ZIP: ${item.sourceName}`);
    // Repeated bibliography files can differ only in PDF metadata because the
    // package generator emitted a copy per lesson. Always select the first
    // archive path lexicographically so staging is reproducible.
    const digest = sha256(candidates[0][1]);
    assertSafeName(item.sourceName);
    const destination = assertInside(outputDir, join(outputDir, item.storageKey.replaceAll("/", sep)));
    if (!checkOnly) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, candidates[0][1]);
    }
    results.push({ id: item.id, sourcePath: candidates[0][0], outputPath: relative(outputDir, destination).replaceAll(sep, "/"), storageKey: item.storageKey, kind: item.id.startsWith("material-summary") ? "summary" : "bibliography", mimeType: item.sourceName.endsWith(".txt") ? "text/plain" : "application/pdf", uploadStatus: "ready", bytes: candidates[0][1].byteLength, sha256: digest });
  }
  return results;
}

function humanTitle(entryName) {
  return entryName
    .replace(/^\d+_(?:SUMARIOS_ORIGINAIS|SUMARIOS_VERIFICADOS)[\\/]/, "")
    .replace(/\.pdf$/i, "")
    .replaceAll("_", " ")
    .replace(/\s+-\s+/g, " · ")
    .trim();
}

async function buildSummaryCover(sourceBytes, title, logoBytes) {
  const source = await PDFDocument.load(sourceBytes);
  const output = await PDFDocument.create();
  const page = output.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const logo = await output.embedPng(logoBytes);
  const logoSize = logo.scaleToFit(180, 72);
  const teal = rgb(0.08, 0.37, 0.40);
  const gold = rgb(0.80, 0.61, 0.18);
  const ink = rgb(0.10, 0.12, 0.15);
  const muted = rgb(0.35, 0.38, 0.42);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.98, 0.96) });
  page.drawRectangle({ x: 0, y: 0, width: 18, height, color: teal });
  page.drawRectangle({ x: 18, y: height - 22, width: width - 18, height: 22, color: teal });
  page.drawCircle({ x: 92, y: height - 160, size: 46, color: rgb(0.86, 0.93, 0.92) });
  page.drawCircle({ x: 92, y: height - 160, size: 22, color: gold });
  page.drawImage(logo, { x: width - logoSize.width - 42, y: height - logoSize.height - 48, width: logoSize.width, height: logoSize.height });
  page.drawText("NEUROANATOMIA  ·  MATERIAIS DE ESTUDO", { x: 52, y: height - 112, size: 10, font: bold, color: teal, characterSpacing: 0.6 });
  page.drawText(title, { x: 52, y: height - 238, size: 27, maxWidth: width - 104, lineHeight: 35, font: bold, color: ink });
  page.drawText("Versão preparada para leitura e estudo", { x: 52, y: height - 300, size: 13, font: regular, color: muted });
  page.drawRectangle({ x: 52, y: height - 344, width: width - 104, height: 2, color: gold });
  page.drawText("Comissão de Curso · FMUP", { x: 52, y: height - 394, size: 13, font: bold, color: ink });
  page.drawText("Gestor Universitário", { x: 52, y: height - 418, size: 11, font: regular, color: muted });
  page.drawText("A capa é adicionada no pré-processamento; os downloads", { x: 52, y: 78, size: 9, font: regular, color: muted });
  page.drawText("em produção entregam apenas o artefacto já preparado.", { x: 52, y: 64, size: 9, font: regular, color: muted });

  const pages = await output.copyPages(source, source.getPageIndices());
  pages.forEach((sourcePage) => output.addPage(sourcePage));
  output.setTitle(`Neuroanatomia · ${title}`);
  output.setAuthor("Comissão de Curso FMUP · Gestor Universitário");
  output.setSubject("Material de estudo de Neuroanatomia");
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}

async function createSummaryCovers(sourceDir, outputDir, checkOnly) {
  const bundle = await readFile(join(sourceDir, PACKAGE));
  const entries = unzipSync(bundle);
  const logoPath = resolve(LOGO);
  const logo = await readFile(logoPath);
  const results = [];
  for (const [entryName, value] of Object.entries(entries)) {
    if (!/^(00_SUMARIOS_ORIGINAIS|01_SUMARIOS_VERIFICADOS)[\\/].+\.pdf$/i.test(entryName)) continue;
    assertSafeName(entryName);
    const baseName = entryName.split(/[\\/]/).pop() || "sumario.pdf";
    const destinationName = baseName.replace(/\.pdf$/i, "-CC.pdf");
    const destination = assertInside(outputDir, join(outputDir, "materials", "neuroanatomia", "sumarios", "capas", destinationName));
    if (!checkOnly) {
      await mkdir(dirname(destination), { recursive: true });
      const pdf = await buildSummaryCover(value, humanTitle(entryName), logo);
      await writeFile(destination, pdf);
    }
    const outputBytes = checkOnly ? null : await readFile(destination);
    results.push({ sourcePath: entryName, outputPath: relative(outputDir, destination).replaceAll(sep, "/"), kind: "summary-cover", mimeType: "application/pdf", uploadStatus: "review-required", rightsReason: "Derivada de material fornecido; confirmar autorização antes de carregar.", ...(outputBytes ? { bytes: outputBytes.byteLength, sha256: sha256(outputBytes) } : {}) });
  }
  return results;
}

function assertStagingBudget(entries) {
  const uploadable = entries.filter((entry) => entry.uploadStatus !== "blocked");
  if (uploadable.length > MAX_STAGING_OBJECTS) {
    throw new Error(`Staging recusado: ${uploadable.length} objetos excedem o limite de ${MAX_STAGING_OBJECTS}.`);
  }
  const totalBytes = uploadable.reduce((sum, entry) => sum + Number(entry.bytes || 0), 0);
  if (totalBytes > MAX_STAGING_BYTES) {
    throw new Error(`Staging recusado: ${totalBytes} bytes excedem o limite de ${MAX_STAGING_BYTES} bytes.`);
  }
  return { totalBytes, objectCount: uploadable.length, blockedObjects: entries.length - uploadable.length };
}

const options = parseArgs(process.argv.slice(2));
const staged = [];
for (const item of expected) staged.push(await validateAndCopySource(options.sourceDir, options.outputDir, item, options.checkOnly));
staged.push(...await stageCatalogEntries(options.sourceDir, options.outputDir, options.checkOnly));
if (options.withSummaryCovers) staged.push(...await createSummaryCovers(options.sourceDir, options.outputDir, options.checkOnly));
const stagingBudget = assertStagingBudget(staged);

const manifest = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  sourcePolicy: "Downloads local; referências MIMED recusadas; autor confirmou autorização para redistribuir os elementos incluídos nos APKG/ZIP.",
  stagingPolicy: {
    maxBytes: MAX_STAGING_BYTES,
    maxObjects: MAX_STAGING_OBJECTS,
    stagedBytes: stagingBudget.totalBytes,
    stagedObjects: stagingBudget.objectCount,
    blockedObjects: stagingBudget.blockedObjects,
    uploadRequirements: "Carregar apenas artefactos com uploadStatus=ready; derivados review-required exigem revisão separada. Confirmar bucket R2 Standard, privado, quota e custo; este script não faz upload.",
  },
  cacheControl: "private, max-age=3600, stale-while-revalidate=86400",
  artifacts: staged,
};
if (!options.checkOnly) {
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(join(options.outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
}
console.log(JSON.stringify({ outputDir: options.outputDir, checkOnly: options.checkOnly, artifactCount: staged.length, artifacts: staged.map(({ sourcePath, outputPath, bytes, sha256: digest, uploadStatus, rightsReason }) => ({ sourcePath, outputPath, bytes, sha256: digest, uploadStatus, ...(rightsReason ? { rightsReason } : {}) })) }, null, 2));
