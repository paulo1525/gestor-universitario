-- Reserva conservadora de leituras R2 por ciclo UTC. O teto da aplicação fica
-- muito abaixo das 10 milhões de operações Class B incluídas por mês.
CREATE TABLE IF NOT EXISTS r2_read_budget (
  period_utc TEXT PRIMARY KEY,
  reserved_operations INTEGER NOT NULL DEFAULT 0 CHECK (reserved_operations >= 0),
  operation_limit INTEGER NOT NULL CHECK (operation_limit > 0),
  updated_at INTEGER NOT NULL
);

-- Migration 0057 is already present in some environments. Keep its
-- copyrighted bibliography and image-bearing APKG entries blocked there too,
-- even when this migration is the first release after the rights gate was
-- introduced. Checksums do not constitute permission to publish.
UPDATE material_catalog
SET publication_status = 'draft', updated_at = unixepoch() * 1000
WHERE material_kind = 'bibliography'
  AND (id LIKE 'material-biblio-%' OR id = 'material-bibliography-neuro-package');
UPDATE material_anki_decks
SET publication_status = 'draft', updated_at = unixepoch() * 1000
WHERE id IN ('anki-neuro-essential', 'anki-neuro-complete');
