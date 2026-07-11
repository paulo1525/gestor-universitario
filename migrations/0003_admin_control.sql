ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'banned'));
ALTER TABLE users ADD COLUMN status_reason TEXT;
ALTER TABLE users ADD COLUMN status_until INTEGER;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_log(created_at);

INSERT INTO app_settings (key, value, updated_at) VALUES ('maintenance_mode', 'true', unixepoch() * 1000);
INSERT INTO app_settings (key, value, updated_at) VALUES ('maintenance_message', 'A área de gestão encontra-se temporariamente indisponível enquanto preparamos novas funcionalidades.', unixepoch() * 1000);
