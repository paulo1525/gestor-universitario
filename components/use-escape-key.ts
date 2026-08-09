"use client";

import { useEffect, useRef } from "react";

type EscapeEntry = { id: symbol; close: () => void };

const escapeStack: EscapeEntry[] = [];
let listening = false;

function handleEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const current = escapeStack.at(-1);
  if (!current) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  current.close();
}

function startListening() {
  if (listening) return;
  document.addEventListener("keydown", handleEscape, true);
  listening = true;
}

function stopListening() {
  if (!listening || escapeStack.length) return;
  document.removeEventListener("keydown", handleEscape, true);
  listening = false;
}

/** Closes only the top-most active layer when Escape is pressed. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const callback = useRef(onEscape);
  useEffect(() => {
    callback.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const entry: EscapeEntry = { id: Symbol("escape-layer"), close: () => callback.current() };
    escapeStack.push(entry);
    startListening();
    return () => {
      const index = escapeStack.findIndex((candidate) => candidate.id === entry.id);
      if (index >= 0) escapeStack.splice(index, 1);
      stopListening();
    };
  }, [active]);
}
