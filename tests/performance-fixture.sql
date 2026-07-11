INSERT OR IGNORE INTO users (id,email,full_name,password_hash,password_salt,password_iterations,role,email_verified_at,password_changed_at,status,created_at,updated_at) VALUES ('perf-user','up202500000@up.pt','Utilizador de Teste','x','x',1,'admin',1,1,'active',1,1);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<400)
INSERT OR IGNORE INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at)
SELECT 'perf-'||x,((x-1)%20)+1,'Estudante de Teste '||x,printf('%09d',202500000+x),CASE WHEN x%3=0 THEN 'move' ELSE 'stay' END,1,'perf-user',1,1 FROM n;
INSERT OR IGNORE INTO student_destinations (student_id,destination_class,rank,updated_by,updated_at)
SELECT id,(class_id%20)+1,1,'perf-user',1 FROM class_students WHERE id LIKE 'perf-%' AND preference='move';
SELECT c.id,c.status,COUNT(s.id) students,COALESCE(SUM(s.preference='stay'),0) stays,COALESCE(SUM(s.preference='move'),0) moves FROM classes c LEFT JOIN class_students s ON s.class_id=c.id AND s.removed_at IS NULL GROUP BY c.id ORDER BY c.id;
SELECT s.id,s.full_name,s.student_number,s.preference,COALESCE(GROUP_CONCAT(d.destination_class || ':' || d.rank, ','),'') destinations FROM class_students s LEFT JOIN student_destinations d ON d.student_id=s.id WHERE s.class_id=17 AND s.removed_at IS NULL GROUP BY s.id ORDER BY s.full_name;
SELECT s.class_id,s.student_number,s.preference,COUNT(d.student_id) destination_count FROM class_students s LEFT JOIN student_destinations d ON d.student_id=s.id WHERE s.removed_at IS NULL GROUP BY s.id;
