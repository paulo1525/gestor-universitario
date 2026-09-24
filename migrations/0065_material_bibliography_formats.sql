-- A bibliografia de uma UC pode incluir a obra completa, excertos recortados
-- de acordo com os sumários e traduções desses excertos. O formato é
-- guardado explicitamente para a biblioteca os separar sem depender do título.
ALTER TABLE material_catalog ADD COLUMN bibliography_format TEXT
  CHECK (bibliography_format IS NULL OR bibliography_format IN ('complete', 'excerpt', 'translation'));

-- Todas as referências publicadas até agora são excertos com páginas definidas.
UPDATE material_catalog
SET bibliography_format = 'excerpt'
WHERE material_kind = 'bibliography' AND bibliography_format IS NULL;

CREATE INDEX IF NOT EXISTS idx_material_catalog_bibliography_format
  ON material_catalog(curricular_unit_id, material_kind, bibliography_format, publication_status);
