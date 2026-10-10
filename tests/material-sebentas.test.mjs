import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSebentas, sebentaDisplayTitle, sebentaPageCount, sebentaChapterRange } from '../lib/material-sebentas.ts';

const source = { id: 'collection', title: 'Sebenta integral — 1.ª frequência', edition: '2026/2027' };
const chapter = number => ({ title: `Capítulo ${number} — Tema · 1.ª frequência`, source });
const integral = { title: 'Sebenta integral — 1.ª frequência (em construção)', source, description: '274 páginas. Em construção: reúne atualmente os capítulos 1 a 6; ainda não cobre toda a matéria.' };

test('Sebentas agrupam a integral antes dos capítulos por ordem natural e preservam outras coleções', () => {
  const other = { title: 'Sebenta anterior' };
  const input = [chapter(10), other, chapter(2), integral, chapter(1)];
  const groups = groupSebentas(input, 'Outras sebentas', true);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Sebenta integral — 1.ª frequência · 2026/2027');
  assert.deepEqual(groups[0].items.map(item => item.title), [integral.title, chapter(1).title, chapter(2).title, chapter(10).title]);
  assert.deepEqual(groups[1].items, [other]);
  assert.equal(input[0].title, chapter(10).title);
  assert.deepEqual(groupSebentas([chapter(2), integral], 'Outras sebentas', false)[0].items.map(item => item.title), [chapter(2).title, integral.title]);
});

test('Filtros podem mostrar apenas um capítulo sem misturar edições ou inventar a integral', () => {
  const edition = { ...chapter(1), source: { ...source, id: 'other-edition', edition: '2025/2026' } };
  const groups = groupSebentas([chapter(2), edition], 'Outras sebentas', true);
  assert.equal(groups.length, 2);
  assert.equal(groups.flatMap(group => group.items).length, 2);
  assert.equal(sebentaDisplayTitle(chapter(2)), 'Capítulo 2 — Tema');
  assert.equal(sebentaDisplayTitle(integral), 'Sebenta integral (em construção)');
  assert.equal(sebentaDisplayTitle({ title: integral.title }), integral.title);
});

test('Metadados compactos mantêm páginas e capítulos, incluindo ficheiros anteriores', () => {
  assert.equal(sebentaPageCount({ pages: { physicalStart: '1', physicalEnd: '39' } }), 39);
  assert.equal(sebentaPageCount(integral), 274);
  assert.equal(sebentaPageCount({ description: 'Sebenta com 556 páginas.' }), 556);
  assert.equal(sebentaPageCount({ pages: { physicalStart: '9', physicalEnd: '2' } }), null);
  assert.deepEqual(sebentaChapterRange(integral), { first: 1, last: 6 });
  assert.equal(sebentaChapterRange(chapter(1)), null);
});
