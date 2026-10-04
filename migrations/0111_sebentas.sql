-- Sebentas are distinct from compendia; existing catalogue categories remain unchanged.
ALTER TABLE material_catalog ADD COLUMN study_category TEXT
  CHECK (study_category IS NULL OR study_category='sebenta');

INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,study_category,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-fis1-sebenta-2026-2027',id,'other','sebenta',
  'Fisiologia I — Sebenta 2026/2027',
  'Sebenta de Fisiologia I para o ano letivo 2026/2027, com 556 páginas. Nota: esta sebenta foi corrigida recorrendo ao ChatGPT.',
  'Sebenta_Fisiologia_I_2026-2027.pdf','application/pdf','r2',
  'materials/fisiologia-i/sebentas/16a120970e9c1f1d425b745bbf89450e91570c7ab963fed02f156c3d0abac614.pdf',
  'ready',65589991,'16a120970e9c1f1d425b745bbf89450e91570c7ab963fed02f156c3d0abac614',
  'original','published','fis1-sebenta-2026-2027',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='FIS1' AND active=1;

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'material_sebenta_published',
  '{"source":"authorized-fis1-sebenta-2026-10-04","chatgptCorrectionNote":true,"publicAccess":false}',
  unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
  AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE action='material_sebenta_published' AND details LIKE '%authorized-fis1-sebenta-2026-10-04%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
