-- The single commission response becomes the first comment of the request thread.
-- The original column is kept untouched; this only copies it, once.
INSERT INTO course_request_comments (id, request_id, user_id, body, created_at)
SELECT lower(hex(randomblob(16))), r.id, r.responded_by, r.response, COALESCE(r.responded_at, r.updated_at, r.created_at)
FROM course_requests r
WHERE r.response IS NOT NULL
  AND trim(r.response) <> ''
  AND r.responded_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.responded_by)
  AND NOT EXISTS (
    SELECT 1 FROM course_request_comments c
    WHERE c.request_id = r.id AND c.user_id = r.responded_by AND c.body = r.response
  );
