-- Final Fisiologia I compendia supplied for publication on 2026-09-30.
-- Integrity/content review completed; scientific review was targeted, not exhaustive.
INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,other_format,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-fis1-compendium-solutions',id,'other','compendium',
  'Fisiologia I — Compêndio com soluções',
  '1.195 questões em 521 páginas, com soluções e figuras. Versão final de 30/09/2026. Revisão científica dirigida; preserva os avisos e ressalvas do documento.',
  'Fisiologia_I_Compendio_com_solucoes.pdf','application/pdf','r2',
  'materials/fisiologia-i/compendios/016b5f8e38beb8bbd5026cf30dd66d5fffb44c18124a7b862e9b7ca77a80147a.pdf',
  'ready',42700793,'016b5f8e38beb8bbd5026cf30dd66d5fffb44c18124a7b862e9b7ca77a80147a',
  'original','published','fis1-compendium-solutions',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='FIS1' AND active=1;

INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,other_format,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-fis1-compendium-no-solutions',id,'other','compendium',
  'Fisiologia I — Compêndio sem soluções',
  'Caderno de treino com as mesmas 1.195 questões e figuras, em 364 páginas, sem soluções. Versão final de 30/09/2026.',
  'Fisiologia_I_Compendio_sem_solucoes.pdf','application/pdf','r2',
  'materials/fisiologia-i/compendios/ac3cab39fd684396568d3f471d0d209bcd328fd02492fd236f23b8eabd387aab.pdf',
  'ready',42214278,'ac3cab39fd684396568d3f471d0d209bcd328fd02492fd236f23b8eabd387aab',
  'original','published','fis1-compendium-no-solutions',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='FIS1' AND active=1;

-- Teaching schedule: no student roster or private student information.
INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,resource_category,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-ar-schedule-2026-09-30',id,'other','information',
  'Anatomia Radiológica — Horários, salas e temas · 2026/2027',
  '2.º ano, 1.º semestre. Calendário das aulas por turma, com horários, anfiteatros, temas e docentes. Documento atualizado em 30/09/2026; alguns locais e datas de exame ainda por definir.',
  'Anatomia_Radiologica_Horarios_2026-2027_30-09-2026.pdf','application/pdf','r2',
  'materials/anatomia-radiologica/information/2a1b4d0d91150de7ef48d9beb67307dd017c982e6260bfa90ef09f81a91de9a8.pdf',
  'ready',70783,'2a1b4d0d91150de7ef48d9beb67307dd017c982e6260bfa90ef09f81a91de9a8',
  'original','published','ar-schedule-2026-27',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='AR' AND active=1;
