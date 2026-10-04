import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from '../lib/quiz-csv.mjs';

// Explicit canonical sources, never archives, OCR intermediates or bibliography databases.
export const SOURCES = [
  ['FIS1', 'Fisiologia I', 'Fontes/Fisiologia_I_Base_Canonica.json'],
  ['NEURO', 'Neuroanatomia', 'Base/questoes.json'],
  ['AR', 'Anatomia Radiológica', 'Base/questoes.json'],
];
const hash = value => createHash('sha256').update(value).digest('hex');
const str = value => typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
const array = value => Array.isArray(value) ? value : [];
const sql = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const identifier = (kind, code, key) => `compendium-${kind}-${code.toLowerCase()}-${hash(key).slice(0, 20)}`;

export function normalizeQuestion(q, index, code) {
  const key = str(q.final_id || q.id || q.source_id || q.numero || index + 1);
  const rawOptions = q.opcoes_json ?? q.opcoes ?? q.alternativas_editoriais ?? q.alternativas ?? q.options;
  let options = [];
  if (Array.isArray(rawOptions)) options = rawOptions.map((option, position) => ({ label: str(option?.label || option?.letra || String.fromCharCode(65 + position)).toUpperCase(), text: str(option?.text ?? option?.texto ?? option) }));
  else if (rawOptions && typeof rawOptions === 'object') options = Object.entries(rawOptions).map(([label, text]) => ({ label: label.toUpperCase(), text: str(text) }));
  else if (typeof rawOptions === 'string') options = [...rawOptions.matchAll(/(?:^|\n|;\s*)\s*([A-Ea-e])\s*[).]\s*([\s\S]*?)(?=;\s*[A-Ea-e]\s*[).]|\n\s*[A-Ea-e]\s*[).]|$)/g)].map(match => ({ label: match[1].toUpperCase(), text: match[2].trim() }));
  const answer = str(q.validation?.verified_answer ?? q.resposta_editorial ?? q.resposta_verificada ?? q.resposta_intercalada?.letra ?? q.resposta ?? q.solution?.answer);
  const answerLetter = answer.match(/^([A-E])(?:\s*[).:\-—–]|$)/i)?.[1]?.toUpperCase();
  const correctOption = options.findIndex(option => option.label === answerLetter || option.text.toLocaleLowerCase('pt-PT') === answer.toLocaleLowerCase('pt-PT'));
  const state = str(q.validation?.status ?? q.estado_validacao ?? q.estado_final ?? q.estado ?? q.validacao_estado ?? q.inventory_solution_status).toLowerCase();
  const approved = ['confirmada', 'corrigida', 'validada', 'validado', 'revisto_com_evidencia', 'adjudicado', 'validado_final'].includes(state);
  const excluded = Boolean(q.exclude_from_compendium) || /exclu|anula|invalid|corromp|quarenten/.test(state);
  const rawImages = array(q.media_editorial?.sem ?? q.imagens_enunciado_json ?? q.images ?? q.imagens_associadas ?? q.figures ?? q.imagens);
  const solutionImages = [...array(q.media_editorial?.com).filter(img => !array(q.media_editorial?.sem).some(other => other.sha256 === img.sha256)), ...array(q.imagens_solucao_json ?? q.answer_images ?? q.solution?.figures), ...rawImages.filter(img => img?.so_solucao)];
  const questionImages = rawImages.filter(img => !img?.so_solucao);
  const missingVisual = Boolean(q.imagem_requerida && !questionImages.length) || array(q.figure_refs_pending).length > 0;
  const prompt = [str(q.contexto), str(q.text_display ?? q.enunciado_editorial ?? q.enunciado ?? q.pergunta ?? q.texto_editorial ?? q.text_original)].filter(Boolean).join('\n\n');
  const explanation = str(q.conclusao_bibliografica ?? q.justificacao ?? q.solution?.rationale ?? q.bibliografia_validacao?.justificacao ?? q.validation?.note);
  const issues = [];
  if (!approved) issues.push(`Validação da fonte: ${state || 'não documentada'}`);
  if (excluded) issues.push('Excluída na base canónica');
  if (!prompt || !answer) issues.push('Enunciado ou solução ausente');
  if (options.length && (options.length < 2 || options.length > 5 || correctOption < 0 || options.some(option => !option.text))) issues.push('Opções ou resposta única por resolver');
  if (missingVisual) issues.push('Figura necessária pendente na fonte');
  return { code, key, prompt, options, answer, correctOption, explanation,
    theme: str(q.secao_editorial || q.aula || q.aula_titulo || q.capitulo || q.chapter || q.tema || 'Compêndio'),
    responseType: options.length ? 'multiple_choice' : /caso|case/i.test(str(q.tipo || q.type)) ? 'case' : 'short_answer',
    questionImages, solutionImages, issues, published: !issues.length,
    page: str(q.pagina ?? q.paginas_pdf?.join(', ') ?? q.occurrences?.[0]?.pdf_page ?? q.sources?.[0]?.page),
    number: str(q.numero_original ?? q.numero ?? q.numero_editorial ?? q.global_number ?? index + 1),
  };
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (/backup|arquivo|__pycache__|node_modules|^tmp$|^_tmp$/i.test(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute));
    else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) files.push(absolute);
  }
  return files;
}

