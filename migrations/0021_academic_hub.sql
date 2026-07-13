-- Hub académico: calendário, documentos, pedidos, inquéritos e materiais.

INSERT OR IGNORE INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('calendar', 1, unixepoch() * 1000),
  ('calendar.events', 1, unixepoch() * 1000),
  ('calendar.management', 1, unixepoch() * 1000),
  ('documents', 1, unixepoch() * 1000),
  ('documents.library', 1, unixepoch() * 1000),
  ('documents.management', 1, unixepoch() * 1000),
  ('requests', 1, unixepoch() * 1000),
  ('requests.submission', 1, unixepoch() * 1000),
  ('requests.management', 1, unixepoch() * 1000),
  ('directory', 1, unixepoch() * 1000),
  ('directory.members', 1, unixepoch() * 1000),
  ('curricular_units.detail', 1, unixepoch() * 1000),
  ('polls', 1, unixepoch() * 1000),
  ('polls.voting', 1, unixepoch() * 1000),
  ('polls.management', 1, unixepoch() * 1000),
  ('dashboard', 1, unixepoch() * 1000),
  ('dashboard.analytics', 1, unixepoch() * 1000),
  ('search', 1, unixepoch() * 1000),
  ('search.global', 1, unixepoch() * 1000),
  ('materials', 1, unixepoch() * 1000),
  ('materials.library', 1, unixepoch() * 1000),
  ('materials.submission', 1, unixepoch() * 1000),
  ('materials.moderation', 1, unixepoch() * 1000);

CREATE TABLE academic_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL CHECK (event_type IN ('assessment', 'exam', 'deadline', 'academic', 'meeting', 'event', 'evaluation')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  location TEXT,
  visibility TEXT NOT NULL DEFAULT 'students' CHECK (visibility IN ('public', 'students', 'cc')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at >= starts_at)
);
CREATE INDEX idx_academic_events_dates ON academic_events(starts_at, ends_at);
CREATE INDEX idx_academic_events_unit ON academic_events(curricular_unit_id, starts_at);

CREATE TABLE academic_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL CHECK (document_type IN ('minutes', 'regulation', 'form', 'document')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  url TEXT,
  content TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_data_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'students' CHECK (visibility IN ('public', 'students', 'cc')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  published_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (url IS NOT NULL OR content IS NOT NULL OR attachment_data_url IS NOT NULL)
);
CREATE INDEX idx_academic_documents_listing ON academic_documents(status, published_at DESC);
CREATE INDEX idx_academic_documents_unit ON academic_documents(curricular_unit_id, status);

CREATE TABLE course_requests (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('suggestion', 'problem', 'curricular_unit', 'facilities', 'academic', 'other', 'complaint', 'question')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  anonymous INTEGER NOT NULL DEFAULT 0 CHECK (anonymous IN (0, 1)),
  submitted_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'forwarded', 'resolved', 'closed')),
  response TEXT,
  response_visibility TEXT CHECK (response_visibility IN ('public', 'private')),
  responded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  responded_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_course_requests_owner ON course_requests(submitted_by, created_at DESC);
CREATE INDEX idx_course_requests_status ON course_requests(status, created_at DESC);

CREATE TABLE announcement_curricular_units (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, curricular_unit_id)
);

CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  results_visibility TEXT NOT NULL DEFAULT 'after_vote' CHECK (results_visibility IN ('always', 'after_vote', 'after_close', 'cc')),
  starts_at INTEGER,
  ends_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_polls_status_dates ON polls(status, starts_at, ends_at);

CREATE TABLE poll_questions (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'single' CHECK (selection_type IN ('single', 'multiple')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE poll_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- O hash impede voto repetido sem guardar/expor a identidade junto das respostas.
CREATE TABLE poll_participations (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, voter_hash)
);

CREATE TABLE poll_votes (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, question_id, option_id, voter_hash)
);
CREATE INDEX idx_poll_votes_results ON poll_votes(poll_id, question_id, option_id);

CREATE TABLE material_submissions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  material_type TEXT NOT NULL CHECK (material_type IN ('exam_photo', 'summary', 'notes', 'other')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  academic_year TEXT,
  anonymous INTEGER NOT NULL DEFAULT 0 CHECK (anonymous IN (0, 1)),
  submitted_by TEXT NOT NULL REFERENCES users(id),
  attachment_name TEXT NOT NULL,
  attachment_mime TEXT NOT NULL,
  attachment_data_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected', 'archived')),
  moderation_note TEXT,
  moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  moderated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_material_submissions_library ON material_submissions(status, created_at DESC);
CREATE INDEX idx_material_submissions_unit ON material_submissions(curricular_unit_id, status);
