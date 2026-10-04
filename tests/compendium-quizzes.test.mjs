import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { normalizeQuestion, SOURCES } from '../scripts/prepare-compendium-banks.mjs';

async function compile(relative, require = () => { throw new Error('Unexpected import'); }) {
  const code = ts.transpileModule(await readFile(new URL(relative, import.meta.url),'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = {exports:{}};
  new Function('module','exports','require',code)(compiled,compiled.exports,require);
  return compiled.exports;
}
const richText = await compile('../lib/announcement-content.ts');
const { handleQuizRoute } = await compile('../worker/quizzes.ts', () => richText);
const SQL = await initSqlJs();

// Keep each SQLite preparation bounded, like D1's migration runner.
function runScript(db, sql) {
 let start=0, quoted=false, comment=false;
 for(let index=0;index<sql.length;index++) {
   const char=sql[index];
   if(comment) {if(char==='\n')comment=false;continue;}
   if(!quoted && char==='-' && sql[index+1]==='-') {comment=true;index++;continue;}
   if(char==="'") {if(quoted && sql[index+1]==="'")index++;else quoted=!quoted;continue;}
   if(char===';' && !quoted) {db.run(sql.slice(start,index+1));start=index+1;}
 }
 if(sql.slice(start).trim()) db.run(sql.slice(start));
}

test('fontes restringem a importação às três UCs pedidas e preservam a opção E', () => {
  assert.deepEqual(SOURCES.map(source=>source[0]),['FIS1','NEURO','AR']);
  const q=normalizeQuestion({id:'visual',enunciado:'Identifique a estrutura',alternativas_editoriais:['A','B','C','D','E'].map(letra=>({letra,texto:`Estrutura ${letra}`})),resposta_editorial:'E — Estrutura E',estado:'confirmada',media_editorial:{sem:[{ficheiro:'Media/pergunta.png',sha256:'p'}],com:[{ficheiro:'Media/pergunta.png',sha256:'p'},{ficheiro:'Media/solucao.png',sha256:'s'}]}},0,'AR');
  assert.equal(q.options.length,5); assert.equal(q.correctOption,4); assert.equal(q.published,true);
  assert.equal(q.questionImages.length,1); assert.equal(q.solutionImages.length,1);
  const open=normalizeQuestion({id:'open',text_display:'Defina núcleo.',options:[],validation:{status:'corrigida',verified_answer:'Agrupamento de corpos celulares.'}},0,'NEURO');
  assert.equal(open.responseType,'short_answer'); assert.deepEqual(open.options,[]); assert.equal(open.published,true);
  assert.equal(normalizeQuestion({id:'review',enunciado:'Questão ambígua',resposta_verificada:'A',estado:'ambígua'},0,'AR').published,false);
});

test('migrations e API integram perguntas abertas, cinco opções e imagens sem perder progresso', async () => {
  const db=new SQL.Database();
  try {
    db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT,created_at INTEGER);
      CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,name TEXT,active INTEGER,ects INTEGER,study_year INTEGER,semester INTEGER);
      CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_by TEXT,updated_at INTEGER);
      INSERT INTO users VALUES('admin','admin',0),('student','student',0);
      INSERT INTO curricular_units VALUES('fis','FIS1','Fisiologia I',1,8,2,1),('neuro','NEURO','Neuroanatomia',1,6,2,1),('ar','AR','Anatomia Radiológica',1,4,2,1);`);
    db.run(await readFile(new URL('../migrations/0030_quizzes.sql',import.meta.url),'utf8'));
    const old=await readFile(new URL('../migrations/0059_question_bank_neuro.sql',import.meta.url),'utf8');
    db.run(old.slice(0,old.indexOf('DROP TABLE IF EXISTS _seed_neuro_question_bank_context')));
    db.run("INSERT INTO quiz_attempts(id,user_id,mode,status,question_count,started_at,created_at,updated_at) VALUES('prior','student','quick','completed',5,0,0,0);");
    db.run(await readFile(new URL('../migrations/0113_restore_quizzes_compendium_images.sql',import.meta.url),'utf8'));
    db.run("BEGIN;");
    runScript(db,await readFile(new URL('../migrations/0114_import_fisio_neuro_radiology_compendiums.sql',import.meta.url),'utf8'));
    db.run("COMMIT;");
    assert.equal(db.exec("SELECT COUNT(*) FROM question_bank_items WHERE source_id LIKE 'compendium-source-%'")[0].values[0][0],2584);
    assert.equal(db.exec("SELECT COUNT(*) FROM quiz_attempts WHERE id='prior'")[0].values[0][0],1);
    assert.deepEqual(db.exec('PRAGMA foreign_key_check'),[]);
    assert.ok(db.exec("SELECT COUNT(*) FROM quiz_question_options WHERE position=5")[0].values[0][0]>1000);
    assert.equal(db.exec("SELECT COUNT(*) FROM quiz_question_options o JOIN quiz_questions q ON q.id=o.question_id WHERE q.response_type<>'multiple_choice'")[0].values[0][0],0);
    const env={ DB:{ prepare(sql){let bindings=[]; const execute=()=>{const statement=db.prepare(sql); try{statement.bind(bindings);const rows=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}};return {bind(...values){bindings=values;return this;},async first(){return execute()[0]??null;},async all(){return {results:execute()};},async run(){execute();return {meta:{changes:db.getRowsModified()}};}};},async batch(statements){for(const statement of statements)await statement.run();} } };
    const user={id:'student',email:'student@example.test',fullName:'Estudante fictício',role:'student'};
    const request=async (pathname,body,method='POST')=>{const url=new URL(pathname,'https://example.test');return handleQuizRoute(new Request(url,{method,headers:{'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),env,url,user,async key=>key!=='quizzes.progress');};
    const short=await request('/api/quiz-attempts',{mode:'quick',unitId:'neuro',questionCount:5,timed:false,answerFormat:'short_answer',shortAnswerMode:'reveal_and_self_assess'});
    assert.equal(short.status,201);const open=(await short.json()).attempt;
    assert.equal(open.answerFormat,'short_answer');assert.equal(open.questions.length,5);
    assert.ok(open.questions.every(q=>q.options[0].text && !q.solutionImageUrls));
    const mc=await request('/api/quiz-attempts',{mode:'exam',unitId:'fis',questionCount:5,timed:false});
    assert.equal(mc.status,201);const exam=(await mc.json()).attempt;
    assert.ok(exam.questions.every(q=>q.options.length===5));assert.ok(exam.questions.every(q=>q.correctOptionId===undefined && q.solutionImageUrls===undefined));
    const source=db.exec("SELECT question_images_json,solution_images_json FROM quiz_questions WHERE solution_images_json<>'[]' AND curricular_unit_id='ar' LIMIT 1")[0];
    assert.ok(source);assert.ok(JSON.parse(source.values[0][1]).length>0);
    // Repeatable imports retain existing attempts and stable source IDs.
    runScript(db,await readFile(new URL('../migrations/0114_import_fisio_neuro_radiology_compendiums.sql',import.meta.url),'utf8'));
    assert.equal(db.exec("SELECT COUNT(*) FROM question_bank_items WHERE source_id LIKE 'compendium-source-%'")[0].values[0][0],2584);
    assert.equal(db.exec("SELECT COUNT(*) FROM quiz_attempts WHERE id='prior'")[0].values[0][0],1);
    db.run(await readFile(new URL('../migrations/0116_archive_fisio_short_answers.sql',import.meta.url),'utf8'));
    assert.equal(db.exec("SELECT COUNT(*) FROM quiz_questions q JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE cu.code='FIS1' AND q.status='published' AND q.response_type<>'multiple_choice'")[0].values[0][0],0);
    assert.equal(db.exec("SELECT COUNT(*) FROM quiz_questions q JOIN curricular_units cu ON cu.id=q.curricular_unit_id WHERE cu.code='FIS1' AND q.status='published' AND q.response_type='multiple_choice'")[0].values[0][0],1106);
    assert.equal(db.exec("SELECT published_count FROM question_bank_sources WHERE id='compendium-source-fis1'")[0].values[0][0],1106);
  } finally {db.close();}
});
