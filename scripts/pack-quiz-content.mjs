import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareQuizJson } from "./prepare-quiz-json-storage.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export function configuredQuizContentKey(environmentValue, localVars = "") {
  const secret = environmentValue || localVars.match(/^QUIZ_CONTENT_KEY=(.+)$/m)?.[1].trim();
  if (!secret) throw new Error("Configure QUIZ_CONTENT_KEY privately before packing. No key was generated or changed.");
  if (Buffer.from(secret, "base64").length !== 32) throw new Error("QUIZ_CONTENT_KEY must contain a 32-byte base64 key.");
  return secret;
}

export function encryptQuizFile(content, objectKey, secret) {
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32)
    throw new Error("QUIZ_CONTENT_KEY must contain a 32-byte base64 key.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(objectKey));
  return Buffer.concat([
    nonce,
    cipher.update(gzipSync(content)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}

export function decryptQuizFile(content, objectKey, secret) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(secret, "base64"),
    content.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(objectKey));
  decipher.setAuthTag(content.subarray(content.length - 16));
  return gunzipSync(
    Buffer.concat([
      decipher.update(content.subarray(12, -16)),
      decipher.final(),
    ]),
  );
}

async function main() {
  const keySlot = process.argv.includes("--key-slot") ? process.argv[process.argv.indexOf("--key-slot") + 1] : "primary";
  if (!["primary", "next"].includes(keySlot)) throw new Error("Use --key-slot primary or next.");
  const sourceArg = process.argv[process.argv.indexOf("--source") + 1];
  if (!process.argv.includes("--source") || !sourceArg)
    throw new Error("Use --source with the private export directory.");
  const source = path.resolve(sourceArg);
  const relative = path.relative(root, source);
  if (!relative.startsWith("..") && !path.isAbsolute(relative))
    throw new Error("Keep plaintext exports outside the repository.");
  let transfer = JSON.parse(
    await readFile(path.join(source, "transfer.json"), "utf8"),
  );
  if (transfer.requiresIndexRebuild && !process.argv.includes("--rebuild"))
    throw new Error("Reviewed content requires --rebuild to refresh question and bank indexes.");
  if (
    !Array.isArray(transfer.files) ||
    !transfer.files.length ||
    !transfer.revision
  )
    throw new Error("Invalid transfer file.");
  let prepared = [];
  for (const file of transfer.files) {
    if (
      path.basename(file.filename) !== file.filename ||
      !/^(quiz-content\/v1\/manifest\.json|quiz-content\/v1\/media\/[a-f0-9]{64}\.json|quiz-content\/v1\/units\/[a-zA-Z0-9_%.-]+\/[a-zA-Z0-9-]+\/(quiz-\d+|bank-\d+|bank-index)\.json)$/.test(
        file.key,
      )
    )
      throw new Error("Invalid content path.");
    const content = await readFile(path.join(source, file.filename));
    if (
      !process.argv.includes("--rebuild") &&
      (content.length !== file.bytes ||
        createHash("sha256").update(content).digest("hex") !== file.sha256)
    )
      throw new Error(
        "Export checksum mismatch. Use --rebuild for intentionally edited JSON.",
      );
    prepared.push({ file, content });
  }
  const manifest = JSON.parse(
    prepared
      .find((item) => item.file.key === "quiz-content/v1/manifest.json")
      ?.content.toString() || "null",
  );
  if (manifest?.revision !== transfer.revision || manifest.schemaVersion !== 1)
    throw new Error("Invalid manifest revision.");
  if (process.argv.includes("--rebuild")) {
    const chunks = prepared
      .filter((item) => item.file.key !== "quiz-content/v1/manifest.json" && !item.file.key.startsWith("quiz-content/v1/media/"))
      .map((item) => JSON.parse(item.content));
    const bankIndexes = chunks.filter(
      (chunk) => chunk.bankTopics.length || chunk.bankSources.length,
    );
    const result = prepareQuizJson({
      quiz_topics: manifest.topics,
      quiz_questions: chunks.flatMap((chunk) => chunk.questions),
      quiz_question_options: chunks.flatMap((chunk) => chunk.options),
      question_bank_items: prepared
        .filter((item) => /bank-\d+\.json$/.test(item.file.key))
        .flatMap((item) => JSON.parse(item.content).bankQuestions),
      question_bank_topics: bankIndexes.flatMap((chunk) => chunk.bankTopics),
      question_bank_sources: bankIndexes.flatMap((chunk) => chunk.bankSources),
    });
    transfer = { revision: result.manifest.revision, counts: result.counts };
    const media = prepared.filter(item => /^quiz-content\/v1\/media\//.test(item.file.key));
    prepared = [...result.artifacts.map((artifact) => ({
      file: artifact,
      content: Buffer.from(artifact.content),
    })), ...media];
  }
  const localVars = await readFile(path.join(root, ".dev.vars"), "utf8").catch(() => "");
  const secret = keySlot === "next"
    ? configuredQuizContentKey(process.env.QUIZ_CONTENT_KEY_NEXT, localVars.replace(/^QUIZ_CONTENT_KEY=.*$/mg, "").replace(/^QUIZ_CONTENT_KEY_NEXT=/mg, "QUIZ_CONTENT_KEY="))
    : configuredQuizContentKey(process.env.QUIZ_CONTENT_KEY, localVars);
  const files = [];
  for (const { file, content } of prepared) {
    const destination = path.join(
      root,
      "private",
      "questions",
      file.key + ".enc",
    );
    let encrypted = await readFile(destination).catch(() => null);
    try {
      if (
        !encrypted ||
        !decryptQuizFile(encrypted, file.key, secret).equals(content)
      )
        encrypted = null;
    } catch {
      encrypted = null;
    }
    encrypted ??= encryptQuizFile(content, file.key, secret);
    if (encrypted.length > 25 * 1024 * 1024) throw new Error("Question asset exceeds the 25 MiB limit: " + file.key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, encrypted);
    files.push({
      key: file.key,
      bytes: encrypted.length,
      sha256: createHash("sha256").update(encrypted).digest("hex"),
    });
  }
  await writeFile(
    path.join(root, "worker", "quiz-content-index.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        revision: transfer.revision,
        encrypted: true,
        keySlot,
        counts: transfer.counts,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      revision: transfer.revision,
      files: files.length,
      encryptedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      counts: transfer.counts,
      secretStoredLocally: true,
      published: false,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
