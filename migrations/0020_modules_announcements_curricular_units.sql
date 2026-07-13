CREATE TABLE app_module_settings (
  module_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('classes', 1, unixepoch() * 1000),
  ('classes.rosters', 1, unixepoch() * 1000),
  ('classes.preferences', 1, unixepoch() * 1000),
  ('classes.placements', 1, unixepoch() * 1000),
  ('announcements', 1, unixepoch() * 1000),
  ('announcements.feed', 1, unixepoch() * 1000),
  ('announcements.publishing', 1, unixepoch() * 1000),
  ('curricular_units', 1, unixepoch() * 1000),
  ('curricular_units.catalog', 1, unixepoch() * 1000),
  ('curricular_units.management', 1, unixepoch() * 1000);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  author_position_code TEXT NOT NULL,
  author_position_label TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  expires_at INTEGER,
  archived_at INTEGER,
  archived_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_announcements_feed ON announcements(status, published_at DESC);
CREATE INDEX idx_announcements_expiry ON announcements(expires_at);

CREATE TABLE curricular_units (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  ects REAL NOT NULL CHECK (ects > 0 AND ects <= 60),
  study_year INTEGER NOT NULL CHECK (study_year BETWEEN 1 AND 6),
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  representative_user_id TEXT NOT NULL REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_curricular_units_order ON curricular_units(study_year, semester, name);
CREATE INDEX idx_curricular_units_representative ON curricular_units(representative_user_id);
