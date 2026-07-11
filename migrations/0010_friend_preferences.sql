CREATE TABLE student_friend_preferences (
  student_id TEXT NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  friend_student_id TEXT NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  destination_class INTEGER NOT NULL REFERENCES classes(id),
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(student_id, friend_student_id),
  UNIQUE(student_id, rank),
  CHECK(student_id <> friend_student_id)
);
CREATE INDEX idx_friend_preferences_student ON student_friend_preferences(student_id, rank);
