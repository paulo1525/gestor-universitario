import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('Neuro videos publish external links with complete lesson mappings and no duplicate records', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_at INTEGER);
      CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',0);
      INSERT INTO curricular_units VALUES('neuro','NEURO',1),('hist','HIST1',1);`);
    db.exec(readFileSync(new URL('../migrations/0057_materials_catalog_anki.sql', import.meta.url), 'utf8').split('-- Aulas da Neuroanatomia')[0]);
    db.exec('ALTER TABLE material_catalog ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0');
    db.exec(readFileSync(new URL('../migrations/0097_material_resource_categories.sql', import.meta.url), 'utf8'));
    for (const code of ['AT15', ...Array.from({ length: 13 }, (_, i) => `AP${i+1}`)]) {
      db.prepare("INSERT INTO material_lessons(id,curricular_unit_id,code,title,created_at,updated_at) VALUES(?,'neuro',?,?,0,0)").run(code,code,code);
    }
    db.exec("INSERT INTO material_catalog(id,curricular_unit_id,material_kind,title,created_at,updated_at) VALUES('existing','hist','other','Existing',0,0)");
    const sql = readFileSync(new URL('../migrations/0112_neuro_video_links.sql', import.meta.url), 'utf8');
    db.exec(sql);
    db.exec(sql);
    const videos = db.prepare("SELECT * FROM material_catalog WHERE curricular_unit_id='neuro'").all();
    assert.equal(videos.length,29);
    assert.equal(new Set(videos.map(v => v.external_url)).size,29);
    assert.equal(videos.filter(v => v.resource_category==='theory').length,2);
    assert.equal(videos.filter(v => v.resource_category==='practical').length,27);
    for (const video of videos) {
      assert.equal(video.storage_backend,'external');
      assert.equal(video.storage_key,null);
      assert.equal(video.storage_state,'ready');
      assert.equal(video.publication_status,'published');
      assert.equal(video.public_access,0);
      assert.equal(video.mime_type,'video/mp4');
      assert.match(video.external_url,/^https:\/\/1drv\.ms\/v\//);
      assert.ok(video.byte_size>0);
      const codes = [...video.file_name.split(' - ')[0].matchAll(/(AT|AP)0?(\d+)/g)].map(m=>m[1]+m[2]);
      const mapped=db.prepare('SELECT l.code FROM material_catalog_lessons ml JOIN material_lessons l ON l.id=ml.lesson_id WHERE ml.material_id=? ORDER BY l.code').all(video.id).map(l=>l.code);
      assert.deepEqual(mapped,codes.sort());
      assert.equal(video.lesson_id,codes.length ? codes[0] : null);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM material_catalog WHERE id='existing'").get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_audit_log').get().n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});
