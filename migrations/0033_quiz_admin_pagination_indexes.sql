-- Índices dedicados à listagem administrativa paginada. O índice histórico
-- idx_quiz_questions_catalog continua a servir o catálogo público por UC/tema.
CREATE INDEX IF NOT EXISTS idx_quiz_questions_admin_recent
  ON quiz_questions(deleted_at, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_admin_unit_recent
  ON quiz_questions(curricular_unit_id, deleted_at, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_admin_topic_recent
  ON quiz_questions(topic_id, deleted_at, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_admin_status_recent
  ON quiz_questions(status, deleted_at, updated_at DESC, id);
