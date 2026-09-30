-- Final study PDFs supplied and approved for publication with their new covers.
-- Private R2 objects are checksum-verified before this catalogue migration.
INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,other_format,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-ar-compendium-solutions',id,'other','compendium',
  'Anatomia Radiológica — Compêndio com soluções',
  'Compêndio de estudo com 215 perguntas em 114 páginas. Edição de 30/09/2026 com a nova capa; preserva as figuras corrigidas e os avisos e ressalvas do documento.',
  'Anatomia_Radiologica_Compendio_com_solucoes.pdf','application/pdf','r2',
  'materials/anatomia-radiologica/compendios/0486259874d73b848bd7638a823e4ab8410b54c4a64752573f09727d5a4d4188.pdf',
  'ready',58792661,'0486259874d73b848bd7638a823e4ab8410b54c4a64752573f09727d5a4d4188',
  'original','published','ar-compendium-solutions',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='AR' AND active=1;

INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,other_format,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-ar-compendium-no-solutions',id,'other','compendium',
  'Anatomia Radiológica — Compêndio sem soluções',
  'Compêndio de estudo com 215 perguntas em 79 páginas, sem soluções. Edição de 30/09/2026 com a nova capa; preserva as figuras corrigidas e os avisos e ressalvas do documento.',
  'Anatomia_Radiologica_Compendio_sem_solucoes.pdf','application/pdf','r2',
  'materials/anatomia-radiologica/compendios/42f42372b1b725be99a202dafac7470e281e7d76ae04586ceced1434045ebb4b.pdf',
  'ready',54691702,'42f42372b1b725be99a202dafac7470e281e7d76ae04586ceced1434045ebb4b',
  'original','published','ar-compendium-no-solutions',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='AR' AND active=1;

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'materials_compendia_published',
  '{"source":"authorized-ar-publication-2026-09-30","newMaterials":2,"newCover":true,"publicAccess":false}',
  unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
  AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE action='materials_compendia_published' AND details LIKE '%authorized-ar-publication-2026-09-30%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
