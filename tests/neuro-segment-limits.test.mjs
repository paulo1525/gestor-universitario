import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { isShortAnswerMatch } from "../lib/short-answer-match.mjs";
import { SEGMENT_CORRECTIONS, correctSegmentRow } from "../scripts/correct-neuro-segment-limits.mjs";

test("intumescência cervical aceita Gray/AP2 e Nolte, sem aproximar segmentos errados", () => {
  for (const id of ["Q0104", "Q1048"]) {
    const expected = SEGMENT_CORRECTIONS[id].answer;
    for (const answer of ["C3-T2", "C5–T1", "Entre os segmentos medulares C3 a T2", "c 5 até t 1"]) assert.equal(isShortAnswerMatch(answer, expected), true, answer);
    for (const answer of ["C3-T1", "C5-T2", "T2-C3", "C4-T1", "C3", "C3-T2 ou C1-T5", "não é C3-T2", "C3-T2 vértebras"]) assert.equal(isShortAnswerMatch(answer, expected), false, answer);
  }
});
test("Clarke aceita todos os pares documentados e exige os dois limites", () => {
  const expected = SEGMENT_CORRECTIONS.Q1196.answer;
  for (const answer of ["C8 a L3", "C8-L2", "T1-L2", "T1–L3", "De C 8 até L 3."]) assert.equal(isShortAnswerMatch(answer, expected), true, answer);
  for (const answer of ["C7-L3", "C8-L4", "T2-L2", "L3-C8", "C8", "L3", "não C8-L3", "C8-L3 e S2-S4"]) assert.equal(isShortAnswerMatch(answer, expected), false, answer);
  assert.equal(isShortAnswerMatch("C8-L3", SEGMENT_CORRECTIONS.Q0118.answer), false, "um intervalo não responde às várias alíneas da Q0118");
});
test("segmentos não recebem tolerância tipográfica no comparador genérico", () => {
  assert.equal(isShortAnswerMatch("C3-T2", "C5-T1"), false);
  assert.equal(isShortAnswerMatch("T1-L3", "T1-L2"), false);
  assert.equal(isShortAnswerMatch("Lâmina VII", "Lâmina 7"), true);
  assert.equal(isShortAnswerMatch("Não cruza", "Cruza"), false);
  assert.equal(isShortAnswerMatch("Articulações fibrosas", "Articulações fibrosas"), true);
  assert.equal(isShortAnswerMatch("C8-L3", "Aferentes de C8-L3 ascendem e entram pelo pedúnculo inferior."), false);
});
test("atualização preserva IDs, origem, imagens e restante banco", () => {
  const row = { id: "existing-question", topic_id: "existing-topic", status: "published", prompt: "Enunciado original", answer_text: "antiga", question_images_json: '["imagem"]', compendium: { finalId: "Q0104", occurrences: [{ source_id: "source" }], validation: {} }, explanation: "<p><strong>Referências</strong><br>antigas</p><p><strong>Fonte do enunciado · Q0104</strong><br>origem</p>" };
  assert.equal(correctSegmentRow(row, 123), true);
  assert.equal(row.id, "existing-question"); assert.equal(row.topic_id, "existing-topic");
  assert.equal(row.prompt, "Enunciado original"); assert.equal(row.question_images_json, '["imagem"]');
  assert.deepEqual(row.compendium.occurrences, [{ source_id: "source" }]);
  assert.equal(row.updated_at, 123); assert.equal(row.answer_text, SEGMENT_CORRECTIONS.Q0104.answer);
  assert.match(row.explanation, /Fonte do enunciado · Q0104/);
  assert.doesNotMatch(row.explanation, /antigas/);
  const unrelated = { id: "unrelated", compendium: { finalId: "Q0001" } }, before = structuredClone(unrelated);
  assert.equal(correctSegmentRow(unrelated), false); assert.deepEqual(unrelated, before);
});
test("PDF corrigido mantém material privado, favoritos e variante sem soluções", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE material_catalog(id TEXT PRIMARY KEY,description TEXT,storage_key TEXT,byte_size INTEGER,checksum_sha256 TEXT,storage_state TEXT,version_number INTEGER,updated_at INTEGER,public_access INTEGER);
      CREATE TABLE favourites(material_id TEXT REFERENCES material_catalog(id));
      CREATE TABLE users(id TEXT,status TEXT,commission_position TEXT,role TEXT,created_at INTEGER);
      CREATE TABLE admin_audit_log(actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
      INSERT INTO users VALUES('admin','active','principal_admin','admin',1);
      INSERT INTO material_catalog(id,version_number,public_access) VALUES('material-neuro-compendium-solutions',2,0),('material-neuro-compendium-no-solutions',2,0);
      INSERT INTO favourites VALUES('material-neuro-compendium-solutions');`);
    const sql = readFileSync(new URL("../migrations/0133_neuro_segment_limits_compendium.sql", import.meta.url), "utf8");
    db.exec(sql); db.exec(sql);
    const updated = db.prepare("SELECT * FROM material_catalog WHERE id='material-neuro-compendium-solutions'").get();
    assert.equal(updated.version_number, 3); assert.equal(updated.public_access, 0);
    assert.equal(updated.storage_key.endsWith(updated.checksum_sha256 + ".pdf"), true);
    assert.equal(db.prepare("SELECT version_number FROM material_catalog WHERE id='material-neuro-compendium-no-solutions'").get().version_number, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM favourites").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_log").get().n, 1);
  } finally { db.close(); }
});
