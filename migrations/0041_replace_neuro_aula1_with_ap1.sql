-- Substitui o banco legado da Aula 1 de Neuroanatomia pelo tópico AP1 de resposta curta.
-- O conteúdo legado é arquivado para preservar histórico de tentativas e auditoria.
DROP TABLE IF EXISTS _seed_neuro_ap1_context;
CREATE TABLE _seed_neuro_ap1_context (unit_id TEXT NOT NULL, actor_id TEXT NOT NULL);
INSERT INTO _seed_neuro_ap1_context (unit_id,actor_id)
SELECT cu.id, COALESCE(
  (SELECT updated_by FROM quiz_topics WHERE curricular_unit_id=cu.id AND id='quiz-topic-neuro-aula-1' LIMIT 1),
  (SELECT id FROM users WHERE status='active' AND role='admin' ORDER BY created_at LIMIT 1),
  (SELECT id FROM users WHERE status='active' ORDER BY created_at LIMIT 1)
)
FROM curricular_units cu WHERE cu.code='NEURO' AND cu.active=1;

UPDATE quiz_questions
SET status='archived', archived_at=COALESCE(archived_at,unixepoch()*1000),
    archived_by=COALESCE(archived_by,(SELECT actor_id FROM _seed_neuro_ap1_context LIMIT 1)),
    updated_by=(SELECT actor_id FROM _seed_neuro_ap1_context LIMIT 1), updated_at=unixepoch()*1000
WHERE topic_id='quiz-topic-neuro-aula-1' AND deleted_at IS NULL;

UPDATE quiz_topics
SET status='archived', archived_at=COALESCE(archived_at,unixepoch()*1000),
    archived_by=COALESCE(archived_by,(SELECT actor_id FROM _seed_neuro_ap1_context LIMIT 1)),
    updated_by=(SELECT actor_id FROM _seed_neuro_ap1_context LIMIT 1), updated_at=unixepoch()*1000
WHERE id='quiz-topic-neuro-aula-1' AND deleted_at IS NULL;

INSERT INTO quiz_topics (id,curricular_unit_id,title,description,status,sort_order,published_at,published_by,created_by,updated_by,created_at,updated_at)
SELECT 'quiz-topic-neuro-ap1',unit_id,'AP1 — Introdução ao estudo prático da Neuroanatomia. Neurocrânio',
       'Neurocrânio: constituição, orientação, normas cranianas, base do crânio, fossas cranianas, ossificação, articulações, crescimento, fontanelas e pontos craniométricos.',
       'published',1,unixepoch()*1000,actor_id,actor_id,actor_id,unixepoch()*1000,unixepoch()*1000
FROM _seed_neuro_ap1_context
WHERE true
ON CONFLICT(id) DO UPDATE SET curricular_unit_id=excluded.curricular_unit_id,title=excluded.title,description=excluded.description,status='published',sort_order=excluded.sort_order,published_at=COALESCE(quiz_topics.published_at,excluded.published_at),published_by=COALESCE(quiz_topics.published_by,excluded.published_by),archived_at=NULL,archived_by=NULL,deleted_at=NULL,deleted_by=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

DROP TABLE IF EXISTS _seed_neuro_ap1_context;
