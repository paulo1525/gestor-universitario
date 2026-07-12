ALTER TABLE distribution_proposals ADD COLUMN input_hash TEXT;
ALTER TABLE distribution_proposals ADD COLUMN engine_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE distribution_proposals ADD COLUMN invalidated_at INTEGER;
ALTER TABLE distribution_proposals ADD COLUMN published_at INTEGER;
ALTER TABLE distribution_proposals ADD COLUMN published_by TEXT REFERENCES users(id);

CREATE TABLE distribution_result_reviews (
  proposal_id TEXT NOT NULL REFERENCES distribution_proposals(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES class_students(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  PRIMARY KEY (proposal_id, student_id)
);

CREATE INDEX idx_distribution_reviews_pending
  ON distribution_result_reviews(proposal_id, status);
