import type { jsPDF } from "jspdf";
import { neuroSections, neuroImages, neuroStudySources, type StudyParagraph, type StudyTopic } from "@/lib/neuroanatomia-study";
import { sanitizeRichTextHtml } from "@/lib/announcement-content";
import type { AnnotationColor, StudyAnnotation } from "@/lib/study-annotations";

export type PdfTextRun = { text: string; bold?: boolean; color?: AnnotationColor };
const highlightColors: Record<AnnotationColor, [number, number, number]> = {
  yellow: [255, 238, 156], green: [204, 238, 212], blue: [205, 228, 251], pink: [248, 214, 231],
};

/** Exact quote matching prevents a revised paragraph from highlighting unrelated text. */
export function paragraphPdfRuns(paragraph: StudyParagraph, id: string, annotations: StudyAnnotation[]): PdfTextRun[] {
  const text = paragraph.parts.map((part) => part.text).join("");
  const marks = annotations.filter((item) => item.paragraphId === id && item.quote && item.start >= 0 && item.end > item.start && item.end <= text.length && text.slice(item.start, item.end) === item.quote);
  let offset = 0;
  return paragraph.parts.flatMap((part) => {
    const start = offset, end = start + part.text.length;
    offset = end;
    const boundaries = [...new Set([start, end, ...marks.flatMap((item) => [Math.max(start, Math.min(end, item.start)), Math.max(start, Math.min(end, item.end))])])].sort((a, b) => a - b);
    return boundaries.slice(0, -1).map((from, index) => {
      const to = boundaries[index + 1];
      const mark = marks.find((item) => item.start <= from && item.end >= to);
      return { text: text.slice(from, to), bold: part.bold, ...(mark ? { color: mark.color } : {}) };
    });
  });
}

// Helvetica's WinAnsi characters cover Portuguese. Normalize typographical marks
// and mathematical arrows explicitly rather than emitting missing PDF glyphs.
function pdfText(value: string) {
  return value.normalize("NFC").replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, " -> ").replace(/←/g, " <- ").replace(/\u00a0/g, " ");
}

function notePdfRuns(note: string): PdfTextRun[] {
  const safe = sanitizeRichTextHtml(note);
  let boldDepth = 0;
  return (safe.match(/<[^>]+>|[^<]+/g) ?? []).flatMap((token): PdfTextRun[] => {
    if (/^<(?:strong|b|h2|h3)>$/i.test(token)) { boldDepth++; return []; }
    if (/^<\/(?:strong|b|h2|h3)>$/i.test(token)) { boldDepth = Math.max(0, boldDepth - 1); return /h[23]/i.test(token) ? [{ text: "\n" }] : []; }
    if (/^<li>$/i.test(token)) return [{ text: "\n• " }];
    if (/^<br\s*\/?>$|^<\/(?:p|div|li)>$/i.test(token)) return [{ text: "\n" }];
    if (token.startsWith("<")) return [];
    const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
    return [{ text: token.replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (_, name: string) => entities[name.toLowerCase()]), bold: boldDepth > 0 }];
  });
}

type PdfOptions = { loadImage?: (src: string) => Promise<Uint8Array>; compress?: boolean };

