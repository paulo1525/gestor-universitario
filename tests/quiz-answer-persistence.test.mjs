import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import initSqlJs from 'sql.js/dist/sql-asm.js';

async function compile(path, require = () => { throw new Error('Unexpected dependency'); }) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', code)(compiled, compiled.exports, require);
  return compiled.exports;
}
const richText = await compile('../lib/announcement-content.ts');
const { handleQuizRoute } = await compile('../worker/quizzes.ts', (path) => {
  assert.equal(path, '../lib/announcement-content');
  return richText;
});
const SQL = await initSqlJs();
const user = { id: 'student-test', email: 'student@example.test', fullName: 'Estudante fictício', role: 'student' };
function fixture(mode = 'quick') {
  const db = new SQL.Database();
  db.run(`CREATE TABLE quiz_attempts (id TEXT PRIMARY KEY,user_id TEXT,mode TEXT,status TEXT,expires_at INTEGER,duration_seconds INTEGER DEFAULT 300,answered_count INTEGER DEFAULT 0,correct_count INTEGER DEFAULT 0,updated_at INTEGER,completed_at INTEGER,config_json TEXT);
    CREATE TABLE quiz_topics (id TEXT PRIMARY KEY,title TEXT);
    CREATE TABLE quiz_attempt_questions (attempt_id TEXT,question_id TEXT,topic_id TEXT,selected_option_id TEXT,correct_option_id TEXT,is_correct INTEGER,answered_at INTEGER,options_json TEXT,explanation TEXT,position INTEGER,PRIMARY KEY(attempt_id,question_id));`);
  db.run('INSERT INTO quiz_attempts (id,user_id,mode,status,expires_at,config_json) VALUES (?,?,?,?,?,?)', ['attempt-test', user.id, mode, 'active', Date.now() + 300000, JSON.stringify({ answerFormat: 'short_answer', shortAnswerMode: 'reveal_and_self_assess' })]);
  db.run('INSERT INTO quiz_attempt_questions (attempt_id,question_id,correct_option_id,options_json,position) VALUES (?,?,?,?,1)', ['attempt-test','q-test','a',JSON.stringify([{ id:'a', text:'Resposta A', position:1 }, { id:'b', text:'Resposta B', position:2 }])]);
  const env = { DB: { prepare(sql) {
    let bindings = [];
    const execute = () => { const statement = db.prepare(sql); try { statement.bind(bindings); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return rows; } finally { statement.free(); } };
    return { bind(...values) { bindings = values; return this; }, async first() { return execute()[0] ?? null; }, async all() { return { results: execute() }; }, async run() { execute(); return { meta: { changes: db.getRowsModified() } }; } };
  } } };
  const request = async (optionId = 'a', actor = user) => {
    const url = new URL('https://example.test/api/quiz-attempts/attempt-test/answers');
    return handleQuizRoute(new Request(url, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({questionId:'q-test',optionId}) }),env,url,actor,async()=>true);
  };
  return { db, env, request };
}

test('repetir uma resposta após perda de rede é idempotente e preserva o instante original', async () => {
  const { db, request } = fixture();
  try {
    assert.equal((await request()).status, 200);
    const first = db.exec('SELECT answered_at FROM quiz_attempt_questions')[0].values[0][0];
    const retry = await request();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).answer.correct, true);
    assert.equal(db.exec('SELECT answered_at FROM quiz_attempt_questions')[0].values[0][0], first);
    assert.deepEqual(db.exec('SELECT answered_count,correct_count FROM quiz_attempts')[0].values, [[1,1]]);
    assert.equal((await request('b')).status, 409);
    assert.equal(db.exec('SELECT selected_option_id FROM quiz_attempt_questions')[0].values[0][0], 'a');
  } finally { db.close(); }
});

test('pedidos simultâneos não substituem uma resposta de treino já corrigida', async () => {
  const { db, request } = fixture();
  try {
    const responses = await Promise.all([request('a'), request('b')]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200,409]);
    assert.equal(db.exec('SELECT selected_option_id FROM quiz_attempt_questions')[0].values[0][0], 'a');
  } finally { db.close(); }
});

test('o simulado admite revisão sem revelar a correção antecipadamente', async () => {
  const { db, request } = fixture('exam');
  try {
    assert.equal((await request('b')).status, 200);
    const revised = await request('a');
    assert.equal(revised.status, 200);
    const result = await revised.json();
    assert.equal(result.answer.correct, undefined);
    assert.equal(result.question, undefined);
    assert.equal(db.exec('SELECT selected_option_id FROM quiz_attempt_questions')[0].values[0][0], 'a');
  } finally { db.close(); }
});

