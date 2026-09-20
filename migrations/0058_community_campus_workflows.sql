-- Community, campus directory, structured exam intake and critical notices.
-- The migration is additive: existing requests, materials and announcements
-- remain readable while the new workflow metadata is introduced.

INSERT OR IGNORE INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('campus', 1, unixepoch() * 1000),
  ('campus.directory', 1, unixepoch() * 1000),
  ('campus.management', 1, unixepoch() * 1000),
  ('materials.exam_workflow', 1, unixepoch() * 1000),
  ('requests.reveal_audit', 1, unixepoch() * 1000),
  ('announcements.critical', 1, unixepoch() * 1000);

CREATE TABLE IF NOT EXISTS course_request_reveal_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES course_requests(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  revealed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_course_request_reveal_audit_request
  ON course_request_reveal_audit(request_id, revealed_at DESC);

CREATE TABLE IF NOT EXISTS exam_submission_details (
  submission_id TEXT PRIMARY KEY REFERENCES material_submissions(id) ON DELETE CASCADE,
  sitting TEXT NOT NULL DEFAULT 'unknown' CHECK (sitting IN ('normal', 'resit', 'special', 'continuous', 'unknown')),
  assessment_component TEXT NOT NULL DEFAULT 'unknown' CHECK (assessment_component IN ('theory', 'practical', 'mixed', 'unknown')),
  exam_date INTEGER,
  question_count INTEGER CHECK (question_count IS NULL OR question_count BETWEEN 1 AND 500),
  transcription_status TEXT NOT NULL DEFAULT 'received' CHECK (transcription_status IN ('received', 'transcribing', 'reviewing', 'imported', 'archived')),
  transcription_notes TEXT NOT NULL DEFAULT '',
  transcribed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  imported_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_submission_details_workflow
  ON exam_submission_details(transcription_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS exam_submission_workflow (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES material_submissions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_submission_workflow_submission
  ON exam_submission_workflow(submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campus_buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  map_url TEXT,
  accessibility_notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campus_floors (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES campus_buildings(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  label TEXT NOT NULL,
  plan_url TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (building_id, level)
);

CREATE TABLE IF NOT EXISTS campus_rooms (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES campus_floors(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'room' CHECK (room_type IN ('room', 'laboratory', 'amphitheatre', 'service', 'other')),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  accessibility_notes TEXT NOT NULL DEFAULT '',
  directions TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (floor_id, code)
);
CREATE INDEX IF NOT EXISTS idx_campus_rooms_code ON campus_rooms(code, active);

CREATE TABLE IF NOT EXISTS campus_faculty (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  email TEXT,
  office TEXT,
  profile_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campus_faculty_name ON campus_faculty(full_name COLLATE NOCASE, active);

CREATE TABLE IF NOT EXISTS campus_faculty_units (
  faculty_id TEXT NOT NULL REFERENCES campus_faculty(id) ON DELETE CASCADE,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (faculty_id, curricular_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_campus_faculty_units_unit ON campus_faculty_units(curricular_unit_id);

ALTER TABLE announcements ADD COLUMN is_critical INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0, 1));
ALTER TABLE announcements ADD COLUMN audience_scope TEXT NOT NULL DEFAULT 'all' CHECK (audience_scope IN ('all', 'unit', 'year'));
ALTER TABLE announcements ADD COLUMN audience_year INTEGER CHECK (audience_year IS NULL OR audience_year BETWEEN 1 AND 6);
ALTER TABLE announcements ADD COLUMN audience_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(is_critical, audience_scope, audience_year, audience_unit_id);

CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_announcement_ack_user ON announcement_acknowledgements(user_id, acknowledged_at DESC);

ALTER TABLE users ADD COLUMN study_year INTEGER CHECK (study_year IS NULL OR study_year BETWEEN 1 AND 6);
