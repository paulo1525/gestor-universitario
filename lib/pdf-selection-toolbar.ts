type Bounds = { left: number; right: number; top: number; bottom: number };

/** Keep selection actions inside the reading viewport, above or below the text. */
export function pdfSelectionToolbarPosition(anchor: Bounds, viewport: Bounds, size: { width: number; height: number }) {
  const gap = 8;
  const left = Math.max(viewport.left + gap, Math.min((anchor.left + anchor.right - size.width) / 2, viewport.right - size.width - gap));
  const above = anchor.top - size.height - gap;
  const top = Math.max(viewport.top + gap, Math.min(above >= viewport.top + gap ? above : anchor.bottom + gap, viewport.bottom - size.height - gap));
  return { left, top };
}
