-- Realces privados, guardados como uma camada lateral ao PDF original.
-- As coordenadas são normalizadas (0–1) para sobreviverem a alterações de zoom.
CREATE TABLE IF NOT EXISTS material_pdf_highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES material_catalog(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 10000),
  x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  width REAL NOT NULL CHECK (width > 0 AND width <= 1),
  height REAL NOT NULL CHECK (height > 0 AND height <= 1),
  color TEXT NOT NULL DEFAULT 'gold' CHECK (color IN ('gold', 'blue', 'green', 'rose')),
  selected_text TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_material_pdf_highlights_owner
  ON material_pdf_highlights(user_id, material_id, page_number, created_at);
