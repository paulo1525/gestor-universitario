"use client";

import { useEffect } from "react";

const RANDOM_MODE_DESCRIPTION = "Mistura perguntas para consolidar o que já estudaste.";

export function QuizUiAdjustments() {
  useEffect(() => {
    const applyLabels = () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        '[role="radiogroup"][aria-label^="Objetivo da sessão de"] > button',
      );

      buttons.forEach((button) => {
        if (button.title !== RANDOM_MODE_DESCRIPTION) return;
        const label = button.querySelector("strong");
        if (label?.textContent === "Sessão guiada") label.textContent = "Aleatório";
        button.setAttribute("aria-label", `Aleatório. ${RANDOM_MODE_DESCRIPTION}`);
      });
    };

    applyLabels();
    const observer = new MutationObserver(applyLabels);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