export async function preserveImage(image, context) {
  const reference = str(typeof image === 'string' ? image : image?.sem_solucoes_path ?? image?.local_path ?? image?.asset_path ?? image?.path ?? image?.file ?? image?.ficheiro);
  if (!reference) throw new Error('Imagem sem caminho de origem');
  if (/quarenten|quarantine|ausente|pendente/.test(str(image?.state ?? image?.estado))) throw new Error(`Figura pendente/quarentenada: ${reference}`);
  const mapped = context.manifest[reference];
  const normalized = str(mapped?.file || reference).replaceAll('\\', '/');
  const exact = path.resolve(context.root, normalized);
  let matches = context.files.filter(file => file === exact);
  if (!matches.length && !path.isAbsolute(normalized)) matches = context.files.filter(file => file.replaceAll('\\', '/').endsWith(`/${normalized.replace(/^\.\//, '')}`));
  if (matches.length !== 1) throw new Error(`Figura ${matches.length ? 'ambígua' : 'em falta'}: ${reference}`);
  const bytes = await readFile(matches[0]);
  const checksum = hash(bytes);
  const expected = mapped?.sha256 || image?.asset_sha256 || image?.sha256;
  if (expected && expected !== checksum) throw new Error(`Hash divergente: ${reference}`);
  const extension = path.extname(matches[0]).toLowerCase();
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(png || jpeg || webp) || !/\.(png|jpe?g|webp)$/.test(extension)) throw new Error(`Formato de imagem inválido: ${reference}`);
  const url = `/quiz-images/compendios/${checksum}${extension}`;
  const target = path.join(context.output, 'public', url.slice(1));
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(matches[0], target);
  context.assets.set(url, { url, checksum, bytes: bytes.length });
  return url;
}

function bankSql(question, index, sourceId, topicId) {
  const id = identifier('question', question.code, question.key);
  const review = question.issues.join('; ');
  const columns = ['id','curricular_unit_id','topic_id','source_id','external_key','prompt','options_text','answer_indicated','answer_text','source_original','anatomical_justification','response_type','source_page','source_question','validation_state','confidence','status','review_note','sort_order','created_by','updated_by','created_at','updated_at','image_url','question_images_json','solution_images_json'];
  const values = [sql(id),'(SELECT unit_id FROM _compendium_context)',sql(topicId),sql(sourceId),sql(question.key),sql(question.prompt),sql(question.options.map(option => `${option.label.toLowerCase()}) ${option.text}`).join('\n')),sql(question.correctOption >= 0 ? `${question.options[question.correctOption].label}) ${question.options[question.correctOption].text}` : ''),sql(question.answer),sql(`${question.code} — Compêndio canónico`),sql(question.explanation),sql(question.responseType),sql(question.page),sql(question.number),sql(question.published ? 'VALIDADO' : 'review'),sql(question.published ? 'ALTO' : ''),sql(question.published ? 'published' : 'review'),sql(review),index + 1,'(SELECT actor_id FROM _compendium_context)','(SELECT actor_id FROM _compendium_context)','unixepoch()*1000','unixepoch()*1000',sql(question.imageUrls[0] || ''),sql(JSON.stringify(question.imageUrls)),sql(JSON.stringify(question.solutionImageUrls))];
  return `INSERT INTO question_bank_items (${columns.join(',')}) SELECT ${values.join(',')} FROM _compendium_context WHERE true ON CONFLICT(id) DO UPDATE SET ${columns.filter(column => !['id','created_by','created_at'].includes(column)).map(column => `${column}=excluded.${column}`).join(',')};`;
}

