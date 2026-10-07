import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import * as fflate from 'fflate';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { readNeuroAnki, mergeNeuroAnki } from '../scripts/import-neuro-anki-tests.mjs';
import { configuredQuizContentKey } from '../scripts/pack-quiz-content.mjs';

async function compile(relative, dependencies = {}) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', code)(compiled, compiled.exports, name => {
    assert.ok(name in dependencies, 'Unexpected dependency: ' + name);
    return dependencies[name];
  });
  return compiled.exports;
}
const richText = await compile('../lib/announcement-content.ts');
const { buildMaterialApkg } = await compile('../lib/anki/materials.ts', { fflate, 'sql.js/dist/sql-asm.js': initSqlJs, '../announcement-content.ts': richText });
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=', 'base64'));

async function deck(deckName = 'Neuroanatomia::AT1') {
  return buildMaterialApkg({ deckName, generatedAt: 1000000, cards: [
    { id: 'plain', type: 'short_answer', question: '<strong>Pergunta fictícia</strong>', answer: 'Resposta fictícia', hint: 'Pista fictícia', source: 'Fonte fictícia' },
    { id: 'image', type: 'image', question: 'Identificação fictícia', answer: '<p>Estrutura fictícia</p>', image: { fileName: 'front.png', bytes: png }, imageBack: { fileName: 'back.png', bytes: png } },
  ] });
}

test('converter Anki preserva perguntas, respostas, pistas, fontes e imagens dos dois lados', async () => {
  const original = await deck();
  const imported = await readNeuroAnki(original.bytes, 'neuro', 12345);
  assert.deepEqual(imported.counts, { cards: 2, lessons: 1 });
  assert.equal(imported.topics[0].title, 'AT1');
  assert.equal(imported.topics[0].id, 'anki-neuro-lesson-at1');
  assert.ok(imported.questions.every(question => question.response_type === 'short_answer'));
  assert.match(imported.questions[0].prompt, /Pergunta fictícia/);
  assert.match(imported.questions[0].prompt, /Pista fictícia/);
  assert.match(imported.questions[0].answer_text, /Resposta fictícia/);
  assert.match(imported.questions[0].answer_text, /Fonte fictícia/);
  assert.match(imported.questions[1].answer_text, /Estrutura fictícia/);
  assert.equal(JSON.parse(imported.questions[1].question_images_json).length, 1);
  assert.equal(JSON.parse(imported.questions[1].solution_images_json).length, 1);
  assert.match(imported.questions[1].image_url, /^data:image\/png;base64,/);
  assert.deepEqual(imported.options, []);
});

test('reimportar preserva identidades e não duplica cartões nem modifica perguntas do compêndio', async () => {
  const original = await deck();
  const first = await readNeuroAnki(original.bytes, 'neuro', 10);
  const second = await readNeuroAnki(original.bytes, 'neuro', 20);
  assert.deepEqual(first.questions.map(question => question.id), second.questions.map(question => question.id));
  const tables = { quiz_topics: [{ id: 'existing-topic' }], quiz_questions: [{ id: 'existing-question', prompt: 'Preservar' }], quiz_question_options: [{ id: 'existing-option' }], question_bank_items: [{ id: 'existing-bank' }] };
  const result = mergeNeuroAnki(mergeNeuroAnki(tables, first), second);
  assert.equal(result.quiz_questions.length, 3);
  assert.equal(result.quiz_topics.length, 2);
  assert.deepEqual(result.quiz_questions[0], tables.quiz_questions[0]);
  assert.deepEqual(result.quiz_question_options, tables.quiz_question_options);
  assert.deepEqual(result.question_bank_items, tables.question_bank_items);
  assert.equal(result.quiz_questions[1].created_at, 10);
});

test('aulas ambíguas e imagens em falta impedem uma importação incompleta', async () => {
  await assert.rejects(readNeuroAnki((await deck('Neuroanatomia::AT1::AP1')).bytes, 'neuro'), /ambígua/);
  const archive = fflate.unzipSync((await deck()).bytes);
  const media = JSON.parse(fflate.strFromU8(archive.media));
  delete archive[Object.keys(media)[0]];
  await assert.rejects(readNeuroAnki(fflate.zipSync(archive), 'neuro'), /Imagem em falta/);
});

test('a aula do subbaralho prevalece sobre etiquetas de referência cruzada', async () => {
  const archive = fflate.unzipSync((await deck('Neuroanatomia::Resposta curta::AP5')).bytes);
  const SQL = await initSqlJs();
  const db = new SQL.Database(archive['collection.anki2']);
  db.run("UPDATE notes SET tags=' AP1 ap5 origem_codex '");
  archive['collection.anki2'] = db.export();
  db.close();
  const imported = await readNeuroAnki(fflate.zipSync(archive), 'neuro');
  assert.deepEqual(imported.topics.map(topic => topic.title), ['AP5']);
});

test('imagens do pack real entre 1 e 3 MiB são conservadas sem reduzir a resolução', async () => {
  const archive = fflate.unzipSync((await deck()).bytes);
  const media = JSON.parse(fflate.strFromU8(archive.media));
  const entry = Object.keys(media)[0];
  const bytes = new Uint8Array(2 * 1024 * 1024);
  bytes.set(png);
  archive[entry] = bytes;
  const imported = await readNeuroAnki(fflate.zipSync(archive), 'neuro');
  assert.equal(Buffer.from(imported.questions[1].image_url.split(',')[1], 'base64').length, bytes.length);
  archive[entry] = new Uint8Array(3 * 1024 * 1024 + 1);
  await assert.rejects(readNeuroAnki(fflate.zipSync(archive), 'neuro'), /superior a 3 MiB/);
});

test('empacotar exige uma chave privada explícita e nunca gera outra automaticamente', () => {
  assert.throws(() => configuredQuizContentKey(undefined, ''), /No key was generated or changed/);
  assert.throws(() => configuredQuizContentKey('invalid'), /32-byte/);
  const key = Buffer.alloc(32, 9).toString('base64');
  assert.equal(configuredQuizContentKey(undefined, 'QUIZ_CONTENT_KEY=' + key), key);
  assert.equal(configuredQuizContentKey(key, 'QUIZ_CONTENT_KEY=invalid'), key);
});
