import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../data/materials/neuro-sigarra-sumarios-2026.json'));
const migration = read('../migrations/0139_neuro_sigarra_summaries.sql');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
    CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
    CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_at INTEGER);
    CREATE TABLE admin_audit_log(actor_user_id TEXT REFERENCES users(id),action TEXT,details TEXT,created_at INTEGER);
    INSERT INTO users VALUES('admin','active','principal_admin','admin',0);
    INSERT INTO curricular_units VALUES('neuro','NEURO',1),('other','OTHER',1);
  `);
  db.exec(read('../migrations/0057_materials_catalog_anki.sql').split('-- Aulas da Neuroanatomia')[0]);
  db.exec("ALTER TABLE material_catalog ADD COLUMN summary_format TEXT; ALTER TABLE material_catalog ADD COLUMN public_access INTEGER DEFAULT 0;");
  const insert = db.prepare("INSERT INTO material_lessons(id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at) VALUES(?,'neuro',?,?,'theory',?,0,0)");
  const codes = [...new Set(['AT1', ...manifest.files.map(f => f.lessonCode), ...manifest.lessonLabels.map(l => l.code)])];
  for (const [index, code] of codes.entries()) insert.run(`neuro-${code}`, code, manifest.lessonLabels.find(l => l.code === code)?.previous || code, index);
  db.exec("INSERT INTO material_catalog(id,curricular_unit_id,lesson_id,material_kind,summary_format,title,created_at,updated_at) VALUES('previous','neuro','neuro-AT1','summary','lecture','Sumário anterior',0,0),('other-material','other',NULL,'summary','lecture','Outra unidade',0,0)");
  return db;
}

test('Sumários SIGARRA: publica apenas cinco PDFs e associa cada um ao código correto, de forma idempotente', () => {
  const db = fixture();
  try {
    const previous = db.prepare('SELECT * FROM material_catalog ORDER BY id').all();
    assert.deepEqual(manifest.files.map(f => f.lessonCode), ['AT7', 'AT8', 'AT9', 'AP5', 'AP6']);
    db.exec(migration);
    db.exec(migration);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM material_catalog').get().n, previous.length + 5);
    for (const file of manifest.files) {
      const row = db.prepare('SELECT * FROM material_catalog WHERE id=?').get(file.id);
      assert.equal(row.title, file.title);
      assert.equal(row.material_kind, 'summary');
      assert.equal(row.summary_format, 'lecture');
      assert.equal(row.publication_status, 'published');
      assert.equal(row.storage_state, 'ready');
      assert.equal(row.public_access, 1);
      assert.equal(row.curricular_unit_id, 'neuro');
      assert.equal(row.lesson_id, `neuro-${file.lessonCode}`);
      assert.equal(row.checksum_sha256, file.sha256);
      assert.equal(row.byte_size, file.byteSize);
      assert.equal(row.storage_key, file.storageKey);
      assert.equal(row.physical_page_end, String(file.pageCount));
      assert.deepEqual(db.prepare('SELECT lesson_id FROM material_catalog_lessons WHERE material_id=?').all(file.id).map(r => r.lesson_id), [row.lesson_id]);
    }
    for (const row of previous) assert.deepEqual(db.prepare('SELECT * FROM material_catalog WHERE id=?').get(row.id), row);
    for (const label of manifest.lessonLabels) assert.equal(db.prepare("SELECT title FROM material_lessons WHERE curricular_unit_id='neuro' AND code=?").get(label.code).title, label.title);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get().n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('Importação preserva um sumário previamente existente com outro ID e ignora unidades inativas', () => {
  const db = fixture();
  try {
    db.exec("INSERT INTO material_catalog(id,curricular_unit_id,lesson_id,material_kind,summary_format,title,created_at,updated_at) VALUES('alternate-at7','neuro','neuro-AT7','summary','lecture','Já existente',0,0)");
    db.exec("UPDATE material_lessons SET title='Título revisto manualmente' WHERE code='AP6'");
    const existing = db.prepare("SELECT * FROM material_catalog WHERE id='alternate-at7'").get();
    db.exec(migration);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM material_catalog WHERE id='material-summary-neuro-at7'").get().n, 0);
    assert.deepEqual(db.prepare("SELECT * FROM material_catalog WHERE id='alternate-at7'").get(), existing);
    assert.equal(db.prepare("SELECT title FROM material_lessons WHERE code='AP6'").get().title, 'Título revisto manualmente');
  } finally { db.close(); }
  const inactive = fixture();
  try {
    inactive.exec("UPDATE curricular_units SET active=0 WHERE code='NEURO'");
    inactive.exec(migration);
    assert.equal(inactive.prepare('SELECT COUNT(*) AS n FROM material_catalog').get().n, 2);
    assert.equal(inactive.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get().n, 0);
  } finally { inactive.close(); }
});
