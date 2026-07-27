ALTER TABLE class_students ADD COLUMN additional_info_review_deferred INTEGER NOT NULL DEFAULT 0
  CHECK(additional_info_review_deferred IN (0, 1));
