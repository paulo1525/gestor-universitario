import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('Academic dates preserve Lisbon dates, uncertain periods and repeatable registration', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      CREATE TABLE academic_events(id TEXT PRIMARY KEY,title TEXT,description TEXT,event_type TEXT,curricular_unit_id TEXT,starts_at INTEGER,ends_at INTEGER,location TEXT,visibility TEXT,status TEXT,created_by TEXT,updated_by TEXT,created_at INTEGER,updated_at INTEGER,CHECK(ends_at>=starts_at));
      CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',0);
      INSERT INTO curricular_units VALUES('fis','FIS1',1),('hist','HIST1',1),('decides','DECIDESI',1),('mp','MP',1);`);
    const sql=readFileSync(new URL('../migrations/0108_register_academic_dates_2026.sql',import.meta.url),'utf8');
    db.exec(sql); db.exec(sql);
    const rows=db.prepare('SELECT * FROM academic_events').all();
    assert.equal(rows.length,9); assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_audit_log').get().n,1);
    for(const row of rows) {assert.equal(row.visibility,'students'); assert.equal(row.status,'scheduled');}
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
    const payment=rows.find(row=>row.id.endsWith('dinner-payment'));
    assert.equal(date.format(payment.starts_at),'2026-10-06');
    assert.equal(date.format(payment.ends_at),'2026-10-06');
    const dinner=rows.find(row=>row.id.endsWith('course-dinner'));
    assert.equal(date.format(dinner.starts_at),'2026-10-08');
    assert.equal(dinner.curricular_unit_id,null);
    const week=rows.find(row=>row.id.endsWith('decides1-practical-week'));
    assert.equal(date.format(week.starts_at),'2026-11-30');
    assert.equal(date.format(week.ends_at),'2026-12-06');
    assert.match(week.description,/Dia e hora exatos por confirmar/);
    assert.equal(rows.filter(row=>row.curricular_unit_id==='hist').length,2);
    assert.match(rows.find(row=>row.id.endsWith('mp-presentation')).description,/à tarde/);
  } finally {db.close();}
});
