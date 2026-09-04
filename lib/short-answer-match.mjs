const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "que", "uma", "um", "opcao", "resposta",
]);

const NEGATIONS = new Set(["ausencia", "ausente", "jamais", "nao", "nem", "nunca", "sem"]);
const PHRASE_ALIASES = new Map([
  ["snc", "sistema nervoso central"], ["snp", "sistema nervoso periferico"],
  ["lcr", "liquido cefalorraquidiano"], ["liquor", "liquido cefalorraquidiano"],
  ["subst cinzenta", "substancia cinzenta"], ["subst branca", "substancia branca"],
]);
const NUMBER_WORDS = new Map([
  ["zero", "0"], ["primeiro", "1"], ["primeira", "1"],
  ["dois", "2"], ["duas", "2"], ["segundo", "2"], ["segunda", "2"],
  ["tres", "3"], ["terceiro", "3"], ["terceira", "3"], ["quatro", "4"], ["quarto", "4"], ["quarta", "4"],
  ["cinco", "5"], ["quinto", "5"], ["quinta", "5"], ["seis", "6"], ["sexto", "6"], ["sexta", "6"],
  ["sete", "7"], ["setimo", "7"], ["setima", "7"], ["oito", "8"], ["oitavo", "8"], ["oitava", "8"],
  ["nove", "9"], ["nono", "9"], ["nona", "9"], ["dez", "10"], ["decimo", "10"], ["decima", "10"],
  ["onze", "11"], ["decimo primeiro", "11"], ["decima primeira", "11"],
  ["doze", "12"], ["decimo segundo", "12"], ["decima segunda", "12"],
]);
const ROMAN_NUMERALS = new Map([
  ["i", "1"], ["ii", "2"], ["iii", "3"], ["iv", "4"], ["v", "5"], ["vi", "6"],
  ["vii", "7"], ["viii", "8"], ["ix", "9"], ["x", "10"], ["xi", "11"], ["xii", "12"],
]);
const CANONICAL_TOKENS = new Map([
  ["direita", "direito"], ["direitas", "direito"], ["direitos", "direito"], ["esquerda", "esquerdo"], ["esquerdas", "esquerdo"], ["esquerdos", "esquerdo"],
  ["anteriormente", "anterior"], ["posteriormente", "posterior"], ["superiores", "superior"], ["inferiores", "inferior"],
  ["mediais", "medial"], ["laterais", "lateral"], ["proximais", "proximal"], ["distais", "distal"], ["dorsais", "dorsal"], ["ventrais", "ventral"],
  ["rostrais", "rostral"], ["caudais", "caudal"], ["superficiais", "superficial"], ["profundos", "profundo"], ["profundas", "profundo"],
  ["aferentes", "aferente"], ["eferentes", "eferente"], ["simpaticos", "simpatico"], ["simpaticas", "simpatico"],
  ["parassimpaticos", "parassimpatico"], ["parassimpaticas", "parassimpatico"],
  ["presente", "presenca"], ["presentes", "presenca"], ["ausente", "ausencia"], ["ausentes", "ausencia"],
]);
const OPPOSITE_GROUPS = [
  ["direito", "esquerdo"], ["anterior", "posterior"], ["superior", "inferior"], ["medial", "lateral"],
  ["proximal", "distal"], ["dorsal", "ventral"], ["rostral", "caudal"], ["superficial", "profundo"],
  ["aferente", "eferente"], ["simpatico", "parassimpatico"], ["flexao", "extensao"],
  ["aumento", "diminuicao"], ["presenca", "ausencia"],
];

function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
}

export function normalizeShortAnswer(value) {
  let normalized = plain(value).replace(/[^a-z0-9\s.,]/g, " ").replace(/[.,](?!\d)/g, " ");
  for (const [alias, expansion] of PHRASE_ALIASES) normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, "g"), expansion);
  for (const [word, number] of [...NUMBER_WORDS].sort((a, b) => b[0].length - a[0].length)) normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), number);
  normalized = normalized.replace(/\b(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|x|v|i)\b/g, (roman) => ROMAN_NUMERALS.get(roman) ?? roman);
  return normalized.replace(/[^a-z0-9\s.,]/g, " ").replace(/\s+/g, " ").trim();
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left, right) {
  if (left === right) return 1;
  const length = Math.max(left.length, right.length);
  return length ? 1 - editDistance(left, right) / length : 0;
}

