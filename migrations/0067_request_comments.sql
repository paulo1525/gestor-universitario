-- Conversation thread on a student request (author and commission). Additive only.
CREATE TABLE IF NOT EXISTS course_request_comments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES course_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_course_request_comments_request ON course_request_comments(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_course_request_comments_user ON course_request_comments(user_id, created_at);
