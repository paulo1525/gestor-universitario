ALTER TABLE class_students ADD COLUMN notes TEXT;
ALTER TABLE class_students ADD COLUMN manual_review INTEGER NOT NULL DEFAULT 0 CHECK (manual_review IN (0,1));

CREATE TABLE distribution_proposals (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','approved','applied','rolled_back','published')),
  input_snapshot TEXT NOT NULL,
  result_snapshot TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  applied_at INTEGER,
  rolled_back_at INTEGER
);
CREATE INDEX idx_distribution_proposals_created ON distribution_proposals(created_at DESC);
