-- Catálogo oficial do 2.º ano. A coluna `code` guarda a sigla apresentada
-- na plataforma; o código MI oficial é preservado no identificador estável.
-- Esta migration pode ser repetida com segurança: atualiza UCs já existentes,
-- reativa-as e cria apenas as que ainda não existirem.
DROP TABLE IF EXISTS _seed_second_year_curricular_units;
DROP TABLE IF EXISTS _seed_curricular_unit_actor;

CREATE TABLE _seed_second_year_curricular_units (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  ects REAL NOT NULL,
  study_year INTEGER NOT NULL,
  semester INTEGER NOT NULL
);

CREATE TABLE _seed_curricular_unit_actor (
  id TEXT NOT NULL
);

INSERT INTO _seed_second_year_curricular_units (id, code, name, ects, study_year, semester) VALUES
  ('curricular-mi247', 'DECIDES I',  'DECIDES I: Decisão, Dados e Estatística em Saúde', 4, 2, 1),
  ('curricular-mi248', 'MP',         'Medicina Preventiva',                              3, 2, 1),
  ('curricular-mi249', 'AR',         'Anatomia Radiológica',                             4, 2, 1),
  ('curricular-mi244', 'FIS1',       'Fisiologia I',                                     8, 2, 1),
  ('curricular-mi245', 'HIST1',      'Histologia I',                                     5, 2, 1),
  ('curricular-mi246', 'NEURO',      'Neuroanatomia',                                    6, 2, 1),
  ('curricular-mi250', 'FIS2',       'Fisiologia II',                                    7, 2, 2),
  ('curricular-mi253', 'DECIDES II', 'DECIDES II: Decisão, Dados e Evidência em Saúde',  4, 2, 2),
  ('curricular-mi251', 'HIST2',      'Histologia II. Embriologia',                       5, 2, 2),
  ('curricular-mi252', 'IMUNO BAS',  'Imunologia Básica',                                5, 2, 2),
  ('curricular-mi254', 'PG',         'Propedêutica Geral',                               4, 2, 2);

INSERT INTO _seed_curricular_unit_actor (id)
SELECT id
FROM users
WHERE status = 'active'
  AND (commission_position = 'principal_admin' OR commission_department = 'management' OR role = 'admin')
ORDER BY
  CASE
    WHEN commission_position = 'principal_admin' THEN 0
    WHEN commission_department = 'management' THEN 1
    ELSE 2
  END,
  created_at
LIMIT 1;

-- Falhar explicitamente é preferível a marcar a migration como aplicada sem
-- inserir dados quando ainda não existe um administrador técnico na base.
INSERT INTO _seed_curricular_unit_actor (id)
SELECT NULL
WHERE NOT EXISTS (SELECT 1 FROM _seed_curricular_unit_actor);

-- O pedido editorial é publicar estas UCs ainda sem representantes.
DELETE FROM curricular_unit_representatives
WHERE curricular_unit_id IN (
  SELECT id
  FROM curricular_units
  WHERE code IN (SELECT code FROM _seed_second_year_curricular_units)
);

UPDATE curricular_units
SET
  name = (SELECT seed.name FROM _seed_second_year_curricular_units seed WHERE seed.code = curricular_units.code),
  ects = (SELECT seed.ects FROM _seed_second_year_curricular_units seed WHERE seed.code = curricular_units.code),
  study_year = (SELECT seed.study_year FROM _seed_second_year_curricular_units seed WHERE seed.code = curricular_units.code),
  semester = (SELECT seed.semester FROM _seed_second_year_curricular_units seed WHERE seed.code = curricular_units.code),
  representative_user_id = NULL,
  active = 1,
  updated_at = unixepoch() * 1000
WHERE code IN (SELECT code FROM _seed_second_year_curricular_units);

-- created_by/updated_by são obrigatórios. O proprietário técnico da carga é um
-- administrador ativo já existente; não se introduz qualquer identificador
-- pessoal no repositório.
INSERT INTO curricular_units (
  id, code, name, ects, study_year, semester, representative_user_id,
  active, created_by, updated_by, created_at, updated_at
)
SELECT
  seed.id, seed.code, seed.name, seed.ects, seed.study_year, seed.semester, NULL,
  1, actor.id, actor.id, unixepoch() * 1000, unixepoch() * 1000
FROM _seed_second_year_curricular_units seed
CROSS JOIN _seed_curricular_unit_actor actor
WHERE NOT EXISTS (
  SELECT 1 FROM curricular_units existing WHERE existing.code = seed.code
);

DROP TABLE _seed_second_year_curricular_units;
DROP TABLE _seed_curricular_unit_actor;
