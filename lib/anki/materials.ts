import { strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { richTextPlainText, sanitizeRichTextHtml } from "../announcement-content.ts";

export type MaterialAnkiType = "multiple_choice" | "short_answer" | "image";
export type MaterialAnkiImage = { fileName: string; bytes: Uint8Array | ArrayBuffer; alt?: string };
export type MaterialAnkiCard = {
  id: string;
  type: MaterialAnkiType;
  lesson?: string;
  subtopic?: string;
  question: string;
  answer: string;
  hint?: string;
  source?: string;
  explanation?: string;
  options?: Array<{ text: string; isCorrect: boolean }>;
  image?: MaterialAnkiImage | null;
  imageBack?: MaterialAnkiImage | null;
  tags?: string[];
};
export type MaterialAnkiDeckInput = { deckName: string; cards: MaterialAnkiCard[]; description?: string; fileName?: string; generatedAt?: number };
export type MaterialAnkiResult = { bytes: Uint8Array; fileName: string; noteCount: number; cardCount: number; mediaCount: number };

const schema = `CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);CREATE TABLE notes (id INTEGER PRIMARY KEY,guid TEXT NOT NULL,mid INTEGER NOT NULL,mod INTEGER NOT NULL,usn INTEGER NOT NULL,tags TEXT NOT NULL,flds TEXT NOT NULL,sfld INTEGER NOT NULL,csum INTEGER NOT NULL,flags INTEGER NOT NULL,data TEXT NOT NULL);CREATE TABLE cards (id INTEGER PRIMARY KEY,nid INTEGER NOT NULL,did INTEGER NOT NULL,ord INTEGER NOT NULL,mod INTEGER NOT NULL,usn INTEGER NOT NULL,type INTEGER NOT NULL,queue INTEGER NOT NULL,due INTEGER NOT NULL,ivl INTEGER NOT NULL,factor INTEGER NOT NULL,reps INTEGER NOT NULL,lapses INTEGER NOT NULL,left INTEGER NOT NULL,odue INTEGER NOT NULL,odid INTEGER NOT NULL,flags INTEGER NOT NULL,data TEXT NOT NULL);CREATE TABLE revlog (id INTEGER PRIMARY KEY,cid INTEGER NOT NULL,usn INTEGER NOT NULL,ease INTEGER NOT NULL,ivl INTEGER NOT NULL,lastIvl INTEGER NOT NULL,factor INTEGER NOT NULL,time INTEGER NOT NULL,type INTEGER NOT NULL);CREATE TABLE graves (usn INTEGER NOT NULL,oid INTEGER NOT NULL,type INTEGER NOT NULL);`;
const sep = "\x1f";
const css = `.card{font-family:Arial,sans-serif;font-size:18px;line-height:1.5;color:#17243d;background:#fff;text-align:left}.material-card{max-width:780px;margin:0 auto}.material-question{font-weight:700;margin-bottom:16px}.material-image{text-align:center;margin:12px 0}.material-image img{max-width:100%;max-height:480px;object-fit:contain}.material-answer{margin-top:16px;padding:12px;border-left:4px solid #b68800;background:#fff7cf}.material-hint,.material-source{color:#59677c;font-size:.82em;margin-top:12px}.material-options{display:grid;gap:8px;list-style:none;padding:0}.material-option{padding:10px 12px;border:1px solid #d5dce8;border-radius:8px}.material-option.correct{border-color:#a8ccae;background:#edf8ef}`;
const models = {
  short: { id: 1_862_410_921, name: "Gestor Universitário · Resposta curta", fields: ["Pergunta", "Resposta", "Pista", "Fonte", "Tema"], q: `<div class="material-card"><div class="material-question">{{Pergunta}}</div>{{#Pista}}<div class="material-hint"><strong>Pista:</strong> {{Pista}}</div>{{/Pista}}</div>`, a: `{{FrontSide}}<hr id="answer"><div class="material-card"><div class="material-answer">{{Resposta}}</div>{{#Fonte}}<div class="material-source"><strong>Fonte:</strong> {{Fonte}}</div>{{/Fonte}}{{#Tema}}<div class="material-source"><strong>Tema:</strong> {{Tema}}</div>{{/Tema}}</div>` },
  image: { id: 1_862_410_922, name: "Gestor Universitário · Imagem prática", fields: ["Tema", "Pergunta", "ImagemFrente", "ImagemVerso", "Resposta", "Fonte"], q: `<div class="material-card"><div class="material-question">{{Pergunta}}</div>{{#ImagemFrente}}<div class="material-image">{{ImagemFrente}}</div>{{/ImagemFrente}}</div>`, a: `{{FrontSide}}<hr id="answer"><div class="material-card">{{#ImagemVerso}}<div class="material-image">{{ImagemVerso}}</div>{{/ImagemVerso}}<div class="material-answer">{{Resposta}}</div>{{#Fonte}}<div class="material-source"><strong>Fonte:</strong> {{Fonte}}</div>{{/Fonte}}</div>` },
  mcq: { id: 1_862_410_923, name: "Gestor Universitário · Escolha múltipla", fields: ["Pergunta", "Opcoes", "Imagem", "Resposta", "Explicacao", "Fonte"], q: `<div class="material-card"><div class="material-question">{{Pergunta}}</div>{{#Imagem}}<div class="material-image">{{Imagem}}</div>{{/Imagem}}{{Opcoes}}</div>`, a: `{{FrontSide}}<hr id="answer"><div class="material-card"><div class="material-answer">{{Resposta}}</div>{{#Explicacao}}<p>{{Explicacao}}</p>{{/Explicacao}}{{#Fonte}}<div class="material-source"><strong>Fonte:</strong> {{Fonte}}</div>{{/Fonte}}</div>` },
} as const;
let sqlitePromise: ReturnType<typeof initSqlJs> | null = null;
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const bytes = (value: Uint8Array | ArrayBuffer) => value instanceof Uint8Array ? value : new Uint8Array(value);
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "imagem.png";
const plain = (value: string) => richTextPlainText(value);
function stable(value: string): number { let hash = 0x811c9dc5; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193); } return hash >>> 0; }
function modelJson(model: typeof models[keyof typeof models], deckId: number, modified: number) { return { [String(model.id)]: { css, did: deckId, flds: model.fields.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [] })), id: String(model.id), latexPost: "\\end{document}", latexPre: "\\documentclass[12pt]{article}\\begin{document}", latexsvg: false, mod: modified, name: model.name, req: [[0, "all", [0, 1]]], sortf: 0, tags: [], tmpls: [{ name: model.name, ord: 0, qfmt: model.q, afmt: model.a, bqfmt: "", bafmt: "", bfont: "", bsize: 0, did: null }], type: 0, usn: -1, vers: [] } }; }
function optionsHtml(options: NonNullable<MaterialAnkiCard["options"]>) { return `<ol class="material-options">${options.map((option, index) => `<li class="material-option${option.isCorrect ? " correct" : ""}">${String.fromCharCode(65 + index)}. ${sanitizeRichTextHtml(option.text)}</li>`).join("")}</ol>`; }
function mediaName(image: MaterialAnkiImage, media: Map<string, Uint8Array>): string { const data = bytes(image.bytes); const name = `gu-${stable(String.fromCharCode(...data.subarray(0, Math.min(1024, data.length)))).toString(36)}-${slug(image.fileName)}`; media.set(name, data); return name; }
function validate(input: MaterialAnkiDeckInput): void { if (!input.deckName.trim() || !input.cards.length) throw new Error("O baralho precisa de nome e cartões."); const ids = new Set<string>(); for (const card of input.cards) { if (!card.id || ids.has(card.id)) throw new Error("Os cartões têm identificadores repetidos."); ids.add(card.id); if (!plain(card.question)) throw new Error("Cada cartão precisa de uma pergunta."); if (card.type === "multiple_choice" && (!card.options || card.options.length < 2 || card.options.filter((option) => option.isCorrect).length !== 1)) throw new Error("Cada pergunta de escolha múltipla precisa de opções e uma resposta correta."); if (!plain(card.answer)) throw new Error("Cada cartão precisa de uma resposta."); for (const image of [card.image, card.imageBack]) if (image && (bytes(image.bytes).length === 0 || bytes(image.bytes).length > 1024 * 1024)) throw new Error("Cada imagem deve ter entre 1 byte e 1 MiB."); } }

