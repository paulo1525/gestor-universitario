-- Comments on announcements. Soft delete keeps the audit trail; only additive changes.
CREATE TABLE IF NOT EXISTS announcement_comments (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_announcement_comments_announcement ON announcement_comments(announcement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcement_comments_user ON announcement_comments(user_id, created_at);
