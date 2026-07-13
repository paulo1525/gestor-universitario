ALTER TABLE class_students ADD COLUMN additional_info_review_status TEXT
  CHECK(additional_info_review_status IN ('valid', 'invalid'));
