-- Publica os materiais de Neuroanatomia depois da confirmação do autor de
-- que possui autorização para redistribuir todos os elementos incluídos.
-- Os objetos são carregados e verificados no R2 antes desta migration remota.

CREATE TABLE _migration_0064_authorized_neuro_artifacts (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL
);

INSERT INTO _migration_0064_authorized_neuro_artifacts VALUES
('material-summary-original-at1','AT1_-_Neurocranio._Ossificacao_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AT1_-_Neurocranio._Ossificacao_-_ORIGINAL.pdf',87365,'02b7ef1a8210f319fcad00314554c3acc12c376cd563cb60d736cf6f32e05404'),
('material-summary-original-at2','AT2_-_Ontogenia_do_SNC._Neuronio_e_sinapse_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AT2_-_Ontogenia_do_SNC._Neuronio_e_sinapse_-_ORIGINAL.pdf',110909,'ac08a32e82b8adb2848af46d3d2fb4975acc11eb59cdf57022639227a3bef286'),
('material-summary-original-at3','AT3_-_Medula_espinhal._Meninges_raquidianas_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AT3_-_Medula_espinhal._Meninges_raquidianas_-_ORIGINAL.pdf',143734,'19e87d5515cb3bf4f6d014e1527efc2c1e2eb5f8c885401528d470d2032737b7'),
('material-summary-original-at4','AT4_-_Tronco_cerebral._Bolbo_e_protuberancia_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AT4_-_Tronco_cerebral._Bolbo_e_protuberancia_-_ORIGINAL.pdf',113002,'2864617e3d08a57a608779cf29a6b6c80deca2645ca6a27496f8d669216001c9'),
('material-summary-original-at5','AT5_-_Mesencefalo_e_formacao_reticular_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AT5_-_Mesencefalo_e_formacao_reticular_-_ORIGINAL.pdf',250899,'9f09afeec56e45218bd7b52604444350569666308ff806205854a252f0a10091'),
('material-summary-original-ap1','AP1_-_Introducao_ao_estudo_pratico._Neurocranio_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AP1_-_Introducao_ao_estudo_pratico._Neurocranio_-_ORIGINAL.pdf',100275,'ddc9f7f906fbc131d7e89acb13124bd5a8159f94d6a9dffa233ca9043d4e8fc1'),
('material-summary-original-ap2','AP2_-_Medula_espinhal_e_suas_meninges_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AP2_-_Medula_espinhal_e_suas_meninges_-_ORIGINAL.pdf',112409,'6151a2e10b8fc95be0a33284ed7e6e10edceb6d7fbd01b5127df23f79654e5ca'),
('material-summary-original-ap3','AP3_-_Bolbo,_protuberancia_e_mesencefalo_-_ORIGINAL.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/AP3_-_Bolbo,_protuberancia_e_mesencefalo_-_ORIGINAL.pdf',182135,'83c41f855672149c3b95d198310921d02b9ef196523a3afe2b6dc13c4f423a51'),
('material-summary-original-plan','Plano_curricular_provisorio.pdf','application/pdf','materials/neuroanatomia/sumarios/originais/Plano_curricular_provisorio.pdf',393254,'c8ae9a4102de3e33ff8b2f406db4808a3927976172ddc389d7f012bbebb70ebd'),
('material-summary-verified-at1-pdf','AT1_-_Neurocranio._Ossificacao_-_VERIFICADO.pdf','application/pdf','materials/neuroanatomia/sumarios/verificados/AT1_-_Neurocranio._Ossificacao_-_VERIFICADO.pdf',51449,'74faaba13781067c16f8139655330b7a984ddb6e032244b1a12a5a280eca6dca'),
('material-summary-verified-at1-text','AT1_-_Neurocranio._Ossificacao_-_TEXTO_VERIFICADO.txt','text/plain','materials/neuroanatomia/sumarios/verificados/AT1_-_Neurocranio._Ossificacao_-_TEXTO_VERIFICADO.txt',7742,'5d07db8836ef64ef295a75fcd11ec79369b725b9aab428740dfcb8861ec6622a'),
('material-summary-verified-at3-pdf','AT3_-_Medula_espinhal._Meninges_raquidianas_-_VERIFICADO.pdf','application/pdf','materials/neuroanatomia/sumarios/verificados/AT3_-_Medula_espinhal._Meninges_raquidianas_-_VERIFICADO.pdf',55983,'2b843342091f2f6bba5452497f482f0141a998a71bc97ea02781fa7331dce61b'),
('material-summary-verified-at3-text','AT3_-_Medula_espinhal._Meninges_raquidianas_-_TEXTO_VERIFICADO.txt','text/plain','materials/neuroanatomia/sumarios/verificados/AT3_-_Medula_espinhal._Meninges_raquidianas_-_TEXTO_VERIFICADO.txt',10508,'783160c60ac863568fec215f2ad3df5e636a9e764b6a20b79151f9f4ae11a804'),
('material-biblio-gray41-227-236','Gray41_p227-236.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p227-236.pdf',1871733,'5b1e3bb0f373e72a814cea60e5d8ffc0a49fd4fbf8ee78a18c5225f8b9e10506'),
('material-biblio-gray41-416-428','Gray41_p416-428.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p416-428.pdf',1061993,'a53089a26dcecb9cb6dc94bb1ca9f0f944282bb2126e03dc555ea8a4e37e951d'),
('material-biblio-gray41-477-480','Gray41_p477-480_parietal_frontal.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p477-480_parietal_frontal.pdf',241954,'d0dab5b03884c57aaee0a7ce11526efdb686b61116bb359204489c7676ef75a1'),
('material-biblio-gray41-534-537','Gray41_p534-537_esfenoide.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p534-537_esfenoide.pdf',379244,'406ac7441e76b4714838527d104189cb2699ef671d0f4293d5abbde5858f39e6'),
('material-biblio-gray41-620-623','Gray41_p620-623.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p620-623.pdf',535717,'d49d6073bde2d9c8423980cb487d2691dc2893438185792e644f691c61c68b4e'),
('material-biblio-gray41-624-627','Gray41_p624-627_temporal.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p624-627_temporal.pdf',355863,'792dc517241bd46c649b80a3dd6ac22d414ddb98b962c7c070de5b9deb19cd9c'),
('material-biblio-gray41-711-714','Gray41_p711-714_occipital.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p711-714_occipital.pdf',1230180,'3ac393e218e7f8723fef2f33e5610e632f8e8b4e4c700fa1aadd3405c403d27f'),
('material-biblio-gray41-762-768','Gray41_p762-768_complemento.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray41_p762-768_complemento.pdf',783670,'25b49d2fd5573026ee5be751f869f2da000287698afc707e27c94b90bd5ce1f3'),
('material-biblio-gray42-442-464','Gray42_p442-464.pdf','application/pdf','materials/neuroanatomia/bibliografia/Gray42_p442-464.pdf',5030399,'1f7ff029bc4af57b1cd0599029272b70b817c4c3f41ae037267571399e156999'),
('material-biblio-lippincott-1-19','Lippincott2_p1-19.pdf','application/pdf','materials/neuroanatomia/bibliografia/Lippincott2_p1-19.pdf',9689853,'2d53aa518b6726d2427db95bad8cbf28f6f225e717ddeeb4d10caf2167db8926'),
('material-biblio-lippincott-24-29','Lippincott2_p24-29.pdf','application/pdf','materials/neuroanatomia/bibliografia/Lippincott2_p24-29.pdf',3053015,'d163550f511b31db54c3ce9cd36c9a00105c1cda653e4cccdb01d285cf7e56b6'),
('material-biblio-lippincott-79-101','Lippincott2_p79-101.pdf','application/pdf','materials/neuroanatomia/bibliografia/Lippincott2_p79-101.pdf',9993931,'d60a9a585b3d963321e2addd2b794ae20400943a2f0469b376ae09c178ddca89'),
('material-biblio-lippincott-102-109','Lippincott2_p102-109.pdf','application/pdf','materials/neuroanatomia/bibliografia/Lippincott2_p102-109.pdf',3904166,'8985e08e25faa7a54ca857ad29ade6128b94f0e7d197fea26845beed1afe1917'),
('material-biblio-lippincott-123-124','Lippincott2_p123-124_vascularizacao.pdf','application/pdf','materials/neuroanatomia/bibliografia/Lippincott2_p123-124_vascularizacao.pdf',738939,'08dbeb0144ef23e503f00c4debdb5bfebe7e7f81ef666888abeb9c6100499ece'),
('material-biblio-lippincott-130-135','Lippincott2_p130-135.pdf','application/pdf','materials/neuroanatomia/bibliografia/Lippincott2_p130-135.pdf',2791957,'381fa12072b85767b9cb2b943351d846256c3ed2f3a423702c96bd0700140c8a'),
('material-biblio-nolte-1-38','Nolte7_p1-38.pdf','application/pdf','materials/neuroanatomia/bibliografia/Nolte7_p1-38.pdf',49849640,'adcec112b00df51d3f28f1f90171acc7a891e57a557b297dbf0102d7d65696ec'),
('material-biblio-nolte-61','Nolte7_p61.pdf','application/pdf','materials/neuroanatomia/bibliografia/Nolte7_p61.pdf',498848,'ffc33f4c538ca7dced4b0431c2029994f2581ad2cf81ccad2ae12f8da0cacfa2'),
('material-biblio-nolte-233-244','Nolte7_p233-244.pdf','application/pdf','materials/neuroanatomia/bibliografia/Nolte7_p233-244.pdf',8202797,'43fb1cfbbdfafffb71c7aad172c774510a5d2857926a028017fc1f4a894cfc3a'),
('material-biblio-nolte-272-295','Nolte7_p272-295.pdf','application/pdf','materials/neuroanatomia/bibliografia/Nolte7_p272-295.pdf',18315392,'ccde30650a425c226deaf4479fff1b0b1f2724658e1499716707b3c5f1ee0f16');

