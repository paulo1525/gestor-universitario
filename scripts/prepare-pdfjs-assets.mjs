import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Keep codecs, character maps, fonts and their licences in sync with the worker.
export async function preparePdfJsAssets(outputRoot = join(projectRoot, "public", "pdfjs")) {
  const destination = join(outputRoot, version);
  await mkdir(destination, { recursive: true });
  for (const directory of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
    await cp(join(packageRoot, directory), join(destination, directory), { recursive: true });
  }
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await preparePdfJsAssets();
  console.log(`PDF.js ${version}: recursos de leitura preparados.`);
}
