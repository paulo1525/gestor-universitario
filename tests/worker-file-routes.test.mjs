import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entry = await readFile(new URL("../cloudflare-worker.ts", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("ficheiros grandes são servidos fora do pipeline do Next (evita o erro 1102)", () => {
  assert.ok(wrangler.includes('"main": "cloudflare-worker.ts"'));
  assert.ok(entry.includes('import openNextWorker from "./.open-next/worker.js"'));
  for (const route of ["material-catalog\\/[^/]+\\/(download|view)", "material-anki\\/[^/]+\\/download", "material-submissions\\/[^/]+\\/files", "material-uploads\\/[^/]+\\/parts"]) {
    assert.ok(entry.includes(route), `rota em falta: ${route}`);
  }
  assert.ok(entry.includes("return apiWorker.fetch(request, env, ctx)"));
});
