import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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

test("os URLs dos JSON privados nunca são servidos como assets públicos", async () => {
  let delegated = 0;
  const compiled = { exports: {} };
  const code = ts.transpileModule(entry, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', code)(compiled, compiled.exports, () => ({ default: { async fetch() { delegated++; return new Response('PUBLIC'); } } }));
  for (const method of ['GET','HEAD','POST','OPTIONS']) {
    const response = await compiled.exports.default.fetch(new Request('https://example.test/__private_quiz/quiz-content/v1/manifest.json.enc', {method}), {}, {});
    assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
  assert.equal(delegated,0);
  assert.ok(JSON.parse(wrangler).assets.run_worker_first.includes('/__private_quiz/*'));
});
