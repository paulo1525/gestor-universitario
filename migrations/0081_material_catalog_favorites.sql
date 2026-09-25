-- Favorite catalogue materials (star in Materials), one row per user and material.
CREATE TABLE IF NOT EXISTS material_catalog_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES material_catalog(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_material_catalog_favorites_user ON material_catalog_favorites(user_id, created_at DESC);
