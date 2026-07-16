-- Dashboard pessoal, notificacoes sem fanout, calendario subscrito,
-- favoritos/versoes de materiais e links uteis.

INSERT OR IGNORE INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('dashboard.personal', 1, unixepoch() * 1000),
  ('notifications', 1, unixepoch() * 1000),
  ('notifications.feed', 1, unixepoch() * 1000),
  ('notifications.preferences', 1, unixepoch() * 1000),
  ('calendar.subscription', 1, unixepoch() * 1000),
  ('materials.favorites', 1, unixepoch() * 1000),
  ('materials.feedback', 1, unixepoch() * 1000),
  ('materials.versioning', 1, unixepoch() * 1000),
  ('useful_links', 1, unixepoch() * 1000),
  ('useful_links.library', 1, unixepoch() * 1000),
  ('useful_links.management', 1, unixepoch() * 1000);

-- O feed e calculado no momento da leitura. Esta tabela guarda apenas o
-- estado privado do utilizador, evitando criar uma linha por destinatario.
CREATE TABLE notification_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('announcement', 'event', 'poll', 'request', 'material')),
  source_id TEXT NOT NULL,
  read_at INTEGER,
  archived_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_type, source_id)
);
CREATE INDEX idx_notification_states_user_archived
  ON notification_states(user_id, archived_at, updated_at DESC);

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  announcements_enabled INTEGER NOT NULL DEFAULT 1 CHECK (announcements_enabled IN (0, 1)),
  calendar_enabled INTEGER NOT NULL DEFAULT 1 CHECK (calendar_enabled IN (0, 1)),
  polls_enabled INTEGER NOT NULL DEFAULT 1 CHECK (polls_enabled IN (0, 1)),
  requests_enabled INTEGER NOT NULL DEFAULT 1 CHECK (requests_enabled IN (0, 1)),
  materials_enabled INTEGER NOT NULL DEFAULT 1 CHECK (materials_enabled IN (0, 1)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
  urgent_only INTEGER NOT NULL DEFAULT 0 CHECK (urgent_only IN (0, 1)),
  curricular_unit_ids TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

-- O segredo nunca e persistido. Guarda-se unicamente SHA-256(token).
CREATE TABLE calendar_subscription_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'Calendario pessoal',
  curricular_unit_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX idx_calendar_subscription_tokens_user
  ON calendar_subscription_tokens(user_id, revoked_at, created_at DESC);

CREATE TABLE material_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES material_submissions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, material_id)
);
CREATE INDEX idx_material_favorites_user_date
  ON material_favorites(user_id, created_at DESC);

CREATE TABLE material_feedback (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES material_submissions(id) ON DELETE CASCADE,
  helpful INTEGER NOT NULL DEFAULT 0 CHECK (helpful IN (0, 1)),
  outdated INTEGER NOT NULL DEFAULT 0 CHECK (outdated IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, material_id)
);
CREATE INDEX idx_material_feedback_material
  ON material_feedback(material_id, helpful, outdated);

CREATE TABLE material_versions (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES material_submissions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  attachment_name TEXT NOT NULL,
  attachment_mime TEXT NOT NULL,
  attachment_data_url TEXT NOT NULL,
  change_note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE (material_id, version_number)
);
CREATE INDEX idx_material_versions_material
  ON material_versions(material_id, version_number DESC);

CREATE TABLE useful_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'important', 'normal')),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('academic', 'platform', 'curricular_unit', 'support', 'association', 'other')),
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'students' CHECK (visibility IN ('public', 'students', 'cc')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_useful_links_listing
  ON useful_links(status, priority, category, updated_at DESC);
CREATE INDEX idx_useful_links_unit
  ON useful_links(curricular_unit_id, status, priority);
