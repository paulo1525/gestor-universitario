import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('Neuro pack replaces the two editions without removing records or other units', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,name TEXT,active INTEGER);
      CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_at INTEGER);
      CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',0);
      INSERT INTO curricular_units VALUES('neuro','NEURO','Neuroanatomia',1),('hist','HIST1','Histologia I',1);`);
    const schema = readFileSync(new URL('../migrations/0057_materials_catalog_anki.sql', import.meta.url), 'utf8').split('-- Aulas da Neuroanatomia')[0];
    db.exec(schema);
    db.exec('ALTER TABLE material_anki_decks ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0');
    for (const [id,unit,variant] of [['anki-neuro-essential','neuro','essential'],['anki-neuro-complete','neuro','complete'],['hist-pack','hist','custom']]) {
      db.prepare("INSERT INTO material_anki_decks(id,curricular_unit_id,title,variant,publication_status,created_at,updated_at) VALUES(?,?,?,?, 'published',0,0)").run(id,unit,id,variant);
    }
    for (const prefix of ['AT','AP']) for(let i=1;i<=(prefix==='AT'?21:13);i++) {
      if (prefix==='AP' && [6,8,9,11,12].includes(i)) continue;
      db.prepare('INSERT INTO material_lessons(id,curricular_unit_id,code,title,created_at,updated_at) VALUES(?,\'neuro\',?,?,0,0)').run(prefix+i,prefix+i,prefix+i);
    }
    const migration=readFileSync(new URL('../migrations/0107_publish_neuro_anki_pack.sql',import.meta.url),'utf8');
    db.exec(migration); db.exec(migration);
    const published=db.prepare("SELECT * FROM material_anki_decks WHERE curricular_unit_id='neuro' AND publication_status='published'").all();
    assert.equal(published.length,1);
    const pack=published[0];
    assert.equal(pack.card_count,3079); assert.equal(pack.media_count,646);
    assert.equal(pack.byte_size,289648634); assert.equal(pack.public_access,0);
    assert.equal(pack.storage_state,'ready'); assert.ok(pack.storage_key.endsWith(pack.checksum_sha256+'.apkg'));
    assert.doesNotMatch(pack.title,/essencial|completo/i);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM material_anki_decks WHERE publication_status='archived'").get().n,2);
    assert.equal(db.prepare("SELECT publication_status FROM material_anki_decks WHERE id='hist-pack'").get().publication_status,'published');
    const counts=db.prepare('SELECT COUNT(*) n,SUM(card_count) cards FROM material_anki_deck_lessons WHERE deck_id=?').get(pack.id);
    assert.equal(counts.n,34); assert.equal(counts.cards,3079);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_audit_log').get().n,1);
    const externalMigration=readFileSync(new URL('../migrations/0110_neuro_anki_onedrive_download.sql',import.meta.url),'utf8');
    db.exec(externalMigration); db.exec(externalMigration);
    const external=db.prepare('SELECT * FROM material_anki_decks WHERE id=?').get(pack.id);
    assert.equal(external.storage_backend,'external');
    assert.match(external.storage_key,/^https:\/\/1drv\.ms\/.+&download=1$/);
    assert.equal(external.card_count,pack.card_count);
    assert.equal(external.checksum_sha256,pack.checksum_sha256);
    assert.equal(external.public_access,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_audit_log').get().n,2);
  } finally { db.close(); }
});
