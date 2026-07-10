export type EstadoTurma = "Validada" | "Em preenchimento" | "Por submeter" | "Exceção pendente";
export type PreferenciaAluno = "Ficar" | "Mudar";

export type Turma = {
  id: number;
  nome: string;
  representante: string;
  alunos: number;
  ficam: number;
  mudam: number;
  estado: EstadoTurma;
};

export type Aluno = {
  id: string;
  nome: string;
  numero: string;
  preferencia: PreferenciaAluno;
  destino: string;
};

const representantes = [
  "Mariana Sousa", "Afonso Lima", "Inês Ribeiro", "Tomás Rocha", "Leonor Alves",
  "Diogo Martins", "Marta Correia", "Gonçalo Teixeira", "Beatriz Ferreira", "Pedro Carvalho",
  "Sofia Moreira", "João Monteiro", "Matilde Neves", "Rodrigo Costa", "Carolina Pinto",
  "Francisco Melo", "Alice Cardoso", "Miguel Araújo", "Diana Lopes", "Tiago Oliveira",
];

const contagens = [16, 15, 16, 17, 15, 16, 14, 17, 16, 15, 16, 17, 15, 16, 14, 17, 16, 15, 18, 16];

export const turmas: Turma[] = contagens.map((alunos, index) => {
  const id = index + 1;
  const mudam = id % 4 === 0 ? 4 : id % 3 === 0 ? 3 : 2;
  let estado: EstadoTurma = "Validada";
  if (id === 19) estado = "Exceção pendente";
  else if (id % 5 === 0) estado = "Por submeter";
  else if (id % 2 === 0) estado = "Em preenchimento";

  return {
    id,
    nome: `Turma ${id}`,
    representante: representantes[index],
    alunos,
    ficam: alunos - mudam,
    mudam,
    estado,
  };
});

const nomes = [
  "Ana Beatriz Silva", "Bernardo Santos Costa", "Catarina Almeida Rocha", "David Manuel Sousa",
  "Eva Maria Ferreira", "Filipe Gonçalves Lima", "Gabriela Neves Pinto", "Henrique João Moreira",
  "Íris Matilde Lopes", "José Miguel Cardoso", "Laura Sofia Martins", "Martim Oliveira Alves",
  "Nádia Isabel Ribeiro", "Óscar Tiago Monteiro", "Patrícia Melo Correia", "Rafael Teixeira Araújo",
  "Sara Leonor Carvalho", "Vicente Duarte Gomes", "Alice Maria Faria", "Tomás André Cunha",
  "Beatriz Reis Pires", "Guilherme Nunes Leal", "Mafalda Castro Dias", "Afonso Viana Coelho",
  "Leonor Campos Matos", "Rodrigo Barros Simões", "Inês Freitas Moura", "Diogo Peixoto Cruz",
  "Carolina Maia Antunes", "Francisco Brito Vale", "Marta Borges Ramos", "Pedro Serra Tavares",
];

export function getTurma(id: number) {
  return turmas.find((turma) => turma.id === id);
}

export function getAlunosDaTurma(turma: Turma): Aluno[] {
  return Array.from({ length: turma.alunos }, (_, index) => {
    const seed = (turma.id * 7 + index) % nomes.length;
    const preferencia: PreferenciaAluno = index < turma.mudam ? "Mudar" : "Ficar";
    const destinoId = turma.id === 20 ? 1 : turma.id + 1;

    return {
      id: `${turma.id}-${index + 1}`,
      nome: nomes[seed],
      numero: `up2025${String(turma.id * 100 + index + 1).padStart(5, "0")}`,
      preferencia,
      destino: preferencia === "Mudar" ? `Turma ${destinoId}` : "",
    };
  });
}

export const regraTurmas = {
  numeroObrigatorio: 20,
  discrepanciaNormal: 3,
  intervaloExemplo: "14–17",
  limiteOperacional: 20,
};
