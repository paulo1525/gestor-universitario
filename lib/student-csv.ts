export type CsvStudent = { nome: string; n_mecanografico: string };

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
  if (headers.length !== 2 || !headers.includes("nome") || !headers.includes("n_mecanografico")) throw new Error("O CSV deve ter apenas as colunas nome e n_mecanografico.");
  const nameIndex = headers.indexOf("nome"), numberIndex = headers.indexOf("n_mecanografico");
  const students = lines.slice(1).map((line, index) => {
    const values = row(line, separator);
    if (values.length !== 2 || !values[nameIndex] || !/^\d{9}$/.test(values[numberIndex])) throw new Error(`Linha ${index + 2}: indique nome e n_mecanografico com 9 algarismos.`);
    return { nome: values[nameIndex], n_mecanografico: values[numberIndex] };
  });
  if (!students.length) throw new Error("O CSV não contém estudantes.");
  if (new Set(students.map(student => student.n_mecanografico)).size !== students.length) throw new Error("O CSV contém números mecanográficos duplicados.");
  return students;
}
