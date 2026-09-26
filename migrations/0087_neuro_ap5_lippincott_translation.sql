-- Tradução final da bibliografia AP5. O sumário oficial AP5 ainda não consta do catálogo;
-- a aula é criada para permitir a associação correta quando esse PDF estiver disponível.
-- Confirmar o objeto privado R2 pelo tamanho e SHA-256 antes de aplicar.
INSERT OR IGNORE INTO material_lessons (
  id, curricular_unit_id, code, title, lesson_type, sort_order, created_at, updated_at
)
SELECT 'lesson-neuro-ap5', id, 'AP5',
  'Nervos glossofaríngeo, vago, acessório e hipoglosso. Espaços comuns ao crânio e à face',
  'practical', 105, unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units WHERE code = 'NEURO' AND active = 1;

INSERT OR IGNORE INTO material_catalog (
  id, curricular_unit_id, lesson_id, material_kind, bibliography_format,
  title, description, file_name, mime_type, storage_backend, storage_key,
  storage_state, byte_size, checksum_sha256, verification_status,
  publication_status, public_access, source_id, page_note, version_group,
  version_number, is_recommended, created_at, updated_at
)
SELECT
  'material-biblio-2627-ap5-lippincott2-translation', cu.id, 'lesson-neuro-ap5',
  'bibliography', 'translation',
  'Lippincott Illustrated Reviews: Neuroscience — AP5 · Tradução',
  'Bibliografia traduzida para AP5 — nervos cranianos IX–XII e espaços comuns ao crânio e à face. 40 páginas e 20 figuras.',
  'AP5_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf', 'application/pdf', 'r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP5_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready', 7206942, '4870f453dfd3034388da46d93c6cb6eba306ee7ec5ddd867c52cb1c5946f69a5',
  'verified', 'published', 0, 'source-lippincott-2',
  'Lippincott Illustrated Reviews: Neuroscience, 2.ª edição: pp. 102–109, 110–118, 119–127. Bibliografia aconselhada no sumário AP5.',
  'biblio-2627-ap5-lippincott2-translation', 1, 1,
  unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units cu
WHERE cu.code = 'NEURO' AND cu.active = 1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-ap5')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id = 'source-lippincott-2');

INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap5-lippincott2-translation', 'lesson-neuro-ap5', 'primary', 0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap5-lippincott2-translation');
INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap5-lippincott2-translation', 'lesson-neuro-at8', 'complementary', 1
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap5-lippincott2-translation')
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-at8');
