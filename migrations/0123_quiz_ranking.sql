-- Opt-in ranking for practice tests: only students who join appear, under an alias they choose.
CREATE TABLE quiz_ranking_members (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 3 AND 24),
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_quiz_ranking_members_name ON quiz_ranking_members(display_name COLLATE NOCASE);
