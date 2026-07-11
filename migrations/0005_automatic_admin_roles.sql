ALTER TABLE users ADD COLUMN admin_override INTEGER NOT NULL DEFAULT 0 CHECK (admin_override IN (0, 1));
ALTER TABLE users ADD COLUMN class_representative INTEGER NOT NULL DEFAULT 0 CHECK (class_representative IN (0, 1));
ALTER TABLE users ADD COLUMN represented_class INTEGER CHECK (represented_class BETWEEN 1 AND 20);
ALTER TABLE users ADD COLUMN font_scale TEXT NOT NULL DEFAULT 'normal' CHECK (font_scale IN ('small', 'normal', 'large'));

UPDATE users
SET admin_override = 1
WHERE role = 'admin'
  AND email <> 'up202507850@up.pt'
  AND COALESCE(commission_department, '') <> 'management';

UPDATE users
SET role = CASE
  WHEN email = 'up202507850@up.pt' THEN 'admin'
  WHEN commission_department = 'management' THEN 'admin'
  WHEN admin_override = 1 AND commission_position IS NOT NULL THEN 'admin'
  WHEN commission_position IS NOT NULL OR class_representative = 1 THEN 'representative'
  ELSE 'student'
END;
