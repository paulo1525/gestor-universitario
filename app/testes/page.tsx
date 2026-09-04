import { QuizHub } from "@/components/quiz-hub";

const TOPIC_MODE_DESCRIPTION = "Concentra a sessão num ou mais temas da unidade curricular.";

export default function QuizzesPage() {
  return <>
    <style>{`
      [role="radiogroup"][aria-label^="Objetivo da sessão de"] > button[title="${TOPIC_MODE_DESCRIPTION}"] {
        display: none;
      }
    `}</style>
    <QuizHub />
  </>;
}
