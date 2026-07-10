import { notFound } from "next/navigation";
import { TurmaDetail } from "@/components/turma-detail";
import { getAlunosDaTurma, getTurma, turmas } from "@/data/turmas";

export function generateStaticParams() {
  return turmas.map((turma) => ({ id: String(turma.id) }));
}

export default async function TurmaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const turma = getTurma(Number(id));
  if (!turma) notFound();
  return <TurmaDetail turma={turma} alunosIniciais={getAlunosDaTurma(turma)} />;
}
