-- Record the explicitly requested batch publication and metadata-only renames.
INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'materials_batch_published',
  '{"source":"authorized-publication-2026-09-30","newMaterials":18,"renamedMaterials":78,"existingR2ObjectsReuploaded":0,"quizModulesArchived":true,"migrations":["0099","0100","0101","0102"]}',
  unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
