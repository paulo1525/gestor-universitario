const ADJACENT_STATES = Object.freeze({
  received: Object.freeze(["received", "transcribing"]),
  transcribing: Object.freeze(["received", "transcribing", "reviewing"]),
  reviewing: Object.freeze(["transcribing", "reviewing", "imported"]),
  imported: Object.freeze(["reviewing", "imported", "archived"]),
  archived: Object.freeze(["archived"]),
});

/**
 * Keeps exam transcription records in the documented workflow while allowing
 * an adjacent backwards step when a reviewer needs to correct a transcription.
 */
export function isExamWorkflowTransitionAllowed(currentStatus, nextStatus) {
  if (typeof currentStatus !== "string" || typeof nextStatus !== "string") return false;
  return ADJACENT_STATES[currentStatus]?.includes(nextStatus) ?? false;
}
