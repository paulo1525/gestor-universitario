-- State of the Google Drive indexing of the year's materials (worker/google-drive.ts).
-- One row ('materials'); last_status 'running' doubles as a lock so two requests never sync at once.
CREATE TABLE IF NOT EXISTS drive_sync_state (
  id TEXT PRIMARY KEY,
  last_started_at INTEGER NOT NULL DEFAULT 0,
  last_finished_at INTEGER,
  last_status TEXT NOT NULL DEFAULT 'never' CHECK (last_status IN ('never', 'running', 'ok', 'error')),
  last_message TEXT NOT NULL DEFAULT '',
  files_count INTEGER NOT NULL DEFAULT 0
);
