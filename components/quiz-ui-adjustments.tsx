"use client";

import { useEffect, useRef } from "react";

const RANDOM_MODE_DESCRIPTION = "Mistura perguntas para consolidar o que já estudaste.";
const LEARNING_SECTION_ENABLED = false;
const NEURO_UNIT_CODE = "NEURO";
const NEURO_DEFAULT_QUESTION_COUNT = "30";

function selectedUnitCode(): string {
  const expanded = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="true"]')]
    .find((button) => button.closest('section[aria-label="Disciplinas"]'));
  return expanded?.querySelector("span")?.textContent?.trim().toUpperCase() ?? "";
}

function buttonByStrongText(container: Element, text: string): HTMLButtonElement | null {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.querySelector("strong")?.textContent?.trim() === text) ?? null;
}

function configureNeuroDefaults() {
  const count = document.querySelector('select[aria-label="Número de perguntas e duração da sessão"]') as HTMLSelectElement | null;
  if (count && [...count.options].some((option) => option.value === NEURO_DEFAULT_QUESTION_COUNT) && count.value !== NEURO_DEFAULT_QUESTION_COUNT) {
    count.value = NEURO_DEFAULT_QUESTION_COUNT;
    count.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const untimed = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find((input) => input.closest("label")?.textContent?.includes("Sem limite de tempo"));
  if (untimed?.checked) untimed.click();

  const formatGroup = document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Formato de resposta"]');
  const shortAnswer = formatGroup ? buttonByStrongText(formatGroup, "Resposta curta") : null;
  if (shortAnswer && shortAnswer.getAttribute("aria-checked") !== "true") shortAnswer.click();

  const shortModeGroup = document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Modo de resposta curta"]');
  const typeAndCheck = shortModeGroup ? buttonByStrongText(shortModeGroup, "Escrever e verificar") : null;
  if (typeAndCheck && typeAndCheck.getAttribute("aria-checked") !== "true") typeAndCheck.click();
}

function applyNeuroPresentation(isNeuro: boolean) {
  const formatGroup = document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Formato de resposta"]');
  const formatSection = formatGroup?.closest<HTMLElement>("section");
  if (formatSection) formatSection.style.display = isNeuro ? "none" : "";
}

function showExportStatus(button: HTMLButtonElement, message: string, isError = false) {
  const footer = button.closest("footer");
  if (!footer) return;
  let status = footer.querySelector<HTMLElement>('[data-neuro-anki-status="true"]');
  if (!status) {
    status = document.createElement("small");
    status.dataset.neuroAnkiStatus = "true";
    status.setAttribute("role", isError ? "alert" : "status");
    status.style.display = "block";
    status.style.marginTop = "6px";
    footer.appendChild(status);
  }
  status.setAttribute("role", isError ? "alert" : "status");
  status.textContent = message;
  window.setTimeout(() => status?.remove(), isError ? 5000 : 3500);
}

async function exportCompleteNeuroDeck(button: HTMLButtonElement) {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const { NEURO_AP1_ANKI_FILE_NAME, NEURO_AP1_CARD_COUNT, neuroAp1ApkgBlob } = await import("@/lib/anki/neuro-ap1-apkg");
    const downloadUrl = URL.createObjectURL(neuroAp1ApkgBlob());
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = NEURO_AP1_ANKI_FILE_NAME;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    showExportStatus(button, `Baralho completo criado: ${NEURO_AP1_CARD_COUNT} cartões.`);
  } catch (error) {
    console.error(error);
    showExportStatus(button, "Não foi possível criar o baralho Anki. Tenta novamente.", true);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

export function QuizUiAdjustments() {
  const lastSelectedUnit = useRef("");

  useEffect(() => {
    const apply = () => {
      const modeButtons = document.querySelectorAll<HTMLButtonElement>(
        '[role="radiogroup"][aria-label^="Objetivo da sessão de"] > button',
      );
      modeButtons.forEach((button) => {
        if (button.title !== RANDOM_MODE_DESCRIPTION) return;
        const label = button.querySelector("strong");
        const titleNode = label?.firstChild;
        if (titleNode?.nodeType === Node.TEXT_NODE && titleNode.textContent?.trim() === "Sessão guiada") titleNode.textContent = "Aleatório";
        const ariaLabel = `Aleatório. ${RANDOM_MODE_DESCRIPTION}`;
        if (button.getAttribute("aria-label") !== ariaLabel) button.setAttribute("aria-label", ariaLabel);
      });

      const learningLink = document.querySelector<HTMLElement>('a[href="/testes/aprender"]');
      if (learningLink) learningLink.style.display = LEARNING_SECTION_ENABLED ? "" : "none";

      const unitCode = selectedUnitCode();
      const isNeuro = unitCode === NEURO_UNIT_CODE;
      applyNeuroPresentation(isNeuro);
      if (unitCode && unitCode !== lastSelectedUnit.current) {
        lastSelectedUnit.current = unitCode;
        if (isNeuro) window.setTimeout(configureNeuroDefaults, 0);
      }

      const exportButtons = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .filter((button) => button.textContent?.includes("Baixar para Anki"));
      exportButtons.forEach((button) => {
        if (button.dataset.neuroExportIntercept === "true") return;
        button.dataset.neuroExportIntercept = "true";
        button.addEventListener("click", (event) => {
          if (selectedUnitCode() !== NEURO_UNIT_CODE) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          void exportCompleteNeuroDeck(button);
        }, true);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "aria-checked"] });
    return () => observer.disconnect();
  }, []);

  return null;
}
