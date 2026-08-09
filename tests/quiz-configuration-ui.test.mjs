import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quizHub = await readFile(new URL("../components/quiz-hub.tsx", import.meta.url), "utf8");
const quizManagement = await readFile(new URL("../components/quiz-management.tsx", import.meta.url), "utf8");

test("o configurador oferece apenas testes de 15, 30 ou 50 perguntas suportados pelo banco", () => {
  assert.match(quizHub, /QUIZ_QUESTION_COUNTS:\s*readonly number\[\]\s*=\s*\[15, 30, 50\]/);
  assert.match(quizHub, /readQuizPreferences\(\)\.questionCount \?\? DEFAULT_QUESTION_COUNT/);
  assert.match(quizHub, /QUIZ_QUESTION_COUNTS\.filter\(\(count\) => count <= availableQuestionCount\)/);
  assert.match(quizHub, /supportedCounts\.at\(-1\) \?\? DEFAULT_QUESTION_COUNT/);
  assert.match(quizHub, /availableQuestionCount < DEFAULT_QUESTION_COUNT/);
  assert.match(quizHub, /Menos de 15 perguntas disponíveis/);
  assert.match(quizHub, /São necessárias pelo menos 15 para iniciar um teste/);
  assert.doesNotMatch(quizHub, /Array\.from\(\{ length: effectiveMaximum - 9 \}/);
  assert.doesNotMatch(quizHub, /pelo menos 10 perguntas disponíveis/);
});

test("o formato de resposta e o modo de resposta curta ficam nas preferências do configurador", () => {
  assert.match(quizHub, /type AnswerFormat = "multiple_choice" \| "short_answer"/);
  assert.match(quizHub, /type ShortAnswerMode = "type_and_check" \| "reveal_and_self_assess"/);
  assert.match(quizHub, /answerFormat: preferences\.answerFormat \?\? "multiple_choice"/);
  assert.match(quizHub, /shortAnswerMode: preferences\.shortAnswerMode \?\? "type_and_check"/);
  assert.match(quizHub, /saveQuizPreferences\(\{ unitId: selectedUnitId, mode: selectedMode, topicIds: selectedTopicIds, questionCount, answerFormat, shortAnswerMode \}\)/);
  for (const label of ["Escolha múltipla", "Resposta curta", "Escrever e verificar", "Revelar e autoavaliar"]) {
    assert.match(quizHub, new RegExp(label));
  }
});

test("a tentativa de resposta curta compara localmente e só regista a autoavaliação final", () => {
  assert.match(quizHub, /function normalizeShortAnswer\(value: string\)/);
  assert.match(quizHub, /normalize\("NFD"\)/);
  assert.match(quizHub, /function isShortAnswerMatch\(value: string, expected: string\)/);
  assert.match(quizHub, /answerFormat === "multiple_choice" \? <div className=\{styles\.options\}/);
  assert.match(quizHub, /O sistema considera \{shortDraft\.proposal \? "certo" : "errado"\}\./);
  assert.match(quizHub, /const option = correct \? correctOption : incorrectOption/);
  assert.match(quizHub, /onSelect\(option\.id\)/);
  for (const label of ["Verificar", "Ver resposta", "Resposta correta", "Acertei", "Errei"]) {
    assert.match(quizHub, new RegExp(label));
  }
});

test("o gestor apresenta dificuldades no plural sem alterar os valores internos", () => {
  assert.match(quizManagement, /value === "easy" \? "Fáceis" : value === "hard" \? "Difíceis" : "Normais"/);
  assert.match(quizManagement, /<option value="easy">Fáceis<\/option><option value="medium">Normais<\/option><option value="hard">Difíceis<\/option>/);
  assert.match(quizManagement, /type Difficulty = "easy" \| "medium" \| "hard"/);
});

test("a configuração atual pode ser baixada como APKG com imagens", () => {
  assert.match(quizHub, /fetch\(`\/api\/quizzes\/export\?\$\{params\.toString\(\)\}`/);
  assert.match(quizHub, /await import\("@\/lib\/anki"\)/);
  assert.match(quizHub, /buildQuizExportApkg\(data as QuizExportPayload\)/);
  assert.match(quizHub, /Baixar para Anki \(\.apkg\)/);
  assert.match(quizHub, /result\.mediaCount/);
});
