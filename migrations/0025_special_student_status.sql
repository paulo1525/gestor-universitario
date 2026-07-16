ALTER TABLE class_students
ADD COLUMN special_status TEXT NOT NULL DEFAULT 'none'
CHECK (special_status IN ('none', 'worker_student', 'athlete', 'other'));

CREATE INDEX idx_class_students_special_status
ON class_students(special_status, removed_at, class_id);
