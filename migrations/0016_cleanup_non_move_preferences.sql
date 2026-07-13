-- Permanecer na turma e ter destinos/referências são estados incompatíveis.
-- Elimina resíduos históricos; as rotas passam igualmente a garantir esta regra.
DELETE FROM student_friend_preferences
WHERE student_id IN (
  SELECT id FROM class_students
  WHERE student_decision IS NULL OR student_decision <> 'move'
);

DELETE FROM student_destinations
WHERE student_id IN (
  SELECT id FROM class_students
  WHERE student_decision IS NULL OR student_decision <> 'move'
);
