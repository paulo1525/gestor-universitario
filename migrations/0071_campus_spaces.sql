-- "Salas e docentes" becomes a simple list: room, building (CIM or Hospital São João),
-- optional teacher and the classes that use it. Additive only: the older detailed
-- campus tables stay untouched (global search and curricular units still read them).
CREATE TABLE IF NOT EXISTS campus_spaces (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  building TEXT NOT NULL CHECK (building IN ('cim', 'hsj')),
  teacher TEXT,
  classes TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campus_spaces_active ON campus_spaces(active, building, room);
