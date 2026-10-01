-- Use the OneDrive link explicitly supplied by the user; download=1 requests the file.
-- Keep the deck identity, lesson mappings and card/media metadata unchanged.
UPDATE material_anki_decks SET
 storage_backend='external',
 storage_key='https://1drv.ms/u/c/ed0b5401b9a1a159/IQDIjKZw5p_SSbXYhdGsW3RHATU6a_Enm74KN1p6nVvMdn0?e=Yov0wb&download=1',
 storage_state='ready',updated_at=unixepoch()*1000
WHERE id='anki-neuro-at1-at21-ap1-ap13' AND publication_status='published';

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'materials_anki_download_changed',
 '{"source":"authorized-neuro-onedrive-2026-10-01","deck":"anki-neuro-at1-at21-ap1-ap13","storage":"external"}',unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
AND NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE action='materials_anki_download_changed' AND details LIKE '%authorized-neuro-onedrive-2026-10-01%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
