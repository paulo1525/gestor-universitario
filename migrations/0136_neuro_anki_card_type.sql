-- Keep the Anki card kind available to the D1 quiz fallback and its catalogue.
ALTER TABLE quiz_questions ADD COLUMN anki_card_type TEXT CHECK (anki_card_type IS NULL OR anki_card_type IN ('label_image','text'));

-- Older imports did not persist this field separately. Front-side figures are
-- the discriminator used by the Anki importer for label-image cards.
UPDATE quiz_questions
SET anki_card_type = CASE
  WHEN json_valid(question_images_json) AND json_array_length(question_images_json) > 0 THEN 'label_image'
  ELSE 'text'
END
WHERE id GLOB 'anki-neuro-*';
