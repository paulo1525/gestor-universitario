-- Useful links become a public Linktree-style page. A link flagged with
-- requires_login is never returned to anonymous visitors.
-- Existing links become visible to everyone, except the ones restricted to the
-- commission ('cc'), which keep requiring a session.
ALTER TABLE useful_links ADD COLUMN requires_login INTEGER NOT NULL DEFAULT 0 CHECK (requires_login IN (0, 1));

UPDATE useful_links SET requires_login = 1 WHERE visibility = 'cc';
UPDATE useful_links SET requires_login = 0, visibility = 'public' WHERE visibility <> 'cc';

CREATE INDEX idx_useful_links_public
  ON useful_links(status, requires_login, visibility);
