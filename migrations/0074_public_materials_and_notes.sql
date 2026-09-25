-- Public page of the year's materials (/materiais-do-ano) and study notes ("Resumos").
-- public_access = 1: anyone can see the title and download it without a session.
-- public_access = 0 (default): only signed-in users see it; visitors get a redacted placeholder.
ALTER TABLE material_catalog ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0 CHECK (public_access IN (0, 1));
ALTER TABLE material_anki_decks ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0 CHECK (public_access IN (0, 1));

-- Lecture summaries ("Sumários") and study notes ("Resumos") share the 'summary' kind,
-- like bibliography_format splits the bibliography (0065).
ALTER TABLE material_catalog ADD COLUMN summary_format TEXT CHECK (summary_format IS NULL OR summary_format IN ('lecture', 'notes'));
UPDATE material_catalog SET summary_format = 'lecture' WHERE material_kind = 'summary' AND summary_format IS NULL;

CREATE INDEX IF NOT EXISTS idx_material_catalog_public
  ON material_catalog(publication_status, public_access, curricular_unit_id);