export async function buildMaterialApkg(input: MaterialAnkiDeckInput): Promise<MaterialAnkiResult> {
  validate(input); const generatedAt = Math.trunc(input.generatedAt || Date.now()), modified = Math.floor(generatedAt / 1000), deckId = 1_000_000_000 + stable(input.deckName) % 1_000_000_000, SQL = await (sqlitePromise ||= initSqlJs()), db = new SQL.Database(), media = new Map<string, Uint8Array>();
  const modelList = Object.values(models); try {
    db.run(schema); const config = { [String(deckId)]: { id: deckId, name: input.deckName, desc: sanitizeRichTextHtml(input.description || ""), dyn: 0, conf: 1, collapsed: false, mod: modified, usn: -1 } }; const modelsJson = Object.fromEntries(modelList.map((model) => [String(model.id), modelJson(model, deckId, modified)[String(model.id)] ]));
    db.run("INSERT INTO col VALUES (NULL,?,?,?,?,0,0,0,?,?,?,?,?)", [modified, generatedAt, generatedAt, 11, JSON.stringify({ activeDecks: [deckId], addToCur: true, curDeck: deckId, curModel: String(models.short.id), nextPos: 1 }), JSON.stringify(modelsJson), JSON.stringify(config), JSON.stringify({ "1": { id: 1, name: "Default", autoplay: true, replayq: true, timer: 0 } }), "{}"]);
    const note = db.prepare("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)"), cardStatement = db.prepare("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    try { input.cards.forEach((item, index) => { const model = models[item.type === "multiple_choice" ? "mcq" : item.type === "image" ? "image" : "short"], noteId = generatedAt + index * 2, cardId = noteId + 1;
      const frontImage = item.image ? `<img src="${esc(mediaName(item.image, media))}">` : "", backImage = item.imageBack ? `<img src="${esc(mediaName(item.imageBack, media))}">` : frontImage;
      let fields: string[]; if (item.type === "multiple_choice") fields = [sanitizeRichTextHtml(item.question), optionsHtml(item.options || []), frontImage, `<strong>Resposta correta: ${(item.options || []).find((option) => option.isCorrect)?.text || item.answer}</strong>`, sanitizeRichTextHtml(item.explanation || ""), sanitizeRichTextHtml(item.source || "")]; else if (item.type === "image") fields = [sanitizeRichTextHtml(item.subtopic || item.lesson || ""), sanitizeRichTextHtml(item.question), frontImage, backImage, sanitizeRichTextHtml(item.answer), sanitizeRichTextHtml(item.source || "")]; else fields = [sanitizeRichTextHtml(item.question), sanitizeRichTextHtml(item.answer), sanitizeRichTextHtml(item.hint || ""), sanitizeRichTextHtml(item.source || ""), sanitizeRichTextHtml(item.subtopic || item.lesson || "")];
      const tags = ` ${(item.tags || []).map((tag) => slug(tag).replaceAll("-", "_")).filter(Boolean).join(" ")} `; note.run([noteId, `gu${stable(item.id).toString(36)}`, model.id, modified, -1, tags, fields.join(sep), plain(item.question), stable(plain(item.question)), 0, ""]); cardStatement.run([cardId, noteId, deckId, 0, modified, -1, 0, 0, index + 1, 0, 0, 0, 0, 0, 0, 0, 0, ""]); }); } finally { note.free(); cardStatement.free(); }
    const archive: Record<string, Uint8Array> = { "collection.anki2": db.export() }, mediaIndex: Record<string, string> = {}; let mediaIndexValue = 0; for (const [name, data] of media) { const entry = String(mediaIndexValue++); mediaIndex[entry] = name; archive[entry] = data; } archive.media = strToU8(JSON.stringify(mediaIndex)); const zipped = zipSync(archive, { level: 6 }); return { bytes: zipped, fileName: input.fileName || `${slug(input.deckName)}.apkg`, noteCount: input.cards.length, cardCount: input.cards.length, mediaCount: media.size };
  } finally { db.close(); }
}

export function materialApkgBlob(result: MaterialAnkiResult): Blob {
  const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "application/apkg" });
}
