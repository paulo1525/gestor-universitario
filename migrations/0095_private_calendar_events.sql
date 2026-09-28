-- Agenda privada: a titularidade é sempre o utilizador autenticado.
CREATE TABLE personal_calendar_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL CHECK (event_type IN ('study', 'personal', 'social', 'academic_group', 'meeting')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  location TEXT,
  organizer TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at >= starts_at)
);
CREATE INDEX idx_personal_calendar_events_owner_dates ON personal_calendar_events(owner_id, starts_at, ends_at);

ALTER TABLE academic_events ADD COLUMN organizer TEXT;
