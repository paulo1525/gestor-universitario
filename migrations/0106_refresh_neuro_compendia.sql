-- Replace obsolete Neuroanatomia downloads in place, preserving favourites and links.
-- Both private R2 PDFs are checksum-verified before applying this migration.
UPDATE material_catalog SET
 description='1.164 perguntas teóricas de resposta aberta em 341 páginas, organizadas por AT1–AT21 e AP1–AP14. Edição de 29/09/2026 com soluções, fontes e ressalvas bibliográficas preservadas.',
 storage_key='materials/neuroanatomia/compendios/e2ec0ce3f1cc4e416d8a515606a00fa72b3cb90e4914bf3d57d7bac26c592b87.pdf',
 byte_size=7815724,checksum_sha256='e2ec0ce3f1cc4e416d8a515606a00fa72b3cb90e4914bf3d57d7bac26c592b87',
 storage_state='ready',version_number=2,updated_at=unixepoch()*1000
WHERE id='material-neuro-compendium-solutions';

UPDATE material_catalog SET
 description='Caderno de treino com as mesmas 1.164 perguntas teóricas de resposta aberta em 156 páginas, sem soluções. Edição de 29/09/2026, organizada por AT1–AT21 e AP1–AP14, com fontes identificadas.',
 storage_key='materials/neuroanatomia/compendios/97ed9df7698e0917c4fd7f125aea8971cf4ed2b8e5770b457aa58742cccc4141.pdf',
 byte_size=4619202,checksum_sha256='97ed9df7698e0917c4fd7f125aea8971cf4ed2b8e5770b457aa58742cccc4141',
 storage_state='ready',version_number=2,updated_at=unixepoch()*1000
WHERE id='material-neuro-compendium-no-solutions';

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'materials_compendia_replaced',
 '{"source":"authorized-neuro-refresh-2026-10-01","edition":"2026-09-29","replacedMaterials":2,"questions":1164}',unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
 AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE action='materials_compendia_replaced' AND details LIKE '%authorized-neuro-refresh-2026-10-01%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
