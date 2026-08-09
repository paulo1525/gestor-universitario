import { strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { richTextPlainText, sanitizeRichTextHtml } from "../announcement-content.ts";

export const GESTOR_MCQ_MODEL_ID = 1_862_410_901;
export const APKG_MIME_TYPE = "application/zip";
export const MAX_ANKI_IMAGE_BYTES = 1024 * 1024;

export type AnkiMcqOption = {
  html: string;
  isCorrect: boolean;
};

export type AnkiMcqImage = {
  fileName: string;
  bytes: Uint8Array | ArrayBuffer;
  alt?: string;
};

export type AnkiMcqCard = {
  id: string;
  promptHtml: string;
  options: AnkiMcqOption[];
  explanationHtml: string;
  image?: AnkiMcqImage | null;
  sourceHtml?: string;
  tags?: string[];
};

export type AnkiMcqDeckInput = {
  deckName: string;
  cards: AnkiMcqCard[];
  deckId?: number;
  modelId?: number;
  fileName?: string;
  descriptionHtml?: string;
  generatedAt?: number;
};

export type AnkiApkgResult = {
  bytes: Uint8Array;
  fileName: string;
  deckId: number;
  modelId: number;
  noteCount: number;
  cardCount: number;
  mediaCount: number;
};

const FIELD_SEPARATOR = "\x1f";
const DATA_URI = /(?:src\s*=\s*["']?data:|data:image\/)/i;
const MCQ_FIELD_NAMES = ["Enunciado", "Opcoes", "Imagem", "Resposta", "Explicacao", "Fonte"];

const APKG_SCHEMA = `
CREATE TABLE col (
  id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL,
  scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL,
  usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL,
  models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL,
  tags TEXT NOT NULL
);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL,
  mod INTEGER NOT NULL, usn INTEGER NOT NULL, tags TEXT NOT NULL,
  flds TEXT NOT NULL, sfld INTEGER NOT NULL, csum INTEGER NOT NULL,
  flags INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE cards (
  id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL,
  ord INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL,
  type INTEGER NOT NULL, queue INTEGER NOT NULL, due INTEGER NOT NULL,
  ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL,
  odid INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE revlog (
  id INTEGER PRIMARY KEY, cid INTEGER NOT NULL, usn INTEGER NOT NULL,
  ease INTEGER NOT NULL, ivl INTEGER NOT NULL, lastIvl INTEGER NOT NULL,
  factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL
);
CREATE TABLE graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
`;

const MODEL_CSS = `
.card { font-family: Arial, sans-serif; font-size: 18px; line-height: 1.5; color: #17243d; background: #fff; text-align: left; }
.mcq { max-width: 760px; margin: 0 auto; }
.mcq-question { font-size: 1.08em; font-weight: 700; margin-bottom: 16px; }
.mcq-image { margin: 14px 0; text-align: center; }
.mcq-image img { max-width: 100%; max-height: 440px; object-fit: contain; border-radius: 8px; }
.mcq-options { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mcq-option { display: grid; grid-template-columns: 2rem 1fr; gap: 8px; padding: 10px 12px; border: 1px solid #d5dce8; border-radius: 8px; }
.mcq-option-letter { font-weight: 800; color: #315f9e; }
.mcq-answer { margin-top: 16px; padding: 12px; border-left: 4px solid #315f9e; background: #eef4fb; }
.mcq-explanation { margin-top: 14px; }
.mcq-source { margin-top: 16px; color: #59677c; font-size: .82em; }
#answer { margin: 22px 0 16px; border: 0; border-top: 1px solid #d5dce8; }
`;

const FRONT_TEMPLATE = `<div class="mcq"><div class="mcq-question">{{Enunciado}}</div>{{#Imagem}}<div class="mcq-image">{{Imagem}}</div>{{/Imagem}}{{Opcoes}}</div>`;
const BACK_TEMPLATE = `{{FrontSide}}<hr id="answer"><div class="mcq"><div class="mcq-answer">{{Resposta}}</div><div class="mcq-explanation"><strong>Explicação:</strong><br>{{Explicacao}}</div>{{#Fonte}}<div class="mcq-source"><strong>Fonte:</strong> {{Fonte}}</div>{{/Fonte}}</div>`;

let sqlitePromise: ReturnType<typeof initSqlJs> | null = null;

function sqlite() {
  sqlitePromise ??= initSqlJs();
  return sqlitePromise;
}

function plainText(html: string): string {
  return richTextPlainText(html);
}

async function fieldChecksum(html: string): Promise<number> {
  if (!globalThis.crypto?.subtle) throw new Error("Este ambiente não disponibiliza Web Crypto para calcular o checksum Anki.");
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(plainText(html)));
  return new DataView(digest).getUint32(0, false);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function fnv1aString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fnv1aBytes(value: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of value) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableGuid(id: string): string {
  return `gu${fnv1aString(id).toString(36)}${fnv1aString([...id].reverse().join("")).toString(36)}`;
}

function stableDeckId(name: string): number {
  return 1_000_000_000 + (fnv1aString(`gestor-universitario:${name}`) % 1_000_000_000);
}

function validAnkiId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} tem de ser um inteiro positivo seguro.`);
  return value;
}

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "baralho";
}

function safeMediaBaseName(value: string): string {
  const baseName = value.replaceAll("\\", "/").split("/").pop() || "imagem.png";
  const safe = slug(baseName);
  if (!safe || safe === "." || safe === "..") throw new Error("O nome do ficheiro de imagem é inválido.");
  return safe;
}

function asBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

function assertNoDataUri(value: string, label: string): void {
  if (DATA_URI.test(value)) throw new Error(`${label} não pode conter data URI; anexa a imagem como media real.`);
}

function normalizeTags(tags: string[] | undefined): string {
  const normalized = [...new Set((tags || []).map((tag) => slug(tag).replaceAll("-", "_")).filter(Boolean))];
  return normalized.length ? ` ${normalized.join(" ")} ` : "";
}

function optionsHtml(options: AnkiMcqCard["options"]): string {
  return `<ol class="mcq-options">${options.map((option, index) => `<li class="mcq-option"><span class="mcq-option-letter">${String.fromCharCode(65 + index)}.</span><div>${option.html}</div></li>`).join("")}</ol>`;
}

function answerHtml(options: AnkiMcqCard["options"]): string {
  const index = options.findIndex((option) => option.isCorrect);
  return `<strong>Resposta correta: ${String.fromCharCode(65 + index)}</strong><br>${options[index].html}`;
}

function modelJson(modelId: number, deckId: number, modifiedSeconds: number) {
  const fields = MCQ_FIELD_NAMES.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [] }));
  return {
    [String(modelId)]: {
      css: MODEL_CSS, did: deckId, flds: fields, id: String(modelId),
      latexPost: "\\end{document}", latexPre: "\\documentclass[12pt]{article}\\begin{document}", latexsvg: false,
      mod: modifiedSeconds, name: "Gestor Universitário · Escolha múltipla", req: [[0, "all", [0, 1]]], sortf: 0, tags: [],
      tmpls: [{ name: "Escolha múltipla", ord: 0, qfmt: FRONT_TEMPLATE, afmt: BACK_TEMPLATE, bqfmt: "", bafmt: "", bfont: "", bsize: 0, did: null }],
      type: 0, usn: -1, vers: [],
    },
  };
}

function deckJson(deckId: number, name: string, description: string, modifiedSeconds: number) {
  return {
    [String(deckId)]: {
      id: deckId, name, desc: description, dyn: 0, conf: 1, collapsed: false,
      extendNew: 10, extendRev: 50, lrnToday: [0, 0], newToday: [0, 0], revToday: [0, 0], timeToday: [0, 0],
      mod: modifiedSeconds, usn: -1,
    },
  };
}

function deckConfigJson() {
  return {
    "1": {
      id: 1, name: "Default", autoplay: true, replayq: true, timer: 0, maxTaken: 60, mod: 0, usn: 0,
      lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
      new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
      rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
    },
  };
}

function collectionConfig(deckId: number, modelId: number) {
  return { activeDecks: [deckId], addToCur: true, collapseTime: 1200, curDeck: deckId, curModel: String(modelId), dueCounts: true, estTimes: true, newBury: true, newSpread: 0, nextPos: 1, sortBackwards: false, sortType: "noteFld", timeLim: 0 };
}

function validateInput(input: AnkiMcqDeckInput): void {
  if (!input.deckName.trim()) throw new Error("O nome do baralho é obrigatório.");
  if (!input.cards.length) throw new Error("O baralho precisa de pelo menos uma pergunta.");
  const ids = new Set<string>();
  for (const [index, card] of input.cards.entries()) {
    if (!card.id.trim() || ids.has(card.id)) throw new Error(`A pergunta ${index + 1} tem um identificador vazio ou repetido.`);
    ids.add(card.id);
    if (!plainText(card.promptHtml)) throw new Error(`A pergunta ${index + 1} não tem enunciado.`);
    if (card.options.length < 2 || card.options.length > 4 || card.options.some((option) => !plainText(option.html))) throw new Error(`A pergunta ${index + 1} tem de ter entre duas e quatro opções preenchidas.`);
    if (card.options.filter((option) => option.isCorrect).length !== 1) throw new Error(`A pergunta ${index + 1} tem de ter exatamente uma resposta correta.`);
    if (plainText(card.explanationHtml).length < 20) throw new Error(`A explicação da pergunta ${index + 1} deve ser desenvolvida (mínimo de 20 caracteres).`);
    for (const [label, html] of [["enunciado", card.promptHtml], ["explicação", card.explanationHtml], ["fonte", card.sourceHtml || ""]] as const) assertNoDataUri(html, `O campo ${label} da pergunta ${index + 1}`);
    card.options.forEach((option, optionIndex) => assertNoDataUri(option.html, `A opção ${optionIndex + 1} da pergunta ${index + 1}`));
    if (card.image) {
      const imageSize = asBytes(card.image.bytes).length;
      if (imageSize === 0) throw new Error(`A imagem da pergunta ${index + 1} está vazia.`);
      if (imageSize > MAX_ANKI_IMAGE_BYTES) throw new Error(`A imagem da pergunta ${index + 1} excede o limite de 1 MiB.`);
    }
  }
}

export async function buildMcqApkg(input: AnkiMcqDeckInput): Promise<AnkiApkgResult> {
  validateInput(input);
  const generatedAt = Math.trunc(input.generatedAt ?? Date.now());
  if (!Number.isSafeInteger(generatedAt) || generatedAt <= 0) throw new Error("A data de geração é inválida.");
  const modifiedSeconds = Math.floor(generatedAt / 1000);
  const deckId = validAnkiId(input.deckId ?? stableDeckId(input.deckName), "O ID do baralho");
  const modelId = validAnkiId(input.modelId ?? GESTOR_MCQ_MODEL_ID, "O ID do modelo");
  const checksums = await Promise.all(input.cards.map((card) => fieldChecksum(card.promptHtml)));
  const SQL = await sqlite();
  const database = new SQL.Database();
  const mediaByName = new Map<string, Uint8Array>();
  try {
    database.run(APKG_SCHEMA);
    database.run("INSERT INTO col VALUES (NULL,?,?,?,?,0,0,0,?,?,?,?,?)", [modifiedSeconds, generatedAt, generatedAt, 11, JSON.stringify(collectionConfig(deckId, modelId)), JSON.stringify(modelJson(modelId, deckId, modifiedSeconds)), JSON.stringify(deckJson(deckId, input.deckName.trim(), sanitizeRichTextHtml(input.descriptionHtml || ""), modifiedSeconds)), JSON.stringify(deckConfigJson()), "{}"]);
    const noteStatement = database.prepare("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    const cardStatement = database.prepare("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    try {
      input.cards.forEach((card, index) => {
        const noteId = generatedAt + (index * 2);
        const cardId = noteId + 1;
        let imageField = "";
        if (card.image) {
          const bytes = asBytes(card.image.bytes);
          const mediaName = `gu-${fnv1aBytes(bytes).toString(36)}-${safeMediaBaseName(card.image.fileName)}`;
          const existing = mediaByName.get(mediaName);
          if (existing && !sameBytes(existing, bytes)) throw new Error(`Conflito no ficheiro de media ${mediaName}.`);
          mediaByName.set(mediaName, bytes);
          imageField = `<img src="${escapeHtml(mediaName)}"${card.image.alt ? ` alt="${escapeHtml(card.image.alt)}"` : ""}>`;
        }
        const promptHtml = sanitizeRichTextHtml(card.promptHtml);
        const safeOptions = card.options.map((option) => ({ ...option, html: sanitizeRichTextHtml(option.html) }));
        const fields = [promptHtml, optionsHtml(safeOptions), imageField, answerHtml(safeOptions), sanitizeRichTextHtml(card.explanationHtml), sanitizeRichTextHtml(card.sourceHtml || "")];
        if (fields.some((field) => DATA_URI.test(field))) throw new Error(`A pergunta ${index + 1} contém uma data URI.`);
        noteStatement.run([noteId, stableGuid(card.id), modelId, modifiedSeconds, -1, normalizeTags(card.tags), fields.join(FIELD_SEPARATOR), plainText(promptHtml), checksums[index], 0, ""]);
        cardStatement.run([cardId, noteId, deckId, 0, modifiedSeconds, -1, 0, 0, index + 1, 0, 0, 0, 0, 0, 0, 0, 0, ""]);
      });
    } finally {
      noteStatement.free();
      cardStatement.free();
    }
    const collection = database.export();
    const archive: Record<string, Uint8Array> = { "collection.anki2": collection };
    const mediaMap: Record<string, string> = {};
    [...mediaByName.entries()].forEach(([name, bytes], index) => {
      archive[String(index)] = bytes;
      mediaMap[String(index)] = name;
    });
    archive.media = strToU8(JSON.stringify(mediaMap));
    return { bytes: zipSync(archive, { level: 6 }), fileName: input.fileName?.endsWith(".apkg") ? input.fileName : `${slug(input.fileName || input.deckName)}.apkg`, deckId, modelId, noteCount: input.cards.length, cardCount: input.cards.length, mediaCount: mediaByName.size };
  } finally {
    database.close();
  }
}

export function apkgBlob(result: AnkiApkgResult): Blob {
  const copied = result.bytes.slice();
  return new Blob([copied.buffer], { type: APKG_MIME_TYPE });
}