UPDATE material_catalog
SET file_name = (SELECT file_name FROM _migration_0064_authorized_neuro_artifacts a WHERE a.id = material_catalog.id),
    mime_type = (SELECT mime_type FROM _migration_0064_authorized_neuro_artifacts a WHERE a.id = material_catalog.id),
    storage_backend = 'r2',
    storage_key = (SELECT storage_key FROM _migration_0064_authorized_neuro_artifacts a WHERE a.id = material_catalog.id),
    storage_state = 'ready',
    byte_size = (SELECT byte_size FROM _migration_0064_authorized_neuro_artifacts a WHERE a.id = material_catalog.id),
    checksum_sha256 = (SELECT checksum_sha256 FROM _migration_0064_authorized_neuro_artifacts a WHERE a.id = material_catalog.id),
    verification_status = 'verified',
    publication_status = 'published',
    description = CASE WHEN material_kind = 'bibliography'
      THEN 'Excerto bibliográfico recomendado e autorizado para distribuição.'
      ELSE description END,
    updated_at = unixepoch() * 1000
WHERE id IN (SELECT id FROM _migration_0064_authorized_neuro_artifacts);

UPDATE material_anki_decks
SET storage_state = 'ready', publication_status = 'published',
    description = CASE id
      WHEN 'anki-neuro-essential' THEN 'AT1–AT5 e AP1–AP3, com resposta curta e cartões práticos de imagem.'
      ELSE 'AT1–AT5 e AP1–AP3, com cobertura completa, resposta curta e cartões práticos de imagem.' END,
    updated_at = unixepoch() * 1000
WHERE id IN ('anki-neuro-essential', 'anki-neuro-complete');

UPDATE material_catalog
SET storage_state = 'ready', publication_status = 'published',
    byte_size = 191131120,
    description = 'Sumários originais, versões verificadas, excertos bibliográficos, mapa de páginas e notas de correção.',
    updated_at = unixepoch() * 1000
WHERE id = 'material-bibliography-neuro-package';

DROP TABLE _migration_0064_authorized_neuro_artifacts;
