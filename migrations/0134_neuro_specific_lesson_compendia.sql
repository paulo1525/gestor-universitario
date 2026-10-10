-- Preserve material identities, favourites and access while replacing the two private PDFs.
-- Curricular classification is reviewed; this is not a claim of full scientific validation.
UPDATE material_catalog SET description='1.164 perguntas teóricas de resposta aberta em 370 páginas, organizadas em 23 conjuntos pela aula específica. Edição de 10/10/2026: aula principal e associações identificadas; associações provisórias e ressalvas científicas preservadas.',file_name='Neuroanatomia_FMUP_Compendio_2026-10-10_com_solucoes.pdf',storage_key='materials/neuroanatomia/compendios/17b3ec6d8821bbd8fe443c0b3fb3a9bae993ee34583178851e6525d9dfde0139.pdf',byte_size=7881071,checksum_sha256='17b3ec6d8821bbd8fe443c0b3fb3a9bae993ee34583178851e6525d9dfde0139',storage_state='ready',version_number=4,updated_at=unixepoch()*1000 WHERE id='material-neuro-compendium-solutions';

UPDATE material_catalog SET description='1.164 perguntas teóricas de resposta aberta em 180 páginas, organizadas em 23 conjuntos pela aula específica. Edição de 10/10/2026: aula principal e associações identificadas; associações provisórias e ressalvas científicas preservadas.',file_name='Neuroanatomia_FMUP_Compendio_2026-10-10_sem_solucoes.pdf',storage_key='materials/neuroanatomia/compendios/68b7c86d1f2771042aef4419a348ec5ea9f53d218a5817b6b8017bc173caa4a9.pdf',byte_size=4665064,checksum_sha256='68b7c86d1f2771042aef4419a348ec5ea9f53d218a5817b6b8017bc173caa4a9',storage_state='ready',version_number=3,updated_at=unixepoch()*1000 WHERE id='material-neuro-compendium-no-solutions';

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'materials_neuro_curriculum_reviewed',
 '{"source":"authorized-neuro-specific-lessons-2026-10-10","reviewed":1174,"included":1164,"groups":23,"replacedMaterials":2,"scientificReview":"ongoing"}',unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
 AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE action='materials_neuro_curriculum_reviewed' AND details LIKE '%authorized-neuro-specific-lessons-2026-10-10%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
