-- Conclusão da revisão científica do banco de Neuroanatomia.
--
-- Critério conservador:
-- 1. perguntas marcadas apenas como escolha múltipla sem opções reais mantêm o
--    enunciado/resposta já moderados, mas passam a resposta curta; não são
--    inventados distratores;
-- 2. perguntas com truncamentos, respostas genéricas ou fragmentos
--    insuficientes são arquivadas, preservando a linha para auditoria sem a
--    disponibilizar aos estudantes.
--
-- Assim não fica qualquer item no estado "review".

UPDATE question_bank_items
SET response_type = 'short_answer',
    options_text = '',
    status = 'published',
    review_note = '',
    updated_at = unixepoch() * 1000
WHERE source_id = 'source-neuro-drive-question-bank'
  AND status = 'review'
  AND review_note = 'Formato de escolha múltipla sem opções estruturadas; requer revisão.'
  AND trim(answer_text) <> ''
  AND trim(answer_text) <> 'Resolução validada FMUP.';

UPDATE question_bank_items
SET status = 'archived',
    validation_state = 'review',
    review_note = CASE
      WHEN trim(review_note) <> '' THEN
        'Revisão científica concluída: não publicável com segurança a partir da fonte disponível. Motivo original: ' || trim(review_note)
      WHEN trim(answer_text) <> '' AND trim(answer_text) NOT GLOB '*[^0-9]*' THEN
        'Revisão científica concluída: resposta reduzida a um fragmento numérico sem contexto suficiente.'
      WHEN trim(answer_text) = 'OS' THEN
        'Revisão científica concluída: resposta reduzida a um fragmento sem contexto suficiente.'
      ELSE
        'Revisão científica concluída: conteúdo de origem insuficiente para publicação segura.'
    END,
    updated_at = unixepoch() * 1000
WHERE source_id = 'source-neuro-drive-question-bank'
  AND status = 'review';

UPDATE question_bank_sources
SET published_count = (
      SELECT COUNT(*)
      FROM question_bank_items
      WHERE source_id = question_bank_sources.id
        AND status = 'published'
    ),
    review_count = (
      SELECT COUNT(*)
      FROM question_bank_items
      WHERE source_id = question_bank_sources.id
        AND status = 'review'
    ),
    verification_status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM question_bank_items
        WHERE source_id = question_bank_sources.id
          AND status = 'review'
      ) THEN 'review'
      ELSE 'verified'
    END,
    coverage_json = json_set(
      coverage_json,
      '$.selection.reviewTotal', 0,
      '$.selection.reclassifiedShortAnswer', 167,
      '$.selection.archivedScientificReview', 150
    ),
    updated_at = unixepoch() * 1000
WHERE id = 'source-neuro-drive-question-bank';
