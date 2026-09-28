-- Corrige a Figura 6.3 da tradução AP3 sem alterar o objeto R2 original.
-- Aplicar após confirmar o novo objeto privado por tamanho e SHA-256.
UPDATE material_catalog
SET file_name = 'AP3_Lippincott_Bibliografia_Traduzida_2026-09-28.pdf',
    storage_key = 'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP3_Lippincott_Bibliografia_Traduzida_2026-09-28.pdf',
    byte_size = 5405742,
    checksum_sha256 = '80123866a8ccd129d700194fe0e58925c58fd90e4a74293554b738778539073c',
    version_number = 2,
    updated_at = unixepoch() * 1000
WHERE id = 'material-biblio-2627-ap03-lippincott2-translation'
  AND checksum_sha256 = '9a52db0e543ee810bc942d1c7db609bfa316a318ed7996921395196a79e70a20'
  AND version_number = 1;
