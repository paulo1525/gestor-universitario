// Split the imported template into balanced top-level blocks, preserving nested
// lists and formatting. The stored card and historical snapshots stay intact.
function blocks(html) {
  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  const result = [];
  let depth = 0, current = "";
  for (const token of tokens) {
    current += token;
    if (/^<\//.test(token)) depth -= 1;
    else if (/^<[a-z]/i.test(token) && !/^<(?:br|hr|img)\b/i.test(token) && !/\/>$/.test(token)) depth += 1;
    if (depth === 0) { if (current.trim()) result.push(current); current = ""; }
  }
  if (current.trim()) result.push(current);
  return result;
}

export function ankiCardPresentation(prompt, solution, imported = true) {
  const fallback = { subject: "", prompt, hint: "", answer: solution, explanation: "", reference: "" };
  if (!imported) return fallback;
  const front = blocks(prompt), back = blocks(solution);
  const deck = front[0]?.match(/^<div>(Neuroanatomia::[^<]+)<\/div>$/);
  const answerIndex = back.findIndex(block => /^<div><div>RESPOSTA<\/div>/i.test(block));
  if (!deck || front.length < 2) return fallback;
  const question = {
    ...fallback,
    subject: deck[1].split("::").at(-1).replace(/^\d+\s+/, ""),
    prompt: front[1],
    hint: front.slice(2).join("").replace(/^Ver pista\s*/i, "").replace(/<div>\s*<\/div>/g, "").trim(),
  };
  if (answerIndex < 0) return question;
  const remaining = back.slice(answerIndex + 1).join("").replace(/^Ver explicação e fonte\s*/i, "");
  const extras = blocks(remaining);
  return {
    ...question,
    answer: back[answerIndex].replace(/^<div><div>RESPOSTA<\/div>/i, "<div>"),
    explanation: extras.slice(0, -1).join(""),
    reference: extras.at(-1) ?? "",
  };
}
