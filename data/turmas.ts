export type EstadoTurma = "Em preenchimento" | "Submetida" | "Em revisão" | "Reaberta" | "Validada" | "Publicada";
export type PreferenciaAluno = "Ficar" | "Mudar";

export type Turma = { id: number; nome: string; representante: string; alunos: number; ficam: number; mudam: number; estado: EstadoTurma };
export type Aluno = { id: string; nome: string; numero: string; preferencia: PreferenciaAluno; locked?: boolean; isSelf?: boolean; destinations?: number[] };

export const turmas: Turma[] = Array.from({ length: 20 }, (_, index) => {
  const id = index + 1;
  return { id, nome: `Turma ${id}`, representante: id === 17 ? "Roger" : "Por atribuir", alunos: 0, ficam: 0, mudam: 0, estado: "Em preenchimento" };
});

export function getTurma(id: number) { return turmas.find((turma) => turma.id === id); }
export function getAlunosDaTurma(turma: Turma): Aluno[] { void turma; return []; }
export const regraTurmas = { numeroObrigatorio: 20, discrepanciaNormal: 3, intervaloExemplo: "14–17", limiteOperacional: 30 };
