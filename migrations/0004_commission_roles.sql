ALTER TABLE users ADD COLUMN commission_position TEXT CHECK (commission_position IN ('principal_admin', 'president', 'vice_president', 'treasurer', 'member'));
ALTER TABLE users ADD COLUMN commission_department TEXT CHECK (commission_department IN ('management', 'studies', 'curricular_units', 'recreation_image'));

CREATE TABLE commission_positions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  authority_level TEXT NOT NULL CHECK (authority_level IN ('supreme', 'core', 'moderator')),
  rank INTEGER NOT NULL UNIQUE
);

CREATE TABLE commission_departments (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  rank INTEGER NOT NULL UNIQUE
);

INSERT INTO commission_positions (code, label, authority_level, rank) VALUES
  ('principal_admin', 'Administrador Principal', 'supreme', 1),
  ('president', 'Presidente', 'core', 2),
  ('vice_president', 'Vice-Presidente', 'core', 3),
  ('treasurer', 'Tesoureiro/a', 'core', 4),
  ('member', 'Vogal', 'moderator', 5);

INSERT INTO commission_departments (code, label, rank) VALUES
  ('management', 'Núcleo de Gestão', 1),
  ('studies', 'Estudos e Sebentas', 2),
  ('curricular_units', 'Unidades Curriculares', 3),
  ('recreation_image', 'Recreativo e Imagem', 4);

CREATE INDEX idx_users_commission_position ON users(commission_position);
CREATE INDEX idx_users_commission_department ON users(commission_department);
