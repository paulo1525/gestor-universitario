import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const index = JSON.parse(
  await readFile(path.join(root, "worker", "quiz-content-index.json"), "utf8"),
);
if (
  index.schemaVersion !== 1 ||
  !index.encrypted ||
  !Array.isArray(index.files) ||
  !index.files.length
)
  throw new Error("Prepare the encrypted question files before building.");
const files = [];
for (const file of index.files) {
  if (
    !/^(quiz-content\/v1\/manifest\.json|quiz-content\/v1\/units\/[a-zA-Z0-9_%.-]+\/[a-zA-Z0-9-]+\/(quiz-\d+|bank-\d+|bank-index)\.json)$/.test(
      file.key,
    )
  )
    throw new Error("Invalid question file path.");
  const source = path.join(root, "private", "questions", file.key + ".enc");
  const content = await readFile(source);
  if (
    content.length !== file.bytes ||
    createHash("sha256").update(content).digest("hex") !== file.sha256
  )
    throw new Error("Question file checksum mismatch.");
  files.push({ source, key: file.key });
}
const target = path.resolve(root, ".open-next", "assets", "__private_quiz");
if (
  path.relative(root, target) !==
  path.join(".open-next", "assets", "__private_quiz")
)
  throw new Error("Unsafe asset output path.");
await rm(target, { recursive: true, force: true });
for (const file of files) {
  const destination = path.join(target, file.key + ".enc");
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file.source, destination);
}
console.log("Prepared " + files.length + " encrypted private question assets.");