function quizSql(question) {
  const id = identifier('quiz', question.code, question.key);
  const columns = ['id','curricular_unit_id','topic_id','prompt','image_url','explanation','difficulty','status','published_at','published_by','created_by','updated_by','created_at','updated_at','question_images_json','solution_images_json','response_type','answer_text'];
  const values = [sql(id),'(SELECT unit_id FROM _compendium_context)',`(SELECT id FROM quiz_topics WHERE curricular_unit_id=(SELECT unit_id FROM _compendium_context) AND title=${sql(question.theme)})`,sql(question.prompt),sql(question.imageUrls[0] || null),sql(question.explanation),'\'medium\'','\'published\'','unixepoch()*1000','(SELECT actor_id FROM _compendium_context)','(SELECT actor_id FROM _compendium_context)','(SELECT actor_id FROM _compendium_context)','unixepoch()*1000','unixepoch()*1000',sql(JSON.stringify(question.imageUrls)),sql(JSON.stringify(question.solutionImageUrls)),sql(question.responseType),sql(question.answer)];
  return [
    `INSERT INTO quiz_questions (${columns.join(',')}) SELECT ${values.join(',')} FROM _compendium_context WHERE true ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt,image_url=excluded.image_url,explanation=excluded.explanation,question_images_json=excluded.question_images_json,solution_images_json=excluded.solution_images_json,response_type=excluded.response_type,answer_text=excluded.answer_text,status=excluded.status,topic_id=excluded.topic_id;`,
    `DELETE FROM quiz_question_options WHERE question_id=${sql(id)};`,
    ...question.options.map((option, position) => `INSERT INTO quiz_question_options (id,question_id,option_text,position,is_correct) SELECT ${sql(`${id}-option-${position + 1}`)},${sql(id)},${sql(option.text)},${position + 1},${Number(position === question.correctOption)} FROM _compendium_context;`),
  ];
}

// D1 executes bounded statements; group imports to avoid thousands of round trips.
function bulkInsert(statements) {
  const result=[];let prefix='',suffix='',selects=[],size=0;
  const flush=()=>{if(selects.length)result.push(prefix+'VALUES '+selects.join(',')+suffix);selects=[];size=0;};
  for(const statement of statements) {
    const start=statement.indexOf(' SELECT ');
    const end=statement.lastIndexOf(' FROM _compendium_context');
    const nextPrefix=statement.slice(0,start+1);
    const tail=statement.slice(end+' FROM _compendium_context'.length);
    const nextSuffix=tail.startsWith(' WHERE true ON CONFLICT') ? tail.slice(' WHERE true'.length) : ';';
    const select='('+statement.slice(start+' SELECT '.length,end)+')';
    if(prefix!==nextPrefix || suffix!==nextSuffix || selects.length>=20 || size+select.length>48000)flush();
    prefix=nextPrefix;suffix=nextSuffix;selects.push(select);size+=select.length;
  }
  flush();return result;
}

