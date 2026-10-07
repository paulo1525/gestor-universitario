-- Study materials marked as completed, one row per user and material (files only, not external links).
CREATE TABLE IF NOT EXISTS material_catalog_completions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES material_catalog(id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, material_id)
);
