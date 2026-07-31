ALTER TABLE distribution_proposals ADD COLUMN cycle_id TEXT;
ALTER TABLE distribution_proposals ADD COLUMN draft_number INTEGER;
ALTER TABLE distribution_proposals ADD COLUMN archived_at INTEGER;
ALTER TABLE distribution_proposals ADD COLUMN archived_by TEXT REFERENCES users(id);

UPDATE distribution_proposals
SET cycle_id = COALESCE(input_hash, 'legacy:' || id)
WHERE cycle_id IS NULL;

UPDATE distribution_proposals AS proposal
SET draft_number = (
  SELECT COUNT(*)
  FROM distribution_proposals AS previous
  WHERE COALESCE(previous.input_hash, 'legacy:' || previous.id) = proposal.cycle_id
    AND (
      previous.created_at < proposal.created_at
      OR (previous.created_at = proposal.created_at AND previous.id <= proposal.id)
    )
)
WHERE draft_number IS NULL;

CREATE UNIQUE INDEX idx_distribution_draft_number
  ON distribution_proposals(cycle_id, draft_number)
  WHERE cycle_id IS NOT NULL AND draft_number IS NOT NULL;

CREATE UNIQUE INDEX idx_distribution_single_definitive
  ON distribution_proposals ((1))
  WHERE invalidated_at IS NULL
    AND archived_at IS NULL
    AND status = 'approved';

CREATE INDEX idx_distribution_cycle_drafts
  ON distribution_proposals(cycle_id, archived_at, created_at DESC);
