import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const html = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("\n", "<br>");
const states = new Set(["confirmada", "corrigida", "com_ressalvas"]);

// The review plan and all plaintext remain outside this public repository.
export function validateCorrectionPlan(plan, sourceBytes) {
  if (plan?.schemaVersion !== 1 || plan.source_sha256 !== digest(sourceBytes)) throw new Error("Review baseline checksum mismatch");
  if (!Array.isArray(plan.corrections) || !plan.corrections.length) throw new Error("No reviewed corrections");
  const seen = new Set();
  for (const correction of plan.corrections) {
    const validation = correction.validation;
    if (!/^Q\d{4}$/.test(correction.final_id) || seen.has(correction.final_id)) throw new Error("Invalid or duplicate review ID");
    seen.add(correction.final_id);
    if (!correction.canonical_id || typeof correction.expected_answer !== "string" || correction.scientific_sources_checked !== true) throw new Error("Incomplete scientific review");
    if (!states.has(validation?.status) || !validation.verified_answer?.trim() || !validation.note?.trim() || !validation.date || !validation.method?.trim() || !validation.references?.length) throw new Error("Incomplete reviewed conclusion");
    for (const ref of validation.references) {
      if (!ref.title?.trim() || !ref.supports?.trim() || !(ref.url || (ref.source_path && Number.isInteger(ref.pdf_page) && ref.pdf_page > 0 && /^[a-f0-9]{64}$/.test(ref.source_sha256)))) throw new Error("Incomplete source evidence");
    }
  }
  return JSON.parse(sourceBytes);
}

export function applyReviewedCorrections(source, chunks, corrections, now = Date.now()) {
  const updatedSource = structuredClone(source), updatedChunks = structuredClone(chunks);
  const counts = { questions: 0, bankQuestions: 0, canonical: 0 };
  for (const correction of corrections) {
    const originals = updatedSource.filter(q => q.final_id === correction.final_id);
    if (originals.length !== 1 || originals[0].id !== correction.canonical_id || originals[0].validation?.verified_answer !== correction.expected_answer) throw new Error("Stale or mismatched canonical question: " + correction.final_id);
    const original = originals[0];
    original.validation = { ...original.validation, ...structuredClone(correction.validation), review_history: [...(original.validation.review_history || []), structuredClone(original.validation)] };
    counts.canonical++;
    for (const table of ["questions", "bankQuestions"]) {
      const matches = updatedChunks.flatMap(chunk => chunk.data[table] || []).filter(row => row.compendium?.finalId === correction.final_id);
      if (matches.length !== 1 || matches[0].compendium.sourceId !== correction.canonical_id || matches[0].answer_text !== correction.expected_answer) throw new Error("Stale or mismatched app question: " + correction.final_id + " / " + table);
      const row = matches[0];
      row.answer_text = original.validation.verified_answer;
      row.compendium.validation = structuredClone(original.validation);
      row.updated_at = now;
      for (const field of ["explanation", "anatomical_justification"]) {
        if (typeof row[field] !== "string") continue;
        const provenance = row[field].match(/<p><strong>Fonte do enunciado[\s\S]*/)?.[0] || "";
        const refs = original.validation.references.map(ref => [ref.title, ref.edition, ref.printed_page != null && `p. ${ref.printed_page}`, ref.pdf_page && `PDF p. ${ref.pdf_page}`, ref.url, ref.supports].filter(Boolean).join(" · ")).join("\n");
        const label = original.validation.status === "com_ressalvas" ? "com ressalvas" : original.validation.status;
        row[field] = `<p><strong>Conclusão bibliográfica registada · ${html(label)}</strong><br>${html(row.answer_text)}</p><p><strong>Ressalva</strong><br>${html(original.validation.note)}</p><p><strong>Referências</strong><br>${html(refs)}</p>${provenance}`;
      }
      counts[table]++;
    }
  }
  return { source: updatedSource, chunks: updatedChunks, counts };
}

