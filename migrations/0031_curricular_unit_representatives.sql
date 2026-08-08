-- Uma UC pode não ter representante atribuído e pode ter, no máximo, dois.
-- O campo singular legado continua como espelho da posição 1 para clientes
-- antigos e para facilitar leituras de compatibilidade.
CREATE TABLE curricular_unit_representatives (
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position IN (1, 2)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (curricular_unit_id, position),
  UNIQUE (curricular_unit_id, user_id)
);

INSERT INTO curricular_unit_representatives (curricular_unit_id, user_id, position, created_by, created_at, updated_by, updated_at)
SELECT id, representative_user_id, 1, updated_by, updated_at, updated_by, updated_at
FROM curricular_units
WHERE representative_user_id IS NOT NULL;

DROP INDEX idx_curricular_units_representative;
ALTER TABLE curricular_units DROP COLUMN representative_user_id;
ALTER TABLE curricular_units ADD COLUMN representative_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

UPDATE curricular_units
SET representative_user_id = (
  SELECT user_id
  FROM curricular_unit_representatives
  WHERE curricular_unit_id = curricular_units.id AND position = 1
);

CREATE INDEX idx_curricular_units_representative ON curricular_units(representative_user_id);
CREATE INDEX idx_curricular_unit_representatives_user ON curricular_unit_representatives(user_id, curricular_unit_id);
