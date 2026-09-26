import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { preparePdfJsAssets } from "../scripts/prepare-pdfjs-assets.mjs";
import { pdfJsAssetOptions } from "../lib/pdfjs-assets.mjs";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

test("os recursos servidos correspondem à versão do PDF.js, incluindo codecs e alternativas JS", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "gu-pdfjs-"));
  try {
    const destination = await preparePdfJsAssets(scratch);
    const options = pdfJsAssetOptions(version, "https://gestoruniversitario.cc");
    assert.equal(options.cMapPacked, true);
    for (const [option, resource] of [
      ["wasmUrl", "wasm/openjpeg.wasm"],
      ["wasmUrl", "wasm/jbig2.wasm"],
      ["wasmUrl", "wasm/qcms_bg.wasm"],
      ["wasmUrl", "wasm/openjpeg_nowasm_fallback.js"],
      ["wasmUrl", "wasm/jbig2_nowasm_fallback.js"],
      ["cMapUrl", "cmaps/Adobe-Japan1-UCS2.bcmap"],
      ["standardFontDataUrl", "standard_fonts/FoxitSerif.pfb"],
      ["iccUrl", "iccs/CGATS001Compat-v2-micro.icc"],
    ]) {
      assert.deepEqual(await readFile(join(destination, resource)), await readFile(join(packageRoot, resource)));
      assert.equal(new URL(resource.split("/")[1], options[option]).pathname, `/pdfjs/${version}/${resource}`);
    }
    const reader = await readFile(new URL("../components/material-pdf-reader.tsx", import.meta.url), "utf8");
    assert.match(reader, /getDocument\(\{ data, \.\.\.pdfJsAssetOptions\(library\.version, window\.location\.origin\)/);
    const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    for (const script of ["dev", "build", "cf:build", "preview", "cf:preview"]) {
      assert.ok(scripts[script].startsWith("node scripts/prepare-pdfjs-assets.mjs && "), script);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("uma figura JPEG 2000 é efetivamente desenhada com os codecs preparados", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "gu-pdfjs-render-"));
  // A self-generated 8x8 RGB image; no bibliography or private document fixture.
  const image = Buffer.from("AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAACAAAAAgAAwcHAAAAAAAPY29scgEAAAAAABAAAACnanAyY/9P/1EALwAAAAAACAAAAAgAAAAAAAAAAAAAAAgAAAAIAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAMEBAAB/1wADUBASEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAJgAB/5PH1AQAj8+0CAXJz7QICB+AgICAgICAgID/2Q==", "base64");
  let task;
  try {
    const destination = await preparePdfJsAssets(scratch);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([8, 8]);
    const imageRef = pdf.context.register(pdf.context.stream(image, {
      Type: "XObject", Subtype: "Image", Width: 8, Height: 8,
      ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "JPXDecode",
    }));
    page.node.set(PDFName.of("Resources"), pdf.context.obj({ XObject: { Figure: imageRef } }));
    page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream("q 8 0 0 8 0 0 cm /Figure Do Q")));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = require(require.resolve("@napi-rs/canvas", { paths: [packageRoot] }));
    task = pdfjs.getDocument({ data: await pdf.save(), wasmUrl: join(destination, "wasm").replaceAll("\\", "/") + "/" });
    const document = await task.promise;
    const pdfPage = await document.getPage(1);
    const canvas = createCanvas(8, 8);
    const context = canvas.getContext("2d");
    await pdfPage.render({ canvas, canvasContext: context, viewport: pdfPage.getViewport({ scale: 1 }) }).promise;
    const [red, green, blue, alpha] = context.getImageData(4, 4, 1, 1).data;
    assert.deepEqual([red, green, blue, alpha], [190, 40, 20, 255], "a figura não pode desaparecer deixando apenas o fundo");
  } finally {
    await task?.destroy();
    await rm(scratch, { recursive: true, force: true });
  }
});
