import type { jsPDF } from "jspdf";
import { MATERIAL_COMPENDIUM_UNITS, resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";

export type MaterialCompendiumType = "multiple_choice" | "short_answer" | "image" | "case";

export type MaterialCompendiumOption = { text: string; isCorrect?: boolean };

export type MaterialCompendiumEntry = {
  id: string;
  lesson?: string;
  topic?: string;
  chapter?: string;
  type: MaterialCompendiumType;
  question: string;
  answer?: string;
  hint?: string;
  source?: string;
  sourceLabel?: string;
  sourcePage?: string;
  sourceQuestion?: string;
  assessment?: string;
  session?: string;
  academicYear?: string;
  imageUrl?: string | null;
  options?: MaterialCompendiumOption[];
};

export type QuestionBankPage = {
  unit?: { id?: string; code?: string; name?: string };
  questions?: Array<{
    id?: string;
    prompt?: string;
    answer?: string;
    indicatedAnswer?: string;
    responseType?: string;
    options?: string | Array<{ text?: string; isCorrect?: boolean }>;
    imageUrl?: string | null;
    topic?: { title?: string; chapterNumber?: string };
    source?: { label?: string; subtopic?: string; academicYear?: string; page?: string; question?: string; assessment?: string; session?: string };
  }>;
  pagination?: { page?: number; totalPages?: number };
  source?: { label?: string } | null;
  error?: string;
};

export type MaterialCompendiumPdfOptions = {
  title?: string;
  subtitle?: string;
  unitCode?: string;
  unitName?: string;
  includeSolutions?: boolean;
  compress?: boolean;
  coverUrl?: string;
  logoUrl?: string;
  loadImage?: (src: string) => Promise<Uint8Array>;
};

const LOGO_URL = "/logo-comissao-curso-fmup-2025-2031-transparente.png";
const COVER_URL = "/neuroanatomia-compendio-cover-v2.png";
const teal = [24, 94, 101] as const;
const gold = [207, 167, 48] as const;
const ink = [30, 36, 42] as const;
const muted = [93, 101, 109] as const;

function pdfText(value: string | undefined | null) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, " -> ")
    .replace(/←/g, " <- ")
    .replace(/\u00a0/g, " ");
}

function responseType(value: string | undefined, options: MaterialCompendiumOption[] | undefined): MaterialCompendiumType {
  if (value === "multiple_choice" && options?.length) return "multiple_choice";
  if (value === "case") return "case";
  return "short_answer";
}

function normalizeOptions(options: string | Array<{ text?: string; isCorrect?: boolean }> | undefined): MaterialCompendiumOption[] | undefined {
  let values: Array<{ text?: string; isCorrect?: boolean }> = Array.isArray(options) ? options : [];
  if (typeof options === "string" && options.trim()) {
    try {
      const parsed = JSON.parse(options) as unknown;
      if (Array.isArray(parsed)) values = parsed.filter((item): item is { text?: string; isCorrect?: boolean } => Boolean(item && typeof item === "object"));
    } catch {
      // The API keeps the source string when no structured options are available.
    }
  }
  const normalized = values.filter((option) => Boolean(option.text)).map((option) => ({ text: option.text || "", isCorrect: option.isCorrect }));
  return normalized.length ? normalized : undefined;
}

function usableAnswer(value: string | undefined) {
  const answer = value?.trim() || "";
  if (!answer || /^(resolução validada fmup\.?|chave indicada na compilação|opção validada conforme a anatomia oficial da fmup\s*\([^)]*\))$/i.test(answer)) return "";
  return answer;
}

function questionBankUrl(unitId: string, page: number) {
  const params = new URLSearchParams({ unitId, page: String(page), pageSize: "50" });
  return `/api/question-bank?${params.toString()}`;
}

/**
 * Reads the already published question-bank contract. The Worker only returns
 * paginated JSON; PDF layout and all binary work remain in the browser.
 */
