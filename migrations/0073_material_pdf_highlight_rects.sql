-- Um realce de texto selecionado ocupa várias linhas: cada linha é guardada
-- como um retângulo normalizado (0–1) em JSON. As colunas x/y/width/height
-- mantêm a caixa envolvente para compatibilidade com os realces por área.
ALTER TABLE material_pdf_highlights ADD COLUMN rects TEXT;
