import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("compêndios de AR entram privados uma única vez e preservam os materiais existentes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
      INSERT INTO curricular_units VALUES('ar','AR',1),('other','NEURO',1);
      CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',1);
      CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
      CREATE TABLE material_catalog(id TEXT PRIMARY KEY,curricular_unit_id TEXT,material_kind TEXT,other_format TEXT,title TEXT,description TEXT,file_name TEXT,mime_type TEXT,storage_backend TEXT,storage_key TEXT,storage_state TEXT,byte_size INTEGER,checksum_sha256 TEXT,verification_status TEXT,publication_status TEXT,version_group TEXT,version_number INTEGER,is_recommended INTEGER,public_access INTEGER,created_at INTEGER,updated_at INTEGER);
      INSERT INTO material_catalog(id,curricular_unit_id,title,public_access) VALUES('existing','ar','Horários',0);`);
    const sql = readFileSync(new URL("../migrations/0105_anatomia_radiologica_compendia.sql", import.meta.url), "utf8");
    db.exec(sql); db.exec(sql);
    const rows = db.prepare("SELECT * FROM material_catalog WHERE id != 'existing'").all();
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.curricular_unit_id, "ar");
      assert.equal(row.other_format, "compendium");
      assert.equal(row.public_access, 0);
      assert.equal(row.publication_status, "published");
      assert.equal(row.storage_state, "ready");
      assert.ok(row.byte_size > 50_000_000);
      assert.ok(row.storage_key.endsWith(`${row.checksum_sha256}.pdf`));
    }
    assert.equal(db.prepare("SELECT title FROM material_catalog WHERE id='existing'").get().title, "Horários");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log").get().n, 1);
  } finally { db.close(); }
});
