export type AnnotationColor = "yellow" | "green" | "blue" | "pink";
export type StudyAnnotation = {
  id: string;
  paragraphId: string;
  start: number;
  end: number;
  quote: string;
  note: string;
  color: AnnotationColor;
  revision: number;
  updatedAt: number;
};
export type AnnotationDraft = Omit<StudyAnnotation, "updatedAt">;
