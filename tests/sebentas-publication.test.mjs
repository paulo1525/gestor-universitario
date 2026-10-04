import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("a sebenta de Fisiologia tem categoria própria, nota ChatGPT e acesso autenticado", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      INSERT INTO curricular_units VALUES('fis1','FIS1',1);
      CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',1);
      CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
      CREATE TABLE material_catalog(id TEXT PRIMARY KEY,curricular_unit_id TEXT,material_kind TEXT,other_format TEXT,title TEXT,description TEXT,file_name TEXT,mime_type TEXT,storage_backend TEXT,storage_key TEXT,storage_state TEXT,byte_size INTEGER,checksum_sha256 TEXT,verification_status TEXT,publication_status TEXT,version_group TEXT,version_number INTEGER,is_recommended INTEGER,public_access INTEGER,created_at INTEGER,updated_at INTEGER);
      INSERT INTO material_catalog(id,other_format,title) VALUES('existing','compendium','Compêndio existente');`);
    db.exec(readFileSync(new URL("../migrations/0111_sebentas.sql", import.meta.url), "utf8"));
    const row = db.prepare("SELECT * FROM material_catalog WHERE id='material-fis1-sebenta-2026-2027'").get();
    assert.equal(row.study_category, "sebenta");
    assert.equal(row.curricular_unit_id, "fis1");
    assert.equal(row.other_format, null);
    assert.equal(row.public_access, 0);
    assert.equal(row.storage_state, "ready");
    assert.equal(row.byte_size, 65589991);
    assert.match(row.description, /corrigida recorrendo ao ChatGPT/);
    assert.ok(row.storage_key.endsWith(`${row.checksum_sha256}.pdf`));
    assert.equal(db.prepare("SELECT other_format FROM material_catalog WHERE id='existing'").get().other_format, "compendium");
    assert.throws(() => db.exec("UPDATE material_catalog SET study_category='invalid' WHERE id='existing'"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log").get().n, 1);
  } finally { db.close(); }
});
