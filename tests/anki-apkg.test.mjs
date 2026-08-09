import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { buildMcqApkg } from "../lib/anki/apkg.ts";
import { buildQuizExportApkg, defaultQuizImageResolver } from "../lib/anki/quiz-export.ts";

const onePixelPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

function question(id, withImage = false) {
  return {
    id,
    promptHtml: `<p>Qual é a relação anatómica pedida na pergunta ${id}?</p>`,
    options: [
      { html: "A primeira opção", isCorrect: false },
      { html: "A segunda opção", isCorrect: true },
      { html: "A terceira opção", isCorrect: false },
      { html: "A quarta opção", isCorrect: false },
    ],
    explanationHtml: "<p>A segunda opção é correta porque descreve integralmente a relação anatómica apresentada.</p>",
    sourceHtml: "Aula 1 · Neuroanatomia",
    tags: ["neuroanatomia", "aula 1"],
    image: withImage ? { fileName: "corte sagital.png", bytes: onePixelPng, alt: "Corte sagital esquemático" } : null,
  };
}

test("gera e reabre um APKG MCQ com SQLite, note type, cartões e media real", async () => {
  const result = await buildMcqApkg({ deckName: "Neuroanatomia::Aula 1", cards: [question("q1", true), question("q2")], generatedAt: 1_800_000_000_000 });
  assert.equal(result.noteCount, 2);
  assert.equal(result.cardCount, 2);
  assert.equal(result.mediaCount, 1);
  assert.match(result.fileName, /\.apkg$/);

  const files = unzipSync(result.bytes);
  assert.ok(files["collection.anki2"]);
  assert.ok(files.media);
  const media = JSON.parse(strFromU8(files.media));
  assert.deepEqual(Object.keys(media), ["0"]);
  assert.match(media["0"], /^gu-[a-z0-9]+-corte-sagital\.png$/);
  assert.deepEqual(files["0"], onePixelPng);

  const SQL = await initSqlJs();
  const db = new SQL.Database(files["collection.anki2"]);
  try {
    assert.equal(db.exec("SELECT COUNT(*) AS n FROM notes")[0].values[0][0], 2);
    assert.equal(db.exec("SELECT COUNT(*) AS n FROM cards")[0].values[0][0], 2);
    assert.equal(db.exec("SELECT COUNT(*) AS n FROM revlog")[0].values[0][0], 0);
    const collection = db.exec("SELECT models,decks FROM col")[0].values[0];
    const models = JSON.parse(collection[0]);
    const decks = JSON.parse(collection[1]);
    const model = models[String(result.modelId)];
    assert.equal(model.name, "Gestor Universitário · Escolha múltipla");
    assert.deepEqual(model.flds.map((field) => field.name), ["Enunciado", "Opcoes", "Imagem", "Resposta", "Explicacao", "Fonte"]);
    assert.match(model.tmpls[0].qfmt, /\{\{Enunciado\}\}[\s\S]*\{\{Imagem\}\}[\s\S]*\{\{Opcoes\}\}/);
    assert.match(model.tmpls[0].afmt, /Resposta[\s\S]*Explicacao/);
    assert.equal(decks[String(result.deckId)].name, "Neuroanatomia::Aula 1");

    const notes = db.exec("SELECT guid,flds,csum FROM notes ORDER BY id")[0].values;
    assert.equal(new Set(notes.map((note) => note[0])).size, 2);
    const fields = notes[0][1].split("\x1f");
    assert.equal(fields.length, 6);
    assert.match(fields[1], /<li class="mcq-option">/);
    assert.equal((fields[1].match(/mcq-option"/g) || []).length, 4);
    assert.match(fields[2], new RegExp(`<img src="${media["0"]}"`));
    assert.match(fields[3], /Resposta correta: B/);
    assert.match(fields[4], /segunda opção é correta/);
    const expectedChecksum = Number.parseInt(createHash("sha1").update("Qual é a relação anatómica pedida na pergunta q1?").digest("hex").slice(0, 8), 16);
    assert.equal(notes[0][2], expectedChecksum);
    assert.notEqual(notes[0][2], 0);
    assert.equal(notes.some((note) => /data:image\//i.test(note[1])), false);
  } finally {
    db.close();
  }
});

test("deduplica media igual e rejeita data URI ou MCQ editorialmente incompleto", async () => {
  const repeated = question("q2", true);
  const result = await buildMcqApkg({ deckName: "Teste", cards: [question("q1", true), repeated], generatedAt: 1_800_000_000_000 });
  assert.equal(result.mediaCount, 1);
  assert.equal(Object.keys(unzipSync(result.bytes)).filter((name) => /^\d+$/.test(name)).length, 1);

  await assert.rejects(() => buildMcqApkg({ deckName: "Teste", cards: [{ ...question("q3"), promptHtml: 'Enunciado <img src="data:image/png;base64,AAAA">' }], generatedAt: 1_800_000_000_000 }), /data URI/);
  await assert.rejects(() => buildMcqApkg({ deckName: "Teste", cards: [{ ...question("q4"), explanationHtml: "Curta." }], generatedAt: 1_800_000_000_000 }), /mínimo de 20 caracteres/);
});

test("remove HTML perigoso mesmo quando as tags incluem espaÃ§os", async () => {
  const unsafe = question("unsafe");
  unsafe.promptHtml = '<script >alert("x")</script ><p>Pergunta segura</p>';
  unsafe.explanationHtml = '<style >body{display:none}</style ><p>ExplicaÃ§Ã£o segura e suficientemente desenvolvida.</p>';
  const result = await buildMcqApkg({ deckName: "Teste seguro", cards: [unsafe], generatedAt: 1_800_000_000_000 });
  const files = unzipSync(result.bytes);
  const SQL = await initSqlJs();
  const db = new SQL.Database(files["collection.anki2"]);
  try {
    const fields = db.exec("SELECT flds FROM notes")[0].values[0][0];
    assert.doesNotMatch(fields, /<\/?(?:script|style)\b/i);
    assert.match(fields, /Pergunta segura/);
    assert.match(fields, /ExplicaÃ§Ã£o segura/);
  } finally {
    db.close();
  }
});

test("adapta diretamente o payload de /api/quizzes/export e converte imageUrl em media", async () => {
  const encodedImage = Buffer.from(onePixelPng).toString("base64");
  const payload = {
    deck: { name: "Neuroanatomia::Aula 1", unitId: "neuro", unitCode: "NEURO", unitName: "Neuroanatomia", mode: "topic", questionCount: 1 },
    questions: [{
      id: "question-1", topicId: "topic-1", topicTitle: "Organização geral", prompt: "<p>Qual é a opção correta?</p>", imageUrl: `data:image/png;base64,${encodedImage}`,
      explanation: "<p>A opção B descreve corretamente a organização geral do sistema nervoso.</p>", difficulty: "easy", correctOptionId: "b",
      options: [{ id: "c", text: "Opção C", position: 3 }, { id: "a", text: "<strong>Opção A</strong>", position: 1 }, { id: "d", text: "Opção D", position: 4 }, { id: "b", text: "Opção B", position: 2 }],
    }],
  };
  const result = await buildQuizExportApkg(payload, { generatedAt: 1_800_000_000_000 });
  const files = unzipSync(result.bytes);
  const media = JSON.parse(strFromU8(files.media));
  assert.equal(Object.keys(media).length, 1);
  assert.deepEqual(files["0"], onePixelPng);
  const SQL = await initSqlJs();
  const db = new SQL.Database(files["collection.anki2"]);
  try {
    const fields = db.exec("SELECT flds FROM notes")[0].values[0][0].split("\x1f");
    assert.match(fields[1], /A\.[\s\S]*&lt;strong&gt;Opção A&lt;\/strong&gt;[\s\S]*B\.[\s\S]*Opção B[\s\S]*C\.[\s\S]*Opção C[\s\S]*D\.[\s\S]*Opção D/);
    assert.doesNotMatch(fields[1], /<strong>Opção A<\/strong>/);
    assert.match(fields[2], new RegExp(media["0"]));
    assert.match(fields[3], /Resposta correta: B/);
    assert.equal(fields.some((field) => /data:image\//i.test(field)), false);
  } finally {
    db.close();
  }
});

test("bloqueia imagens superiores a 1 MiB pelo cabeçalho e pelos bytes resolvidos", async () => {
  const oversized = new Uint8Array((1024 * 1024) + 1);
  const baseQuestion = { id: "large", topicId: "topic", topicTitle: "Tema", prompt: "Pergunta", imageUrl: "/large.png", explanation: "Explicação suficientemente desenvolvida.", difficulty: "easy", correctOptionId: "b", options: [] };
  await assert.rejects(() => defaultQuizImageResolver("/large.png", baseQuestion, async () => new Response(null, { status: 200, headers: { "content-type": "image/png", "content-length": String(oversized.length) } })), /1 MiB/);
  const payload = { deck: { name: "Teste", unitId: "u", unitCode: "UC", unitName: "Unidade", mode: "quick", questionCount: 1 }, questions: [{ ...baseQuestion, options: [{ id: "a", text: "A", position: 1 }, { id: "b", text: "B", position: 2 }, { id: "c", text: "C", position: 3 }, { id: "d", text: "D", position: 4 }] }] };
  await assert.rejects(() => buildQuizExportApkg(payload, { resolveImage: async () => ({ fileName: "large.png", bytes: oversized }), generatedAt: 1_800_000_000_000 }), /1 MiB/);
});
