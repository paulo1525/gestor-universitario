import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/quiz-audio.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ enabled = 'on', hidden = false, sessionSupported = true, resumeFails = false } = {}) {
  const contexts = [], timers = new Map(), sessionTypes = [];
  let timerId = 0;
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    async resume() { if (resumeFails) throw new Error('NotAllowedError'); this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    createOscillator() { return { frequency: param, connect(target) { return target; }, start() {}, stop() {}, disconnect() {} }; }
    createGain() { return { gain: param, connect(target) { return target; }, disconnect() {} }; }
  }
  const navigator = sessionSupported ? { audioSession: { set type(value) { sessionTypes.push(value); } } } : {};
  const document = { visibilityState: hidden ? 'hidden' : 'visible' };
  const window = { AudioContext, localStorage: { getItem() { return enabled; } }, addEventListener() { assert.fail('Import must not install global audio-unlock listeners'); } };
  const compiled = { exports: {} };
  runInNewContext(code, {
    module: compiled, exports: compiled.exports, window, document, navigator,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { audio: compiled.exports, contexts, sessionTypes, timers, runTimers() { for (const callback of [...timers.values()]) callback(); timers.clear(); } };
}

test('abrir o módulo com sons guardados como ativos não inicia áudio nem toma a sessão', () => {
  const f = fixture();
  assert.equal(f.audio.readSoundEnabled(), true);
  assert.equal(f.contexts.length, 0);
  assert.deepEqual(f.sessionTypes, []);
});

test('sons desligados ou página em segundo plano não iniciam áudio', () => {
  for (const options of [{ enabled: null }, { enabled: 'off' }, { hidden: true }]) {
    const f = fixture(options);
    f.audio.playQuizSound('correct');
    assert.equal(f.contexts.length, 0);
    assert.deepEqual(f.sessionTypes, []);
  }
});

test('os sinais sonoros usam uma sessão partilhada e libertam o áudio após o sinal', () => {
  const f = fixture();
  f.audio.playQuizSound('correct');
  assert.deepEqual(f.sessionTypes, ['transient']);
  assert.equal(f.contexts[0].state, 'running');
  f.audio.playQuizSound('combo');
  assert.equal(f.contexts.length, 1);
  assert.equal(f.timers.size, 1);
  f.runTimers();
  assert.equal(f.contexts[0].state, 'suspended');
});

test('desligar sons ou sair fecha o contexto e cancela sinais pendentes', () => {
  const f = fixture();
  f.audio.playQuizSound('win');
  f.audio.stopQuizSound();
  assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.timers.size, 0);
  f.audio.stopQuizSound();
  f.audio.playQuizSound('wrong');
  assert.equal(f.contexts.length, 2);
});

test('navegadores sem Audio Session e recusas de reprodução não bloqueiam o teste', async () => {
  const f = fixture({ sessionSupported: false, resumeFails: true });
  assert.doesNotThrow(() => f.audio.playQuizSound('correct'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.contexts.length, 1);
  f.audio.stopQuizSound();
});