export async function loadMaterialQuestionBank(unitId: string, fetcher: typeof fetch = fetch): Promise<{ entries: MaterialCompendiumEntry[]; sourceLabel: string; unit?: { id: string; code: string; name: string } }> {
  const requestPage = async (page: number) => {
    const response = await fetcher(questionBankUrl(unitId, page), { cache: "no-store" });
    const data = await response.json() as QuestionBankPage;
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar o banco de questões.");
    return data;
  };

  const first = await requestPage(1);
  const totalPages = Math.max(1, Number(first.pagination?.totalPages || 1));
  const pages: QuestionBankPage[] = [first];
  // Four concurrent pages keep the browser responsive while avoiding a burst
  // of requests against D1 when the bank contains many questions.
  for (let page = 2; page <= totalPages; page += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, offset) => requestPage(page + offset)));
    pages.push(...batch);
  }
  const sourceLabel = pages.find((page) => page.source?.label)?.source?.label || "Banco de questões";
  const unitRecord = pages.find((page) => page.unit?.code || page.unit?.name)?.unit;
  const unit = unitRecord?.id && unitRecord.code && unitRecord.name ? { id: unitRecord.id, code: unitRecord.code, name: unitRecord.name } : undefined;
  const entries = pages.flatMap((page) => (page.questions || []).flatMap((question) => {
    if (!question.id || !question.prompt) return [];
    const source = question.source?.label || sourceLabel;
    const topic = question.source?.subtopic || question.topic?.title || "Tema geral";
    const assessment = question.source?.assessment || "";
    const options = normalizeOptions(question.options);
    const answer = usableAnswer(question.answer) || usableAnswer(question.indicatedAnswer);
    return [{
      id: `question-bank:${question.id}`,
      topic,
      chapter: question.topic?.chapterNumber || "",
      type: responseType(question.responseType, options),
      question: question.prompt,
      answer,
      source,
      sourceLabel: source,
      sourcePage: question.source?.page || "",
      sourceQuestion: question.source?.question || "",
      assessment,
      session: question.source?.session || "",
      academicYear: question.source?.academicYear || "",
      imageUrl: question.imageUrl || null,
      options,
    } satisfies MaterialCompendiumEntry];
  }));
  return { entries, sourceLabel, unit };
}

function imageFormat(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? "JPEG" : "PNG";
}

function imageDimensions(bytes: Uint8Array) {
  // A fixed height makes a mixed set of cards predictable. The source image
  // is still drawn at its native aspect ratio when common PNG/JPEG dimensions
  // are available; unknown formats use a conservative landscape ratio.
  if (imageFormat(bytes) === "PNG" && bytes.length > 24) {
    const width = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16);
    const height = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20);
    if (width && height) return { width, height };
  }
  return { width: 4, height: 3 };
}

