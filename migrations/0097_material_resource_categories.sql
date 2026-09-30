-- Keep existing kinds and formats; teaching resources have dedicated folders.
ALTER TABLE material_catalog ADD COLUMN resource_category TEXT
  CHECK (resource_category IS NULL OR resource_category IN
    ('information','theory','tutorials','practical','support','seminars','assessment'));
CREATE INDEX idx_material_catalog_resource_category
  ON material_catalog(curricular_unit_id, resource_category, publication_status);
