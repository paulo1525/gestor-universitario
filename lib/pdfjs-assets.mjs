/** Absolute URLs also work when the PDF worker imports a JS codec fallback. */
export function pdfJsAssetOptions(version, origin) {
  const root = new URL(`/pdfjs/${version}/`, origin).href;
  return {
    wasmUrl: `${root}wasm/`,
    cMapUrl: `${root}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${root}standard_fonts/`,
    iccUrl: `${root}iccs/`,
  };
}