/** Generates selectable text and vectors locally; private annotations never leave the device. */
export async function buildStudyPdf(annotations: StudyAnnotation[], options: PdfOptions = {}): Promise<jsPDF> {
  const { jsPDF: Pdf } = await import("jspdf");
  const pdf = new Pdf({ unit: "pt", format: "a4", compress: options.compress ?? true });
  pdf.setProperties({ title: "Neuroanatomia - Aula Prática 1", subject: "Introdução à Neuroanatomia e Neurocrânio", creator: "Gestor Universitário" });
  const pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48, width = pageWidth - margin * 2, bottom = pageHeight - 48;
  let y = 62;
  const newPage = () => { pdf.addPage(); y = 55; };
  const ensure = (height: number) => { if (y + height > bottom) newPage(); };
  const setFont = (size: number, bold = false) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); };

  const flow = (runs: PdfTextRun[], size = 11, lineHeight = 17, spacing = 7) => {
    let line: PdfTextRun[] = [], lineWidth = 0;
    const measure = (run: PdfTextRun) => { setFont(size, run.bold); return pdf.getTextWidth(run.text); };
    const flush = () => {
      if (!line.length) return;
      ensure(lineHeight);
      let x = margin;
      for (const run of line) {
        const runWidth = measure(run);
        if (run.color) { pdf.setFillColor(...highlightColors[run.color]); pdf.rect(x, y - size * .86, runWidth, size * 1.25, "F"); }
        pdf.setTextColor(36, 40, 45);
        pdf.text(run.text, x, y);
        x += runWidth;
      }
      y += lineHeight;
      line = []; lineWidth = 0;
    };
    const add = (text: string, run: PdfTextRun) => {
      const token = { ...run, text };
      const tokenWidth = measure(token);
      if (lineWidth + tokenWidth > width && line.length) flush();
      if (!line.length && /^ +$/.test(text)) return;
      if (tokenWidth <= width) { line.push(token); lineWidth += tokenWidth; return; }
      // A long URL or unbroken word in a personal note must wrap too.
      for (const character of text) {
        const item = { ...run, text: character }, characterWidth = measure(item);
        if (lineWidth + characterWidth > width) flush();
        line.push(item); lineWidth += characterWidth;
      }
    };
    for (const run of runs) {
      for (const token of pdfText(run.text).match(/\n|[^\S\n]+|[^\s]+/g) ?? []) {
        if (token === "\n") { flush(); continue; }
        add(token.replace(/\s/g, " "), run);
      }
    }
    flush(); y += spacing;
  };
  const heading = (title: string, size: number, gap = 10) => {
    setFont(size, true);
    const lines: string[] = pdf.splitTextToSize(pdfText(title), width);
    ensure(lines.length * (size + 5) + 38);
    y += gap;
    flow([{ text: title, bold: true }], size, size + 5, 7);
  };
  const paragraph = (p: StudyParagraph, prefix: string, index: number) => {
    const id = p.id ?? (prefix.endsWith("-orientation") ? `${prefix}-${index}` : `${prefix}-p${index + 1}`);
    return flow(paragraphPdfRuns(p, id, annotations));
  };
  const loadImage = options.loadImage ?? (async (src: string) => {
    const response = await fetch(src, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Não foi possível incluir uma figura no PDF. Tente novamente.");
    return new Uint8Array(await response.arrayBuffer());
  });
  const usedImages = new Set<string>();
  const topic = async (item: StudyTopic) => {
    const depth = item.number.split(".").length;
    heading(`${item.number}  ${item.title}`, depth === 1 ? 15 : depth === 2 ? 12.5 : 11.5, depth === 1 ? 15 : 7);
    item.paragraphs.forEach((p, index) => paragraph(p, item.id, index));
    for (const id of item.imageIds) {
      if (usedImages.has(id)) continue;
      const figure = neuroImages[id];
      if (!figure) continue;
      usedImages.add(id);
      const bytes = await loadImage(figure.src);
      const scale = Math.min(width / figure.width, 480 / figure.height);
      const imageWidth = figure.width * scale, imageHeight = figure.height * scale;
      setFont(9);
      const caption = `${figure.caption}\n${figure.source}`;
      const captionLines: string[] = pdf.splitTextToSize(pdfText(caption), width);
      ensure(imageHeight + captionLines.length * 13 + 20);
      pdf.addImage(bytes, /\.jpe?g$/i.test(figure.src) ? "JPEG" : "PNG", margin + (width - imageWidth) / 2, y, imageWidth, imageHeight, id, "FAST");
      y += imageHeight + 13;
      flow([{ text: caption }], 9, 13, 12);
    }
    for (const child of item.children) await topic(child);
  };

  heading("Neuroanatomia", 24, 0);
  flow([{ text: "Aula Prática 1", bold: true }], 13, 19, 2);
  flow([{ text: "Introdução à Neuroanatomia · Neurocrânio" }], 11, 17, 12);
  for (const [index, section] of neuroSections.entries()) {
    if (index > 0) newPage();
    heading(`${index + 1 === 1 ? "I" : "II"}. ${section.title}`, 18, 5);
    (section.orientation ?? []).forEach((p, i) => paragraph(p, `${section.id}-orientation`, i));
    for (const item of section.topics) await topic(item);
  }
  heading("Bibliografia", 15, 14);
  neuroStudySources.forEach((source) => flow([{ text: source }], 9, 14, 4));

  if (annotations.length) {
    newPage(); heading("Apontamentos pessoais", 18, 0);
    for (const [index, annotation] of annotations.entries()) {
      heading(`Apontamento ${index + 1}`, 11, 8);
      if (annotation.quote) flow([{ text: annotation.quote, color: annotation.color }], 10, 16, 7);
      if (annotation.note) flow(notePdfRuns(annotation.note));
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); setFont(8);
    pdf.setTextColor(105, 110, 117);
    pdf.text("Neuroanatomia · Aula Prática 1", margin, 28);
    pdf.setDrawColor(222, 224, 226); pdf.setLineWidth(.5);
    pdf.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    pdf.text("Gestor Universitário", margin, pageHeight - 21);
    pdf.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 21, { align: "right" });
  }
  return pdf;
}

export async function downloadStudyPdf(annotations: StudyAnnotation[]) {
  const pdf = await buildStudyPdf(annotations);
  await pdf.save("neuroanatomia-aula-pratica-1.pdf", { returnPromise: true });
}
