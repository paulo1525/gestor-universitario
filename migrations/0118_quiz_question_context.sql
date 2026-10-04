-- Preserve whether a question had already been answered before this session.
ALTER TABLE quiz_attempt_questions ADD COLUMN seen_before INTEGER NOT NULL DEFAULT 0 CHECK (seen_before IN (0,1));
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_question_history ON quiz_attempt_questions(question_id,answered_at);
