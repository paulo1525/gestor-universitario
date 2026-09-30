import assert from "node:assert/strict";
import test from "node:test";
import { pdfSelectionToolbarPosition } from "../lib/pdf-selection-toolbar.ts";

test("barra da seleção fica dentro do leitor junto ao texto, mesmo nas margens e em mobile", () => {
  const viewport = { left: 0, right: 390, top: 160, bottom: 844 };
  const size = { width: 320, height: 52 };
  assert.deepEqual(pdfSelectionToolbarPosition({ left: 0, right: 50, top: 200, bottom: 220 }, viewport, size), { left: 8, top: 228 });
  assert.deepEqual(pdfSelectionToolbarPosition({ left: 350, right: 390, top: 800, bottom: 830 }, viewport, size), { left: 62, top: 740 });
  const note = pdfSelectionToolbarPosition({ left: 100, right: 200, top: 170, bottom: 190 }, viewport, { width: 320, height: 240 });
  assert.equal(note.top, 198);
  const sidebarViewport = { left: 200, right: 1020, top: 100, bottom: 700 };
  const wide = pdfSelectionToolbarPosition({ left: 1000, right: 1100, top: 660, bottom: 690 }, sidebarViewport, size);
  assert.ok(wide.left + size.width <= sidebarViewport.right - 8);
  assert.ok(wide.top + size.height <= sidebarViewport.bottom - 8);
});
