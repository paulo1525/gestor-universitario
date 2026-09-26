-- Traduções finais da bibliografia AP4, separadas dos recortes originais.
-- Confirmar ambos os objetos privados R2 por tamanho e SHA-256 antes de aplicar.
INSERT OR IGNORE INTO material_catalog (
  id, curricular_unit_id, lesson_id, material_kind, bibliography_format,
  title, description, file_name, mime_type, storage_backend, storage_key,
  storage_state, byte_size, checksum_sha256, verification_status,
  publication_status, public_access, source_id, page_note, version_group,
  version_number, is_recommended, created_at, updated_at
)
SELECT
  'material-biblio-2627-ap4-gray42-translation', cu.id, 'lesson-neuro-ap4',
  'bibliography', 'translation', 'Gray’s Anatomy — AP4 · Tradução',
  'Bibliografia traduzida para AP4 — nervos trigémio e facial. 30 páginas e 5 figuras.',
  'AP4_Gray_Bibliografia_Traduzida_2026-09-26.pdf', 'application/pdf', 'r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP4_Gray_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready', 2617453, '6815255f96ca8e9d84429b2a812329f2623612bef38e344f7f7049770fdec2c5',
  'verified', 'published', 0, 'source-gray-42',
  'Gray’s Anatomy, 42.ª edição: p. 391; pp. 450, 453–455; pp. 630–633. Bibliografia aconselhada no sumário AP4.',
  'biblio-2627-ap4-gray42-translation', 1, 1, unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units cu
WHERE cu.code = 'NEURO' AND cu.active = 1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-ap4')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id = 'source-gray-42');

INSERT OR IGNORE INTO material_catalog (
  id, curricular_unit_id, lesson_id, material_kind, bibliography_format,
  title, description, file_name, mime_type, storage_backend, storage_key,
  storage_state, byte_size, checksum_sha256, verification_status,
  publication_status, public_access, source_id, page_note, version_group,
  version_number, is_recommended, created_at, updated_at
)
SELECT
  'material-biblio-2627-ap4-nolte6-translation', cu.id, 'lesson-neuro-ap4',
  'bibliography', 'translation', 'The Human Brain — AP4 · Tradução',
  'Bibliografia traduzida para AP4 — nervos trigémio e facial. 32 páginas e 19 figuras.',
  'AP4_Nolte_Bibliografia_Traduzida_2026-09-26.pdf', 'application/pdf', 'r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP4_Nolte_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready', 7262164, 'e1173ee387cfc6a00dae76b5abe70882c315e01bda9a1bc13db8efd64b151d13',
  'verified', 'published', 0, 'source-nolte-6',
  'The Human Brain, 6.ª edição: pp. 295–298 e 305–316 na tradução. Bibliografia aconselhada no sumário AP4.',
  'biblio-2627-ap4-nolte6-translation', 1, 1, unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units cu
WHERE cu.code = 'NEURO' AND cu.active = 1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-ap4')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id = 'source-nolte-6');

INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap4-gray42-translation', 'lesson-neuro-ap4', 'primary', 0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap4-gray42-translation');
INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap4-gray42-translation', 'lesson-neuro-at7', 'complementary', 1
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap4-gray42-translation')
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-at7');
INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap4-nolte6-translation', 'lesson-neuro-ap4', 'primary', 0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap4-nolte6-translation');
INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order)
SELECT 'material-biblio-2627-ap4-nolte6-translation', 'lesson-neuro-at7', 'complementary', 1
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id = 'material-biblio-2627-ap4-nolte6-translation')
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id = 'lesson-neuro-at7');
