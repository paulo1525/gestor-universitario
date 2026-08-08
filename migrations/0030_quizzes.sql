-- O antigo fluxo de turmas deixa de estar disponível; o banco é preservado
-- para auditoria, mas os respetivos módulos nunca voltam a ser ativados.
UPDATE app_module_settings
SET enabled = 0, updated_by = NULL, updated_at = unixepoch() * 1000
WHERE module_key IN ('classes', 'classes.rosters', 'classes.preferences', 'classes.placements', 'classes.special_statuses');

INSERT INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('quizzes', 1, unixepoch() * 1000),
  ('quizzes.practice', 1, unixepoch() * 1000),
  ('quizzes.progress', 1, unixepoch() * 1000),
  ('quizzes.management', 1, unixepoch() * 1000)
ON CONFLICT(module_key) DO UPDATE SET enabled = 1, updated_by = NULL, updated_at = excluded.updated_at;

CREATE TABLE quiz_topics (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at INTEGER,
  archived_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at INTEGER,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(curricular_unit_id, title)
);

CREATE INDEX idx_quiz_topics_catalog ON quiz_topics(curricular_unit_id, status, deleted_at, sort_order, title);

CREATE TABLE quiz_questions (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE RESTRICT,
  topic_id TEXT NOT NULL REFERENCES quiz_topics(id) ON DELETE RESTRICT,
  prompt TEXT NOT NULL,
  image_url TEXT,
  explanation TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at INTEGER,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at INTEGER,
  archived_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at INTEGER,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_quiz_questions_catalog ON quiz_questions(curricular_unit_id, topic_id, status, deleted_at, difficulty);
CREATE INDEX idx_quiz_questions_topic ON quiz_questions(topic_id, status, deleted_at);

CREATE TABLE quiz_question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  UNIQUE(question_id, position)
);

CREATE INDEX idx_quiz_options_question ON quiz_question_options(question_id, position);

-- A validação de 2--4 opções e de exatamente uma correta também é feita pelo
-- Worker de forma atómica; estes triggers impedem uma segunda opção correta.
CREATE TRIGGER quiz_question_options_one_correct_insert
BEFORE INSERT ON quiz_question_options
WHEN NEW.is_correct = 1 AND EXISTS (
  SELECT 1 FROM quiz_question_options WHERE question_id = NEW.question_id AND is_correct = 1
)
BEGIN
  SELECT RAISE(ABORT, 'quiz_question_options requires one correct option');
END;

CREATE TRIGGER quiz_question_options_one_correct_update
BEFORE UPDATE OF is_correct, question_id ON quiz_question_options
WHEN NEW.is_correct = 1 AND EXISTS (
  SELECT 1 FROM quiz_question_options WHERE question_id = NEW.question_id AND id != NEW.id AND is_correct = 1
)
BEGIN
  SELECT RAISE(ABORT, 'quiz_question_options requires one correct option');
END;

CREATE TABLE quiz_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('quick', 'exam', 'topic', 'unseen', 'mistakes')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  topic_id TEXT REFERENCES quiz_topics(id) ON DELETE SET NULL,
  difficulty_filter TEXT CHECK (difficulty_filter IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 100),
  answered_count INTEGER NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_quiz_attempts_user_history ON quiz_attempts(user_id, completed_at DESC, started_at DESC);

ALTER TABLE quiz_attempts ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json));
ALTER TABLE quiz_attempts ADD COLUMN duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 60 AND 14400);
ALTER TABLE quiz_attempts ADD COLUMN expires_at INTEGER;
CREATE INDEX idx_quiz_attempts_expiry ON quiz_attempts(status, expires_at);

CREATE TABLE quiz_attempt_questions (
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE RESTRICT,
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  topic_id TEXT REFERENCES quiz_topics(id) ON DELETE SET NULL,
  position INTEGER NOT NULL CHECK (position >= 1),
  prompt TEXT NOT NULL,
  image_url TEXT,
  explanation TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  options_json TEXT NOT NULL CHECK (json_valid(options_json)),
  correct_option_id TEXT NOT NULL,
  selected_option_id TEXT,
  is_correct INTEGER CHECK (is_correct IN (0, 1)),
  answered_at INTEGER,
  PRIMARY KEY(attempt_id, question_id),
  UNIQUE(attempt_id, position)
);

CREATE INDEX idx_quiz_attempt_questions_question ON quiz_attempt_questions(question_id, attempt_id);
CREATE INDEX idx_quiz_attempt_questions_topic ON quiz_attempt_questions(topic_id, attempt_id);

CREATE TABLE quiz_comments (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE RESTRICT,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  moderation_note TEXT,
  moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  moderated_at INTEGER,
  deleted_at INTEGER,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_quiz_comments_question ON quiz_comments(question_id, status, deleted_at, created_at);
CREATE INDEX idx_quiz_comments_moderation ON quiz_comments(status, deleted_at, created_at);

CREATE TABLE quiz_imports (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  topics_created INTEGER NOT NULL DEFAULT 0 CHECK (topics_created >= 0),
  questions_created INTEGER NOT NULL CHECK (questions_created >= 0),
  imported_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_quiz_imports_history ON quiz_imports(created_at DESC);