async function main() {
  const arg = name => process.argv.includes(name) && process.argv[process.argv.indexOf(name) + 1];
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const privatePath = name => {
    const value = arg(name);
    if (!value) throw new Error("Missing " + name);
    const resolved = path.resolve(value), relative = path.relative(root, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Keep plaintext outside the repository");
    return resolved;
  };
  const content = privatePath("--content"), questionsPath = privatePath("--questions"), planPath = privatePath("--plan");
  const sourceBytes = await readFile(questionsPath), plan = JSON.parse(await readFile(planPath, "utf8"));
  const source = validateCorrectionPlan(plan, sourceBytes);
  const checkedSources = new Map();
  for (const correction of plan.corrections) for (const ref of correction.validation.references) {
    if (!ref.source_path) continue;
    if (!checkedSources.has(ref.source_path)) checkedSources.set(ref.source_path, digest(await readFile(ref.source_path)));
    if (checkedSources.get(ref.source_path) !== ref.source_sha256) throw new Error("Consulted source changed");
  }
  const transferPath = path.join(content, "transfer.json"), transfer = JSON.parse(await readFile(transferPath, "utf8"));
  const chunks = [];
  for (const file of transfer.files) {
    if (!/\/(quiz|bank)-\d+\.json$/.test(file.key)) continue;
    if (path.basename(file.filename) !== file.filename) throw new Error("Invalid transfer filename");
    const bytes = await readFile(path.join(content, file.filename));
    if (digest(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error("Private shard checksum mismatch");
    chunks.push({ file, data: JSON.parse(bytes) });
  }
  const result = applyReviewedCorrections(source, chunks, plan.corrections);
  const prepared = result.chunks.filter((chunk, index) => JSON.stringify(chunk.data) !== JSON.stringify(chunks[index].data));
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ ...result.counts, changedFiles: prepared.length, dryRun: true })); return; }
  // All identity, source and shard checks finish before any file is changed.
  const manifestFile = transfer.files.find(file => file.key.endsWith("/manifest.json"));
  if (!manifestFile || path.basename(manifestFile.filename) !== manifestFile.filename) throw new Error("Missing content manifest");
  const manifestBytes = await readFile(path.join(content, manifestFile.filename));
  if (digest(manifestBytes) !== manifestFile.sha256 || manifestBytes.length !== manifestFile.bytes) throw new Error("Content manifest checksum mismatch");
  const manifest = JSON.parse(manifestBytes), revision = randomUUID();
  manifest.revision = revision; manifest.updatedAt = Date.now();
  prepared.push({ file: manifestFile, data: manifest });
  const backup = path.join(content, `canonical-before-reviewed-${digest(await readFile(planPath)).slice(0, 12)}.json`);
  await writeFile(backup, sourceBytes, { flag: "wx" });
  await writeFile(questionsPath, JSON.stringify(result.source, null, 2) + "\n");
  for (const chunk of prepared) {
    const bytes = Buffer.from(JSON.stringify(chunk.data));
    await writeFile(path.join(content, chunk.file.filename), bytes);
    const file = transfer.files.find(file => file.key === chunk.file.key);
    file.bytes = bytes.length; file.sha256 = digest(bytes);
  }
  transfer.revision = revision;
  await writeFile(transferPath, JSON.stringify(transfer, null, 2));
  const report = { ...result.counts, changedFiles: prepared.length, revision, backup, canonical_before_sha256: digest(sourceBytes), canonical_after_sha256: digest(await readFile(questionsPath)), plan_sha256: digest(await readFile(planPath)), ids: plan.corrections.map(c => c.final_id), published: false };
  await writeFile(path.join(content, `reviewed-corrections-${report.plan_sha256.slice(0, 12)}.json`), JSON.stringify(report, null, 2));
  await writeFile(path.join(content, "reviewed-corrections-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
