import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const TABLES = [
  "quiz_topics",
  "quiz_questions",
  "quiz_question_options",
  "question_bank_items",
  "question_bank_topics",
  "question_bank_sources",
];
const META_FIELDS = [
  "id",
  "curricular_unit_id",
  "topic_id",
  "status",
  "deleted_at",
  "response_type",
  "difficulty",
  "updated_at",
  "anki_card_type",
];
const repository = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export function prepareQuizJson(
  tables,
  revision = randomUUID(),
  now = Date.now(),
) {
  for (const table of TABLES) {
    if (!Array.isArray(tables[table]))
      throw new Error("Missing table: " + table);
    if (
      new Set(tables[table].map((row) => row.id)).size !== tables[table].length
    )
      throw new Error("Duplicate IDs: " + table);
  }
  const topics = new Map(tables.quiz_topics.map((row) => [row.id, row]));
  const questionIds = new Set(tables.quiz_questions.map((row) => row.id));
  for (const q of tables.quiz_questions) {
    if (topics.get(q.topic_id)?.curricular_unit_id !== q.curricular_unit_id)
      throw new Error("Question/topic relationship invalid: " + q.id);
  }
  if (
    tables.quiz_question_options.some(
      (row) => !questionIds.has(row.question_id),
    )
  )
    throw new Error("Orphan options");
  const unitIds = [
    ...new Set(
      [
        ...tables.quiz_questions,
        ...tables.question_bank_items,
        ...tables.quiz_topics,
        ...tables.question_bank_topics,
      ].map((row) => row.curricular_unit_id),
    ),
  ];
  const manifest = {
    schemaVersion: 1,
    revision,
    updatedAt: now,
    shards: {},
    bankIndexes: {},
    topics: tables.quiz_topics,
    questions: [],
  };
  const artifacts = [];
  const optionsById = new Map();
  for (const option of tables.quiz_question_options) {
    const list = optionsById.get(option.question_id) || [];
    list.push(option);
    optionsById.set(option.question_id, list);
  }
  for (const unitId of unitIds) {
    if (typeof unitId !== "string" || !unitId)
      throw new Error("Missing discipline ID");
    const prefix =
      "quiz-content/v1/units/" + encodeURIComponent(unitId) + "/files/";
    const questions = tables.quiz_questions.filter(
      (q) => q.curricular_unit_id === unitId,
    );
    manifest.shards[unitId] = [];
    for (let offset = 0; offset < questions.length; offset += 32) {
      const selected = questions.slice(offset, offset + 32),
        key = prefix + "quiz-" + offset + ".json";
      const shard = {
        schemaVersion: 1,
        unitId,
        questions: selected,
        options: selected.flatMap((q) => optionsById.get(q.id) || []),
        bankQuestions: [],
        bankTopics: [],
        bankSources: [],
      };
      artifacts.push({
        key,
        filename: encodeURIComponent(unitId) + "-quiz-" + offset + ".json",
        content: JSON.stringify(shard),
      });
      manifest.shards[unitId].push(key);
      manifest.questions.push(
        ...selected.map((q) => ({
          ...Object.fromEntries(
            META_FIELDS.map((k) => [
              k,
              q[k] ?? (k === "response_type" ? "multiple_choice" : null),
            ]),
          ),
          _chunk: key,
        })),
      );
    }
    const bank = tables.question_bank_items.filter(
        (q) => q.curricular_unit_id === unitId,
      ),
      index = [];
    for (let offset = 0; offset < bank.length; offset += 32) {
      const selected = bank.slice(offset, offset + 32),
        key = prefix + "bank-" + offset + ".json";
      const shard = {
        schemaVersion: 1,
        unitId,
        questions: [],
        options: [],
        bankQuestions: selected,
        bankTopics: [],
        bankSources: [],
      };
      artifacts.push({
        key,
        filename: encodeURIComponent(unitId) + "-bank-" + offset + ".json",
        content: JSON.stringify(shard),
      });
      const fields = [
        "id",
        "curricular_unit_id",
        "topic_id",
        "source_id",
        "prompt",
        "source_subtopic",
        "source_academic_year",
        "source_page",
        "source_question",
        "source_assessment",
        "source_session",
        "response_type",
        "sort_order",
        "status",
        "validation_state",
        "confidence",
        "review_note",
      ];
      index.push(
        ...selected.map((q) => ({
          ...Object.fromEntries(fields.map((k) => [k, q[k] ?? ""])),
          _chunk: key,
          image_url: q.image_url ? "image" : "",
          answer_text:
            String(q.answer_text || "").trim() &&
            String(q.answer_text).trim().toLowerCase() !==
              "resolução validada fmup."
              ? "solution"
              : "",
          eligible:
            q.status === "published" &&
            q.validation_state === "VALIDADO" &&
            q.confidence === "ALTO" &&
            !String(q.review_note || "").trim() &&
            (q.response_type !== "multiple_choice" ||
              (String(q.options_text).toLowerCase().includes("a)") &&
                String(q.options_text).toLowerCase().includes("b)"))),
        })),
      );
    }
    const bankKey = prefix + "bank-index.json";
    manifest.bankIndexes[unitId] = bankKey;
    artifacts.push({
      key: bankKey,
      filename: encodeURIComponent(unitId) + "-bank-index.json",
      content: JSON.stringify({
        schemaVersion: 1,
        unitId,
        questions: [],
        options: [],
        bankQuestions: index,
        bankTopics: tables.question_bank_topics.filter(
          (t) => t.curricular_unit_id === unitId,
        ),
        bankSources: tables.question_bank_sources.filter(
          (t) => t.curricular_unit_id === unitId,
        ),
      }),
    });
  }
  artifacts.push({
    key: "quiz-content/v1/manifest.json",
    filename: "manifest.json",
    content: JSON.stringify(manifest),
  });
  return {
    manifest,
    artifacts,
    counts: Object.fromEntries(
      TABLES.map((table) => [table, tables[table].length]),
    ),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");
  const database = args.includes("--database")
    ? args[args.indexOf("--database") + 1]
    : "gestor-universitario-prod";
  if (!/^[a-zA-Z0-9_-]+$/.test(database || ""))
    throw new Error("Invalid database name");
  const outputArg = args.includes("--output")
    ? args[args.indexOf("--output") + 1]
    : null;
  const output = path.resolve(
    outputArg || path.join(os.tmpdir(), "gestor-quiz-json-" + randomUUID()),
  );
  const relative = path.relative(repository, output);
  if (!relative.startsWith("..") && !path.isAbsolute(relative))
    throw new Error("Keep exported private content outside the repository.");
  await mkdir(output, { recursive: true });
  const tables = {};
  // Strict allowlist: this export never reads users, sessions, answers or audit logs.
  for (const table of TABLES) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repository, "node_modules/wrangler/bin/wrangler.js"),
        "d1",
        "execute",
        database,
        remote ? "--remote" : "--local",
        "--command",
        "SELECT * FROM " + table + " ORDER BY id",
        "--json",
      ],
      {
        cwd: repository,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true,
      },
    );
    if (result.status !== 0)
      throw new Error(
        "Export failed for " + table + "; no objects were uploaded.",
      );
    const results = JSON.parse(result.stdout);
    if (!results.every((result) => result.success))
      throw new Error("Incomplete export: " + table);
    tables[table] = results.flatMap((result) => result.results);
  }
  const prepared = prepareQuizJson(tables);
  const files = [];
  for (const artifact of prepared.artifacts) {
    await writeFile(
      path.join(output, artifact.filename),
      artifact.content,
      "utf8",
    );
    files.push({
      key: artifact.key,
      filename: artifact.filename,
      bytes: Buffer.byteLength(artifact.content),
      sha256: createHash("sha256").update(artifact.content).digest("hex"),
    });
  }
  await writeFile(
    path.join(output, "transfer.json"),
    JSON.stringify(
      {
        revision: prepared.manifest.revision,
        database,
        remote,
        counts: prepared.counts,
        files,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    JSON.stringify({
      output,
      revision: prepared.manifest.revision,
      counts: prepared.counts,
      files: files.length,
      totalBytes: files.reduce((n, f) => n + f.bytes, 0),
      uploaded: false,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
