-- Conteúdo didático permanece versionado no código. Apenas anotações pessoais
-- são guardadas aqui, sempre consultadas pela identidade da sessão real.
CREATE TABLE study_annotations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  id TEXT NOT NULL,
  paragraph_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset >= start_offset),
  quote TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 12000),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'green', 'blue', 'pink')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, document_id, id)
);
