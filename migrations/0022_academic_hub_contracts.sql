-- Alarga os valores aceites para corresponder aos contratos do frontend.
PRAGMA foreign_keys = OFF;

ALTER TABLE academic_events RENAME TO academic_events_old;
DROP INDEX idx_academic_events_dates;
DROP INDEX idx_academic_events_unit;
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
INSERT INTO academic_events SELECT * FROM academic_events_old;
DROP TABLE academic_events_old;
CREATE INDEX idx_academic_events_dates ON academic_events(starts_at, ends_at);
CREATE INDEX idx_academic_events_unit ON academic_events(curricular_unit_id, starts_at);

ALTER TABLE course_requests RENAME TO course_requests_old;
DROP INDEX idx_course_requests_owner;
DROP INDEX idx_course_requests_status;
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
INSERT INTO course_requests SELECT * FROM course_requests_old;
DROP TABLE course_requests_old;
CREATE INDEX idx_course_requests_owner ON course_requests(submitted_by, created_at DESC);
CREATE INDEX idx_course_requests_status ON course_requests(status, created_at DESC);

PRAGMA foreign_keys = ON;
