import assert from "node:assert/strict";
import test from "node:test";
import { isShortAnswerMatch, normalizeShortAnswer } from "../lib/short-answer-match.mjs";

test("normaliza pontuação, acentos, capitalização e espaços", () => {
  assert.equal(normalizeShortAnswer("  Artéria, FEMORAL!!!  "), "arteria femoral");
  assert.equal(isShortAnswerMatch("Artéria, FEMORAL!!!", "artéria femoral"), true);
  assert.equal(isShortAnswerMatch("nervo direito facial", "Nervo facial direito."), true);
  assert.equal(isShortAnswerMatch("C", "Opção C"), true);
  assert.equal(isShortAnswerMatch("A", "Opção A"), true);
  assert.equal(isShortAnswerMatch("OPCAO A", "Opção A"), true);
  assert.equal(isShortAnswerMatch("opção-a!!!", "Opção A"), true);
});

test("tolera flexões, contexto adicional e pequenas gralhas", () => {
  assert.equal(isShortAnswerMatch("as artérias femorais", "artéria femoral"), true);
  assert.equal(isShortAnswerMatch("é o nervo facial direito", "nervo facial direito"), true);
  assert.equal(isShortAnswerMatch("um nervo facial", "nervo facial"), true);
  assert.equal(isShortAnswerMatch("hipotalmo", "hipotálamo"), true);
  assert.equal(isShortAnswerMatch("líquido cefalorraquidiano", "LCR"), true);
  assert.equal(isShortAnswerMatch("SNC", "sistema nervoso central"), true);
});

test("reconhece números escritos, ordinais e numeração romana", () => {
  assert.equal(isShortAnswerMatch("terceiro nervo craniano", "3.º nervo craniano"), true);
  assert.equal(isShortAnswerMatch("nervo craniano XII", "12 nervo craniano"), true);
  assert.equal(isShortAnswerMatch("doze pares cranianos", "12 pares cranianos"), true);
});

test("rejeita mudanças críticas de negação, número e orientação", () => {
  assert.equal(isShortAnswerMatch("não atravessa o canal", "atravessa o canal"), false);
  assert.equal(isShortAnswerMatch("12 pares cranianos", "10 pares cranianos"), false);
  assert.equal(isShortAnswerMatch("artéria esquerda", "artéria direita"), false);
  assert.equal(isShortAnswerMatch("face posterior", "face anterior"), false);
  assert.equal(isShortAnswerMatch("estrutura distal", "estrutura proximal"), false);
  assert.equal(isShortAnswerMatch("via eferente", "via aferente"), false);
  assert.equal(isShortAnswerMatch("sistema parassimpático", "sistema simpático"), false);
});

test("rejeita conceitos diferentes, respostas vazias e reutilização da mesma palavra", () => {
  assert.equal(isShortAnswerMatch("artéria carótida", "nervo facial"), false);
  assert.equal(isShortAnswerMatch("facial", "nervo facial facial"), false);
  assert.equal(isShortAnswerMatch("", "nervo facial"), false);
  assert.equal(isShortAnswerMatch("nervo", ""), false);
});