function stem(token) {
  token = CANONICAL_TOKENS.get(token) ?? token;
  if (token.length > 7 && token.endsWith("mente")) token = token.slice(0, -5);
  if (token.length > 5 && token.endsWith("oes")) token = `${token.slice(0, -3)}ao`;
  else if (token.length > 4 && token.endsWith("s")) token = token.slice(0, -1);
  if (token.length > 6 && /(?:ado|ada|ido|ida)$/.test(token)) token = token.slice(0, -3);
  return CANONICAL_TOKENS.get(token) ?? token;
}

function rawTokens(value) { return value.split(" ").filter(Boolean).map(stem); }
function contentTokens(value) {
  const tokens = rawTokens(value), filtered = tokens.filter((token) => !STOP_WORDS.has(token));
  return filtered.length ? filtered : tokens;
}
function numberSignature(value) { return value.match(/\b\d+(?:[.,]\d+)?\b/g)?.map((item) => item.replace(",", ".")) ?? []; }
function negationSignature(value) { return rawTokens(value).some((token) => NEGATIONS.has(token)); }
function hasOppositeConflict(answer, reference) {
  const answerSet = new Set(rawTokens(answer)), referenceSet = new Set(rawTokens(reference));
  return OPPOSITE_GROUPS.some((group) => group.some((term) => referenceSet.has(term)) && group.some((term) => answerSet.has(term) && !referenceSet.has(term)));
}

// Each word is aligned only once, so one similar word cannot satisfy several concepts.
function alignedCoverage(source, target) {
  if (!source.length || !target.length) return 0;
  const candidates = [];
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) candidates.push({ sourceIndex, targetIndex, score: similarity(source[sourceIndex], target[targetIndex]) });
  candidates.sort((left, right) => right.score - left.score);
  const usedSource = new Set(), usedTarget = new Set();
  let total = 0;
  for (const candidate of candidates) {
    if (usedSource.has(candidate.sourceIndex) || usedTarget.has(candidate.targetIndex)) continue;
    usedSource.add(candidate.sourceIndex); usedTarget.add(candidate.targetIndex); total += candidate.score;
  }
  return total / source.length;
}

function bigramDice(left, right) {
  const compactLeft = left.replace(/\s/g, ""), compactRight = right.replace(/\s/g, "");
  if (compactLeft.length < 2 || compactRight.length < 2) return compactLeft === compactRight ? 1 : 0;
  const rightPairs = new Map();
  for (let index = 0; index < compactRight.length - 1; index += 1) { const pair = compactRight.slice(index, index + 2); rightPairs.set(pair, (rightPairs.get(pair) ?? 0) + 1); }
  let overlap = 0;
  for (let index = 0; index < compactLeft.length - 1; index += 1) { const pair = compactLeft.slice(index, index + 2), count = rightPairs.get(pair) ?? 0; if (count > 0) { overlap += 1; rightPairs.set(pair, count - 1); } }
  return (2 * overlap) / (compactLeft.length + compactRight.length - 2);
}

export function isShortAnswerMatch(value, expected) {
  const answer = normalizeShortAnswer(value), reference = normalizeShortAnswer(expected);
  if (!answer || !reference) return false;
  if (answer === reference) return true;
  const answerChoice = answer.replace(/^(?:opcao|resposta)\s+/, ""), referenceChoice = reference.replace(/^(?:opcao|resposta)\s+/, "");
  if (/^[a-d]$/.test(answerChoice) && answerChoice === referenceChoice) return true;
  if (numberSignature(answer).join("|") !== numberSignature(reference).join("|")) return false;
  if (negationSignature(answer) !== negationSignature(reference) || hasOppositeConflict(answer, reference)) return false;
  const answerTokens = contentTokens(answer), referenceTokens = contentTokens(reference);
  const referenceCoverage = alignedCoverage(referenceTokens, answerTokens), answerPrecision = alignedCoverage(answerTokens, referenceTokens);
  if (referenceTokens.length === 1 && referenceCoverage >= .8 && answerPrecision >= .62) return true;
  if (referenceCoverage >= .84 && answerPrecision >= .64) return true;
  const compactSimilarity = similarity(answer.replace(/\s/g, ""), reference.replace(/\s/g, ""));
  return compactSimilarity >= .86 || (bigramDice(answer, reference) >= .84 && referenceCoverage >= .76);
}
