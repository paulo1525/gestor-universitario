import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = (kind, key) => `compendium-${kind}-fis1-${createHash('sha256').update(key).digest('hex').slice(0, 20)}`;

// Only move existing records. Options, answers, publication state and attempt snapshots stay intact.
export function curriculumMigration(base) {
  const lessons = base.organizacao_curricular.aulas;
  const mapping = new Map(lessons.map(lesson => [lesson.codigo, lesson]));
  if (lessons.length !== 60 || mapping.size !== 60 || base.questoes.length !== 1195 || new Set(base.questoes.map(q => q.id)).size !== 1195) throw new Error('Cobertura curricular inesperada');
  const rows = ["-- Fisiologia I 2026/27: organização curricular preservando IDs e histórico.",
    "DROP TABLE IF EXISTS _fis_lessons_context; DROP TABLE IF EXISTS _fis_lesson_mapping;",
    "CREATE TABLE _fis_lessons_context AS SELECT cu.id AS unit_id,(SELECT id FROM users ORDER BY (role='admin') DESC,created_at LIMIT 1) AS actor_id FROM curricular_units cu WHERE cu.code='FIS1';"];
  const topics = [...lessons.map(a => ({ ...a, title: `${a.codigo} · ${a.titulo}` })), { codigo: 'sem-aula', title: 'Sem correspondência curricular confirmada', frequencia: null }];
  for (const [index, lesson] of topics.entries()) {
    const id = identifier('lesson', lesson.codigo);
    const metadata = JSON.stringify({ assessmentPart: lesson.frequencia, lessonCode: lesson.codigo, lessonType: lesson.tipo ?? null, date: lesson.data ?? null, dateAmbiguous: lesson.data_ambigua_frequencia ?? false });
    rows.push(`INSERT INTO question_bank_topics (id,curricular_unit_id,source_id,chapter_number,title,sort_order,created_by,updated_by,created_at,updated_at) SELECT ${literal(id)},unit_id,'compendium-source-fis1',${literal(lesson.codigo)},${literal(lesson.title)},${index + 1},actor_id,actor_id,unixepoch()*1000,unixepoch()*1000 FROM _fis_lessons_context WHERE true ON CONFLICT(id) DO UPDATE SET title=excluded.title,sort_order=excluded.sort_order;`);
    rows.push(`INSERT INTO quiz_topics (id,curricular_unit_id,title,description,status,sort_order,created_by,updated_by,created_at,updated_at) SELECT ${literal(id)},unit_id,${literal(lesson.title)},${literal(metadata)},'published',${index + 1},actor_id,actor_id,unixepoch()*1000,unixepoch()*1000 FROM _fis_lessons_context WHERE true ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,sort_order=excluded.sort_order;`);
  }
  rows.push('CREATE TABLE _fis_lesson_mapping (suffix TEXT PRIMARY KEY,topic_id TEXT NOT NULL);');
  const values = base.questoes.map(question => {
    if (question.aula_codigo && !mapping.has(question.aula_codigo)) throw new Error(`Aula desconhecida: ${question.id}`);
    return `(${literal(createHash('sha256').update(question.id).digest('hex').slice(0,20))},${literal(identifier('lesson', question.aula_codigo ?? 'sem-aula'))})`;
  });
  for (let offset=0;offset<values.length;offset+=100) rows.push(`INSERT INTO _fis_lesson_mapping VALUES ${values.slice(offset,offset+100).join(',')};`);
  rows.push("UPDATE question_bank_items SET topic_id=(SELECT topic_id FROM _fis_lesson_mapping m WHERE question_bank_items.id='compendium-question-fis1-'||m.suffix),updated_at=unixepoch()*1000 WHERE source_id='compendium-source-fis1' AND EXISTS (SELECT 1 FROM _fis_lesson_mapping m WHERE question_bank_items.id='compendium-question-fis1-'||m.suffix);");
  rows.push("UPDATE quiz_questions SET topic_id=(SELECT topic_id FROM _fis_lesson_mapping m WHERE quiz_questions.id='compendium-quiz-fis1-'||m.suffix),updated_at=unixepoch()*1000 WHERE curricular_unit_id IN (SELECT unit_id FROM _fis_lessons_context) AND EXISTS (SELECT 1 FROM _fis_lesson_mapping m WHERE quiz_questions.id='compendium-quiz-fis1-'||m.suffix);");
  rows.push('DROP TABLE _fis_lesson_mapping;');
  // Historical topics remain available to old attempt snapshots but disappear from the catalogue.
  rows.push("UPDATE quiz_topics SET status='archived',archived_at=unixepoch()*1000 WHERE curricular_unit_id IN (SELECT unit_id FROM _fis_lessons_context) AND id LIKE 'compendium-topic-fis1-%' AND NOT EXISTS (SELECT 1 FROM quiz_questions q WHERE q.topic_id=quiz_topics.id AND q.status='published' AND q.deleted_at IS NULL);");
  rows.push('DROP TABLE _fis_lessons_context;');
  return rows.join('\n') + '\n';
}

if (process.argv[2]) {
  const base = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const target = new URL('../migrations/0119_fisiologia_lessons_2026.sql', import.meta.url);
  await writeFile(target, curriculumMigration(base));
  console.log('Migration preparada: 60 aulas; 1195 IDs preservados.');
}
