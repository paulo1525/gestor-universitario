ALTER TABLE class_students ADD COLUMN considerations TEXT NOT NULL DEFAULT '[]';
ALTER TABLE class_students ADD COLUMN support_class INTEGER REFERENCES classes(id);
ALTER TABLE class_students ADD COLUMN friend_group_code TEXT;
CREATE INDEX idx_class_students_friend_group ON class_students(friend_group_code, removed_at);
