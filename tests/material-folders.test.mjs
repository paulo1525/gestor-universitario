import assert from 'node:assert/strict';
import test from 'node:test';
import { MATERIAL_FOLDER_GROUPS, materialFolderCount, materialVideoFolder, VIDEO_FOLDERS } from '../lib/material-folders.ts';

test('videos take precedence over presentation categories and preserve lesson types', () => {
  assert.equal(materialVideoFolder({ mimeType: 'video/mp4', resourceCategory: 'theory' }), 'video-theory');
  assert.equal(materialVideoFolder({ fileName: 'AP11.mp4', title: 'AP11 - Órbita' }), 'video-practical');
  assert.equal(materialVideoFolder({ mimeType: 'video/mp4', resourceCategory: 'practical', title: 'Complemento 01' }), 'video-practical');
  assert.equal(materialVideoFolder({ mimeType: 'video/webm', title: 'Recording' }), 'video-other');
  assert.equal(materialVideoFolder({ mimeType: 'application/pdf', resourceCategory: 'theory' }), null);
  assert.equal(materialVideoFolder({ fileName: 'Slides.pptx', resourceCategory: 'practical' }), null);
});

test('only populated folders appear, with a single video parent and study guides first', () => {
  const counts = { sebentas: 1, compendiums: 2, 'video-theory': 2, 'video-practical': 27, anki: 1, exams: 0, notes: 0 };
  const groups = MATERIAL_FOLDER_GROUPS.map(g=>({ ...g, sections: g.sections.filter(s=>materialFolderCount(s,counts)>0) })).filter(g=>g.sections.length);
  assert.deepEqual(groups.map(g=>g.key), ['study','lessons']);
  assert.deepEqual(groups[0].sections, ['sebentas','compendiums','anki']);
  assert.deepEqual(groups[1].sections, ['videos']);
  assert.equal(materialFolderCount('videos',counts),29);
  assert.deepEqual(VIDEO_FOLDERS.filter(f=>materialFolderCount(f,counts)>0),['video-theory','video-practical']);
  assert.equal(materialFolderCount('videos',{}),0);
});
