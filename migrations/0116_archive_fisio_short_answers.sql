-- Fisiologia fica apenas com perguntas de escolha múltipla no catálogo ativo.
-- Mantemos os registos arquivados para preservar histórico e auditoria.
UPDATE quiz_questions
SET status='archived',
    archived_at=COALESCE(archived_at,unixepoch()*1000),
    archived_by=NULL,
    updated_at=unixepoch()*1000
WHERE curricular_unit_id=(SELECT id FROM curricular_units WHERE code='FIS1' LIMIT 1)
  AND response_type<>'multiple_choice'
  AND deleted_at IS NULL;

UPDATE question_bank_items
SET status='archived',
    updated_at=unixepoch()*1000
WHERE source_id='compendium-source-fis1'
  AND response_type<>'multiple_choice';

UPDATE question_bank_sources
SET published_count=(SELECT COUNT(*) FROM question_bank_items WHERE source_id='compendium-source-fis1' AND status='published'),
    review_count=(SELECT COUNT(*) FROM question_bank_items WHERE source_id='compendium-source-fis1' AND status='review'),
    updated_at=unixepoch()*1000
WHERE id='compendium-source-fis1';
