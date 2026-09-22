-- Resolução dos bloqueios de direitos dos materiais de Neuroanatomia.
--
-- Os APKG binários com imagens/recortes de obras protegidas deixam de ser
-- candidatos a publicação. Um novo pacote só poderá ser disponibilizado
-- depois de preparado, moderado e autorizado, sem reutilizar estes binários.
--
-- Os excertos bibliográficos deixam de representar ficheiros distribuíveis:
-- conservam-se apenas a referência e os intervalos de páginas. O ZIP agregado
-- é arquivado.

UPDATE material_anki_decks
SET publication_status = 'archived',
    description = 'Pacote binário original arquivado por conter media/recortes sem autorização de distribuição. Um novo pacote exigirá preparação e autorização antes de ser disponibilizado.',
    updated_at = unixepoch() * 1000
WHERE id IN ('anki-neuro-essential', 'anki-neuro-complete');

UPDATE material_catalog
SET description = 'Referência bibliográfica e intervalo de páginas. O Gestor Universitário não distribui o excerto; consulte a obra por uma via licenciada.',
    file_name = NULL,
    mime_type = NULL,
    storage_backend = 'inline',
    storage_key = NULL,
    external_url = NULL,
    storage_state = 'ready',
    byte_size = NULL,
    checksum_sha256 = NULL,
    verification_status = 'verified',
    publication_status = 'published',
    updated_at = unixepoch() * 1000
WHERE material_kind = 'bibliography'
  AND id LIKE 'material-biblio-%';

UPDATE material_catalog
SET publication_status = 'archived',
    description = 'Pacote agregado arquivado: continha excertos bibliográficos sem autorização de distribuição. As referências e intervalos de páginas permanecem disponíveis separadamente, sem ficheiros.',
    updated_at = unixepoch() * 1000
WHERE id = 'material-bibliography-neuro-package';
