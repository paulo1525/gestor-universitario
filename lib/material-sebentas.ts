type SebentaItem = {
  title: string;
  source?: { id?: string; title?: string; edition?: string } | null;
  description?: string;
  pages?: { physicalStart?: string; physicalEnd?: string };
};

/** Collections share the same source identity used to group bibliography. */
export function groupSebentas<T extends SebentaItem>(items: T[], otherTitle: string, chapterOrder: boolean) {
  const groups = new Map<string, { key: string; title: string; items: T[] }>();
  for (const item of items) {
    const source = item.source;
    const key = source?.title ? source.id || `${source.title}|${source.edition || ""}` : "";
    const title = source?.title ? [source.title, source.edition].filter(Boolean).join(" · ") : otherTitle;
    if (!groups.has(key)) groups.set(key, { key, title, items: [] });
    groups.get(key)!.items.push(item);
  }
  const order = (item: T) => /\b(?:sebenta|versão) integral\b/i.test(item.title) ? 0 : Number(/\bcap[íi]tulo\s+(\d+)\b/i.exec(item.title)?.[1] || Infinity);
  return [...groups.values()].map(group => ({
    ...group,
    items: chapterOrder ? [...group.items].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title, "pt-PT", { numeric: true })) : group.items,
  })).sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.title.localeCompare(b.title, "pt-PT", { numeric: true }));
}

/** The assessment is already visible in the collection heading; keep construction status. */
export function sebentaDisplayTitle(item: SebentaItem) {
  return /frequ[êe]ncia/i.test(item.source?.title || "")
    ? item.title.replace(/\s*[·—-]\s*\d+\.\s*ª\s*frequ[êe]ncia(\s*\(em constru[çc][ãa]o\))?$/i, "$1")
    : item.title;
}

export function sebentaPageCount(item: SebentaItem) {
  const start = Number(item.pages?.physicalStart), end = Number(item.pages?.physicalEnd);
  if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) return end - start + 1;
  return Number(/\b(\d+)\s+p[áa]ginas\b/i.exec(item.description || "")?.[1]) || null;
}

export function sebentaChapterRange(item: SebentaItem) {
  const match = /cap[íi]tulos\s+(\d+)\s+a\s+(\d+)/i.exec(item.description || "");
  return match ? { first: Number(match[1]), last: Number(match[2]) } : null;
}
