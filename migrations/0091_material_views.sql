-- Aggregate openings; temporary, pseudonymous keys deduplicate repeated opens.
-- No names, emails or IP addresses are stored here.
CREATE TABLE IF NOT EXISTS material_view_totals (
  resource_type TEXT NOT NULL CHECK (resource_type IN ('catalog', 'anki')),
  resource_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (resource_type, resource_id)
);
CREATE TABLE IF NOT EXISTS material_view_visitors (
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  viewer_hash TEXT NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (resource_type, resource_id, viewer_hash)
);
CREATE INDEX IF NOT EXISTS idx_material_view_visitors_expiry ON material_view_visitors(viewed_at);
-- The counter and deduplication write are atomic, including concurrent requests.
CREATE TRIGGER IF NOT EXISTS material_view_insert AFTER INSERT ON material_view_visitors BEGIN
  INSERT INTO material_view_totals(resource_type,resource_id,views) VALUES(NEW.resource_type,NEW.resource_id,1)
  ON CONFLICT(resource_type,resource_id) DO UPDATE SET views=views+1;
END;
CREATE TRIGGER IF NOT EXISTS material_view_update AFTER UPDATE OF viewed_at ON material_view_visitors BEGIN
  INSERT INTO material_view_totals(resource_type,resource_id,views) VALUES(NEW.resource_type,NEW.resource_id,1)
  ON CONFLICT(resource_type,resource_id) DO UPDATE SET views=views+1;
END;
