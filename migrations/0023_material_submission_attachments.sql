-- Permite anexar varias fotografias a uma submissao reservada de exame.
CREATE TABLE material_submission_attachments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES material_submissions(id) ON DELETE CASCADE,
  attachment_name TEXT NOT NULL,
  attachment_mime TEXT NOT NULL,
  attachment_data_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_material_submission_attachments_submission
  ON material_submission_attachments(submission_id, sort_order, created_at);