function drawLines(pdf: jsPDF, text: string, x: number, y: number, width: number, size: number, lineHeight: number, color: readonly [number, number, number], bold = false, pageBreak?: () => number, pageBottom = Number.POSITIVE_INFINITY) {
  pdf.setFont("helvetica", bold ? "bold" : "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  const lines = pdf.splitTextToSize(pdfText(text), width) as string[];
  let currentY = y;
  lines.forEach((line) => {
    if (currentY + lineHeight > pageBottom && pageBreak) currentY = pageBreak();
    pdf.text(line, x, currentY);
    currentY += lineHeight;
  });
  return currentY;
}

function typeLabel(type: MaterialCompendiumType) {
  if (type === "multiple_choice") return "ESCOLHA MÚLTIPLA";
  if (type === "image") return "IDENTIFICAÇÃO VISUAL";
  if (type === "case") return "CASO CLÍNICO";
  return "RESPOSTA CURTA";
}

/** Builds a uniform, selectable A4 compendium entirely in the browser. */
export async function buildMaterialCompendiumPdf(entries: MaterialCompendiumEntry[], options: MaterialCompendiumPdfOptions = {}): Promise<Uint8Array> {
  const { jsPDF: Pdf } = await import("jspdf");
  const pdf = new Pdf({ unit: "pt", format: "a4", compress: options.compress ?? true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;
  const resolvedUnit = resolveMaterialCompendiumUnit(options.unitCode || options.unitName || options.title) || MATERIAL_COMPENDIUM_UNITS.find((unit) => unit.code === "NEURO");
  const unitLabel = resolvedUnit?.shortTitle || options.unitName || options.unitCode || "Material de estudo";
  const unitName = options.unitName || resolvedUnit?.title || unitLabel;
  const title = options.title || `${unitLabel} · Compêndio personalizado`;
  const subtitle = options.subtitle || "Perguntas selecionadas para leitura e estudo";
  const includeSolutions = options.includeSolutions ?? true;
  const loadImage = options.loadImage || (async (src: string) => {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Imagem indisponível (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  });

  pdf.setProperties({ title: pdfText(title), subject: `Compêndio personalizado de ${pdfText(unitName)}`, creator: "Gestor Universitário" });
  let coverLoaded = false;
  try {
    const cover = await loadImage(options.coverUrl || resolvedUnit?.coverUrl || COVER_URL);
    const dimensions = imageDimensions(cover);
    const scale = Math.max(pageWidth / dimensions.width, pageHeight / dimensions.height);
    const coverWidth = dimensions.width * scale;
    const coverHeight = dimensions.height * scale;
    pdf.addImage(cover, imageFormat(cover), (pageWidth - coverWidth) / 2, (pageHeight - coverHeight) / 2, coverWidth, coverHeight, undefined, "FAST");
    coverLoaded = true;
  } catch {
    pdf.setFillColor(249, 249, 246);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  }
  if (!coverLoaded) {
    pdf.setFillColor(...teal);
    pdf.rect(0, 0, 18, pageHeight, "F");
    pdf.rect(18, 0, pageWidth - 18, 24, "F");
    pdf.setFillColor(228, 239, 237);
    pdf.circle(94, 172, 48, "F");
    pdf.setFillColor(...gold);
    pdf.circle(94, 172, 23, "F");
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...teal);
  pdf.text(`${pdfText(unitLabel).toLocaleUpperCase("pt-PT")}  ·  MATERIAL DE ESTUDO`, margin, 76);
  pdf.setFontSize(26);
  pdf.setTextColor(...ink);
  const titleLines = pdf.splitTextToSize(pdfText(title), contentWidth - 8) as string[];
  const titleY = 170;
  pdf.text(titleLines, margin, titleY, { lineHeightFactor: 1.2 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(...muted);
  const subtitleLines = pdf.splitTextToSize(pdfText(subtitle), contentWidth * 0.82) as string[];
  const subtitleY = Math.max(264, titleY + titleLines.length * 31 + 14);
  pdf.text(subtitleLines, margin, subtitleY, { lineHeightFactor: 1.25 });
  pdf.setFillColor(...gold);
  const detailY = subtitleY + subtitleLines.length * 17 + 28;
  pdf.rect(margin, detailY, contentWidth * 0.64, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...ink);
  pdf.text("Comissão de Curso · FMUP", margin, detailY + 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(...muted);
  pdf.text(`${entries.length} itens · ${includeSolutions ? "com soluções" : "sem soluções"}`, margin, detailY + 66);
  pdf.text("Gestor Universitário · FMUP", margin, pageHeight - 48);
  try {
    const logo = await loadImage(options.logoUrl || LOGO_URL);
    pdf.addImage(logo, imageFormat(logo), pageWidth - margin - 126, 48, 126, 50, undefined, "FAST");
  } catch {
    // The cover remains usable when the optional logo is unavailable offline.
  }

  const addFooter = (pageNumber: number) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text("Comissão de Curso · FMUP", margin, pageHeight - 26);
    pdf.text(`${pageNumber}`, pageWidth - margin, pageHeight - 26, { align: "right" });
  };
  let y = 60;
  const startPage = () => {
    pdf.addPage();
    pdf.setFillColor(249, 249, 246);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setFillColor(...teal);
    pdf.rect(0, 0, pageWidth, 9, "F");
    y = 48;
  };
  const writePageSafe = () => { startPage(); return y; };
  const ensure = (height: number) => {
    if (y + height > pageHeight - 48) startPage();
  };
  startPage();
  for (const entry of entries) {
    const topicLabel = [entry.chapter && `Capítulo ${entry.chapter}`, entry.topic].filter(Boolean).join(" · ");
    ensure(86);
    pdf.setFillColor(235, 243, 241);
    pdf.roundedRect(margin, y, contentWidth, 26, 6, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...teal);
    pdf.text(typeLabel(entry.type), margin + 10, y + 17);
    if (topicLabel) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...muted);
      pdf.text(pdfText(topicLabel), pageWidth - margin - 10, y + 17, { align: "right", maxWidth: contentWidth * 0.55 });
    }
    y += 42;
    y = drawLines(pdf, entry.question, margin, y, contentWidth, 12, 17, ink, true, writePageSafe, pageHeight - 48);
    y += 6;
    if (entry.options?.length) {
      for (const option of entry.options) {
        const prefix = includeSolutions && option.isCorrect ? "✓ " : "○ ";
        y = drawLines(pdf, `${prefix}${option.text}`, margin + 12, y, contentWidth - 12, 10.5, 15, includeSolutions && option.isCorrect ? teal : ink, false, writePageSafe, pageHeight - 48);
        y += 2;
      }
    }
    if (entry.imageUrl) {
      try {
        const image = await loadImage(entry.imageUrl);
        const dimensions = imageDimensions(image);
        const imageWidth = Math.min(260, contentWidth);
        const imageHeight = imageWidth * (dimensions.height / dimensions.width);
        ensure(imageHeight + 18);
        pdf.addImage(image, imageFormat(image), margin, y, imageWidth, Math.min(imageHeight, 190), undefined, "FAST");
        y += Math.min(imageHeight, 190) + 12;
      } catch {
        y = drawLines(pdf, "Imagem indisponível no momento da exportação.", margin + 12, y, contentWidth - 12, 9, 13, muted, false, writePageSafe, pageHeight - 48);
      }
    }
    if (includeSolutions && entry.answer) {
      ensure(45);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...teal);
      pdf.text("Solução", margin + 2, y);
      y += 14;
      y = drawLines(pdf, entry.answer, margin + 12, y, contentWidth - 12, 10.5, 15, ink, false, writePageSafe, pageHeight - 48);
    }
    if (includeSolutions && entry.hint) {
      y += 3;
      y = drawLines(pdf, `Nota: ${entry.hint}`, margin + 12, y, contentWidth - 12, 9.5, 14, muted, false, writePageSafe, pageHeight - 48);
    }
    const metadata = [
      entry.lesson && `Aula ${entry.lesson}`,
      (entry.source || entry.sourceLabel) && `Fonte: ${entry.source || entry.sourceLabel}`,
      entry.assessment && `Avaliação: ${entry.assessment}`,
      entry.session && `Época: ${entry.session}`,
      entry.academicYear && `Ano: ${entry.academicYear}`,
      entry.sourcePage && `p. ${entry.sourcePage}`,
      entry.sourceQuestion && `questão ${entry.sourceQuestion}`,
    ].filter(Boolean).join(" · ");
    if (metadata) {
      y += 5;
      ensure(22);
      y = drawLines(pdf, metadata, margin + 2, y, contentWidth - 4, 8, 11, muted, false, writePageSafe, pageHeight - 48);
    }
    if (y + 14 <= pageHeight - 48) {
      y += 18;
      pdf.setDrawColor(220, 224, 221);
      pdf.line(margin, y - 8, pageWidth - margin, y - 8);
    } else {
      y = pageHeight;
    }
  }
  for (let page = 2; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page);
    addFooter(page - 1);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}
