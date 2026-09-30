export type PdfHighlightRect = { x: number; y: number; width: number; height: number };
export type HighlightEdge = "start" | "end";
type TextPoint = { node: Text; offset: number };
type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function textNodes(layer: HTMLElement): Text[] {
  const walker = layer.ownerDocument.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.length && !node.parentElement?.closest(".endOfContent")) nodes.push(node);
  }
  return nodes;
}

function indexOfPoint(nodes: Text[], point: TextPoint): number {
  let index = 0;
  for (const node of nodes) {
    if (node === point.node) return index + Math.min(node.length, point.offset);
    index += node.length;
  }
  return -1;
}

function pointAtIndex(nodes: Text[], index: number): TextPoint | null {
  let remaining = Math.max(0, index);
  for (const node of nodes) {
    if (remaining <= node.length) return { node, offset: remaining };
    remaining -= node.length;
  }
  const last = nodes.at(-1);
  return last ? { node: last, offset: last.length } : null;
}

/** Resolve a pointer to the PDF text, including when the pointer is over a handle. */
export function pdfTextPoint(layer: HTMLElement, x: number, y: number): TextPoint | null {
  const doc = layer.ownerDocument as CaretDocument;
  const caret = doc.caretPositionFromPoint?.(x, y);
  const fallback = !caret ? doc.caretRangeFromPoint?.(x, y) : null;
  const node = caret?.offsetNode ?? fallback?.startContainer;
  const offset = caret?.offset ?? fallback?.startOffset ?? 0;
  if (node?.nodeType === Node.TEXT_NODE && layer.contains(node)) return { node: node as Text, offset };

  // The bar is above the text layer. Find the nearest text run, then its
  // character boundary; character measurements are limited to that run.
  let closest: Text | null = null, distance = Infinity;
  const measure = doc.createRange();
  for (const candidate of textNodes(layer)) {
    measure.selectNodeContents(candidate);
    const rect = measure.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const next = dx * dx + dy * dy * 4;
    if (next < distance) { closest = candidate; distance = next; }
  }
  if (!closest) return null;
  let bestOffset = 0;
  distance = Infinity;
  for (let index = 0; index < closest.length; index++) {
    measure.setStart(closest, index);
    measure.setEnd(closest, index + 1);
    const rect = measure.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const next = dx * dx + dy * dy * 4;
    if (next < distance) { distance = next; bestOffset = x < (rect.left + rect.right) / 2 ? index : index + 1; }
  }
  return { node: closest, offset: bestOffset };
}

/** Recover endpoints from saved page coordinates, including existing highlights. */
export function pdfRangeFromRects(layer: HTMLElement, page: HTMLElement, rects: PdfHighlightRect[]): Range | null {
  const first = rects[0], last = rects.at(-1);
  if (!first || !last) return null;
  const bounds = page.getBoundingClientRect();
  const start = pdfTextPoint(layer, bounds.left + first.x * bounds.width + 0.2, bounds.top + (first.y + first.height / 2) * bounds.height);
  const end = pdfTextPoint(layer, bounds.left + (last.x + last.width) * bounds.width - 0.2, bounds.top + (last.y + last.height / 2) * bounds.height);
  if (!start || !end) return null;
  const range = layer.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range.collapsed ? null : range;
}

/** Move one endpoint, keeping the other fixed and at least one character selected. */
export function movePdfRangeEdge(layer: HTMLElement, original: Range, edge: HighlightEdge, point: TextPoint): Range | null {
  const nodes = textNodes(layer);
  const start = indexOfPoint(nodes, { node: original.startContainer as Text, offset: original.startOffset });
  const end = indexOfPoint(nodes, { node: original.endContainer as Text, offset: original.endOffset });
  const target = indexOfPoint(nodes, point);
  if (start < 0 || end < 0 || target < 0) return null;
  const nextStart = pointAtIndex(nodes, edge === "start" ? Math.max(0, Math.min(target, end - 1)) : start);
  const nextEnd = pointAtIndex(nodes, edge === "end" ? Math.max(start + 1, target) : end);
  if (!nextStart || !nextEnd) return null;
  const range = layer.ownerDocument.createRange();
  range.setStart(nextStart.node, nextStart.offset);
  range.setEnd(nextEnd.node, nextEnd.offset);
  return range;
}

export function stepPdfRangeEdge(layer: HTMLElement, range: Range, edge: HighlightEdge, direction: number): Range | null {
  const nodes = textNodes(layer);
  const index = indexOfPoint(nodes, { node: (edge === "start" ? range.startContainer : range.endContainer) as Text, offset: edge === "start" ? range.startOffset : range.endOffset });
  const point = pointAtIndex(nodes, index + direction);
  return point ? movePdfRangeEdge(layer, range, edge, point) : null;
}

export function pdfRangeGeometry(range: Range, page: HTMLElement): { rects: PdfHighlightRect[]; selectedText: string } | null {
  const bounds = page.getBoundingClientRect();
  const raw = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 1 && rect.height < bounds.height * 0.1);
  const lines: PdfHighlightRect[] = [];
  for (const rect of raw) {
    const next = { x: clamp((rect.left - bounds.left) / bounds.width), y: clamp((rect.top - bounds.top) / bounds.height), width: rect.width / bounds.width, height: rect.height / bounds.height };
    const line = lines.find((candidate) => Math.abs(candidate.y + candidate.height / 2 - (next.y + next.height / 2)) < Math.max(candidate.height, next.height) * 0.5);
    if (!line) lines.push(next);
    else {
      const right = Math.max(line.x + line.width, next.x + next.width), bottom = Math.max(line.y + line.height, next.y + next.height);
      line.x = Math.min(line.x, next.x); line.y = Math.min(line.y, next.y);
      line.width = right - line.x; line.height = bottom - line.y;
    }
  }
  if (lines.length > 80) return null;
  const rects = lines.sort((a, b) => a.y - b.y || a.x - b.x).map((rect) => ({ ...rect, width: Math.min(rect.width, 1 - rect.x), height: Math.min(rect.height, 1 - rect.y) }));
  // PDF text runs do not always contain spaces or line breaks between them.
  // Recover those separators from the positions of the selected fragments.
  let excerpt = "", previous: DOMRect | null = null;
  const fragment = page.ownerDocument.createRange();
  const layer = page.querySelector<HTMLElement>(".textLayer");
  for (const node of layer ? textNodes(layer) : []) {
    if (!range.intersectsNode(node)) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;
    fragment.setStart(node, start); fragment.setEnd(node, end);
    const rect = fragment.getBoundingClientRect();
    if (previous && (Math.abs(rect.top - previous.top) > Math.max(rect.height, previous.height) * 0.5 || rect.left - previous.right > rect.height * 0.15)) excerpt += " ";
    excerpt += node.data.slice(start, end);
    previous = rect;
  }
  const selectedText = (excerpt || range.toString()).replace(/\s+/g, " ").trim().slice(0, 2000);
  return rects.length && selectedText ? { rects, selectedText } : null;
}

export function resizePdfArea(rect: PdfHighlightRect, edge: HighlightEdge, point: { x: number; y: number }): PdfHighlightRect {
  const minimum = 0.002;
  const left = edge === "start" ? Math.min(clamp(point.x), rect.x + rect.width - minimum) : rect.x;
  const top = edge === "start" ? Math.min(clamp(point.y), rect.y + rect.height - minimum) : rect.y;
  const right = edge === "end" ? Math.max(clamp(point.x), rect.x + minimum) : rect.x + rect.width;
  const bottom = edge === "end" ? Math.max(clamp(point.y), rect.y + minimum) : rect.y + rect.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
