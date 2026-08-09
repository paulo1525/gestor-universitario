import { buildMcqApkg, MAX_ANKI_IMAGE_BYTES, type AnkiApkgResult, type AnkiMcqDeckInput, type AnkiMcqImage } from "./apkg.ts";

export type QuizExportOption = {
  id: string;
  text: string;
  position: number;
};

export type QuizExportQuestion = {
  id: string;
  topicId: string;
  topicTitle: string;
  prompt: string;
  imageUrl: string | null;
  explanation: string;
  difficulty: string;
  options: QuizExportOption[];
  correctOptionId: string;
};

export type QuizExportPayload = {
  deck: {
    name: string;
    unitId: string;
    unitCode: string;
    unitName: string;
    mode: string;
    questionCount: number;
  };
  questions: QuizExportQuestion[];
};

export type QuizImageResolver = (imageUrl: string, question: QuizExportQuestion) => Promise<AnkiMcqImage | null>;

export type QuizExportApkgOptions = Pick<AnkiMcqDeckInput, "deckId" | "modelId" | "fileName" | "generatedAt"> & {
  resolveImage?: QuizImageResolver;
  fetcher?: typeof fetch;
};

const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function base64Bytes(base64: string): Uint8Array {
  if (typeof atob !== "function") throw new Error("Este ambiente não disponibiliza descodificação base64; fornece resolveImage.");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function imageExtension(contentType: string): string {
  if (/image\/png/i.test(contentType)) return "png";
  if (/image\/(?:jpeg|jpg)/i.test(contentType)) return "jpg";
  if (/image\/webp/i.test(contentType)) return "webp";
  throw new Error(`Formato de imagem não suportado no APKG: ${contentType || "desconhecido"}.`);
}

function fileNameFromUrl(imageUrl: string, questionId: string, contentType: string): string {
  try {
    const path = new URL(imageUrl, "https://gestoruniversitario.local").pathname;
    const candidate = decodeURIComponent(path.split("/").pop() || "");
    if (/\.(?:png|jpe?g|webp)$/i.test(candidate)) return candidate;
  } catch { /* Usa um nome derivado do ID abaixo. */ }
  return `${questionId}.${imageExtension(contentType)}`;
}

export async function defaultQuizImageResolver(imageUrl: string, question: QuizExportQuestion, fetcher: typeof fetch = fetch): Promise<AnkiMcqImage> {
  const dataImage = imageUrl.match(DATA_IMAGE);
  if (dataImage) {
    const bytes = base64Bytes(dataImage[2]);
    if (bytes.length > MAX_ANKI_IMAGE_BYTES) throw new Error(`A imagem da pergunta ${question.id} excede o limite de 1 MiB.`);
    return { fileName: `${question.id}.${dataImage[1].toLowerCase() === "jpeg" ? "jpg" : dataImage[1].toLowerCase()}`, bytes, alt: `Imagem da pergunta: ${question.topicTitle}` };
  }
  const response = await fetcher(imageUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Não foi possível obter a imagem da pergunta ${question.id}.`);
  const advertisedSize = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(advertisedSize) && advertisedSize > MAX_ANKI_IMAGE_BYTES) throw new Error(`A imagem da pergunta ${question.id} excede o limite de 1 MiB.`);
  const contentType = response.headers.get("content-type") || "";
  imageExtension(contentType);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_ANKI_IMAGE_BYTES) throw new Error(`A imagem da pergunta ${question.id} excede o limite de 1 MiB.`);
  return { fileName: fileNameFromUrl(imageUrl, question.id, contentType), bytes, alt: `Imagem da pergunta: ${question.topicTitle}` };
}

export async function quizExportToAnkiDeck(payload: QuizExportPayload, options: QuizExportApkgOptions = {}): Promise<AnkiMcqDeckInput> {
  if (!payload.deck?.name || !Array.isArray(payload.questions) || payload.questions.length === 0) throw new Error("O payload de exportação de Testes está vazio ou é inválido.");
  if (payload.deck.questionCount !== payload.questions.length) throw new Error("A contagem do baralho não coincide com as perguntas exportadas.");
  const resolver = options.resolveImage || ((imageUrl, question) => defaultQuizImageResolver(imageUrl, question, options.fetcher));
  const cards = await Promise.all(payload.questions.map(async (question, index) => {
    const orderedOptions = [...question.options].sort((left, right) => left.position - right.position);
    if (orderedOptions.length < 2 || orderedOptions.length > 4) throw new Error(`A pergunta ${index + 1} não tem entre duas e quatro opções.`);
    if (!orderedOptions.some((option) => option.id === question.correctOptionId)) throw new Error(`A pergunta ${index + 1} não identifica uma opção correta válida.`);
    const image = question.imageUrl ? await resolver(question.imageUrl, question) : null;
    if (image && image.bytes.byteLength > MAX_ANKI_IMAGE_BYTES) throw new Error(`A imagem da pergunta ${question.id} excede o limite de 1 MiB.`);
    return {
      id: question.id,
      promptHtml: question.prompt,
      options: orderedOptions.map((option) => ({ html: escapeHtml(option.text), isCorrect: option.id === question.correctOptionId })),
      explanationHtml: question.explanation,
      image,
      sourceHtml: `${escapeHtml(payload.deck.unitCode)} · ${escapeHtml(question.topicTitle)}`,
      tags: [payload.deck.unitCode, question.topicTitle, question.difficulty, payload.deck.mode],
    };
  }));
  return { deckName: payload.deck.name, descriptionHtml: `${escapeHtml(payload.deck.unitName)} · Exportado do Gestor Universitário`, cards, deckId: options.deckId, modelId: options.modelId, fileName: options.fileName, generatedAt: options.generatedAt };
}

export async function buildQuizExportApkg(payload: QuizExportPayload, options: QuizExportApkgOptions = {}): Promise<AnkiApkgResult> {
  return buildMcqApkg(await quizExportToAnkiDeck(payload, options));
}
