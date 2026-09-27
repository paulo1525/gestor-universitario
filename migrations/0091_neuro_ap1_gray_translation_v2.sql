-- Substitui o PDF Gray AP1 corrigido sem alterar o objeto original do R2.
-- Aplicar apenas depois de confirmar tamanho e SHA-256 do novo objeto privado.
UPDATE material_catalog
SET storage_key = 'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP1_Gray_Bibliografia_Traduzida_2026-09-24_v2.pdf',
    byte_size = 2179340,
    checksum_sha256 = '1d073ede123d7d689cb960a347ef098144559fbdf999b90046e50fe89f18a5bf',
    version_number = 2,
    updated_at = unixepoch() * 1000
WHERE id = 'material-biblio-2627-ap1-gray-translation'
  AND checksum_sha256 = '03fbf2557078035ae4a7aa2152e3c6f959192556dbdc88437f033b87024b75e4'
  AND version_number = 1;
