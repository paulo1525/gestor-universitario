-- Restore Testes without deleting attempts, questions or personal progress.
INSERT INTO app_module_settings (module_key,enabled,updated_at) VALUES
 ('quizzes',1,unixepoch()*1000),('quizzes.practice',1,unixepoch()*1000),
 ('quizzes.progress',1,unixepoch()*1000),('quizzes.learning',1,unixepoch()*1000),
 ('quizzes.management',1,unixepoch()*1000)
ON CONFLICT(module_key) DO UPDATE SET enabled=1,updated_at=excluded.updated_at;

-- Keep original figures separate and in order; solution figures must not leak.
ALTER TABLE quiz_questions ADD COLUMN question_images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(question_images_json));
ALTER TABLE quiz_questions ADD COLUMN solution_images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(solution_images_json));
ALTER TABLE quiz_attempt_questions ADD COLUMN question_images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(question_images_json));
ALTER TABLE quiz_attempt_questions ADD COLUMN solution_images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(solution_images_json));
ALTER TABLE question_bank_items ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE question_bank_items ADD COLUMN question_images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(question_images_json));
ALTER TABLE question_bank_items ADD COLUMN solution_images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(solution_images_json));

-- Original FMUP questions often use A–E. Preserve the fifth option.
CREATE TABLE quiz_question_options_new (
 id TEXT PRIMARY KEY,
 question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
 option_text TEXT NOT NULL,
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 5),
 is_correct INTEGER NOT NULL DEFAULT 0 CHECK(is_correct IN (0,1)),
 UNIQUE(question_id,position)
);
INSERT INTO quiz_question_options_new SELECT * FROM quiz_question_options;
DROP TABLE quiz_question_options;
ALTER TABLE quiz_question_options_new RENAME TO quiz_question_options;
CREATE INDEX idx_quiz_options_question ON quiz_question_options(question_id,position);
CREATE TRIGGER quiz_question_options_one_correct_insert BEFORE INSERT ON quiz_question_options
WHEN NEW.is_correct=1 AND EXISTS(SELECT 1 FROM quiz_question_options WHERE question_id=NEW.question_id AND is_correct=1)
BEGIN SELECT RAISE(ABORT,'quiz_question_options requires one correct option'); END;
CREATE TRIGGER quiz_question_options_one_correct_update BEFORE UPDATE OF is_correct,question_id ON quiz_question_options
WHEN NEW.is_correct=1 AND EXISTS(SELECT 1 FROM quiz_question_options WHERE question_id=NEW.question_id AND id!=NEW.id AND is_correct=1)
BEGIN SELECT RAISE(ABORT,'quiz_question_options requires one correct option'); END;

ALTER TABLE quiz_questions ADD COLUMN response_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK(response_type IN ('multiple_choice','short_answer','case'));
ALTER TABLE quiz_questions ADD COLUMN answer_text TEXT NOT NULL DEFAULT '';