test('outra conta e uma sessão concluída não podem modificar respostas', async () => {
  const { db, request } = fixture();
  try {
    assert.equal((await request('a', { ...user, id: 'other-student' })).status, 404);
    db.run("UPDATE quiz_attempts SET status='completed'");
    assert.equal((await request()).status, 409);
    assert.equal(db.exec('SELECT selected_option_id FROM quiz_attempt_questions')[0].values[0][0], null);
  } finally { db.close(); }
});

test('recuperar uma tentativa mantém o formato e o modo de autoavaliação', async () => {
  const { db, env } = fixture();
  try {
    const url = new URL('https://example.test/api/quiz-attempts/attempt-test');
    const response = await handleQuizRoute(new Request(url), env, url, user, async () => true);
    assert.equal(response.status, 200);
    const { attempt } = await response.json();
    assert.equal(attempt.answerFormat, 'short_answer');
    assert.equal(attempt.shortAnswerMode, 'reveal_and_self_assess');
    assert.equal(attempt.questions[0].topic, 'Tema geral');
  } finally { db.close(); }
});

async function timer(f, action, reason = 'manual', actor = user) {
  const url = new URL('https://example.test/api/quiz-attempts/attempt-test/timer');
  return handleQuizRoute(new Request(url, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({action,reason}) }), f.env, url, actor, async()=>true);
}

test('pausar conserva o tempo, é idempotente e retomar gera um novo prazo', async () => {
  const f = fixture();
  try {
    const paused = await (await timer(f, 'pause')).json();
    assert.equal(paused.attempt.timerPaused, true);
    assert.equal(paused.attempt.expiresAt, null);
    assert.equal((await f.request()).status, 409);
    assert.ok(paused.attempt.pausedRemainingSeconds >= 299);
    const again = await (await timer(f, 'pause')).json();
    assert.equal(again.attempt.pausedRemainingSeconds, paused.attempt.pausedRemainingSeconds);
    const resumed = await (await timer(f, 'resume')).json();
    assert.equal(resumed.attempt.timerPaused, false);
    assert.ok(resumed.attempt.expiresAt > Date.now() + 298000);
    const duplicate = await (await timer(f, 'resume')).json();
    assert.equal(duplicate.attempt.expiresAt, resumed.attempt.expiresAt);
  } finally { f.db.close(); }
});

test('voltar ao separador retoma apenas pausas automáticas', async () => {
  const f = fixture();
  try {
    await timer(f, 'pause', 'automatic');
    let response = await (await timer(f, 'resume', 'automatic')).json();
    assert.equal(response.attempt.timerPaused, false);
    await timer(f, 'pause', 'manual');
    await timer(f, 'pause', 'automatic');
    response = await (await timer(f, 'resume', 'automatic')).json();
    assert.equal(response.attempt.timerPaused, true);
    assert.equal(response.attempt.pauseReason, 'manual');
    response = await (await timer(f, 'resume', 'manual')).json();
    assert.equal(response.attempt.timerPaused, false);
  } finally { f.db.close(); }
});

test('uma sessão sem tempo mantém o prazo nulo ao pausar e retomar', async () => {
  const f = fixture();
  try {
    f.db.run('UPDATE quiz_attempts SET duration_seconds=NULL,expires_at=NULL');
    for (const action of ['pause','resume']) {
      const {attempt} = await (await timer(f, action)).json();
      assert.equal(attempt.timed, false);
      assert.equal(attempt.durationSeconds, null);
      assert.equal(attempt.expiresAt, null);
      assert.equal(attempt.timerPaused, false);
    }
    assert.equal((await f.request()).status, 200);
  } finally { f.db.close(); }
});

test('não é possível ressuscitar o prazo expirado nem pausar a sessão de outra conta', async () => {
  const f = fixture();
  try {
    assert.equal((await timer(f, 'pause', 'manual', {...user,id:'other'})).status, 404);
    f.db.run('UPDATE quiz_attempts SET expires_at=?', [Date.now()-1000]);
    const {attempt} = await (await timer(f, 'pause')).json();
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.timerPaused, false);
  } finally { f.db.close(); }
});