export async function prepareBanks(studyRoot, output) {
  const assets = new Map();
  const report = { sources: [], assets: [], warnings: [], publication: 'local staging only; requires review, build, GitHub and D1 migrations before production' };
  await mkdir(output, { recursive: true });
  for (const [code, discipline, relative] of SOURCES) {
    const root = path.join(studyRoot, '01_Disciplinas', discipline, 'Compendio');
    let content;
    try { content = await readFile(path.join(root, relative), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; report.warnings.push(`${code}: base canónica não localizada`); continue; }
    let items;
    if (relative.endsWith('.csv')) {
      const [headers, ...rows] = parseCsv(content);
      items = rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
    } else {
      const payload = JSON.parse(content);
      items = Array.isArray(payload) ? payload : payload.questoes ?? payload.registos ?? payload.questions;
    }
    if (!Array.isArray(items)) throw new Error(`Formato desconhecido: ${code}`);
    let manifest = {};
    try { manifest = JSON.parse(await readFile(path.join(root, 'Assets/manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const context = { root, output, files: await filesBelow(root), manifest, assets };
    const questions = [];
    const ids = new Set();
    for (const [index, item] of items.entries()) {
      const question = normalizeQuestion(item, index, code);
      if (ids.has(question.key)) throw new Error(`ID duplicado: ${code}/${question.key}`);
      ids.add(question.key);
      question.imageUrls = []; question.solutionImageUrls = [];
      for (const [references, urls] of [[question.questionImages, question.imageUrls], [question.solutionImages, question.solutionImageUrls]]) {
        for (const image of references) {
          try { urls.push(await preserveImage(image, context)); } catch (error) { question.issues.push(error.message); question.published = false; }
        }
      }
      questions.push(question);
    }
    const sourceId = `compendium-source-${code.toLowerCase()}`;
    const source = { code, total: questions.length, published: questions.filter(q => q.published).length, quizzes: questions.filter(q => q.published).length, questionFigures: questions.reduce((sum,q) => sum + q.imageUrls.length,0), solutionFigures: questions.reduce((sum,q) => sum + q.solutionImageUrls.length,0), review: questions.filter(q => !q.published).map(q => ({ id:q.key, issues:q.issues })) };
    report.sources.push(source);
    const statements = [
      'DROP TABLE IF EXISTS _compendium_context;',
      'CREATE TABLE _compendium_context (unit_id TEXT NOT NULL,actor_id TEXT NOT NULL);',
      `INSERT INTO _compendium_context SELECT cu.id,u.id FROM curricular_units cu CROSS JOIN users u WHERE cu.code=${sql(code)} AND cu.active=1 AND u.role='admin' ORDER BY u.created_at,u.id LIMIT 1;`,
      `INSERT INTO question_bank_sources (id,curricular_unit_id,source_kind,label,locator,revision_label,source_row_count,imported_count,published_count,review_count,coverage_json,verification_status,created_by,created_at,updated_at) SELECT ${sql(sourceId)},unit_id,'local_file',${sql(`${discipline} — Compêndio`)},${sql(`fmup-med:${code}:canonical`)},${sql(hash(content))},${source.total},${source.total},${source.published},${source.total-source.published},'{}','review',actor_id,unixepoch()*1000,unixepoch()*1000 FROM _compendium_context WHERE true ON CONFLICT(id) DO UPDATE SET revision_label=excluded.revision_label,source_row_count=excluded.source_row_count,imported_count=excluded.imported_count,published_count=excluded.published_count,review_count=excluded.review_count,updated_at=excluded.updated_at;`,
    ];
    const themes = [...new Set(questions.map(q => q.theme))];
    for (const [index, theme] of themes.entries()) {
      const topicId = identifier('topic',code,theme);
      statements.push(`INSERT INTO question_bank_topics (id,curricular_unit_id,source_id,chapter_number,title,sort_order,created_by,updated_by,created_at,updated_at) SELECT ${sql(topicId)},unit_id,${sql(sourceId)},${sql(String(index+1))},${sql(theme)},${index+1},actor_id,actor_id,unixepoch()*1000,unixepoch()*1000 FROM _compendium_context WHERE true ON CONFLICT(id) DO UPDATE SET title=excluded.title;`);
      if (questions.some(q => q.theme===theme && q.published)) statements.push(`INSERT INTO quiz_topics (id,curricular_unit_id,title,status,sort_order,created_by,updated_by,created_at,updated_at) SELECT ${sql(topicId)},unit_id,${sql(theme)},'published',${index+1},actor_id,actor_id,unixepoch()*1000,unixepoch()*1000 FROM _compendium_context WHERE true ON CONFLICT(curricular_unit_id,title) DO UPDATE SET status='published',deleted_at=NULL;`);
    }
    const bankStatements=[], quizStatements=[], optionStatements=[], quizIds=[];
    for (const [index, question] of questions.entries()) {
      const topicId = identifier('topic',code,question.theme);
      bankStatements.push(bankSql(question,index,sourceId,topicId));
      if (question.published) {
        const [quiz,,...options]=quizSql(question);
        quizStatements.push(quiz);optionStatements.push(...options);
        quizIds.push(identifier('quiz',question.code,question.key));
      }
    }
    statements.push(...bulkInsert(bankStatements),...bulkInsert(quizStatements));
    for(let offset=0;offset<quizIds.length;offset+=100) statements.push(`DELETE FROM quiz_question_options WHERE question_id IN (${quizIds.slice(offset,offset+100).map(sql).join(',')});`);
    statements.push(...bulkInsert(optionStatements));
    statements.push('DROP TABLE _compendium_context;');
    await writeFile(path.join(output, `${code}-bank.sql`), statements.join('\n')+'\n');
    await writeFile(path.join(output, `${code}-bank.json`), JSON.stringify(questions,null,2));
  }
  report.assets = [...assets.values()];
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [studyRoot, output] = process.argv.slice(2);
  if (!studyRoot || !output) throw new Error('Uso: node scripts/prepare-compendium-banks.mjs <FMUP_Med> <staging-fora-do-repositorio>');
  const report = await prepareBanks(path.resolve(studyRoot),path.resolve(output));
  console.log(JSON.stringify({ sources:report.sources.map(({review,...source})=>({...source,review:review.length})),assets:report.assets.length,warnings:report.warnings },null,2));
}
