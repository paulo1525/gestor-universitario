CREATE TABLE announcement_reads (
 announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 read_at INTEGER NOT NULL,
 PRIMARY KEY(announcement_id,user_id)
);
CREATE INDEX idx_announcement_reads_user ON announcement_reads(user_id,announcement_id);
-- Previous explicit acknowledgements are already confirmed reads.
INSERT INTO announcement_reads SELECT announcement_id,user_id,acknowledged_at FROM announcement_acknowledgements;
