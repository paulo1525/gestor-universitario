import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Indica a pasta Compendio do projeto Fisiologia I.');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const base = JSON.parse(await readFile(path.join(root, 'Fontes/Fisiologia_I_Base_Canonica.json'), 'utf8'));
const pdfQa = JSON.parse(await readFile(path.join(root, 'validacao_entregas.json'), 'utf8'));
const deckName = `Fisiologia_Compendio_MC_2026-10-04_${pdfQa.base_sha256.slice(0,8)}`;
const deckQa = JSON.parse(await readFile(path.join(root, `Entregas/Anki_Compendio/${deckName}_validacao.json`), 'utf8'));
if (!deckQa.valido) throw new Error('Baralho sem validação.');
const files = [];
const rows = ['-- Compêndios por aulas e apenas o novo Anki de escolha múltipla de Fisiologia.', '-- Ativação separada após confirmação dos bytes no R2.'];
for (const pdf of pdfQa.pdfs) {
  const solutions = pdf.file.includes('_com_solucoes');
  const id = `material-fis1-compendium-${solutions ? 'solutions' : 'no-solutions'}`;
  const localPath = path.join(root, 'Entregas', pdf.file);
  const bytes = await readFile(localPath);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (checksum !== pdf.sha256) throw new Error('PDF diferente do validado.');
  const storageKey = `materials/fisiologia-i/compendios/${checksum}.pdf`;
  const title = `Fisiologia I — Compêndio por aulas ${solutions ? 'com' : 'sem'} soluções`;
  const description = `${pdfQa.questions} perguntas de escolha múltipla em ${pdf.pages} páginas, organizadas pelas aulas teóricas, teórico-práticas e práticas de 2026/27. Edição de 04/10/2026. Mantém os avisos de validação da fonte.`;
  files.push({ id, table: 'material_catalog', unitCode: 'FIS1', title, fileName: pdf.file, localPath, mimeType: 'application/pdf', byteSize: bytes.length, sha256: checksum, storageKey });
  rows.push(`UPDATE material_catalog SET title=${quote(title)},description=${quote(description)},file_name=${quote(pdf.file)},storage_key=${quote(storageKey)},storage_state='pending',byte_size=${bytes.length},checksum_sha256=${quote(checksum)},updated_at=unixepoch()*1000 WHERE id=${quote(id)} AND curricular_unit_id IN (SELECT id FROM curricular_units WHERE code='FIS1');`);
}
const localPath = path.join(root, `Entregas/Anki_Compendio/${deckName}.apkg`);
const bytes = await readFile(localPath);
const checksum = createHash('sha256').update(bytes).digest('hex');
const mediaCount = deckQa.media ?? deckQa.ficheiros_media ?? 202;
const deck = { id:'anki-fis1-compendium-mc',table:'material_anki_decks',unitCode:'FIS1',title:'Fisiologia - Compêndio',fileName:`${deckName}.apkg`,localPath,mimeType:'application/apkg',byteSize:bytes.length,sha256:checksum,storageKey:`materials/fisiologia-i/anki/${checksum}.apkg`,cardCount:deckQa.cartoes,mediaCount };
files.push(deck);
rows.push(`INSERT INTO material_anki_decks (id,curricular_unit_id,title,variant,description,file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,checksum_sha256,card_count,media_count,source_file_name,publication_status,public_access,created_at,updated_at) SELECT ${quote(deck.id)},cu.id,${quote(deck.title)},'custom',${quote(`${deck.cardCount} perguntas de escolha múltipla, com opções clicáveis e correção imediata. Organizado por aulas de 2026/27. Apenas perguntas com chave validada e figuras disponíveis.`)},${quote(deck.fileName)},'application/apkg','r2',${quote(deck.storageKey)},'pending',${deck.byteSize},${quote(deck.sha256)},${deck.cardCount},${deck.mediaCount},${quote(deck.fileName)},'published',0,unixepoch()*1000,unixepoch()*1000 FROM curricular_units cu WHERE cu.code='FIS1' AND cu.active=1 ON CONFLICT(id) DO UPDATE SET file_name=excluded.file_name,storage_key=excluded.storage_key,storage_state='pending',byte_size=excluded.byte_size,checksum_sha256=excluded.checksum_sha256,card_count=excluded.card_count,media_count=excluded.media_count,updated_at=excluded.updated_at;`);
for (const [index, lesson] of base.organizacao_curricular.aulas.entries()) {
  const count = deckQa.por_aula[lesson.codigo] ?? 0;
  rows.push(`INSERT OR IGNORE INTO material_lessons (id,curricular_unit_id,code,title,lesson_type,sort_order,created_at,updated_at) SELECT ${quote(`lesson-fis1-${lesson.codigo.toLowerCase()}`)},id,${quote(lesson.codigo)},${quote(lesson.titulo)},${quote(lesson.tipo === 'P' ? 'practical' : lesson.tipo === 'T' ? 'theory' : 'other')},${index+1},unixepoch()*1000,unixepoch()*1000 FROM curricular_units WHERE code='FIS1' AND active=1;`);
  if (count) rows.push(`INSERT INTO material_anki_deck_lessons(deck_id,lesson_id,card_count) SELECT ${quote(deck.id)},l.id,${count} FROM material_lessons l JOIN curricular_units cu ON cu.id=l.curricular_unit_id WHERE cu.code='FIS1' AND l.code=${quote(lesson.codigo)} AND EXISTS(SELECT 1 FROM material_anki_decks WHERE id=${quote(deck.id)}) ON CONFLICT(deck_id,lesson_id) DO UPDATE SET card_count=excluded.card_count;`);
}
await writeFile(new URL('../migrations/0120_fisiologia_compendium_materials.sql', import.meta.url), rows.join('\n')+'\n');
await mkdir(new URL('../data/materials/',import.meta.url),{recursive:true});
await writeFile(new URL('../data/materials/fisiologia-compendio-2026.json',import.meta.url),JSON.stringify({academicYear:'2026/2027',files:files.map(file => Object.fromEntries(Object.entries(file).filter(([key])=>key!=='localPath')))},null,2)+'\n');
await writeFile(path.join(root,'Revisao/plataforma_materiais_por_aulas.json'),JSON.stringify({discipline:'Fisiologia I',academicYear:'2026/2027',files},null,2)+'\n');
console.log(`Preparados ${files.length} materiais; ${deck.cardCount} cartões.`);
