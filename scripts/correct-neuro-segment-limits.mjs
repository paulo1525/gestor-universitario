import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cervicalAnswer = "C3–T2 ou C5–T1. O Gray e o sumário da AP2 descrevem C3–T2; o Nolte delimita convencionalmente C5–T1 e salienta que os limites da intumescência não são nítidos. São segmentos medulares, não níveis vertebrais.";
const clarkeAnswer = "C8–L3, C8–L2, T1–L3 ou T1–L2. O núcleo torácico posterior de Clarke situa-se na lâmina VII; os seus limites variam entre descrições anatómicas. O Nolte indica aproximadamente T1–L2 e também T1–L2/L3; a descrição mais abrangente admite C8–L2/L3.";
const gray = (part, pdfPage, printedPage, supports) => ({ title: "Gray’s Anatomy: The Anatomical Basis of Clinical Practice", edition: "42.ª", source_path: `01_Disciplinas/Neuroanatomia/Bibliografia/Oficial/Gray 42/Gray's Anatomy ${part}.pdf`, pdf_page: pdfPage, printed_page: printedPage, supports });
const nolte = (edition, pdfPage, printedPage, supports) => ({ title: "Nolte: The Human Brain", edition: `${edition}.ª`, source_path: `01_Disciplinas/Neuroanatomia/Bibliografia/Oficial/Nolte/Nolte - The Human Brain, ${edition}th Ed..pdf`, pdf_page: pdfPage, printed_page: printedPage, supports });
const cervicalReferences = [
  gray("1001-1500", 298, 856, "Extensão da intumescência cervical: segmentos C3–T2; circunferência máxima em C6."),
  nolte(6, 241, 228, "Limites não nítidos; convenção C5–T1."),
  nolte(7, 240, 234, "Limites não nítidos; convenção C5–T1."),
  { title: "FMUP — Sumário AP2: Medula espinhal e suas meninges", edition: "2026/2027", pdf_page: 1, supports: "Intumescência cervical: C3 a T2 (variável)." },
];
const clarkeReferences = [
  gray("0501-1000", 112, 426, "Lâmina VII; segmentos torácicos e lombares superiores. O intervalo T1–L2 é atribuído nesta passagem ao núcleo intermediolateral, não a Clarke."),
  nolte(6, 250, 237, "Núcleo de Clarke: aproximadamente T1–L2."),
  nolte(7, 262, 256, "Tabela 10-5: origem do feixe espinocerebeloso posterior em Clarke (T1–L2/3)."),
  { title: "Blumenfeld — Neuroanatomy Through Clinical Cases", source_path: "01_Disciplinas/Neuroanatomia/Bibliografia/Complementar/Blumenfeld Neuroanatomy Through Clinical Cases.pdf", pdf_page: 735, printed_page: 709, supports: "Núcleo dorsal de Clarke: C8 até L2 ou L3; feixe espinocerebeloso dorsal ipsilateral." },
  { title: "University of Michigan — Spinal Cord, Part I", url: "https://open.umich.edu/sites/default/files/downloads/030909.m1-cns.spinalcordpti.pdf", supports: "Núcleo dorsal de Clarke: C8–L3." },
];
export const SEGMENT_CORRECTIONS = {
  Q0104: { answer: cervicalAnswer, note: "C3–T2 é a delimitação indicada no sumário da AP2 e no Gray; C5–T1 é a convenção do Nolte. Ambas são anatomicamente aceitáveis quando o enunciado não especifica uma fonte.", references: cervicalReferences },
  Q1048: { answer: cervicalAnswer, note: "C3–T2 e C5–T1 são descrições bibliográficas da mesma intumescência; não confundir a sua extensão morfológica com as raízes predominantes do plexo braquial.", references: cervicalReferences },
  Q1196: { answer: clarkeAnswer, note: "Aceitam-se C8–L2, C8–L3, T1–L2 e T1–L3. Não confundir o núcleo de Clarke com a coluna intermediolateral simpática.", references: clarkeReferences },
  Q0118: { answer: "O núcleo de Clarke situa-se na lâmina VII, aproximadamente C8/T1–L2/L3; aceitam-se C8–L2, C8–L3, T1–L2 e T1–L3. O núcleo cuneado lateral (acessório), no bolbo raquidiano, é o seu homólogo para o membro superior. O feixe espinocerebeloso posterior ascende ipsilateralmente, entra pelo pedúnculo cerebeloso inferior e termina como fibras musgosas.", note: "Os limites segmentares variam entre descrições anatómicas; T1–L2 não constitui a única delimitação aceitável.", references: clarkeReferences },
};
export function correctedValidation(original, correction) {
  return { ...original, status: "com_ressalvas", verified_answer: correction.answer, note: correction.note, references: correction.references, date: "2026-10-10", method: "leitura direta dos sumários AT3/AP2, Gray 42 e Nolte 6/7; confronto com a tabela da University of Michigan", origin: "revisão bibliográfica dos limites segmentares de 10/10/2026", review_attempt: { date: "2026-10-10", outcome: "com_ressalvas", evidence: correction.note } };
}
const html = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("\n", "<br>");
export function correctSegmentRow(row, now = Date.now()) {
  const correction = SEGMENT_CORRECTIONS[row.compendium?.finalId];
  if (!correction) return false;
  row.answer_text = correction.answer;
  row.updated_at = now;
  row.compendium.validation = correctedValidation(row.compendium.validation, correction);
  for (const field of ["explanation", "anatomical_justification"]) {
    if (typeof row[field] !== "string") continue;
    const refs = correction.references.map(ref => [ref.title, ref.edition, ref.printed_page && `p. ${ref.printed_page}`, ref.pdf_page && `PDF p. ${ref.pdf_page}`, ref.url, ref.supports].filter(Boolean).join(" · ")).join("\n");
    const provenance = row[field].match(/<p><strong>Fonte do enunciado[\s\S]*/)?.[0] || "";
    row[field] = `<p><strong>Conclusão bibliográfica registada · com ressalvas</strong><br>${html(correction.answer)}</p><p><strong>Ressalva</strong><br>${html(correction.note)}</p><p><strong>Referências</strong><br>${html(refs)}</p>${provenance}`;
  }
  return true;
}
async function main() {
  const arg = name => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes("--content") || !process.argv.includes("--questions")) throw new Error("Use --content PRIVATE_DIRECTORY --questions CANONICAL_QUESTIONS_JSON");
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const content = path.resolve(arg("--content"));
  const relative = path.relative(root, content);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Plaintext must remain outside the repository");
  const questionsPath = path.resolve(arg("--questions"));
  const sourceText = await readFile(questionsPath, "utf8");
  const questions = JSON.parse(sourceText);
  for (const id of Object.keys(SEGMENT_CORRECTIONS)) {
    const matches = questions.filter(q => q.final_id === id);
    if (matches.length !== 1) throw new Error(`Missing or duplicate source question: ${id}`);
    matches[0].validation = correctedValidation(matches[0].validation, SEGMENT_CORRECTIONS[id]);
  }
  const transfer = JSON.parse(await readFile(path.join(content, "transfer.json"), "utf8"));
  const prepared = [], counts = { questions: 0, bankQuestions: 0 };
  const revision = randomUUID(), now = Date.now();
  for (const file of transfer.files) {
    if (!file.key.endsWith("manifest.json") && !/\/(quiz|bank)-\d+\.json$/.test(file.key)) continue;
    const data = JSON.parse(await readFile(path.join(content, file.filename), "utf8"));
    let changed = false;
    if (file.key.endsWith("manifest.json")) { data.revision = revision; data.updatedAt = now; changed = true; }
    for (const table of ["questions", "bankQuestions"]) for (const row of data[table] || []) if (correctSegmentRow(row, now)) { counts[table]++; changed = true; }
    if (changed) prepared.push({ file, bytes: Buffer.from(JSON.stringify(data)) });
  }
  if (counts.questions !== 4 || counts.bankQuestions !== 4) throw new Error(`Unexpected coverage: ${JSON.stringify(counts)}`);
  await writeFile(path.join(content, "questoes-before-segment-correction.json"), sourceText, { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
  await writeFile(questionsPath, JSON.stringify(questions, null, 2) + "\n");
  for (const { file, bytes } of prepared) {
    await writeFile(path.join(content, file.filename), bytes);
    file.bytes = bytes.length; file.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  transfer.revision = revision;
  await writeFile(path.join(content, "transfer.json"), JSON.stringify(transfer, null, 2));
  console.log(JSON.stringify({ ...counts, changedFiles: prepared.length, revision }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
