import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import * as zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import ts from "typescript";
import { prepareQuizJson } from "./prepare-quiz-json-storage.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const richTextSource = await readFile(path.join(root, "lib/announcement-content.ts"), "utf8");
const compiled = { exports: {} };
new Function("module", "exports", ts.transpileModule(richTextSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(compiled, compiled.exports);
const { sanitizeRichTextHtml, richTextPlainText } = compiled.exports;
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 24);

function render(template, fields) {
  if (/<script\b|{{(?:cloze|tts):|{{(?:#|\^)c\d+/i.test(template)) throw new Error("O modelo depende de código, áudio ou oclusão; requer conversão específica.");
  let html = template.replaceAll("{{FrontSide}}", "");
  for (let iteration = 0; iteration < 10 && /{{[#^]/.test(html); iteration++) {
    html = html.replace(/{{([#^])([^{}]+)}}([\s\S]*?){{\/\2}}/g, (_, operator, name, body) => Boolean(fields[name]?.trim()) === (operator === "#") ? body : "");
  }
  html = html.replace(/{{([^{}]+)}}/g, (_, name) => {
    const key = name.replace(/^(?:text|type|hint):/, "");
    if (!(key in fields)) throw new Error("Campo ou filtro não suportado: " + name);
    return name.startsWith("text:") ? richTextPlainText(fields[key]) : fields[key];
  });
  if (/{{|\[sound:/i.test(html)) throw new Error("O cartão contém conteúdo não convertido.");
  return html;
}

function content(html, media, archive) {
  const images = [];
  html.replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, filename) => {
    // Anki references local media names, never fetch arbitrary remote URLs.
    const entry = media.get(filename.replace(/&amp;/g, "&"));
    const bytes = entry && archive[entry];
    const extension = filename.split(".").at(-1)?.toLowerCase();
    const mime = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" }[extension];
    if (!bytes || !mime || bytes.length > 1024 * 1024) throw new Error("Imagem em falta, formato não suportado ou superior a 1 MiB: " + filename);
    const uri = `data:image/${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    if (!images.includes(uri)) images.push(uri);
    return "";
  });
  return { html: sanitizeRichTextHtml(html), images };
}

export async function readNeuroAnki(bytes, unitId, now = Date.now()) {
  if (!unitId) throw new Error("Indique o identificador da unidade curricular de Neuroanatomia.");
  const archive = unzipSync(new Uint8Array(bytes));
  const name = ["collection.anki21b", "collection.anki21", "collection.anki2"].find(key => archive[key]);
  if (!name) throw new Error("O ficheiro não contém uma coleção Anki.");
  if (name.endsWith("21b") && typeof zlib.zstdDecompressSync !== "function") throw new Error("Este formato requer Node.js 24 ou superior.");
  const collection = name.endsWith("21b") ? zlib.zstdDecompressSync(archive[name]) : archive[name];
  const SQL = await initSqlJs(), db = new SQL.Database(collection);
  try {
    const rows = query => { const result = db.exec(query)[0]; return result ? result.values.map(values => Object.fromEntries(result.columns.map((column, index) => [column, values[index]]))) : []; };
    const col = rows("SELECT models,decks FROM col")[0];
    if (!col?.models || !col?.decks) throw new Error("Formato de modelos Anki não suportado; requer inspeção do baralho.");
    const models = JSON.parse(col.models), decks = JSON.parse(col.decks);
    const media = new Map(Object.entries(JSON.parse(new TextDecoder().decode(archive.media || new Uint8Array()))).map(([key, value]) => [value, key]));
    const cards = rows("SELECT c.ord,c.did,n.guid,n.mid,n.flds,n.tags FROM cards c JOIN notes n ON n.id=c.nid ORDER BY c.id");
    const topics = new Map(), questions = [];
    for (const card of cards) {
      const model = models[String(card.mid)], deckName = decks[String(card.did)]?.name || "";
      if (!model || model.type !== 0) throw new Error("O cartão " + card.guid + " requer conversão de oclusão específica.");
      const lessons = [...new Set((deckName + " " + card.tags).match(/\b(?:AT|AP)\s*\d{1,2}\b/gi)?.map(value => value.replace(/\s/g, "").toUpperCase()) || [])];
      if (lessons.length !== 1) throw new Error("Aula ausente ou ambígua no cartão " + card.guid);
      const lesson = lessons[0], number = Number(lesson.slice(2));
      if (number < 1 || number > (lesson.startsWith("AT") ? 21 : 13)) throw new Error("Aula fora do pack: " + lesson);
      const template = model.tmpls.find(item => item.ord === card.ord);
      if (!template) throw new Error("Modelo em falta para " + card.guid);
      const values = card.flds.split("\x1f");
      if (values.length !== model.flds.length) throw new Error("Campos incompletos em " + card.guid);
      const fields = Object.fromEntries(model.flds.map((field, index) => [field.name, values[index]]));
      fields.Deck = deckName; fields.Subdeck = deckName.split("::").at(-1); fields.Tags = card.tags; fields.Type = model.name; fields.Card = template.name;
      const front = content(render(template.qfmt, fields), media, archive);
      const back = content(render(template.afmt, fields), media, archive);
      if (!richTextPlainText(back.html)) throw new Error("Resposta textual ausente em " + card.guid);
      if (!richTextPlainText(front.html) && !front.images.length) throw new Error("Frente vazia em " + card.guid);
      const topicId = "anki-neuro-lesson-" + lesson.toLowerCase();
      const id = "anki-neuro-" + hash(card.guid + ":" + card.ord);
      topics.set(topicId, { id: topicId, curricular_unit_id: unitId, title: lesson, description: JSON.stringify({ source: "anki", lesson }), sort_order: (lesson.startsWith("AT") ? 0 : 100) + number, status: "published", deleted_at: null, created_at: now, updated_at: now });
      questions.push({ id, curricular_unit_id: unitId, topic_id: topicId, prompt: front.html || "Identifica a estrutura assinalada.", answer_text: back.html, explanation: back.html, response_type: "short_answer", image_url: front.images[0] || null, question_images_json: JSON.stringify(front.images), solution_images_json: JSON.stringify(back.images), difficulty: "medium", status: "published", deleted_at: null, created_at: now, updated_at: now });
    }
    if (!questions.length || new Set(questions.map(q => q.id)).size !== questions.length) throw new Error("Coleção vazia ou identificadores repetidos.");
    return { topics: [...topics.values()], questions, options: [], counts: { cards: questions.length, lessons: topics.size } };
  } finally { db.close(); }
}

export function mergeNeuroAnki(tables, imported) {
  const existing = new Map(tables.quiz_questions.map(question => [question.id, question]));
  const existingTopics = new Map(tables.quiz_topics.map(topic => [topic.id, topic]));
  for (const question of imported.questions) {
    const previous = existing.get(question.id);
    if (previous && previous.curricular_unit_id !== question.curricular_unit_id) throw new Error("Conflito de disciplina no cartão " + question.id);
    existing.set(question.id, { ...question, created_at: previous?.created_at ?? question.created_at });
  }
  for (const topic of imported.topics) {
    const previous = existingTopics.get(topic.id);
    if (previous && previous.curricular_unit_id !== topic.curricular_unit_id) throw new Error("Conflito de disciplina na aula " + topic.id);
    existingTopics.set(topic.id, { ...topic, created_at: previous?.created_at ?? topic.created_at });
  }
  return { ...tables, quiz_questions: [...existing.values()], quiz_topics: [...existingTopics.values()] };
}

async function main() {
  const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
  const deck = argument("--deck"), source = argument("--source"), output = argument("--output"), unitId = argument("--unit");
  if (!deck || !source || !output || !unitId) throw new Error("Use --deck ficheiro.apkg --source exportacao-privada --output nova-exportacao --unit id-neuro.");
  for (const directory of [source, output]) {
    const relative = path.relative(root, path.resolve(directory));
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Os ficheiros sem encriptação devem ficar fora do repositório.");
  }
  const transfer = JSON.parse(await readFile(path.join(source, "transfer.json"), "utf8"));
  const files = [];
  for (const file of transfer.files) {
    if (path.basename(file.filename) !== file.filename) throw new Error("Caminho inválido.");
    const bytes = await readFile(path.join(source, file.filename));
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256 || bytes.length !== file.bytes) throw new Error("Checksum inválido.");
    files.push({ key: file.key, data: JSON.parse(bytes) });
  }
  const manifest = files.find(file => file.key === "quiz-content/v1/manifest.json")?.data;
  if (!manifest || manifest.revision !== transfer.revision) throw new Error("Índice incompatível.");
  const shards = files.filter(file => /quiz-\d+\.json$/.test(file.key)).map(file => file.data);
  const bank = files.filter(file => /bank-\d+\.json$/.test(file.key)).map(file => file.data);
  const indexes = files.filter(file => /bank-index\.json$/.test(file.key)).map(file => file.data);
  const deckBytes = await readFile(deck);
  const expectedSha = argument("--expected-sha");
  if (expectedSha && createHash("sha256").update(deckBytes).digest("hex") !== expectedSha) throw new Error("O ficheiro Anki não corresponde ao checksum esperado.");
  const imported = await readNeuroAnki(deckBytes, unitId);
  const expected = argument("--expected-cards");
  if (expected && imported.counts.cards !== Number(expected)) throw new Error("Contagem de cartões diferente do catálogo.");
  const prepared = prepareQuizJson(mergeNeuroAnki({ quiz_topics: manifest.topics, quiz_questions: shards.flatMap(shard => shard.questions), quiz_question_options: shards.flatMap(shard => shard.options), question_bank_items: bank.flatMap(shard => shard.bankQuestions), question_bank_topics: indexes.flatMap(shard => shard.bankTopics), question_bank_sources: indexes.flatMap(shard => shard.bankSources) }, imported));
  await mkdir(output, { recursive: true });
  const entries = [];
  for (const artifact of prepared.artifacts) {
    await writeFile(path.join(output, artifact.filename), artifact.content);
    entries.push({ key: artifact.key, filename: artifact.filename, bytes: Buffer.byteLength(artifact.content), sha256: createHash("sha256").update(artifact.content).digest("hex") });
  }
  await writeFile(path.join(output, "transfer.json"), JSON.stringify({ revision: prepared.manifest.revision, counts: prepared.counts, files: entries }, null, 2));
  console.log(JSON.stringify({ imported: imported.counts, counts: prepared.counts, published: false }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
