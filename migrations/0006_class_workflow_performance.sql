-- Fluxo persistente das turmas e índices de desempenho.
-- Migração aditiva: preserva todas as turmas, alunos, pedidos e auditorias existentes.

CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 20), academic_year TEXT NOT NULL DEFAULT '2026/2027', status TEXT NOT NULL DEFAULT 'draft', submitted_at INTEGER, submitted_by TEXT REFERENCES users(id), updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS class_students (id TEXT PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), full_name TEXT NOT NULL, student_number TEXT NOT NULL UNIQUE, preference TEXT NOT NULL CHECK(preference IN ('stay','move')), preference_locked_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, removed_at INTEGER);
CREATE TABLE IF NOT EXISTS student_destinations (student_id TEXT NOT NULL REFERENCES class_students(id) ON DELETE CASCADE, destination_class INTEGER NOT NULL REFERENCES classes(id), rank INTEGER NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL, PRIMARY KEY(student_id, destination_class), UNIQUE(student_id, rank));
CREATE TABLE IF NOT EXISTS class_tickets (id TEXT PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), student_id TEXT REFERENCES class_students(id), category TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', response TEXT, created_by TEXT NOT NULL REFERENCES users(id), resolved_by TEXT REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS class_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL, student_id TEXT, actor_user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, details TEXT, created_at INTEGER NOT NULL);

INSERT OR IGNORE INTO classes (id, updated_at) VALUES
 (1,unixepoch()*1000),(2,unixepoch()*1000),(3,unixepoch()*1000),(4,unixepoch()*1000),(5,unixepoch()*1000),
 (6,unixepoch()*1000),(7,unixepoch()*1000),(8,unixepoch()*1000),(9,unixepoch()*1000),(10,unixepoch()*1000),
 (11,unixepoch()*1000),(12,unixepoch()*1000),(13,unixepoch()*1000),(14,unixepoch()*1000),(15,unixepoch()*1000),
 (16,unixepoch()*1000),(17,unixepoch()*1000),(18,unixepoch()*1000),(19,unixepoch()*1000),(20,unixepoch()*1000);

ALTER TABLE classes ADD COLUMN workflow_step INTEGER NOT NULL DEFAULT 1 CHECK (workflow_step BETWEEN 1 AND 3);
ALTER TABLE classes ADD COLUMN draft_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE class_students ADD COLUMN student_decision TEXT CHECK (student_decision IN ('stay', 'move'));
ALTER TABLE class_students ADD COLUMN decision_at INTEGER;
ALTER TABLE class_students ADD COLUMN distribution_result TEXT;

ALTER TABLE class_tickets ADD COLUMN request_type TEXT;
ALTER TABLE class_tickets ADD COLUMN request_payload TEXT;
ALTER TABLE class_tickets ADD COLUMN decided_at INTEGER;
ALTER TABLE class_tickets ADD COLUMN executed_at INTEGER;
ALTER TABLE class_tickets ADD COLUMN execution_result TEXT;

CREATE TABLE class_drafts (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  workflow_step INTEGER NOT NULL CHECK (workflow_step BETWEEN 1 AND 3),
  payload TEXT NOT NULL,
  saved_by TEXT NOT NULL REFERENCES users(id),
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, revision)
);

CREATE INDEX idx_sessions_token_expiry ON sessions(token_hash, expires_at);
CREATE INDEX idx_users_represented_class ON users(represented_class, class_representative, status);
CREATE INDEX idx_classes_status ON classes(status);
CREATE INDEX idx_class_students_class_active ON class_students(class_id, removed_at);
CREATE INDEX idx_class_students_number_active ON class_students(student_number, removed_at);
CREATE INDEX idx_destinations_student_rank ON student_destinations(student_id, rank);
CREATE INDEX idx_tickets_status_created ON class_tickets(status, created_at);
CREATE INDEX idx_tickets_class_created ON class_tickets(class_id, created_at);
CREATE INDEX idx_class_audit_class_created ON class_audit_log(class_id, created_at);

UPDATE class_tickets SET request_type = COALESCE(request_type, 'other');
UPDATE class_tickets SET request_payload = COALESCE(request_payload, '{}');

INSERT OR IGNORE INTO class_drafts (class_id, revision, workflow_step, payload, saved_by, saved_at)
SELECT c.id, 0, 1,
       COALESCE((
         SELECT json_group_array(json_object(
           'id', s.id,
           'fullName', s.full_name,
           'studentNumber', s.student_number,
           'preference', s.preference
         ))
         FROM class_students s
         WHERE s.class_id = c.id AND s.removed_at IS NULL
       ), '[]'),
       COALESCE(c.submitted_by, (SELECT id FROM users ORDER BY created_at LIMIT 1)),
       c.updated_at
FROM classes c
WHERE EXISTS (SELECT 1 FROM users)
  AND c.status IN ('draft', 'reopened');
