ALTER TABLE distribution_proposals
ADD COLUMN max_difference INTEGER NOT NULL DEFAULT 3 CHECK(max_difference >= 3);

ALTER TABLE distribution_proposals
ADD COLUMN final_difference INTEGER NOT NULL DEFAULT 0 CHECK(final_difference >= 0);

ALTER TABLE distribution_proposals
ADD COLUMN imbalance_override_reason TEXT;
