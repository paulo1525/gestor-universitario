-- Polls only have two states now: running ('published', shown as "A decorrer") and
-- closed ('closed', shown as "Encerrado"). New polls are published straight away.
-- Drafts were never visible to students; the ones without any participation are removed.
-- Questions, options and votes cascade from polls.
DELETE FROM polls
WHERE status = 'draft'
  AND NOT EXISTS (SELECT 1 FROM poll_participations p WHERE p.poll_id = polls.id);

-- Anything left in draft or archived becomes closed.
UPDATE polls
SET status = 'closed', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE status IN ('draft', 'archived');
