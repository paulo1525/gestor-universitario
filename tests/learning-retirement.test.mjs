import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import initSqlJs from 'sql.js/dist/sql-asm.js';

const source = await readFile(new URL('../lib/app-modules.ts', import.meta.url), 'utf8');
const compiled = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(compiled, compiled.exports);
const { APP_MODULES, moduleEffectiveEnabled } = compiled.exports;

test('Aprender matéria fica arquivado e o catálogo de Testes inicia fechado', async () => {
  const learning = APP_MODULES.find((module) => module.key === 'quizzes.learning');
  assert.equal(learning.retired, true);
  assert.equal(learning.defaultEnabled, false);
  assert.equal(moduleEffectiveEnabled('quizzes.learning', { 'quizzes.learning': true }), false);

  const hub = await readFile(new URL('../components/quiz-hub.tsx', import.meta.url), 'utf8');
  assert.match(hub, /expandedUnitId/);
  assert.match(hub, /setExpandedUnitId\(\(current\) => current === unitId \? null : unitId\)/);
  assert.doesNotMatch(hub, /href="\/testes\/aprender"/);
  assert.doesNotMatch(await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'), /handleLearningRoute|isLearningPath/);
});

test('migration desativa a entrada persistida do módulo arquivado', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run('CREATE TABLE app_module_settings (module_key TEXT PRIMARY KEY, enabled INTEGER, updated_by TEXT, updated_at INTEGER); INSERT INTO app_module_settings VALUES (\'quizzes.learning\',1,\'admin\',1);');
    db.run(await readFile(new URL('../migrations/0117_retire_learning_module.sql', import.meta.url), 'utf8'));
    assert.deepEqual(db.exec("SELECT enabled,updated_by FROM app_module_settings WHERE module_key='quizzes.learning'")[0].values[0], [0, null]);
  } finally {
    db.close();
  }
});
