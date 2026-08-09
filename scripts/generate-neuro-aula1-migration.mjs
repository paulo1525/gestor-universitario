import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "data", "quizzes", "neuro-aula-1.json");
const outputName = process.argv[2] ?? "0035_seed_neuro_aula1_quiz.sql";
if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(outputName)) throw new Error("Nome de migration invÃ¡lido.");
const outputPath = join(root, "migrations", outputName);
const migrationVersion = outputName.slice(0, 4);
const importId = migrationVersion === "0035" ? "quiz-import-neuro-a1-v1" : `quiz-import-neuro-a1-${migrationVersion}`;
const bank = JSON.parse(await readFile(sourcePath, "utf8"));
const allQuestions = bank.questions;
const partition = process.argv[3] ?? "all";
const questions = partition === "first" ? allQuestions.slice(0, 25) : partition === "second" ? allQuestions.slice(25) : allQuestions;

if (!Array.isArray(allQuestions) || allQuestions.length !== 50) throw new Error("O banco tem de conter exatamente 50 perguntas.");
if (!new Set(["all", "first", "second"]).has(partition)) throw new Error("PartiÃ§Ã£o invÃ¡lida.");
const assets = new Map((bank.imageAssets ?? []).map((asset) => [asset.id, asset]));
const sql = (value) => value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const questionId = (question) => `quiz-${question.id.toLocaleLowerCase("pt-PT")}`;
const imageUrl = (question) => {
  if (!question.imageAssetId) return null;
  const asset = assets.get(question.imageAssetId);
  if (!asset) throw new Error(`Imagem desconhecida em ${question.id}: ${question.imageAssetId}`);
  return `/quiz-images/neuro/aula-1/${basename(asset.file)}`;
};

for (const question of questions) {
  if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error(`${question.id}: são necessárias quatro opções.`);
  if (!Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption > 3) throw new Error(`${question.id}: índice correto inválido.`);
}

const lines = [
  "-- Banco publicado da primeira aula de Neuroanatomia (PDF pp. 4-8).",
  "-- Conteúdo e imagens foram revistos visualmente; IDs estáveis tornam a carga idempotente.",
  "DROP TABLE IF EXISTS _seed_neuro_a1_context;",
  "DROP TABLE IF EXISTS _seed_neuro_a1_actor;",
  "CREATE TABLE _seed_neuro_a1_actor (id TEXT NOT NULL);",
  "INSERT INTO _seed_neuro_a1_actor (id)",
  "SELECT id FROM users WHERE status='active' AND (commission_position='principal_admin' OR commission_department='management' OR role='admin')",
  "ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 WHEN commission_department='management' THEN 1 ELSE 2 END, created_at LIMIT 1;",
  "INSERT INTO _seed_neuro_a1_actor (id) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM _seed_neuro_a1_actor);",
  "CREATE TABLE _seed_neuro_a1_context (unit_id TEXT NOT NULL, topic_id TEXT NOT NULL, actor_id TEXT NOT NULL);",
  `INSERT INTO _seed_neuro_a1_context (unit_id,topic_id,actor_id) SELECT cu.id,COALESCE((SELECT id FROM quiz_topics WHERE curricular_unit_id=cu.id AND title=${sql(bank.theme)} LIMIT 1),'quiz-topic-neuro-aula-1'),actor.id FROM curricular_units cu CROSS JOIN _seed_neuro_a1_actor actor WHERE cu.code=${sql(bank.unitCode)} AND cu.active=1;`,
  "INSERT INTO _seed_neuro_a1_context (unit_id,topic_id,actor_id) SELECT NULL,NULL,NULL WHERE NOT EXISTS (SELECT 1 FROM _seed_neuro_a1_context);",
  `INSERT INTO quiz_topics (id,curricular_unit_id,title,description,status,sort_order,published_at,published_by,created_by,updated_by,created_at,updated_at) SELECT topic_id,unit_id,${sql(bank.theme)},${sql("Descrição geral do sistema nervoso central: encéfalo, espinal medula, organização funcional e sistema ventricular.")},'published',1,unixepoch()*1000,actor_id,actor_id,actor_id,unixepoch()*1000,unixepoch()*1000 FROM _seed_neuro_a1_context WHERE true ON CONFLICT(id) DO UPDATE SET curricular_unit_id=excluded.curricular_unit_id,title=excluded.title,description=excluded.description,status='published',published_at=COALESCE(quiz_topics.published_at,excluded.published_at),published_by=COALESCE(quiz_topics.published_by,excluded.published_by),archived_at=NULL,archived_by=NULL,deleted_at=NULL,deleted_by=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at;`,
  `DELETE FROM quiz_question_options WHERE question_id IN (${questions.map((question) => sql(questionId(question))).join(",")});`,
];

for (const question of questions) {
  const id = questionId(question);
  lines.push(`INSERT INTO quiz_questions (id,curricular_unit_id,topic_id,prompt,image_url,explanation,difficulty,status,published_at,published_by,created_by,updated_by,created_at,updated_at) SELECT ${sql(id)},unit_id,topic_id,${sql(question.question)},${sql(imageUrl(question))},${sql(question.explanation)},${sql(question.difficulty)},'published',unixepoch()*1000,actor_id,actor_id,actor_id,unixepoch()*1000,unixepoch()*1000 FROM _seed_neuro_a1_context WHERE true ON CONFLICT(id) DO UPDATE SET curricular_unit_id=excluded.curricular_unit_id,topic_id=excluded.topic_id,prompt=excluded.prompt,image_url=excluded.image_url,explanation=excluded.explanation,difficulty=excluded.difficulty,status='published',published_at=COALESCE(quiz_questions.published_at,excluded.published_at),published_by=COALESCE(quiz_questions.published_by,excluded.published_by),archived_at=NULL,archived_by=NULL,deleted_at=NULL,deleted_by=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at;`);
  question.options.forEach((option, index) => lines.push(`INSERT INTO quiz_question_options (id,question_id,option_text,position,is_correct) VALUES (${sql(`${id}-option-${index + 1}`)},${sql(id)},${sql(option)},${index + 1},${question.correctOption === index ? 1 : 0});`));
}

lines.push(
  `INSERT INTO quiz_imports (id,filename,curricular_unit_id,row_count,topics_created,questions_created,imported_by,created_at) SELECT ${sql(importId)},'neuro-aula-1-50-perguntas.json',unit_id,${questions.length},1,${questions.length},actor_id,unixepoch()*1000 FROM _seed_neuro_a1_context WHERE true ON CONFLICT(id) DO NOTHING;`,
  `INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) SELECT actor_id,'quiz_questions_seeded',${sql(JSON.stringify({ unitCode: bank.unitCode, theme: bank.theme, count: questions.length, published: true, migration: migrationVersion }))},unixepoch()*1000 FROM _seed_neuro_a1_context;`,
  "DROP TABLE _seed_neuro_a1_context;",
  "DROP TABLE _seed_neuro_a1_actor;",
  "",
);

await writeFile(outputPath, lines.join("\n"), "utf8");
console.log(`Gerada ${outputPath} com ${questions.length} perguntas e ${questions.filter((question) => question.imageAssetId).length} perguntas visuais.`);
