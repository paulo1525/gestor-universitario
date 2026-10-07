import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export async function restoreQuizContentExport(source, output) {
  const sources = Array.isArray(source) ? source : [source];
  for (const directory of [...sources, output]) {
    const relative = path.relative(root, path.resolve(directory));
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Keep private exports outside the repository.");
  }
  await mkdir(output);
  const files = [], keys = new Set();
  let index, manifest;
  for (const sourceFile of sources) {
  for await (const line of createInterface({ input: createReadStream(sourceFile), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.type === "index") {
      if (entry.type !== "index" || !entry.revision || !Number.isInteger(entry.fileCount) || entry.fileCount < 1) throw new Error("Invalid export index.");
      if (entry.offset !== files.length || (index && (entry.revision !== index.revision || entry.fileCount !== index.fileCount))) throw new Error("Private export parts are missing or out of order.");
      index ??= entry;
      continue;
    }
    if (!index) throw new Error("Invalid export index.");
    if (entry.type !== "file" || typeof entry.content !== "string" || keys.has(entry.key) || !/^(quiz-content\/v1\/manifest\.json|quiz-content\/v1\/media\/[a-f0-9]{64}\.json|quiz-content\/v1\/units\/[a-zA-Z0-9_%.-]+\/[a-zA-Z0-9-]+\/(quiz-\d+|bank-\d+|bank-index)\.json)$/.test(entry.key)) throw new Error("Invalid or repeated export file.");
    const bytes = Buffer.from(entry.content);
    if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Export checksum mismatch.");
    const data = JSON.parse(entry.content);
    if (entry.key === "quiz-content/v1/manifest.json") manifest = data;
    const filename = entry.key.replaceAll("/", "--");
    await writeFile(path.join(output, filename), bytes, { flag: "wx" });
    files.push({ key: entry.key, filename, bytes: entry.bytes, sha256: entry.sha256 });
    keys.add(entry.key);
  }
  }
  if (!index || files.length !== index.fileCount || manifest?.schemaVersion !== 1 || manifest.revision !== index.revision) throw new Error("Incomplete private export.");
  await writeFile(path.join(output, "transfer.json"), JSON.stringify({ revision: index.revision, counts: index.counts, units: index.units, files }, null, 2), { flag: "wx" });
  return { revision: index.revision, counts: index.counts, files: files.length, units: index.units };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
  const source = arg("--source"), output = arg("--output");
  if (!source || !output) throw new Error("Use --source private-backup.ndjson --output new-private-directory.");
  restoreQuizContentExport(source.split(","), path.resolve(output)).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
