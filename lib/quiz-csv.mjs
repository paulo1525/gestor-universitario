/** Campos aceites no ficheiro CSV de perguntas. */
export const QUIZ_CSV_HEADERS = [
  "unit_code",
  "theme",
  "question",
  "option_1",
  "option_2",
  "option_3",
  "option_4",
  "correct_option",
  "explanation",
  "difficulty",
  "image_url",
];

const HEADER_ALIASES = {
  unit_code: "unitCode",
  unit: "unitCode",
  uc: "unitCode",
  unidade_curricular: "unitCode",
  unit_id: "unitId",
  theme: "theme",
  tema: "theme",
  question: "question",
  pergunta: "question",
  option_1: "option1",
  opcao_1: "option1",
  opção_1: "option1",
  option_2: "option2",
  opcao_2: "option2",
  opção_2: "option2",
  option_3: "option3",
  opcao_3: "option3",
  opção_3: "option3",
  option_4: "option4",
  opcao_4: "option4",
  opção_4: "option4",
  correct_option: "correctOption",
  correct_answer: "correctOption",
  resposta_correta: "correctOption",
  opcao_correta: "correctOption",
  opção_correta: "correctOption",
  explanation: "explanation",
  explicacao: "explanation",
  explicação: "explanation",
  difficulty: "difficulty",
  dificuldade: "difficulty",
  image_url: "imageUrl",
  imagem_url: "imageUrl",
};
const MAX_IMAGE_BYTES = 1024 * 1024;

function normaliseHeader(value) {
  return value
    .trim()
    .toLocaleLowerCase("pt-PT")
    .replace(/[\s-]+/g, "_");
}

function clean(value) {
  return String(value ?? "").trim();
}

function chooseDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/**
 * Lê um CSV sem depender de uma biblioteca no browser/Worker. Mantém quebras
 * de linha dentro de células entre aspas e devolve um erro claro para aspas
 * não terminadas.
 */
export function parseCsv(text, delimiter = chooseDelimiter(text)) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else quoted = false;
      } else value += character;
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("O CSV tem aspas por fechar.");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((items) => items.some((item) => clean(item)));
}

function difficulty(value) {
  const normalised = clean(value).toLocaleLowerCase("pt-PT");
  if (["fácil", "facil", "easy", "1"].includes(normalised)) return "easy";
  if (["difícil", "dificil", "hard", "3"].includes(normalised)) return "hard";
  if (["média", "media", "médio", "medio", "medium", "2", ""].includes(normalised)) return "medium";
  return null;
}

function correctOption(value) {
  const normalised = clean(value).toUpperCase();
  if (/^[1-4]$/.test(normalised)) return Number(normalised) - 1;
  if (/^[A-D]$/.test(normalised)) return normalised.charCodeAt(0) - 65;
  return null;
}

function validImageReference(value) {
  if (/^\/(?!\/)/.test(value)) return !value.includes("\\") && value.length <= 1000;
  const image = value.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  return Boolean(image && Math.floor(image[1].length * 3 / 4) <= MAX_IMAGE_BYTES);
}

/**
 * Valida o formato usado pela importação. Um ficheiro pode identificar a UC
 * pelo código (`unit_code`) ou pelo identificador (`unit_id`).
 */
export function validateQuizCsv(text, { units = [], selectedUnitId = "", selectedUnitCode = "" } = {}) {
  let matrix;
  try {
    matrix = parseCsv(text);
  } catch (error) {
    return { rows: [], validRows: [], errors: [{ row: 0, field: "csv", message: error instanceof Error ? error.message : "Não foi possível ler o CSV." }], headers: [] };
  }
  if (!matrix.length) return { rows: [], validRows: [], errors: [{ row: 0, field: "csv", message: "O ficheiro CSV está vazio." }], headers: [] };

  const headers = matrix[0].map(normaliseHeader);
  const fields = headers.map((header) => HEADER_ALIASES[header] ?? null);
  const errors = [];
  if (!fields.includes("unitCode") && !fields.includes("unitId") && !selectedUnitId && !selectedUnitCode) errors.push({ row: 1, field: "unit_code", message: "Selecione a unidade curricular ou inclua a coluna unit_code/unit_id." });
  for (const required of ["theme", "question", "option1", "option2", "correctOption"]) {
    if (!fields.includes(required)) errors.push({ row: 1, field: required, message: `Falta a coluna obrigatória ${required}.` });
  }
  if (errors.length) return { rows: [], validRows: [], errors, headers };

  const unitIds = new Set(units.map((unit) => String(unit.id)));
  const unitCodes = new Set(units.map((unit) => clean(unit.code).toLocaleUpperCase("pt-PT")));
  const rows = matrix.slice(1).map((cells, offset) => {
    const values = {};
    fields.forEach((field, index) => { if (field) values[field] = clean(cells[index]); });
    const options = [values.option1, values.option2, values.option3, values.option4].filter(Boolean);
    return {
      row: offset + 2,
      unitId: values.unitId || selectedUnitId,
      unitCode: values.unitCode || selectedUnitCode,
      theme: values.theme || "",
      question: values.question || "",
      options,
      correctOption: correctOption(values.correctOption),
      explanation: values.explanation || "",
      difficulty: difficulty(values.difficulty),
      imageUrl: values.imageUrl || "",
    };
  });

  for (const item of rows) {
    const unitKnown = !units.length || (item.unitId ? unitIds.has(item.unitId) : unitCodes.has(item.unitCode.toLocaleUpperCase("pt-PT")));
    if (!item.unitId && !item.unitCode) errors.push({ row: item.row, field: "unit_code", message: "Indique a unidade curricular." });
    else if (!unitKnown) errors.push({ row: item.row, field: "unit_code", message: "A unidade curricular não foi encontrada." });
    if (!item.theme) errors.push({ row: item.row, field: "theme", message: "Indique o tema." });
    if (!item.question) errors.push({ row: item.row, field: "question", message: "Indique a pergunta." });
    if (item.options.length < 2 || item.options.length > 4) errors.push({ row: item.row, field: "options", message: "Indique entre 2 e 4 opções." });
    if (item.correctOption === null || item.correctOption >= item.options.length) errors.push({ row: item.row, field: "correct_option", message: "A opção correta não corresponde a uma opção preenchida." });
    if (!item.explanation) errors.push({ row: item.row, field: "explanation", message: "Inclua uma explicação para a resposta correta." });
    if (!item.difficulty) errors.push({ row: item.row, field: "difficulty", message: "A dificuldade deve ser fácil, média ou difícil." });
    if (item.imageUrl && !validImageReference(item.imageUrl)) errors.push({ row: item.row, field: "image_url", message: "Use um caminho interno iniciado por / ou data:image JPEG, PNG ou WebP até 1 MiB." });
  }
  const invalidRows = new Set(errors.filter((error) => error.row > 1).map((error) => error.row));
  return { rows, validRows: rows.filter((item) => !invalidRows.has(item.row)), errors, headers };
}

export function quizCsvTemplate() {
  const headers = QUIZ_CSV_HEADERS.filter((header) => header !== "unit_code");
  return `${headers.join(",")}\nAnatomia,Qual é o maior órgão do corpo humano?,Pele,Fígado,Coração,Pulmão,1,A pele é o maior órgão do corpo humano.,easy,\n`;
}
