import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const deployment = await readFile(new URL("../docs/DEPLOYMENT-CLOUDFLARE.md", import.meta.url), "utf8");

test("o build Cloudflare não aplica migrations remotas", () => {
  assert.equal(wrangler.build?.command, "pnpm cf:build");
  assert.doesNotMatch(wrangler.build?.command || "", /migrat|--remote/i);
  assert.equal(packageJson.scripts["db:migrate:remote"], "wrangler d1 migrations apply gestor-universitario-prod --remote");
});

test("o Worker declara o binding R2 do catálogo e o wrangler mantém o mesmo recurso", () => {
  assert.match(worker, /MATERIALS_BUCKET\?: R2Bucket/);
  assert.deepEqual(wrangler.r2_buckets, [{ binding: "MATERIALS_BUCKET", bucket_name: "gestor-universitario-materials" }]);
  assert.match(deployment, /MATERIALS_BUCKET/);
  assert.match(deployment, /STORAGE_NOT_READY/);
});

test("a documentação mantém D1, OpenNext e R2 em fases separadas", () => {
  assert.match(deployment, /pnpm run cf:build/);
  assert.match(deployment, /pnpm db:migrate:remote/);
  assert.match(deployment, /Nunca executar este passo como parte de/);
});
