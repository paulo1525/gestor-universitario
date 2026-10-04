import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { decryptQuizFile } from "./pack-quiz-content.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputArg = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : null;
const output = path.resolve(
  outputArg || path.join(os.tmpdir(), "gestor-quiz-edit-" + Date.now()),
);
const relative = path.relative(root, output);
if (!relative.startsWith("..") && !path.isAbsolute(relative))
  throw new Error("Plaintext JSON must stay outside the repository.");
const localVars = await readFile(path.join(root, ".dev.vars"), "utf8").catch(
  () => "",
);
const secret =
  process.env.QUIZ_CONTENT_KEY ||
  localVars.match(/^QUIZ_CONTENT_KEY=(.+)$/m)?.[1].trim();
if (!secret)
  throw new Error("Set QUIZ_CONTENT_KEY privately before opening the files.");
const index = JSON.parse(
  await readFile(path.join(root, "worker", "quiz-content-index.json"), "utf8"),
);
const prepared = [];
for (const file of index.files) {
  if (!file.key.startsWith("quiz-content/v1/") || file.key.includes(".."))
    throw new Error("Invalid private file path.");
  const encrypted = await readFile(
    path.join(root, "private", "questions", file.key + ".enc"),
  );
  if (
    encrypted.length !== file.bytes ||
    createHash("sha256").update(encrypted).digest("hex") !== file.sha256
  )
    throw new Error("Encrypted file checksum mismatch.");
  const content = decryptQuizFile(encrypted, file.key, secret),
    filename = file.key.replaceAll("/", "--");
  prepared.push({
    content,
    file: {
      key: file.key,
      filename,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    },
  });
}
await mkdir(output, { recursive: true });
for (const item of prepared)
  await writeFile(path.join(output, item.file.filename), item.content);
await writeFile(
  path.join(output, "transfer.json"),
  JSON.stringify(
    {
      revision: index.revision,
      counts: index.counts,
      files: prepared.map((item) => item.file),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    output,
    files: prepared.length,
    plaintextOutsideRepository: true,
  }),
);
