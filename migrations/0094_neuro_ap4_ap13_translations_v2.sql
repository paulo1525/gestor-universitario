-- Publica as versões finais de AP4 Gray/Nolte e AP13 Gray com novos objetos R2.
-- Os objetos anteriores ficam intactos; confirmar tamanho e SHA-256 antes de aplicar.
UPDATE material_catalog
SET storage_key = 'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP4_Gray_Bibliografia_Traduzida_2026-09-26_v2.pdf',
    byte_size = 2620480,
    checksum_sha256 = '18bb3be7e3f06beb4e918752c527b14e57d3860bae80943f2262d668aa67608d',
    version_number = 2,
    updated_at = unixepoch() * 1000
WHERE id = 'material-biblio-2627-ap4-gray42-translation'
  AND checksum_sha256 = '6815255f96ca8e9d84429b2a812329f2623612bef38e344f7f7049770fdec2c5'
  AND version_number = 1;

UPDATE material_catalog
SET storage_key = 'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP4_Nolte_Bibliografia_Traduzida_2026-09-26_v2.pdf',
    byte_size = 6636493,
    checksum_sha256 = '790282d3aae178fc99dc8fa0b1d623f8e2511c67e7fac0be5b3eb835dbadbbf7',
    description = 'Bibliografia traduzida para AP4 — nervos trigémio e facial. 31 páginas.',
    page_note = 'The Human Brain, 6.ª edição: pp. 295–298 e 306–316 na tradução. Bibliografia aconselhada no sumário AP4.',
    version_number = 2,
    updated_at = unixepoch() * 1000
WHERE id = 'material-biblio-2627-ap4-nolte6-translation'
  AND checksum_sha256 = 'e1173ee387cfc6a00dae76b5abe70882c315e01bda9a1bc13db8efd64b151d13'
  AND version_number = 1;

UPDATE material_catalog
SET storage_key = 'materials/neuroanatomia/bibliografia/traducoes/2026-27/AP13_Gray_Bibliografia_Traduzida_2026-09-26_v2.pdf',
    byte_size = 4784882,
    checksum_sha256 = 'df2dc83b1f9f03bf3eae4294494b6e3f0c9fb1a241f083f87a6fabe0a3dd3ff2',
    description = 'Bibliografia traduzida para AP13 — divisão autónoma do sistema nervoso periférico. 29 páginas.',
    version_number = 2,
    updated_at = unixepoch() * 1000
WHERE id = 'material-biblio-2627-ap13-gray42-translation'
  AND checksum_sha256 = '0c007efd71bd79e2738de9303cd7ff8ec6e909ff5121aff41a66ba680451b8de'
  AND version_number = 1;
