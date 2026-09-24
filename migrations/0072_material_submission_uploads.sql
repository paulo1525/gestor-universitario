-- Material submissions stored in R2 instead of inline data URLs.
-- Only additive changes: rebuilding material_submissions would fire the
-- ON DELETE CASCADE actions of favourites, feedback, versions and exam details.

ALTER TABLE material_submissions ADD COLUMN file_kind TEXT;
ALTER TABLE material_submissions ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'inline';
ALTER TABLE material_submissions ADD COLUMN storage_key TEXT;
ALTER TABLE material_submissions ADD COLUMN size_bytes INTEGER;
ALTER TABLE material_submissions ADD COLUMN anki_meta TEXT;

ALTER TABLE material_submission_attachments ADD COLUMN file_kind TEXT;
ALTER TABLE material_submission_attachments ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'inline';
ALTER TABLE material_submission_attachments ADD COLUMN storage_key TEXT;
ALTER TABLE material_submission_attachments ADD COLUMN size_bytes INTEGER;

-- One row per file sent to R2. Rows that never reach a submission are
-- removed (object and row) after 24 hours.
CREATE TABLE IF NOT EXISTS material_upload_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  r2_upload_id TEXT,
  file_name TEXT NOT NULL,
  file_kind TEXT NOT NULL CHECK (file_kind IN ('pdf', 'docx', 'pptx', 'zip', 'apkg', 'image')),
  mime_type TEXT NOT NULL,
  declared_size INTEGER NOT NULL CHECK (declared_size > 0),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'uploaded', 'attached', 'deleted')),
  submission_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_material_upload_sessions_user
  ON material_upload_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_upload_sessions_status
  ON material_upload_sessions(status, created_at);

-- Silent safeguards for the R2 free tier (10 GB-month, 1M Class A operations).
-- Application limits only; Cloudflare billing is not affected by these rows.
CREATE TABLE IF NOT EXISTS r2_write_budget (
  period_utc TEXT PRIMARY KEY,
  reserved_operations INTEGER NOT NULL DEFAULT 0 CHECK (reserved_operations >= 0),
  operation_limit INTEGER NOT NULL CHECK (operation_limit > 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS r2_storage_budget (
  scope TEXT PRIMARY KEY,
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  byte_limit INTEGER NOT NULL CHECK (byte_limit > 0),
  updated_at INTEGER NOT NULL
);
