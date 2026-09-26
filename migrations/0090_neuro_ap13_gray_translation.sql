-- Tradução Gray 42 da AP13, separada da tradução Nolte 7 já publicada.
-- Confirmar o objeto R2 privado por tamanho e SHA-256 antes de aplicar.
INSERT OR IGNORE INTO material_catalog (
  id,curricular_unit_id,lesson_id,material_kind,bibliography_format,title,description,
  file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,
  checksum_sha256,verification_status,publication_status,public_access,source_id,
  page_note,version_group,version_number,is_recommended,created_at,updated_at
)
SELECT 'material-biblio-2627-ap13-gray42-translation',cu.id,'lesson-neuro-ap13',
  'bibliography','translation','Gray’s Anatomy — AP13 · Tradução',
  'Bibliografia traduzida para AP13 — divisão autónoma do sistema nervoso periférico. 30 páginas e 10 figuras.',
  'AP13_Gray_Bibliografia_Traduzida_2026-09-26.pdf','application/pdf','r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP13_Gray_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready',4758923,'0c007efd71bd79e2738de9303cd7ff8ec6e909ff5121aff41a66ba680451b8de',
  'verified','published',0,'source-gray-42',
  'Gray’s Anatomy, 42.ª edição: pp. 392–395, 549–551 e 1109–1111. Bibliografia indicada para AP13.',
  'biblio-2627-ap13-gray42-translation',1,1,unixepoch()*1000,unixepoch()*1000
FROM curricular_units cu WHERE cu.code='NEURO' AND cu.active=1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id='lesson-neuro-ap13')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id='source-gray-42');

INSERT OR IGNORE INTO material_catalog_lessons (material_id,lesson_id,relevance,sort_order)
SELECT 'material-biblio-2627-ap13-gray42-translation','lesson-neuro-ap13','primary',0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id='material-biblio-2627-ap13-gray42-translation');
