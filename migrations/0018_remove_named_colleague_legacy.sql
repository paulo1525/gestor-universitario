-- Remove a funcionalidade histórica de colegas indicados e rede/grupo de apoio.
-- Mantém apenas os critérios administrativos atuais, incluindo o critério
-- genérico "Tem amigos noutra turma", que não identifica qualquer pessoa.
UPDATE class_students AS student
SET considerations = (
  SELECT json_group_array(value)
  FROM json_each(CASE WHEN json_valid(student.considerations) THEN student.considerations ELSE '[]' END)
  WHERE value IN ('friends_other_class', 'integration_bullying', 'other')
)
WHERE NOT json_valid(student.considerations)
   OR EXISTS (
     SELECT 1
     FROM json_each(CASE WHEN json_valid(student.considerations) THEN student.considerations ELSE '[]' END)
     WHERE value NOT IN ('friends_other_class', 'integration_bullying', 'other')
   );

DROP TABLE student_friend_preferences;
DROP INDEX idx_class_students_friend_group;
ALTER TABLE class_students DROP COLUMN support_class;
ALTER TABLE class_students DROP COLUMN friend_group_code;
