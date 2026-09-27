-- Substitui o PDF Lippincott AP1 corrigido sem alterar o objeto original do R2.
-- Aplicar apenas depois de confirmar tamanho e SHA-256 do novo objeto privado.
UPDATE material_catalog
SET storage_key = 'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP1_Lippincott_Bibliografia_Traduzida_2026-09-24_v2.pdf',
    byte_size = 1622983,
    checksum_sha256 = '12892f1b79c24ea062738c23dd27616fee63dc3edc2002892ceab9782c516e4c',
    version_number = 2,
    updated_at = unixepoch() * 1000
WHERE id = 'material-biblio-2627-ap1-lippincott-translation'
  AND checksum_sha256 = 'a730318a40f2563b89d16fd2a272be0e4756e101400cff1c492bee9d45936147'
  AND version_number = 1;
