-- Catálogo estruturado de Materiais: sumários, bibliografia, Anki, exames e
-- restantes recursos. Os ficheiros grandes ficam num object storage (R2 ou
-- backend compatível); esta migration guarda apenas metadados e proveniência.

INSERT OR IGNORE INTO app_module_settings (module_key, enabled, updated_at) VALUES
  ('materials.catalog', 1, unixepoch() * 1000),
  ('materials.summaries', 1, unixepoch() * 1000),
  ('materials.bibliography', 1, unixepoch() * 1000),
  ('materials.anki', 1, unixepoch() * 1000);

CREATE TABLE IF NOT EXISTS material_lessons (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  lesson_type TEXT NOT NULL DEFAULT 'theory' CHECK (lesson_type IN ('theory', 'practical', 'other')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (curricular_unit_id, code)
);
CREATE INDEX IF NOT EXISTS idx_material_lessons_unit_order
  ON material_lessons(curricular_unit_id, sort_order, code);

CREATE TABLE IF NOT EXISTS material_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  edition TEXT,
  citation TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_sources_identity
  ON material_sources(title, COALESCE(edition, ''));

CREATE TABLE IF NOT EXISTS material_catalog (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT REFERENCES curricular_units(id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES material_lessons(id) ON DELETE SET NULL,
  material_kind TEXT NOT NULL CHECK (material_kind IN ('summary', 'bibliography', 'anki', 'exam', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  mime_type TEXT,
  storage_backend TEXT NOT NULL DEFAULT 'r2' CHECK (storage_backend IN ('r2', 'external', 'inline', 'pending')),
  storage_key TEXT,
  external_url TEXT,
  storage_state TEXT NOT NULL DEFAULT 'pending' CHECK (storage_state IN ('pending', 'ready', 'failed')),
  byte_size INTEGER,
  checksum_sha256 TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('original', 'verified', 'pending')),
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'archived')),
  source_id TEXT REFERENCES material_sources(id) ON DELETE SET NULL,
  printed_page_start TEXT,
  printed_page_end TEXT,
  physical_page_start TEXT,
  physical_page_end TEXT,
  page_note TEXT,
  version_group TEXT,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  is_recommended INTEGER NOT NULL DEFAULT 0 CHECK (is_recommended IN (0, 1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_material_catalog_listing
  ON material_catalog(publication_status, material_kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_catalog_unit_kind
  ON material_catalog(curricular_unit_id, material_kind, publication_status);
CREATE INDEX IF NOT EXISTS idx_material_catalog_lesson
  ON material_catalog(lesson_id, material_kind, publication_status);
CREATE INDEX IF NOT EXISTS idx_material_catalog_storage
  ON material_catalog(storage_backend, storage_state, storage_key);

-- Uma referência bibliográfica pode ser recomendada para várias aulas sem
-- duplicar o ficheiro nem perder o mapeamento de páginas.
CREATE TABLE IF NOT EXISTS material_catalog_lessons (
  material_id TEXT NOT NULL REFERENCES material_catalog(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES material_lessons(id) ON DELETE CASCADE,
  relevance TEXT NOT NULL DEFAULT 'primary' CHECK (relevance IN ('primary', 'complementary')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (material_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_material_catalog_lessons_lesson
  ON material_catalog_lessons(lesson_id, sort_order, material_id);

CREATE TABLE IF NOT EXISTS material_anki_decks (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('essential', 'complete', 'custom')),
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  mime_type TEXT NOT NULL DEFAULT 'application/apkg',
  storage_backend TEXT NOT NULL DEFAULT 'r2' CHECK (storage_backend IN ('r2', 'external', 'inline', 'pending')),
  storage_key TEXT,
  storage_state TEXT NOT NULL DEFAULT 'pending' CHECK (storage_state IN ('pending', 'ready', 'failed')),
  byte_size INTEGER,
  checksum_sha256 TEXT,
  card_count INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  source_file_name TEXT,
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'archived')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (curricular_unit_id, variant, title)
);
CREATE INDEX IF NOT EXISTS idx_material_anki_decks_listing
  ON material_anki_decks(publication_status, curricular_unit_id, variant);

CREATE TABLE IF NOT EXISTS material_anki_deck_lessons (
  deck_id TEXT NOT NULL REFERENCES material_anki_decks(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES material_lessons(id) ON DELETE CASCADE,
  card_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deck_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS material_anki_facets (
  deck_id TEXT NOT NULL REFERENCES material_anki_decks(id) ON DELETE CASCADE,
  lesson_code TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('multiple_choice', 'short_answer', 'image')),
  card_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deck_id, lesson_code, subtopic, card_type)
);
CREATE INDEX IF NOT EXISTS idx_material_anki_facets_filter
  ON material_anki_facets(deck_id, lesson_code, card_type, subtopic);

-- Aulas da Neuroanatomia cobertas pelos anexos enviados. A UC é resolvida por
-- código para a migration continuar a funcionar se o identificador interno
-- da UC tiver sido preservado ou criado anteriormente.
INSERT OR IGNORE INTO material_lessons (id, curricular_unit_id, code, title, lesson_type, sort_order, created_at, updated_at)
SELECT 'lesson-neuro-at1', id, 'AT1', 'Neurocrânio e ossificação', 'theory', 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-at2', id, 'AT2', 'Ontogenia, neurónio e sinapse', 'theory', 2, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-at3', id, 'AT3', 'Medula espinhal e meninges raquidianas', 'theory', 3, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-at4', id, 'AT4', 'Tronco cerebral: bolbo e ponte', 'theory', 4, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-at5', id, 'AT5', 'Mesencéfalo e formação reticular', 'theory', 5, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-ap1', id, 'AP1', 'Introdução ao estudo prático e neurocrânio', 'practical', 6, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-ap2', id, 'AP2', 'Medula espinhal e meninges', 'practical', 7, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;
INSERT OR IGNORE INTO material_lessons SELECT 'lesson-neuro-ap3', id, 'AP3', 'Tronco cerebral', 'practical', 8, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units WHERE code = 'NEURO' AND active = 1;

INSERT OR IGNORE INTO material_sources (id, title, author, edition, citation, created_at, updated_at) VALUES
  ('source-gray-41', 'Gray’s Anatomy', 'Susan Standring (ed.)', '41.ª edição', 'Gray’s Anatomy, 41st edition', unixepoch() * 1000, unixepoch() * 1000),
  ('source-gray-42', 'Gray’s Anatomy', 'Susan Standring (ed.)', '42.ª edição', 'Gray’s Anatomy, 42nd edition', unixepoch() * 1000, unixepoch() * 1000),
  ('source-nolte-7', 'The Human Brain', 'John Nolte', '7.ª edição', 'The Human Brain, 7th edition', unixepoch() * 1000, unixepoch() * 1000),
  ('source-lippincott-2', 'Lippincott Illustrated Reviews: Neuroscience', 'Claudia Krebs et al.', '2.ª edição (2019)', 'Lippincott Illustrated Reviews: Neuroscience, 2nd edition', unixepoch() * 1000, unixepoch() * 1000),
  ('source-yokochi-7', 'Yokochi’s Atlas of Anatomy', NULL, '7.ª edição', 'Yokochi, atlas de anatomia', unixepoch() * 1000, unixepoch() * 1000);

-- Sumários originais: cada cópia permanece uma entidade própria e não é
-- substituída pela versão verificada.
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at)
SELECT 'material-summary-original-at1', cu.id, 'lesson-neuro-at1', 'summary', 'AT1 — Neurocrânio. Ossificação — original', 'Cópia exata do sumário fornecido.', 'AT1_-_Neurocranio._Ossificacao_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AT1_-_Neurocranio._Ossificacao_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-at1', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-at2', cu.id, 'lesson-neuro-at2', 'summary', 'AT2 — Ontogenia do sistema nervoso central. Neurónio e sinapse — original', 'Cópia exata do sumário fornecido.', 'AT2_-_Ontogenia_do_SNC._Neuronio_e_sinapse_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AT2_-_Ontogenia_do_SNC._Neuronio_e_sinapse_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-at2', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-at3', cu.id, 'lesson-neuro-at3', 'summary', 'AT3 — Medula espinhal. Meninges raquidianas — original', 'Cópia exata do sumário fornecido.', 'AT3_-_Medula_espinhal._Meninges_raquidianas_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AT3_-_Medula_espinhal._Meninges_raquidianas_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-at3', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-at4', cu.id, 'lesson-neuro-at4', 'summary', 'AT4 — Tronco cerebral. Bolbo e protuberância — original', 'Cópia exata do sumário fornecido.', 'AT4_-_Tronco_cerebral._Bolbo_e_protuberancia_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AT4_-_Tronco_cerebral._Bolbo_e_protuberancia_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-at4', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-at5', cu.id, 'lesson-neuro-at5', 'summary', 'AT5 — Mesencéfalo e formação reticular — original', 'Cópia exata do sumário fornecido.', 'AT5_-_Mesencefalo_e_formacao_reticular_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AT5_-_Mesencefalo_e_formacao_reticular_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-at5', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-ap1', cu.id, 'lesson-neuro-ap1', 'summary', 'AP1 — Introdução ao estudo prático. Neurocrânio — original', 'Cópia exata do sumário fornecido.', 'AP1_-_Introducao_ao_estudo_pratico._Neurocranio_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AP1_-_Introducao_ao_estudo_pratico._Neurocranio_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-ap1', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-ap2', cu.id, 'lesson-neuro-ap2', 'summary', 'AP2 — Medula espinhal e suas meninges — original', 'Cópia exata do sumário fornecido.', 'AP2_-_Medula_espinhal_e_suas_meninges_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AP2_-_Medula_espinhal_e_suas_meninges_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-ap2', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-original-ap3', cu.id, 'lesson-neuro-ap3', 'summary', 'AP3 — Bolbo, protuberância e mesencéfalo — original', 'Cópia exata do sumário fornecido.', 'AP3_-_Bolbo,_protuberancia_e_mesencefalo_-_ORIGINAL.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/AP3_-_Bolbo,_protuberancia_e_mesencefalo_-_ORIGINAL.pdf', 'pending', 'original', 'published', 'summary-ap3', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at)
SELECT 'material-summary-original-plan', cu.id, 'summary', 'Plano curricular provisório — original', 'Plano curricular provisório incluído no pacote de sumários.', 'Plano_curricular_provisorio.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/originais/Plano_curricular_provisorio.pdf', 'pending', 'original', 'published', 'summary-plan', 1, 0, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;

INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-verified-at1-pdf', cu.id, 'lesson-neuro-at1', 'summary', 'AT1 — Neurocrânio. Ossificação — verificado', 'Versão verificada. As alterações estão documentadas no pacote editorial.', 'AT1_-_Neurocranio._Ossificacao_-_VERIFICADO.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/verificados/AT1_-_Neurocranio._Ossificacao_-_VERIFICADO.pdf', 'pending', 'verified', 'published', 'summary-at1', 2, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-verified-at1-text', cu.id, 'lesson-neuro-at1', 'summary', 'AT1 — Neurocrânio. Ossificação — texto verificado', 'Versão textual verificada para pesquisa e acessibilidade.', 'AT1_-_Neurocranio._Ossificacao_-_TEXTO_VERIFICADO.txt', 'text/plain', 'r2', 'materials/neuroanatomia/sumarios/verificados/AT1_-_Neurocranio._Ossificacao_-_TEXTO_VERIFICADO.txt', 'pending', 'verified', 'published', 'summary-at1', 2, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-verified-at3-pdf', cu.id, 'lesson-neuro-at3', 'summary', 'AT3 — Medula espinhal. Meninges raquidianas — verificado', 'Versão verificada com uniformização topográfica documentada.', 'AT3_-_Medula_espinhal._Meninges_raquidianas_-_VERIFICADO.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/sumarios/verificados/AT3_-_Medula_espinhal._Meninges_raquidianas_-_VERIFICADO.pdf', 'pending', 'verified', 'published', 'summary-at3', 2, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, lesson_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-summary-verified-at3-text', cu.id, 'lesson-neuro-at3', 'summary', 'AT3 — Medula espinhal. Meninges raquidianas — texto verificado', 'Versão textual verificada para pesquisa e acessibilidade.', 'AT3_-_Medula_espinhal._Meninges_raquidianas_-_TEXTO_VERIFICADO.txt', 'text/plain', 'r2', 'materials/neuroanatomia/sumarios/verificados/AT3_-_Medula_espinhal._Meninges_raquidianas_-_TEXTO_VERIFICADO.txt', 'pending', 'verified', 'published', 'summary-at3', 2, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;

-- Fontes e excertos da bibliografia recortada. As relações com aulas são
-- preenchidas abaixo; recursos comuns a AT4/AT5/AP3 são armazenados uma vez.
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at)
SELECT 'material-biblio-gray41-227-236', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 227–236', 'Excerto recomendado para AT2.', 'Gray41_p227-236.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p227-236.pdf', 'pending', 'verified', 'published', 'source-gray-41', '227', '236', '333', '342', NULL, 'biblio-gray41-227-236', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-416-428', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 416–428', 'Excerto recomendado para AT1.', 'Gray41_p416-428.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p416-428.pdf', 'pending', 'verified', 'published', 'source-gray-41', '416', '428', '586', '599', NULL, 'biblio-gray41-416-428', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-477-480', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 477–480', 'Excerto recomendado para AP1: parietal e frontal.', 'Gray41_p477-480_parietal_frontal.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p477-480_parietal_frontal.pdf', 'pending', 'verified', 'published', 'source-gray-41', '477', '480', '654', '657', NULL, 'biblio-gray41-477-480', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-534-537', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 534–537', 'Excerto recomendado para AP1: esfenóide.', 'Gray41_p534-537_esfenoide.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p534-537_esfenoide.pdf', 'pending', 'verified', 'published', 'source-gray-41', '534', '537', '722', '726', NULL, 'biblio-gray41-534-537', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-620-623', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 620–623', 'Excerto recomendado para AT1.', 'Gray41_p620-623.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p620-623.pdf', 'pending', 'verified', 'published', 'source-gray-41', '620', '623', '849', '853', NULL, 'biblio-gray41-620-623', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-624-627', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 624–627', 'Excerto recomendado para AP1: temporal.', 'Gray41_p624-627_temporal.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p624-627_temporal.pdf', 'pending', 'verified', 'published', 'source-gray-41', '624', '627', '854', '857', NULL, 'biblio-gray41-624-627', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-711-714', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 711–714', 'Excerto recomendado para AP1: occipital.', 'Gray41_p711-714_occipital.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p711-714_occipital.pdf', 'pending', 'verified', 'published', 'source-gray-41', '711', '714', '964', '967', NULL, 'biblio-gray41-711-714', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray41-762-768', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 762–768', 'Complemento recomendado para AT3/AP2.', 'Gray41_p762-768_complemento.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray41_p762-768_complemento.pdf', 'pending', 'verified', 'published', 'source-gray-41', '762', '768', '1030', '1037', 'Complemento', 'biblio-gray41-762-768', 1, 0, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-gray42-442-464', cu.id, 'bibliography', 'Gray’s Anatomy — pp. 442–464 (incl. páginas eletrónicas)', 'Excerto recomendado para AT4, AT5 e AP3.', 'Gray42_p442-464.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Gray42_p442-464.pdf', 'pending', 'verified', 'published', 'source-gray-42', '442', '464', '134', '173', 'Inclui páginas eletrónicas', 'biblio-gray42-442-464', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-lippincott-1-19', cu.id, 'bibliography', 'Lippincott Neuroscience — pp. 1–19', 'Excerto recomendado para AT2.', 'Lippincott2_p1-19.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Lippincott2_p1-19.pdf', 'pending', 'verified', 'published', 'source-lippincott-2', '1', '19', '11', '29', NULL, 'biblio-lippincott-1-19', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-lippincott-24-29', cu.id, 'bibliography', 'Lippincott Neuroscience — pp. 24–29', 'Excerto recomendado para AT2.', 'Lippincott2_p24-29.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Lippincott2_p24-29.pdf', 'pending', 'verified', 'published', 'source-lippincott-2', '24', '29', '34', '39', NULL, 'biblio-lippincott-24-29', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-lippincott-79-101', cu.id, 'bibliography', 'Lippincott Neuroscience — pp. 79–101', 'Excerto recomendado para AT3 e AP2.', 'Lippincott2_p79-101.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Lippincott2_p79-101.pdf', 'pending', 'verified', 'published', 'source-lippincott-2', '79', '101', '89', '111', NULL, 'biblio-lippincott-79-101', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-lippincott-102-109', cu.id, 'bibliography', 'Lippincott Neuroscience — pp. 102–109', 'Excerto recomendado para AT4, AT5 e AP3.', 'Lippincott2_p102-109.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Lippincott2_p102-109.pdf', 'pending', 'verified', 'published', 'source-lippincott-2', '102', '109', '112', '119', NULL, 'biblio-lippincott-102-109', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-lippincott-123-124', cu.id, 'bibliography', 'Lippincott Neuroscience — pp. 123–124', 'Complemento de vascularização para AT4, AT5 e AP3.', 'Lippincott2_p123-124_vascularizacao.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Lippincott2_p123-124_vascularizacao.pdf', 'pending', 'verified', 'published', 'source-lippincott-2', '123', '124', '133', '134', 'Vascularização', 'biblio-lippincott-123-124', 1, 0, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-lippincott-130-135', cu.id, 'bibliography', 'Lippincott Neuroscience — pp. 130–135', 'Excerto recomendado para AT4, AT5 e AP3.', 'Lippincott2_p130-135.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Lippincott2_p130-135.pdf', 'pending', 'verified', 'published', 'source-lippincott-2', '130', '135', '140', '145', NULL, 'biblio-lippincott-130-135', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-nolte-1-38', cu.id, 'bibliography', 'Nolte — pp. 1–38', 'Excerto recomendado para AT2.', 'Nolte7_p1-38.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Nolte7_p1-38.pdf', 'pending', 'verified', 'published', 'source-nolte-7', '1', '38', '7', '44', NULL, 'biblio-nolte-1-38', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-nolte-61', cu.id, 'bibliography', 'Nolte — p. 61', 'Excerto recomendado para AT2.', 'Nolte7_p61.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Nolte7_p61.pdf', 'pending', 'verified', 'published', 'source-nolte-7', '61', '61', '67', '67', NULL, 'biblio-nolte-61', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-nolte-233-244', cu.id, 'bibliography', 'Nolte — pp. 233–244', 'Excerto recomendado para AT3 e AP2.', 'Nolte7_p233-244.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Nolte7_p233-244.pdf', 'pending', 'verified', 'published', 'source-nolte-7', '233', '244', '20', '31', NULL, 'biblio-nolte-233-244', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, verification_status, publication_status, source_id, printed_page_start, printed_page_end, physical_page_start, physical_page_end, page_note, version_group, version_number, is_recommended, created_at, updated_at) SELECT 'material-biblio-nolte-272-295', cu.id, 'bibliography', 'Nolte — pp. 272–295', 'Excerto recomendado para AT4, AT5 e AP3.', 'Nolte7_p272-295.pdf', 'application/pdf', 'r2', 'materials/neuroanatomia/bibliografia/Nolte7_p272-295.pdf', 'pending', 'verified', 'published', 'source-nolte-7', '272', '295', '59', '82', NULL, 'biblio-nolte-272-295', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;

-- Associações das referências partilhadas e dos excertos complementares.
INSERT OR IGNORE INTO material_catalog_lessons (material_id, lesson_id, relevance, sort_order) VALUES
  ('material-biblio-gray41-227-236', 'lesson-neuro-at2', 'primary', 1),
  ('material-biblio-gray41-416-428', 'lesson-neuro-at1', 'primary', 1),
  ('material-biblio-gray41-477-480', 'lesson-neuro-ap1', 'primary', 1),
  ('material-biblio-gray41-534-537', 'lesson-neuro-ap1', 'primary', 2),
  ('material-biblio-gray41-620-623', 'lesson-neuro-at1', 'primary', 2),
  ('material-biblio-gray41-624-627', 'lesson-neuro-ap1', 'primary', 3),
  ('material-biblio-gray41-711-714', 'lesson-neuro-ap1', 'primary', 4),
  ('material-biblio-gray41-762-768', 'lesson-neuro-at3', 'complementary', 3),
  ('material-biblio-gray41-762-768', 'lesson-neuro-ap2', 'complementary', 3),
  ('material-biblio-gray42-442-464', 'lesson-neuro-at4', 'primary', 1),
  ('material-biblio-gray42-442-464', 'lesson-neuro-at5', 'primary', 1),
  ('material-biblio-gray42-442-464', 'lesson-neuro-ap3', 'primary', 1),
  ('material-biblio-lippincott-1-19', 'lesson-neuro-at2', 'primary', 2),
  ('material-biblio-lippincott-24-29', 'lesson-neuro-at2', 'primary', 3),
  ('material-biblio-lippincott-79-101', 'lesson-neuro-at3', 'primary', 1),
  ('material-biblio-lippincott-79-101', 'lesson-neuro-ap2', 'primary', 1),
  ('material-biblio-lippincott-102-109', 'lesson-neuro-at4', 'primary', 2),
  ('material-biblio-lippincott-102-109', 'lesson-neuro-at5', 'primary', 2),
  ('material-biblio-lippincott-102-109', 'lesson-neuro-ap3', 'primary', 2),
  ('material-biblio-lippincott-123-124', 'lesson-neuro-at4', 'complementary', 4),
  ('material-biblio-lippincott-123-124', 'lesson-neuro-at5', 'complementary', 4),
  ('material-biblio-lippincott-123-124', 'lesson-neuro-ap3', 'complementary', 4),
  ('material-biblio-lippincott-130-135', 'lesson-neuro-at4', 'primary', 5),
  ('material-biblio-lippincott-130-135', 'lesson-neuro-at5', 'primary', 5),
  ('material-biblio-lippincott-130-135', 'lesson-neuro-ap3', 'primary', 5),
  ('material-biblio-nolte-1-38', 'lesson-neuro-at2', 'primary', 4),
  ('material-biblio-nolte-61', 'lesson-neuro-at2', 'primary', 5),
  ('material-biblio-nolte-233-244', 'lesson-neuro-at3', 'primary', 2),
  ('material-biblio-nolte-233-244', 'lesson-neuro-ap2', 'primary', 2),
  ('material-biblio-nolte-272-295', 'lesson-neuro-at4', 'primary', 6),
  ('material-biblio-nolte-272-295', 'lesson-neuro-at5', 'primary', 6),
  ('material-biblio-nolte-272-295', 'lesson-neuro-ap3', 'primary', 6);

-- Pacotes APKG originais. Os checksums e tamanhos permitem validar uma cópia
-- posterior, mas os cartões de imagem permanecem em draft até revisão de
-- direitos (incluem referências a Yokochi e recortes de páginas).
INSERT OR IGNORE INTO material_anki_decks (id, curricular_unit_id, title, variant, description, file_name, mime_type, storage_backend, storage_key, storage_state, byte_size, checksum_sha256, card_count, media_count, source_file_name, publication_status, created_at, updated_at)
SELECT 'anki-neuro-essential', cu.id, 'Neuroanatomia — Essencial', 'essential', 'AT1–AT5 e AP1–AP3, com resposta curta e cartões práticos de imagem.', 'Neuroanatomia_AT1_AT5_AP1_AP3_PACK_ESSENCIAL_FINAL.apkg', 'application/apkg', 'r2', 'materials/neuroanatomia/anki/Neuroanatomia_AT1_AT5_AP1_AP3_PACK_ESSENCIAL_FINAL.apkg', 'pending', 16473756, 'da717fcfdd2c34c3c6e8c7dd0d48dccf116ff8adb212453a80238af09477ff88', 1099, 29, 'Neuroanatomia_AT1_AT5_AP1_AP3_PACK_ESSENCIAL_FINAL.apkg', 'published', unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_anki_decks (id, curricular_unit_id, title, variant, description, file_name, mime_type, storage_backend, storage_key, storage_state, byte_size, checksum_sha256, card_count, media_count, source_file_name, publication_status, created_at, updated_at)
SELECT 'anki-neuro-complete', cu.id, 'Neuroanatomia — Completo', 'complete', 'AT1–AT5 e AP1–AP3, com cobertura completa, resposta curta e cartões práticos de imagem.', 'Neuroanatomia_AT1_AT5_AP1_AP3_PACK_COMPLETO_FINAL.apkg', 'application/apkg', 'r2', 'materials/neuroanatomia/anki/Neuroanatomia_AT1_AT5_AP1_AP3_PACK_COMPLETO_FINAL.apkg', 'pending', 16543230, 'a59c4addb772d08f97d828de8e0ffa2291ce327aa25887a6154cdb488e07756f', 1620, 29, 'Neuroanatomia_AT1_AT5_AP1_AP3_PACK_COMPLETO_FINAL.apkg', 'published', unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;
INSERT OR IGNORE INTO material_anki_deck_lessons (deck_id, lesson_id, card_count) VALUES
  ('anki-neuro-essential', 'lesson-neuro-at1', 131), ('anki-neuro-essential', 'lesson-neuro-at2', 85), ('anki-neuro-essential', 'lesson-neuro-at3', 90), ('anki-neuro-essential', 'lesson-neuro-at4', 85), ('anki-neuro-essential', 'lesson-neuro-at5', 97), ('anki-neuro-essential', 'lesson-neuro-ap1', 257), ('anki-neuro-essential', 'lesson-neuro-ap2', 96), ('anki-neuro-essential', 'lesson-neuro-ap3', 104),
  ('anki-neuro-complete', 'lesson-neuro-at1', 208), ('anki-neuro-complete', 'lesson-neuro-at2', 176), ('anki-neuro-complete', 'lesson-neuro-at3', 103), ('anki-neuro-complete', 'lesson-neuro-at4', 85), ('anki-neuro-complete', 'lesson-neuro-at5', 97), ('anki-neuro-complete', 'lesson-neuro-ap1', 257), ('anki-neuro-complete', 'lesson-neuro-ap2', 96), ('anki-neuro-complete', 'lesson-neuro-ap3', 104);

-- O pacote de bibliografia é mantido como recurso de catálogo, com estado de
-- armazenamento pendente e publicação bloqueada até revisão de direitos.
INSERT OR IGNORE INTO material_catalog (id, curricular_unit_id, material_kind, title, description, file_name, mime_type, storage_backend, storage_key, storage_state, byte_size, checksum_sha256, verification_status, publication_status, version_group, version_number, is_recommended, created_at, updated_at)
SELECT 'material-bibliography-neuro-package', cu.id, 'bibliography', 'Bibliografia de Neuroanatomia — pacote completo', 'Sumários originais, versões verificadas, excertos bibliográficos, mapa de páginas e notas de correção.', 'Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip', 'application/zip', 'r2', 'materials/neuroanatomia/bibliografia/Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip', 'pending', 191131120, '06082cc89302320f484e64c04d068a472ae0c8f9f3b796dee663a44ef4a3539f', 'verified', 'published', 'bibliography-neuro-package', 1, 1, unixepoch() * 1000, unixepoch() * 1000 FROM curricular_units cu WHERE cu.code = 'NEURO' AND cu.active = 1;

-- Os excertos de Gray, Lippincott e Nolte, o ZIP de bibliografia e os APKG
-- com imagens de Yokochi/páginas recortadas ficam catalogados, mas em draft.
-- A verificação de checksum/conteúdo não é uma autorização de publicação:
-- estes objetos só podem passar a published depois de uma revisão de direitos.
UPDATE material_catalog
SET publication_status = 'draft', updated_at = unixepoch() * 1000
WHERE id IN (
  'material-biblio-gray41-227-236', 'material-biblio-gray41-416-428',
  'material-biblio-gray41-477-480', 'material-biblio-gray41-534-537',
  'material-biblio-gray41-620-623', 'material-biblio-gray41-624-627',
  'material-biblio-gray41-711-714', 'material-biblio-gray41-762-768',
  'material-biblio-gray42-442-464', 'material-biblio-lippincott-1-19',
  'material-biblio-lippincott-24-29', 'material-biblio-lippincott-79-101',
  'material-biblio-lippincott-102-109', 'material-biblio-lippincott-123-124',
  'material-biblio-lippincott-130-135', 'material-biblio-nolte-1-38',
  'material-biblio-nolte-61', 'material-biblio-nolte-233-244',
  'material-biblio-nolte-272-295', 'material-bibliography-neuro-package'
);
UPDATE material_anki_decks
SET publication_status = 'draft', updated_at = unixepoch() * 1000
WHERE id IN ('anki-neuro-essential', 'anki-neuro-complete');
