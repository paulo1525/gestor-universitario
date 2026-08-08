-- Quiz comments are public conversations.  The legacy moderation columns remain
-- in place for audit/history compatibility, but no new comment waits for review.
UPDATE quiz_comments
SET status = 'published'
WHERE status = 'pending' AND deleted_at IS NULL;

ALTER TABLE quiz_comments
  ADD COLUMN parent_comment_id TEXT REFERENCES quiz_comments(id) ON DELETE SET NULL;

-- Preserve the former DEFAULT 'pending' for any older writer, while ensuring that
-- it is published in the same transaction.  New application writes use
-- 'published' explicitly.
CREATE TRIGGER quiz_comments_publish_immediately
AFTER INSERT ON quiz_comments
WHEN NEW.status = 'pending' AND NEW.deleted_at IS NULL
BEGIN
  UPDATE quiz_comments
  SET status = 'published'
  WHERE id = NEW.id;
END;

DROP INDEX idx_quiz_comments_moderation;
CREATE INDEX idx_quiz_comments_question_public ON quiz_comments(question_id, deleted_at, created_at);
CREATE INDEX idx_quiz_comments_parent ON quiz_comments(parent_comment_id, deleted_at, created_at);
