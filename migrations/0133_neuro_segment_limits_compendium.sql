-- Replace only the solutions PDF; stable material IDs preserve links and favourites.
-- Questions and bank corrections are delivered in the encrypted application assets.
UPDATE material_catalog SET
 description='1.164 perguntas teóricas de resposta aberta em 341 páginas, organizadas por AT1–AT21 e AP1–AP14. Revisão de 10/10/2026: limites da intumescência cervical e do núcleo de Clarke conferidos no Gray, Nolte, Blumenfeld e sumários AT3/AP2.',
 storage_key='materials/neuroanatomia/compendios/f9347d7297f01618e1ab2baec30bb53f00a92615b855c4d0ba52e1e953c2d90e.pdf',
 byte_size=7817383,checksum_sha256='f9347d7297f01618e1ab2baec30bb53f00a92615b855c4d0ba52e1e953c2d90e',
 storage_state='ready',version_number=3,updated_at=unixepoch()*1000
WHERE id='material-neuro-compendium-solutions';

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'materials_compendium_segment_limits_corrected',
 '{"source":"authorized-neuro-segment-limits-2026-10-10","questions":["Q0104","Q1048","Q0118","Q1196"],"replacedMaterials":1}',unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
 AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE action='materials_compendium_segment_limits_corrected' AND details LIKE '%authorized-neuro-segment-limits-2026-10-10%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
