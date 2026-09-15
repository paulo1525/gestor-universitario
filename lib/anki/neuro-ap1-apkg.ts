import chunk01 from "./neuro-ap1-apkg-chunks/chunk-01";
import chunk02 from "./neuro-ap1-apkg-chunks/chunk-02";
import chunk03 from "./neuro-ap1-apkg-chunks/chunk-03";
import chunk04 from "./neuro-ap1-apkg-chunks/chunk-04";
import chunk05 from "./neuro-ap1-apkg-chunks/chunk-05";
import chunk06 from "./neuro-ap1-apkg-chunks/chunk-06";
import chunk07 from "./neuro-ap1-apkg-chunks/chunk-07";
import chunk08 from "./neuro-ap1-apkg-chunks/chunk-08";
import chunk09 from "./neuro-ap1-apkg-chunks/chunk-09";
import chunk10 from "./neuro-ap1-apkg-chunks/chunk-10";
import chunk11 from "./neuro-ap1-apkg-chunks/chunk-11";

export const NEURO_AP1_ANKI_FILE_NAME = "Neuroanatomia_Aulas_Praticas_AP1.apkg";
export const NEURO_AP1_CARD_COUNT = 295;
const NEURO_AP1_APKG_BASE64 = [chunk01, chunk02, chunk03, chunk04, chunk05, chunk06, chunk07, chunk08, chunk09, chunk10, chunk11].join("");

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function neuroAp1ApkgBlob(): Blob {
  const bytes = decodeBase64(NEURO_AP1_APKG_BASE64);
  const copied = bytes.slice();
  return new Blob([copied.buffer], { type: "application/zip" });
}
