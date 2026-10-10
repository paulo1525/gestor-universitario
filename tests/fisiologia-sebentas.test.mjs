import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../data/materials/fisiologia-sebenta-integral-2026.json'));
const migration = read('../migrations/0137_fisiologia_sebentas_primeira_frequencia.sql');

test('Fisiologia: publica sete sebentas privadas para a primeira frequência, sem duplicar ou substituir materiais', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_at INTEGER);
      CREATE TABLE admin_audit_log(actor_user_id TEXT REFERENCES users(id),action TEXT,details TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',0);
      INSERT INTO curricular_units VALUES('fis','FIS1',1),('hist','HIST1',1);
    `);
    db.exec(read('../migrations/0057_materials_catalog_anki.sql').split('-- Aulas da Neuroanatomia')[0]);
    db.exec("ALTER TABLE material_catalog ADD COLUMN study_category TEXT; ALTER TABLE material_catalog ADD COLUMN public_access INTEGER DEFAULT 0;");
    db.exec("INSERT INTO material_catalog(id,curricular_unit_id,material_kind,title,created_at,updated_at) VALUES('existing','fis','other','Sebenta anterior',0,0),('other-unit','hist','other','Histologia',0,0)");
    const original = db.prepare("SELECT * FROM material_catalog WHERE id IN ('existing','other-unit') ORDER BY id").all();
    const insertLesson = db.prepare("INSERT INTO material_lessons(id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at) VALUES(?,'fis',?,'Aula','theory',0,0,0)");
    for (const code of new Set(manifest.files.flatMap(file => file.lessonCodes))) insertLesson.run(`fis-${code}`, code);
    db.exec(migration);
    db.exec(migration);
    const published = db.prepare("SELECT * FROM material_catalog WHERE id LIKE 'material-fis1-sebenta-integral-%'").all();
    assert.equal(published.length, 7);
    for (const file of manifest.files) {
      const row = published.find(item => item.id === file.id);
      assert.ok(row);
      assert.equal(row.curricular_unit_id, 'fis');
      assert.equal(row.study_category, 'sebenta');
      assert.equal(row.publication_status, 'published');
      assert.equal(row.public_access, 0);
      assert.equal(row.storage_state, 'ready');
      assert.equal(row.checksum_sha256, file.sha256);
      assert.equal(row.byte_size, file.byteSize);
      assert.match(row.title, /1\.ª frequência/);
      assert.match(row.description, /1\.ª frequência/);
      const codes = db.prepare('SELECT l.code FROM material_catalog_lessons a JOIN material_lessons l ON l.id=a.lesson_id WHERE a.material_id=? ORDER BY a.sort_order').all(file.id).map(item => item.code);
      assert.deepEqual(codes, file.lessonCodes);
    }
    const integral = published.find(item => item.id === 'material-fis1-sebenta-integral-2026-2027');
    assert.match(integral.title, /em construção/);
    assert.match(integral.description, /ainda não cobre toda a matéria/);
    assert.deepEqual(db.prepare("SELECT * FROM material_catalog WHERE id IN ('existing','other-unit') ORDER BY id").all(), original);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action='fisiologia_sebentas_published'").get().n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});
