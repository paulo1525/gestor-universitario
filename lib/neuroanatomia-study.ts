import content from "@/lib/study/neuroanatomia-ap1.json";

export type StudyTextPart = { text: string; bold?: boolean; questionIds?: string[]; tone?: string };
export type StudySourceReference = { source: string; pages: number[]; heading: string };
export type StudyParagraph = { id?: string; parts: StudyTextPart[]; sourcePages: number[]; sourceRefs?: StudySourceReference[] };
export type StudyImage = { id: string; src: string; width: number; height: number; alt: string; caption: string; source: string };
export type StudyQuestion = { id: string; number: string; prompt: string; answer: string; answerParts?: { label: string; text: string }[]; sourcePage: number; scope?: string };
export type StudyTopic = { id: string; number: string; title: string; outline: string[]; syllabusPages: number[]; paragraphs: StudyParagraph[]; questionIds?: string[]; imageIds: string[]; children: StudyTopic[]; source: string };
export type StudySection = { id: string; title: string; topics: StudyTopic[]; orientation?: StudyParagraph[] };

export const neuroSections: StudySection[] = content.sections;
export const neuroQuestions: Record<string, StudyQuestion> = content.questions;
export const neuroImages: Record<string, StudyImage> = content.images;
export const neuroStudySources = [
  "Sumário oficial de 2027 — Aula prática 1: Introdução à Neuroanatomia. Neurocrânio (estrutura e títulos).",
  "Gray’s Anatomy, 42.ª edição — capítulos 34, 36, 38, 42 e 46 (neurocrânio; tradução de excertos).",
  "Nolte’s The Human Brain, 7.ª edição — capítulos 1, 3, 4, 5, 9, 10, 12 e 22 (conceitos fundamentais; tradução de excertos).",
  "Lippincott Illustrated Reviews: Neuroscience, 2.ª edição — capítulo 10 (componentes funcionais dos nervos cranianos).",
  "Compêndio com soluções (enunciados e respostas; página indicada em cada pergunta).",
  "Gray’s Anatomy, 42.ª edição (figuras identificadas nas legendas).",
  "Prática Ossos e Anatomia I (imagens identificadas nas legendas).",
];
export function flattenStudyTopics(topics: StudyTopic[]): StudyTopic[] {
  return topics.flatMap((topic) => [topic, ...flattenStudyTopics(topic.children)]);
}

export const neuroParagraphs = new Map(neuroSections.flatMap((section) => [
  ...(section.orientation ?? []).map((paragraph, index) => [paragraph.id ?? `${section.id}-orientation-${index}`, paragraph.parts.map((part) => part.text).join("")] as const),
  ...flattenStudyTopics(section.topics).flatMap((topic) => topic.paragraphs.map((paragraph, index) => [paragraph.id ?? `${topic.id}-p${index + 1}`, paragraph.parts.map((part) => part.text).join("")] as const)),
]));
neuroParagraphs.set("document", "");
