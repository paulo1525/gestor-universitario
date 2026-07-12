ALTER TABLE class_students ADD COLUMN exception_points INTEGER NOT NULL DEFAULT 0 CHECK(exception_points BETWEEN 0 AND 5);
ALTER TABLE class_students ADD COLUMN exception_reviewed_at INTEGER;
ALTER TABLE class_students ADD COLUMN exception_reviewed_by TEXT REFERENCES users(id);
ALTER TABLE class_students ADD COLUMN exception_review_reason TEXT;
ALTER TABLE class_students ADD COLUMN preference_source TEXT NOT NULL DEFAULT 'student' CHECK(preference_source IN ('student','admin','automatic'));
ALTER TABLE class_students ADD COLUMN preference_admin_reason TEXT;

CREATE TABLE distribution_manual_overrides (
  proposal_id TEXT NOT NULL REFERENCES distribution_proposals(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES class_students(id),
  previous_class INTEGER NOT NULL REFERENCES classes(id),
  destination_class INTEGER NOT NULL REFERENCES classes(id),
  reason TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, student_id)
);

CREATE INDEX idx_distribution_overrides_proposal
  ON distribution_manual_overrides(proposal_id, created_at);
