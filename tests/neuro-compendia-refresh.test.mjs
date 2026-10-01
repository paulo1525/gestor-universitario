import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
test('Neuro replacement preserves references and other compendia and is repeatable',()=>{
 const db=new DatabaseSync(':memory:');
 try {
 db.exec(`CREATE TABLE material_catalog(id TEXT PRIMARY KEY,description TEXT,storage_key TEXT,byte_size INTEGER,checksum_sha256 TEXT,storage_state TEXT,version_number INTEGER,updated_at INTEGER,public_access INTEGER);
 CREATE TABLE favourites(material_id TEXT REFERENCES material_catalog(id));
 CREATE TABLE users(id TEXT,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
 CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
 INSERT INTO users VALUES('admin','active','principal_admin','admin',1);
 INSERT INTO material_catalog(id,version_number,public_access) VALUES('material-neuro-compendium-solutions',1,0),('material-neuro-compendium-no-solutions',1,0),('fis1',1,0),('ar',1,0);
 INSERT INTO favourites VALUES('material-neuro-compendium-solutions');`);
 const sql=readFileSync(new URL('../migrations/0106_refresh_neuro_compendia.sql',import.meta.url),'utf8');
 db.exec(sql);db.exec(sql);
 const rows=db.prepare("SELECT * FROM material_catalog WHERE id LIKE 'material-neuro%'").all();
 assert.equal(rows.length,2);
 for(const row of rows){assert.equal(row.version_number,2);assert.equal(row.public_access,0);assert.equal(row.storage_state,'ready');assert.ok(row.storage_key.endsWith(row.checksum_sha256+'.pdf'));assert.match(row.description,/1.164/);}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM favourites').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM material_catalog WHERE version_number=1').get().n,2);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_audit_log').get().n,1);
 }finally{db.close();}
});
