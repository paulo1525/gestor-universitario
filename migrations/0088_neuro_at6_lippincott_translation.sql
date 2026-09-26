-- Tradução final da bibliografia Lippincott AT6, separada do recorte original.
-- Confirmar o objeto privado R2 pelo tamanho e SHA-256 antes de aplicar.
INSERT OR IGNORE INTO material_catalog (
  id, curricular_unit_id, lesson_id, material_kind, bibliography_format,
  title, description, file_name, mime_type, storage_backend, storage_key,
  storage_state, byte_size, checksum_sha256, verification_status,
  publication_status, public_access, source_id, page_note, version_group,
  version_number, is_recommended, created_at, updated_at
)
SELECT
  'material-biblio-2627-at6-lippincott2-translation', cu.id,
  'lesson-neuro-at6', 'bibliography', 'translation',
  'Lippincott Illustrated Reviews: Neuroscience — AT6 · Tradução',
  'Bibliografia traduzida para AT6 — nervos cranianos, componentes funcionais, nervo e via olfativos. 30 páginas e 17 figuras.',
  'AT6_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf', 'application/pdf', 'r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AT6_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready', 5569926, '766a9670b6b66e6d247318467ee70339191787c15bbda2f13b214b081375e15a',
  'verified', 'published', 0, 'source-lippincott-2',
  'Lippincott Illustrated Reviews: Neuroscience, 2.ª edição: pp. 109–120 e 425–429; inclui a Tabela 6.1 (p. 115). Bibliografia aconselhada no sumário AT6 de 2027.',
  'biblio-2627-at6-lippincott2-translation', 1, 1,
  unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units cu
WHERE cu.code = 'NEURO' AND cu.active = 1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-at6')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id = 'source-lippincott-2');

INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-at6-lippincott2-translation', 'lesson-neuro-at6', 'primary', 0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-at6-lippincott2-translation');
