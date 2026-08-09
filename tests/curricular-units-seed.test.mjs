import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0034_seed_second_year_curricular_units.sql", import.meta.url), "utf8");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      commission_position TEXT,
      commission_department TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE curricular_units (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      ects REAL NOT NULL,
      study_year INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      representative_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      active INTEGER NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE curricular_unit_representatives (
      curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (curricular_unit_id, position)
    );
    INSERT INTO users VALUES ('admin', 'admin', 'active', 'principal_admin', 'management', 1);
    INSERT INTO users VALUES ('representative', 'representative', 'active', 'member', 'curricular_units', 2);
    INSERT INTO curricular_units VALUES (
      'existing-neuro', 'NEURO', 'Nome antigo', 1, 1, 2, 'representative', 0,
      'admin', 'admin', 1, 1
    );
    INSERT INTO curricular_unit_representatives VALUES ('existing-neuro', 'representative', 1);
  `);
  return db;
}

test("a migration publica as onze UCs do 2.º ano sem Opção 2 nem representantes", () => {
  const db = database();
  db.exec(migration);

  const units = db.prepare("SELECT code,name,ects,study_year,semester,representative_user_id,active FROM curricular_units ORDER BY semester,code").all();
  assert.equal(units.length, 11);
  assert.deepEqual(units.map((unit) => unit.code), [
    "AR", "DECIDES I", "FIS1", "HIST1", "MP", "NEURO",
    "DECIDES II", "FIS2", "HIST2", "IMUNO BAS", "PG",
  ]);
  assert.equal(units.some((unit) => /opção 2/i.test(`${unit.code} ${unit.name}`)), false);
  assert.equal(units.every((unit) => unit.study_year === 2 && unit.active === 1), true);
  assert.equal(units.every((unit) => unit.representative_user_id === null), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM curricular_unit_representatives").get().count, 0);

  const neuro = units.find((unit) => unit.code === "NEURO");
  assert.deepEqual({ ...neuro }, {
    code: "NEURO",
    name: "Neuroanatomia",
    ects: 6,
    study_year: 2,
    semester: 1,
    representative_user_id: null,
    active: 1,
  });
});

test("a carga é idempotente e mantém o identificador de uma UC já existente", () => {
  const db = database();
  db.exec(migration);
  db.exec(migration);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM curricular_units").get().count, 11);
  assert.equal(db.prepare("SELECT id FROM curricular_units WHERE code='NEURO'").get().id, "existing-neuro");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM curricular_unit_representatives").get().count, 0);
});

test("a migration não contém dados pessoais e atribui a carga a um administrador ativo", () => {
  assert.doesNotMatch(migration, /up\d{9}@/i);
  assert.match(migration, /commission_position = 'principal_admin'/);
  assert.match(migration, /commission_department = 'management'/);
  assert.match(migration, /WHERE NOT EXISTS/);
});

test("a migration falha de forma explícita se não existir um administrador técnico", () => {
  const db = database();
  db.exec("DELETE FROM curricular_unit_representatives; DELETE FROM curricular_units; DELETE FROM users;");
  assert.throws(() => db.exec(migration), /NOT NULL constraint failed/);
});
