import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quizHub = await readFile(new URL("../components/quiz-hub.tsx", import.meta.url), "utf8");
const quizManagement = await readFile(new URL("../components/quiz-management.tsx", import.meta.url), "utf8");
const appShell = await readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("o configurador oferece sessões curtas e testes longos suportados pelo banco", () => {
  assert.match(quizHub, /QUIZ_QUESTION_COUNTS:\s*readonly number\[\]\s*=\s*\[5, 10, 15, 30, 50\]/);
  assert.match(quizHub, /readQuizPreferences\(\)\.questionCount \?\? DEFAULT_QUESTION_COUNT/);
  assert.match(quizHub, /QUIZ_QUESTION_COUNTS\.filter\(\(count\) => count <= availableQuestionCount\)/);
  assert.match(quizHub, /supportedCounts\.at\(-1\) \?\? DEFAULT_QUESTION_COUNT/);
  assert.match(quizHub, /availableQuestionCount < DEFAULT_QUESTION_COUNT/);
  assert.match(quizHub, /Menos de 5 perguntas disponíveis/);
  assert.match(quizHub, /São necessárias pelo menos 5 para iniciar uma sessão/);
  assert.doesNotMatch(quizHub, /Array\.from\(\{ length: effectiveMaximum - 9 \}/);
  assert.doesNotMatch(quizHub, /pelo menos 10 perguntas disponíveis/);
});

test("a sessão MediLoop mantém poucos controlos durante a resposta", () => {
  for (const label of ["Sessão guiada", "Matéria nova", "Só erros", "Por tópico"]) {
    assert.match(quizHub, new RegExp(label));
  }
  for (const label of ["Chute", "Dúvida", "Provável", "Certeza", "Falhei", "Difícil", "Bom", "Fácil"]) {
    assert.doesNotMatch(quizHub, new RegExp(label));
  }
  assert.doesNotMatch(quizHub, /confidenceByQuestion|ratingByQuestion/);
  assert.match(quizHub, /aria-keyshortcuts=\{String\(index \+ 1\)\}/);
  assert.match(quizHub, /aria-keyshortcuts="ArrowRight Enter"/);
  assert.match(quizHub, /focusMode=\{screen === "attempt"\}/);
  assert.match(appShell, /app-shell--focus/);
  assert.match(globals, /\.app-shell--focus \.main-content/);
});

test("o formato de resposta e o modo de resposta curta ficam nas preferências do configurador", () => {
  assert.match(quizHub, /type AnswerFormat = "multiple_choice" \| "short_answer"/);
  assert.match(quizHub, /type ShortAnswerMode = "type_and_check" \| "reveal_and_self_assess"/);
  assert.match(quizHub, /answerFormat: preferences\.answerFormat \?\? "multiple_choice"/);
  assert.match(quizHub, /shortAnswerMode: preferences\.shortAnswerMode \?\? "type_and_check"/);
  assert.match(quizHub, /saveQuizPreferences\(\{ unitId: selectedUnitId, mode: selectedMode, topicIds: selectedTopicIds, questionCount, answerFormat, shortAnswerMode, timed \}\)/);
  for (const label of ["Escolha múltipla", "Resposta curta", "Escrever e verificar", "Revelar e autoavaliar"]) {
    assert.match(quizHub, new RegExp(label));
  }
});

test("a tentativa de resposta curta usa apenas o corretor local e mantém a decisão final do estudante", () => {
  assert.match(quizHub, /import \{ isShortAnswerMatch \} from "@\/lib\/short-answer-match\.mjs"/);
  assert.match(quizHub, /answerFormat === "multiple_choice" \? <div className=\{styles\.options\}/);
  assert.match(quizHub, /isShortAnswerMatch\(shortDraft\.value, correctOption\.text\)/);
  assert.doesNotMatch(quizHub, /\/evaluate|GEMINI|Gemma/);
  assert.match(quizHub, /const option = correct \? correctOption : incorrectOption/);
  assert.match(quizHub, /onSelect\(option\.id\)/);
  for (const label of ["Verificar", "Ver resposta", "Resposta correta", "Certa", "Errada", "Confirmar", "Marcar certa", "Marcar errada"]) {
    assert.match(quizHub, new RegExp(label));
  }
});

test("os temas estão sempre disponíveis e filtram qualquer modo de sessão", () => {
  assert.doesNotMatch(quizHub, /selectedMode === "topic" && <div className=\{styles\.topicPicker\}/);
  assert.match(quizHub, /const activeTopicIds = selectedTopicIds/);
  assert.match(quizHub, /if \(selectedTopicIds\.length\) params\.set\("topicIds"/);
  assert.match(quizHub, /if \(selectedTopicIds\.length\) return topics\.filter/);
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
