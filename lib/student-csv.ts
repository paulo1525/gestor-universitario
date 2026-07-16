import { studentStatusFromCode, type StudentSpecialStatus, type StudentStatusCode } from "./student-status.ts";

export type CsvStudent = {
  turma: number;
  nome: string;
  n_mecanografico: string;
  codigo_estatuto: StudentStatusCode;
  specialStatus: StudentSpecialStatus;
};

function row(line: string, separator: string) {
  const values: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === separator && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

export function parseStudentCsv(source: string): CsvStudent[] {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error("O ficheiro CSV está vazio.");
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = row(lines[0], separator).map(value => value.toLocaleLowerCase().trim());
  const expected = ["turma", "nome", "n_mecanografico", "codigo_estatuto"];
  if (headers.length !== expected.length || expected.some((header) => !headers.includes(header))) throw new Error("O CSV deve ter apenas as colunas turma, nome, n_mecanografico e codigo_estatuto.");
  const classIndex = headers.indexOf("turma"), nameIndex = headers.indexOf("nome"), numberIndex = headers.indexOf("n_mecanografico"), statusIndex = headers.indexOf("codigo_estatuto");
  const students = lines.slice(1).map((line, index) => {
    const values = row(line, separator);
    const turma = Number(values[classIndex]), specialStatus = studentStatusFromCode(values[statusIndex]);
    if (values.length !== expected.length || !Number.isInteger(turma) || turma < 1 || turma > 20) throw new Error(`Linha ${index + 2}: indique uma turma entre 1 e 20.`);
    if (!values[nameIndex] || !/^\d{9}$/.test(values[numberIndex])) throw new Error(`Linha ${index + 2}: indique nome e n_mecanografico com 9 algarismos.`);
    if (!specialStatus) throw new Error(`Linha ${index + 2}: codigo_estatuto deve ser N, TE, A ou O.`);
    return { turma, nome: values[nameIndex], n_mecanografico: values[numberIndex], codigo_estatuto: values[statusIndex].trim().toLocaleUpperCase("pt-PT") as StudentStatusCode, specialStatus };
  });
  if (!students.length) throw new Error("O CSV não contém estudantes.");
  if (students.length > 500) throw new Error("O CSV pode conter, no máximo, 500 estudantes por importação.");
  if (new Set(students.map(student => student.n_mecanografico)).size !== students.length) throw new Error("O CSV contém números mecanográficos duplicados.");
  return students;
}
