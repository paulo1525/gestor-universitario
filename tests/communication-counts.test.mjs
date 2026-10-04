import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import initSqlJs from 'sql.js/dist/sql-asm.js';
const source=await readFile(new URL('../worker/communication-counts.ts',import.meta.url),'utf8');
const compiled={exports:{}};
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(compiled,compiled.exports);
const {unreadAnnouncementCount,recordAnnouncementRead,unansweredPollCount}=compiled.exports;
const SQL=await initSqlJs();
function adapter(db) {return {prepare(sql){let values=[];const execute=()=>{const statement=db.prepare(sql);try{statement.bind(values);const rows=[];while(statement.step()) rows.push(statement.getAsObject());return rows;}finally{statement.free();}};return {bind(...args){values=args;return this;},async first(){return execute()[0]??null;},async all(){return {results:execute()};},async run(){execute();}};}};}
test('avisos contam leituras por pessoa, respeitam audiência e voltam a contar após republicação',async()=>{
 const db=new SQL.Database();try {
 db.run(`PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,study_year INTEGER); INSERT INTO users VALUES('a',2),('b',3);
 CREATE TABLE curricular_unit_representatives(curricular_unit_id TEXT,user_id TEXT);
 CREATE TABLE announcements(id TEXT PRIMARY KEY,status TEXT,expires_at INTEGER,published_at INTEGER,audience_scope TEXT,audience_year INTEGER,audience_unit_id TEXT);
 CREATE TABLE announcement_acknowledgements(announcement_id TEXT,user_id TEXT,acknowledged_at INTEGER);
 INSERT INTO announcements VALUES('all','published',NULL,1,'all',NULL,NULL),('year','published',NULL,1,'year',2,NULL),('unit','published',NULL,1,'unit',NULL,'neuro'),('expired','published',5,1,'all',NULL,NULL),('archive','archived',NULL,1,'all',NULL,NULL);
 INSERT INTO announcement_acknowledgements VALUES('all','b',2);`);
 db.run(await readFile(new URL('../migrations/0115_announcement_read_counts.sql',import.meta.url),'utf8'));
 const env=adapter(db);
 assert.equal(await unreadAnnouncementCount(env,'a',false,10),2);
 assert.equal(await unreadAnnouncementCount(env,'b',false,10),0);
 assert.equal(await unreadAnnouncementCount(env,'b',true,10),2);
 await recordAnnouncementRead(env,'all','a',10);await recordAnnouncementRead(env,'all','a',11);
 assert.equal(await unreadAnnouncementCount(env,'a',false,12),1);
 assert.equal(await unreadAnnouncementCount(env,'b',false,12),0);
 db.run("UPDATE announcements SET published_at=13 WHERE id='all';");
 assert.equal(await unreadAnnouncementCount(env,'a',false,14),2);
 db.run("INSERT INTO curricular_unit_representatives VALUES('neuro','a');");
 assert.equal(await unreadAnnouncementCount(env,'a',false,14),3);
 }finally{db.close();}
});
test('inquéritos contam apenas os ativos sem resposta da própria pessoa',async()=>{
 const db=new SQL.Database();try {
 db.run(`CREATE TABLE polls(id TEXT,status TEXT,starts_at INTEGER,ends_at INTEGER); CREATE TABLE poll_participations(poll_id TEXT,voter_hash TEXT);
 INSERT INTO polls VALUES('active','published',NULL,NULL),('second','published',5,20),('future','published',11,NULL),('expired','published',NULL,10),('closed','closed',NULL,NULL),('draft','draft',NULL,NULL);
 INSERT INTO poll_participations VALUES('active','a:active');`);
 const env=adapter(db);
 assert.equal(await unansweredPollCount(env,async id=>'a:'+id,10),1);
 assert.equal(await unansweredPollCount(env,async id=>'b:'+id,10),2);
 db.run("INSERT INTO poll_participations VALUES('second','a:second');");
 assert.equal(await unansweredPollCount(env,async id=>'a:'+id,10),0);
 }finally{db.close();}
});
