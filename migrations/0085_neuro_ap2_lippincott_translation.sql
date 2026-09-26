-- Tradução final de Lippincott para AP2, separada do recorte original.
-- O objeto R2 deve ser confirmado pelo tamanho e SHA-256 antes de aplicar esta migration.
INSERT OR IGNORE INTO material_catalog (
  id, curricular_unit_id, lesson_id, material_kind, bibliography_format,
  title, description, file_name, mime_type, storage_backend, storage_key,
  storage_state, byte_size, checksum_sha256, verification_status,
  publication_status, public_access, source_id, page_note, version_group,
  version_number, is_recommended, created_at, updated_at
)
SELECT
  'material-biblio-2627-ap2-lippincott-translation', cu.id,
  'lesson-neuro-ap2', 'bibliography', 'translation',
  'Lippincott Illustrated Reviews: Neuroscience — AP2 · Tradução',
  'Bibliografia traduzida para AP2 — medula espinhal e meninges. 36 páginas e 17 figuras traduzidas.',
  'AP2_Lippincott_Bibliografia_Traduzida_2026-09-25.pdf', 'application/pdf', 'r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP2_Lippincott_Bibliografia_Traduzida_2026-09-25.pdf',
  'ready', 6081733, '8924e17031f02bdd98779fe6b58b8fa504edb0487e859c085016587d9560431f',
  'verified', 'published', 0, 'source-lippincott-2',
  'Bibliografia aconselhada no sumário AP2: pp. 79–101. Tradução integral das páginas indicadas, com 16 figuras numeradas e o diagrama clínico AC5.2.',
  'biblio-2627-ap2-lippincott-translation', 1, 1,
  unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units cu
WHERE cu.code = 'NEURO' AND cu.active = 1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-ap2')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id = 'source-lippincott-2');

INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap2-lippincott-translation', 'lesson-neuro-ap2', 'primary', 0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap2-lippincott-translation');
