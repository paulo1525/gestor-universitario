-- Traduções de AP7, AP10 e AP13. Os sumários oficiais destas práticas
-- ainda não constam do catálogo; as aulas ficam prontas para futura associação.
-- Confirmar cada objeto privado R2 pelo tamanho e SHA-256 antes de aplicar.
INSERT OR IGNORE INTO material_lessons (id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at)
SELECT 'lesson-neuro-ap7',id,'AP7','Telencéfalo I — configuração externa','practical',107,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='NEURO' AND active=1;
INSERT OR IGNORE INTO material_lessons (id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at)
SELECT 'lesson-neuro-ap10',id,'AP10','Vascularização do encéfalo. Meninges','practical',110,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='NEURO' AND active=1;
INSERT OR IGNORE INTO material_lessons (id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at)
SELECT 'lesson-neuro-ap13',id,'AP13','Divisão autónoma do sistema nervoso periférico','practical',113,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='NEURO' AND active=1;

INSERT OR IGNORE INTO material_catalog (
  id,curricular_unit_id,lesson_id,material_kind,bibliography_format,title,description,
  file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,
  checksum_sha256,verification_status,publication_status,public_access,source_id,
  page_note,version_group,version_number,is_recommended,created_at,updated_at
)
SELECT 'material-biblio-2627-ap7-lippincott2-translation',cu.id,'lesson-neuro-ap7',
  'bibliography','translation','Lippincott Illustrated Reviews: Neuroscience — AP7 · Tradução',
  'Bibliografia traduzida para AP7 — telencéfalo I, configuração externa. 16 páginas e 9 figuras.',
  'AP7_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf','application/pdf','r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP7_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready',3306227,'604999b303334cf594e009a7f221bf4b020913267668c98aa248a468d8ed7b63',
  'verified','published',0,'source-lippincott-2',
  'Lippincott Illustrated Reviews: Neuroscience, 2.ª edição: pp. 28–34. Bibliografia indicada para AP7.',
  'biblio-2627-ap7-lippincott2-translation',1,1,unixepoch()*1000,unixepoch()*1000
FROM curricular_units cu WHERE cu.code='NEURO' AND cu.active=1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id='lesson-neuro-ap7')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id='source-lippincott-2');

INSERT OR IGNORE INTO material_catalog (
  id,curricular_unit_id,lesson_id,material_kind,bibliography_format,title,description,
  file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,
  checksum_sha256,verification_status,publication_status,public_access,source_id,
  page_note,version_group,version_number,is_recommended,created_at,updated_at
)
SELECT 'material-biblio-2627-ap10-lippincott2-translation',cu.id,'lesson-neuro-ap10',
  'bibliography','translation','Lippincott Illustrated Reviews: Neuroscience — AP10 · Tradução',
  'Bibliografia traduzida para AP10 — vascularização do encéfalo e meninges. 52 páginas e 24 figuras.',
  'AP10_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf','application/pdf','r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP10_Lippincott_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready',8144584,'a7a617e821c957c6583f0055d1b2dddd8593ba87cf0298a497a21d240740563e',
  'verified','published',0,'source-lippincott-2',
  'Lippincott Illustrated Reviews: Neuroscience, 2.ª edição: pp. 259–270, 271–283 e 284–291. Bibliografia indicada para AP10.',
  'biblio-2627-ap10-lippincott2-translation',1,1,unixepoch()*1000,unixepoch()*1000
FROM curricular_units cu WHERE cu.code='NEURO' AND cu.active=1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id='lesson-neuro-ap10')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id='source-lippincott-2');

INSERT OR IGNORE INTO material_catalog (
  id,curricular_unit_id,lesson_id,material_kind,bibliography_format,title,description,
  file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,
  checksum_sha256,verification_status,publication_status,public_access,source_id,
  page_note,version_group,version_number,is_recommended,created_at,updated_at
)
SELECT 'material-biblio-2627-ap13-nolte7-translation',cu.id,'lesson-neuro-ap13',
  'bibliography','translation','The Human Brain — AP13 · Tradução',
  'Bibliografia traduzida para AP13 — divisão autónoma do sistema nervoso periférico. 18 páginas e 7 figuras.',
  'AP13_Nolte_Bibliografia_Traduzida_2026-09-26.pdf','application/pdf','r2',
  'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP13_Nolte_Bibliografia_Traduzida_2026-09-26.pdf',
  'ready',3782501,'cae0c9ac46cd02c735ff413e16e6c751d0881d029ad6222ebdc0368d5b53d3eb',
  'verified','published',0,'source-nolte-7',
  'Nolte’s The Human Brain, 7.ª edição: pp. 260–271. Bibliografia indicada para AP13.',
  'biblio-2627-ap13-nolte7-translation',1,1,unixepoch()*1000,unixepoch()*1000
FROM curricular_units cu WHERE cu.code='NEURO' AND cu.active=1
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id='lesson-neuro-ap13')
  AND EXISTS (SELECT 1 FROM material_sources WHERE id='source-nolte-7');

INSERT OR IGNORE INTO material_catalog_lessons (material_id,lesson_id,relevance,sort_order)
SELECT 'material-biblio-2627-ap7-lippincott2-translation','lesson-neuro-ap7','primary',0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id='material-biblio-2627-ap7-lippincott2-translation');
INSERT OR IGNORE INTO material_catalog_lessons (material_id,lesson_id,relevance,sort_order)
SELECT 'material-biblio-2627-ap7-lippincott2-translation','lesson-neuro-at11','complementary',1
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id='material-biblio-2627-ap7-lippincott2-translation')
  AND EXISTS (SELECT 1 FROM material_lessons WHERE id='lesson-neuro-at11');
INSERT OR IGNORE INTO material_catalog_lessons (material_id,lesson_id,relevance,sort_order)
SELECT 'material-biblio-2627-ap10-lippincott2-translation','lesson-neuro-ap10','primary',0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id='material-biblio-2627-ap10-lippincott2-translation');
INSERT OR IGNORE INTO material_catalog_lessons (material_id,lesson_id,relevance,sort_order)
SELECT 'material-biblio-2627-ap13-nolte7-translation','lesson-neuro-ap13','primary',0
WHERE EXISTS (SELECT 1 FROM material_catalog WHERE id='material-biblio-2627-ap13-nolte7-translation');
