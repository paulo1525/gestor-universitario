ALTER TABLE quiz_comments ADD COLUMN pinned_at INTEGER;
ALTER TABLE announcement_comments ADD COLUMN pinned_at INTEGER;
CREATE INDEX idx_quiz_comments_pinned ON quiz_comments(question_id,status,pinned_at DESC,created_at);
CREATE INDEX idx_announcement_comments_pinned ON announcement_comments(announcement_id,pinned_at DESC,created_at);
