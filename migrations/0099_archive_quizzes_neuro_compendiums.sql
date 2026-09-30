-- Archive the interactive module without deleting questions, attempts or progress.
UPDATE app_module_settings SET enabled=0,updated_at=unixepoch()*1000
WHERE module_key IN ('quizzes','quizzes.practice','quizzes.progress','quizzes.learning','quizzes.management');

-- Preserve the existing submission types and add an explicit compendium subtype.
ALTER TABLE material_submissions ADD COLUMN other_format TEXT
  CHECK (other_format IS NULL OR (material_type='other' AND other_format='compendium'));

-- PDFs reviewed from the user's Drive. Objects are uploaded and checksum-verified
-- before applying this migration remotely. Original answers are not medically revalidated.
INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,other_format,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-neuro-compendium-solutions',id,'other','compendium',
  'Neuroanatomia — Compêndio com soluções',
  '665 perguntas em 395 páginas, com as soluções e comentários do documento original. Compilação de estudo; respostas não revalidadas editorialmente.',
  'Neuroanatomia_Compendio_com_solucoes.pdf','application/pdf','r2',
  'materials/neuroanatomia/compendios/961e8bf5bc8ddb011bee9d26ddb618f9d589301d5d8964e34f978c948b50b470.pdf',
  'ready',3825495,'961e8bf5bc8ddb011bee9d26ddb618f9d589301d5d8964e34f978c948b50b470',
  'original','published','neuro-compendium-solutions',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='NEURO' AND active=1;

INSERT OR IGNORE INTO material_catalog
  (id,curricular_unit_id,material_kind,other_format,title,description,file_name,mime_type,
   storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,
   publication_status,version_group,version_number,is_recommended,public_access,created_at,updated_at)
SELECT 'material-neuro-compendium-no-solutions',id,'other','compendium',
  'Neuroanatomia — Compêndio sem soluções',
  'Caderno de treino com as mesmas 665 perguntas, em 319 páginas, sem soluções. Documento original da compilação de Neuroanatomia.',
  'Neuroanatomia_Compendio_sem_solucoes.pdf','application/pdf','r2',
  'materials/neuroanatomia/compendios/c2288949944d9548c93302bd08a05ed9c581596b6c6c49c7b3cd9a07b666c192.pdf',
  'ready',733095,'c2288949944d9548c93302bd08a05ed9c581596b6c6c49c7b3cd9a07b666c192',
  'original','published','neuro-compendium-no-solutions',1,0,0,unixepoch()*1000,unixepoch()*1000
FROM curricular_units WHERE code='NEURO' AND active=1;
