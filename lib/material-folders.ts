export const VIDEO_FOLDERS = ['video-theory', 'video-practical', 'video-other'] as const;
export type VideoFolder = typeof VIDEO_FOLDERS[number];

/** Identify the file itself before applying teaching-resource categories. */
export function materialVideoFolder(item: { mimeType?: string | null; fileName?: string | null; title?: string | null; resourceCategory?: string | null; lessonCode?: string | null }): VideoFolder | null {
  if (!item.mimeType?.startsWith('video/') && !/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(item.fileName || '')) return null;
  if (item.resourceCategory === 'theory') return 'video-theory';
  if (item.resourceCategory === 'practical' || item.resourceCategory === 'tutorials') return 'video-practical';
  const code = /\b(A[TP])\s*0*\d+/i.exec(`${item.title || ''} ${item.lessonCode || ''}`)?.[1].toUpperCase();
  return code === 'AT' ? 'video-theory' : code === 'AP' ? 'video-practical' : 'video-other';
}

export const MATERIAL_FOLDER_GROUPS = [
  { key: 'study', sections: ['sebentas', 'compendiums', 'notes', 'summaries', 'anki'] },
  { key: 'lessons', sections: ['videos', 'slides', 'theory', 'practical', 'tutorials', 'seminars'] },
  { key: 'reference', sections: ['bibliography', 'exams', 'assessment', 'information', 'support', 'other'] },
] as const;

/** Video subfolders count towards a single, discoverable parent folder. */
export function materialFolderCount(section: string, counts: Readonly<Record<string, number>>) {
  return section === 'videos' ? VIDEO_FOLDERS.reduce((total, key) => total + (counts[key] || 0), 0) : counts[section] || 0;
}
