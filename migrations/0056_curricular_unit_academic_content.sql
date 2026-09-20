-- Informação académica específica de cada ano letivo.
-- O perfil é deliberadamente separado da UC base para preservar o histórico
-- quando mudam regras de avaliação, presenças ou fontes recomendadas.

INSERT OR IGNORE INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('curricular_units.content', 1, unixepoch() * 1000),
  ('curricular_units.content.management', 1, unixepoch() * 1000);

CREATE TABLE curricular_unit_academic_profiles (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  attendance_required INTEGER NOT NULL DEFAULT 0 CHECK (attendance_required IN (0, 1)),
  attendance_policy TEXT NOT NULL DEFAULT '',
  absence_limit TEXT NOT NULL DEFAULT '',
  absence_policy TEXT NOT NULL DEFAULT '',
  attendance_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'a_validar' CHECK (status IN ('a_validar', 'verificado')),
  last_validated_at INTEGER,
  last_validated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (curricular_unit_id, academic_year)
);

CREATE INDEX idx_curricular_unit_academic_profiles_year
  ON curricular_unit_academic_profiles(curricular_unit_id, academic_year DESC);
CREATE INDEX idx_curricular_unit_academic_profiles_status
  ON curricular_unit_academic_profiles(status, updated_at DESC);

CREATE TABLE curricular_unit_evaluations (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES curricular_unit_academic_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  weight REAL CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100)),
  minimum_score REAL CHECK (minimum_score IS NULL OR (minimum_score >= 0 AND minimum_score <= 20)),
  details TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_curricular_unit_evaluations_profile
  ON curricular_unit_evaluations(profile_id, sort_order, title COLLATE NOCASE);

CREATE TABLE curricular_unit_exams (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES curricular_unit_academic_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('frequencia', 'normal', 'recurso', 'especial', 'melhoria', 'outro')),
  calendar_event_id TEXT REFERENCES academic_events(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_curricular_unit_exams_profile
  ON curricular_unit_exams(profile_id, sort_order, title COLLATE NOCASE);
CREATE INDEX idx_curricular_unit_exams_calendar_event
  ON curricular_unit_exams(calendar_event_id);

CREATE TABLE curricular_unit_sources (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES curricular_unit_academic_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('oficial', 'recomendada', 'regulamento', 'bibliografia', 'outro')),
  citation TEXT NOT NULL DEFAULT '',
  pages TEXT NOT NULL DEFAULT '',
  url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_curricular_unit_sources_profile
  ON curricular_unit_sources(profile_id, sort_order, title COLLATE NOCASE);
