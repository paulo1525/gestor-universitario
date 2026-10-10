import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { restoreQuizContentExport } from "../scripts/restore-quiz-content-export.mjs";
import ts from "typescript";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { prepareQuizJson } from "../scripts/prepare-quiz-json-storage.mjs";

async function compile(relative, dependencies = {}) {
  const code = ts.transpileModule(
    await readFile(new URL(relative, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const compiled = { exports: {} };
  new Function("module", "exports", "require", code)(
    compiled,
    compiled.exports,
    (p) => {
      assert.ok(p in dependencies, "Unexpected dependency: " + p);
      return dependencies[p];
    },
  );
  return compiled.exports;
}
import { encryptQuizFile } from "../scripts/pack-quiz-content.mjs";
const testKey = Buffer.alloc(32, 7).toString("base64");
const storage = await compile("../worker/quiz-content-store.ts", {
  "./quiz-content-index.json": { default: { revision: "seed-test" } },
});
const richText = await compile("../lib/announcement-content.ts");
const { handleQuizRoute } = await compile("../worker/quizzes.ts", {
  "./quiz-content-store": storage,
  "../lib/announcement-content": richText,
});
const SQL = await initSqlJs();
const admin = {
  id: "admin-test",
  email: "admin@example.test",
  fullName: "Administrador fictício",
  role: "admin",
};
const student = {
  id: "student-test",
  email: "student@example.test",
  fullName: "Estudante fictício",
  role: "student",
};
const migration = await readFile(
  new URL("../migrations/0030_quizzes.sql", import.meta.url),
  "utf8",
);

class Bucket {
  objects = new Map();
  reads = [];
  unavailable = false;
  constructor(artifacts) {
    for (const a of artifacts)
      this.objects.set(a.key, encryptQuizFile(a.content, a.key, testKey));
  }
  async fetch(request) {
    const key = new URL(request.url).pathname
      .replace("/__private_quiz/", "")
      .replace(/\.enc$/, "");
    this.reads.push(key);
    if (this.unavailable) return new Response(null, { status: 503 });
    const value = this.objects.get(key);
    return value ? new Response(value) : new Response(null, { status: 404 });
  }
}
function fixture(count = 8, splitSources = false) {
  const db = new SQL.Database();
  const statements = [];
  db.run(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,full_name TEXT);
    CREATE TABLE curricular_units(id TEXT PRIMARY KEY,code TEXT,name TEXT,ects REAL,study_year INTEGER,semester INTEGER,active INTEGER);
    CREATE TABLE app_module_settings(module_key TEXT PRIMARY KEY,enabled INTEGER,updated_by TEXT,updated_at INTEGER);
    CREATE TABLE admin_audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id TEXT,action TEXT,details TEXT,created_at INTEGER);
    CREATE TABLE r2_read_budget(period_utc TEXT PRIMARY KEY,reserved_operations INTEGER,operation_limit INTEGER,updated_at INTEGER);
    INSERT INTO users VALUES('admin-test','Administrador fictício'),('student-test','Estudante fictício');
    INSERT INTO curricular_units VALUES('unit-test','TEST','Disciplina fictícia',6,2,1,1);`);
  db.run(migration);
  if (splitSources) db.run("UPDATE curricular_units SET code='NEURO' WHERE id='unit-test'");
  for (const table of ["quiz_questions", "quiz_attempt_questions"])
    db.run(
      "ALTER TABLE " +
        table +
        " ADD COLUMN question_images_json TEXT DEFAULT '[]'; ALTER TABLE " +
        table +
        " ADD COLUMN solution_images_json TEXT DEFAULT '[]';",
    );
  db.run(
    "ALTER TABLE quiz_questions ADD COLUMN response_type TEXT DEFAULT 'multiple_choice';ALTER TABLE quiz_questions ADD COLUMN answer_text TEXT DEFAULT '';ALTER TABLE quiz_questions ADD COLUMN anki_card_type TEXT;ALTER TABLE quiz_attempt_questions ADD COLUMN seen_before INTEGER DEFAULT 0;",
  );
  const topic = {
    id: "topic-test",
    curricular_unit_id: "unit-test",
    title: "Tema fictício",
    description: "",
    status: "published",
    sort_order: 0,
    deleted_at: null,
    created_by: admin.id,
    updated_by: admin.id,
    created_at: 1,
    updated_at: 1,
  };
  db.run(
    "INSERT INTO quiz_topics(id,curricular_unit_id,title,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    [topic.id, "unit-test", topic.title, "published", admin.id, admin.id, 1, 1],
  );
  const ankiTopic = { ...topic, id: "anki-neuro-lesson-at1", title: "AT1" };
  if (splitSources) db.run(
    "INSERT INTO quiz_topics(id,curricular_unit_id,title,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    [ankiTopic.id, "unit-test", ankiTopic.title, "published", admin.id, admin.id, 1, 1],
  );
  const questions = [],
    options = [];
  for (let i = 0; i < count; i++) {
    const isAnki = splitSources && i >= count / 2;
    const id = (isAnki ? "anki-neuro-" : "q-") + i;
    const q = {
      id,
      curricular_unit_id: "unit-test",
      topic_id: isAnki ? ankiTopic.id : topic.id,
      prompt: "Pergunta JSON " + i,
      explanation: "Solução privada " + i,
      image_url: null,
      difficulty: "medium",
      status: "published",
      response_type: "multiple_choice",
      answer_text: "",
      deleted_at: null,
      created_by: admin.id,
      updated_by: admin.id,
      created_at: 1,
      updated_at: 1,
      question_images_json: "[]",
      solution_images_json: "[]",
    };
    questions.push(q);
    db.run(
      "INSERT INTO quiz_questions(id,curricular_unit_id,topic_id,prompt,status,created_by,updated_by,created_at,updated_at)VALUES(?,?,?,'Legacy DB body','published',?,?,1,1)",
      [id, "unit-test", isAnki ? ankiTopic.id : topic.id, admin.id, admin.id],
    );
    options.push(
      {
        id: id + "-a",
        question_id: id,
        option_text: "Opção A",
        position: 1,
        is_correct: 1,
      },
      {
        id: id + "-b",
        question_id: id,
        option_text: "Opção B",
        position: 2,
        is_correct: 0,
      },
    );
  }
  const bankTopic = {
    id: "bank-topic",
    curricular_unit_id: "unit-test",
    title: "Tema do banco",
    chapter_number: "1",
    sort_order: 0,
  };
  const bank = {
    id: "bank-q",
    curricular_unit_id: "unit-test",
    topic_id: bankTopic.id,
    source_id: "bank-source",
    prompt: "Questão do banco",
    options_text: "a) A\nb) B",
    answer_text: "a) A",
    answer_indicated: "a) A",
    response_type: "multiple_choice",
    status: "published",
    confidence: "ALTO",
    validation_state: "VALIDADO",
    review_note: "",
    image_url: "",
    question_images_json: "[]",
    solution_images_json: "[]",
    sort_order: 0,
  };
  const tables = {
    quiz_topics: splitSources ? [topic, ankiTopic] : [topic],
    quiz_questions: questions,
    quiz_question_options: options,
    question_bank_items: [bank],
    question_bank_topics: [bankTopic],
    question_bank_sources: [
      {
        id: "bank-source",
        curricular_unit_id: "unit-test",
        label: "Fonte fictícia",
        source_kind: "compendium",
        updated_at: 1,
      },
    ],
  };
  const prepared = prepareQuizJson(tables, "seed-test", 1);
  const bucket = new Bucket(prepared.artifacts);
  const DB = {
    prepare(sql) {
      statements.push(sql);
      let bindings = [];
      const execute = () => {
        const query = db.prepare(sql);
        try {
          query.bind(bindings);
          const rows = [];
          while (query.step()) rows.push(query.getAsObject());
          return rows;
        } finally {
          query.free();
        }
      };
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async first() {
          return execute()[0] ?? null;
        },
        async all() {
          return { results: execute(), meta: {} };
        },
        async run() {
          execute();
          return { meta: { changes: db.getRowsModified() } };
        },
      };
    },
    async batch(queries) {
      db.run("BEGIN");
      try {
        const result = [];
        for (const q of queries) result.push(await q.run());
        db.run("COMMIT");
        return result;
      } catch (error) {
        db.run("ROLLBACK");
        throw error;
      }
    },
  };
  const env = {
    DB,
    ASSETS: bucket,
    QUIZ_CONTENT_STORAGE: "files",
    QUIZ_CONTENT_KEY: testKey,
  };
  const request = (path, method = "GET", body = null, user = student) => {
    const url = new URL(path, "https://example.test");
    return handleQuizRoute(
      new Request(url, {
        method,
        ...(body
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      }),
      env,
      url,
      user,
      async () => true,
    );
  };
  return { db, bucket, env, request, statements, tables };
}
const contentSql =
  /\b(?:FROM|JOIN)\s+(?:quiz_questions|quiz_question_options|question_bank_items|question_bank_topics|question_bank_sources)\b/i;

test("a recuperação privada conserva todos os ficheiros, incluindo arquivados, sem exportar a chave", async () => {
  const f = fixture(1050);
  const directory = await mkdtemp(path.join(os.tmpdir(), "quiz-recovery-test-"));
  try {
    f.tables.quiz_questions[0].status = "archived";
    f.tables.quiz_questions[1].deleted_at = 123;
    const prepared = prepareQuizJson(f.tables, "seed-test", 1);
    const env = { ...f.env, ASSETS: new Bucket(prepared.artifacts) };
    const response = await storage.createQuizContentExport(env, { revision: "seed-test", counts: prepared.counts, files: prepared.artifacts });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const firstPart = await response.text();
    assert.ok(env.ASSETS.reads.length <= 33);
    const secondPart = await (await storage.createQuizContentExport(env, { revision: "seed-test", counts: prepared.counts, files: prepared.artifacts }, 32)).text();
    const body = firstPart + secondPart;
    assert.ok(!body.includes(testKey));
    const backup = path.join(directory, "backup.ndjson"), output = path.join(directory, "restored");
    await writeFile(backup, body);
    const restored = await restoreQuizContentExport(backup, output);
    assert.equal(restored.files, prepared.artifacts.length);
    const transfer = JSON.parse(await readFile(path.join(output, "transfer.json"), "utf8"));
    for (const artifact of prepared.artifacts) {
      const file = transfer.files.find(file => file.key === artifact.key);
      assert.deepEqual(JSON.parse(await readFile(path.join(output, file.filename), "utf8")), JSON.parse(artifact.content));
    }
    await writeFile(backup, body.trim().split("\n").slice(0, -1).join("\n"));
    await assert.rejects(restoreQuizContentExport(backup, path.join(directory, "incomplete")), /Incomplete/);
    await assert.rejects(readFile(path.join(directory, "incomplete", "transfer.json")), /ENOENT/);
  } finally { f.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test("a exportação privada recusa estudantes e sessões ausentes antes de abrir os ficheiros", async () => {
  const f = fixture();
  try {
    const reads = f.bucket.reads.length;
    assert.equal((await f.request("/api/admin/quizzes/content-export")).status, 403);
    assert.equal((await f.request("/api/admin/quizzes/content-export", "GET", null, null)).status, 401);
    assert.equal((await f.request("/api/admin/quizzes/content-export", "POST", {}, admin)).status, 405);
    assert.equal(f.bucket.reads.length, reads);
  } finally { f.db.close(); }
});

test("o índice seleciona a nova chave sem alterar a leitura da versão antiga", async () => {
  const f = fixture();
  try {
    const nextKey = Buffer.alloc(32, 19).toString("base64");
    const nextStorage = await compile("../worker/quiz-content-store.ts", {
      "./quiz-content-index.json": { default: { revision: "seed-test", keySlot: "next" } },
    });
    const prepared = prepareQuizJson(f.tables, "seed-test", 1);
    const nextBucket = new Bucket(prepared.artifacts);
    for (const artifact of prepared.artifacts) nextBucket.objects.set(artifact.key, encryptQuizFile(artifact.content, artifact.key, nextKey));
    const nextEnv = { ...f.env, ASSETS: nextBucket, QUIZ_CONTENT_KEY_NEXT: nextKey };
    const next = await nextStorage.QuizContentStore.open(nextEnv);
    assert.equal((await next.question("q-0")).prompt, f.tables.quiz_questions[0].prompt);
    const previous = await storage.QuizContentStore.open({ ...f.env, QUIZ_CONTENT_KEY_NEXT: nextKey });
    assert.equal((await previous.question("q-0")).prompt, f.tables.quiz_questions[0].prompt);
    await assert.rejects(nextStorage.QuizContentStore.open({ ...nextEnv, QUIZ_CONTENT_KEY_NEXT: undefined }), /ainda não estão disponíveis/);
  } finally { f.db.close(); }
});

test("catálogo e detalhe vêm do JSON; o detalhe não revela soluções nem varre perguntas D1", async () => {
  const f = fixture();
  try {
    const catalog = await (await f.request("/api/quizzes")).json();
    assert.equal(catalog.units[0].questionCount, 8);
    assert.equal(catalog.topics[0].questionCount, 8);
    const response = await f.request("/api/quizzes/q-0");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.question.prompt, "Pergunta JSON 0");
    assert.equal(body.question.explanation, undefined);
    assert.equal(body.question.correctOptionId, undefined);
    assert.equal(
      f.statements.some((sql) => contentSql.test(sql)),
      false,
    );
  } finally {
    f.db.close();
  }
});
test("banco preserva paginação, filtros e seleção com/sem soluções a partir dos blocos privados", async () => {
  const f = fixture();
  try {
    const result = await (
      await f.request("/api/question-bank?unitId=unit-test&solutions=without")
    ).json();
    assert.equal(result.pagination.total, 1);
    assert.equal(result.questions[0].prompt, "Questão do banco");
    assert.equal(result.questions[0].answer, null);
    assert.equal(result.questions[0].sheet.Resposta_Validada, null);
    const filtered = await (
      await f.request("/api/question-bank?unitId=unit-test&query=inexistente")
    ).json();
    assert.equal(filtered.pagination.total, 0);
    assert.equal(
      f.statements.some((sql) => contentSql.test(sql)),
      false,
    );
  } finally {
    f.db.close();
  }
});
test("teste e simulado usam JSON; a tentativa continua recuperável mesmo com ficheiros indisponíveis", async () => {
  const f = fixture();
  try {
    const created = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test",
      mode: "exam",
      questionCount: 5,
      timed: true,
    });
    assert.equal(created.status, 201);
    const attempt = (await created.json()).attempt;
    assert.equal(attempt.questions.length, 5);
    assert.ok(
      attempt.questions.every(
        (q) =>
          q.prompt.startsWith("Pergunta JSON") &&
          q.correctOptionId === undefined &&
          q.explanation === undefined,
      ),
    );
    assert.equal(
      f.statements.some((sql) => contentSql.test(sql)),
      false,
    );
    f.bucket.unavailable = true;
    const resumed = await f.request("/api/quiz-attempts/" + attempt.id);
    assert.equal(resumed.status, 200);
    assert.deepEqual(
      (await resumed.json()).attempt.questions.map((q) => q.prompt),
      attempt.questions.map((q) => q.prompt),
    );
  } finally {
    f.db.close();
  }
});
test("índice ausente ou inválido fecha o acesso sem regressar a scans D1; sessões sem permissão não leem ficheiros", async () => {
  const f = fixture();
  try {
    assert.equal(
      (await f.request("/api/quizzes", "GET", null, null)).status,
      401,
    );
    assert.equal(
      (await f.request("/api/admin/quizzes", "GET", null, student)).status,
      403,
    );
    assert.equal(f.bucket.reads.length, 0);
    f.bucket.objects.delete(storage.QUIZ_CONTENT_MANIFEST_KEY);
    assert.equal((await f.request("/api/quizzes")).status, 503);
    assert.equal(
      f.statements.some((sql) => contentSql.test(sql)),
      false,
    );
    assert.throws(() =>
      storage.validateManifest({
        schemaVersion: 1,
        revision: "invalid",
        updatedAt: 1,
        shards: {},
        bankIndexes: {},
        topics: [],
        questions: [
          {
            id: "q",
            curricular_unit_id: "missing",
            topic_id: "missing",
            _chunk: "bad",
          },
        ],
      }),
    );
  } finally {
    f.db.close();
  }
});
test("iniciar cinco perguntas num catálogo grande lê só os blocos selecionados", async () => {
  const f = fixture(300);
  try {
    const response = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test",
      mode: "quick",
      questionCount: 5,
      timed: false,
    });
    assert.equal(response.status, 201);
    const quizReads = f.bucket.reads.filter((key) =>
      /quiz-\d+\.json$/.test(key),
    );
    assert.ok(quizReads.length <= 5);
    assert.equal(
      f.statements.some((sql) => contentSql.test(sql)),
      false,
    );
  } finally {
    f.db.close();
  }
});

test("a chave ausente ou errada e um ficheiro adulterado bloqueiam o conteúdo", async () => {
  for (const failure of ["missing", "wrong", "tampered"]) {
    const f = fixture();
    try {
      if (failure === "missing") delete f.env.QUIZ_CONTENT_KEY;
      if (failure === "wrong")
        f.env.QUIZ_CONTENT_KEY = Buffer.alloc(32, 9).toString("base64");
      if (failure === "tampered")
        f.bucket.objects.get(storage.QUIZ_CONTENT_MANIFEST_KEY)[20] ^= 1;
      assert.equal((await f.request("/api/quizzes")).status, 503);
      assert.equal(
        f.statements.some((sql) => contentSql.test(sql)),
        false,
      );
      if (failure === "missing") assert.equal(f.bucket.reads.length, 0);
    } finally {
      f.db.close();
    }
  }
});

test("administração e importações ficam bloqueadas sem abrir ou alterar ficheiros", async () => {
  const f = fixture();
  try {
    for (const [path, method, body] of [
      ["/api/admin/quizzes", "GET", null],
      ["/api/admin/quizzes", "POST", { action: "create_question" }],
      ["/api/admin/quizzes", "PATCH", { action: "update_question", id: "q-0" }],
      ["/api/admin/quizzes", "DELETE", { id: "q-0" }],
      ["/api/admin/quizzes/import", "POST", { rows: [] }],
      ["/api/admin/quizzes/bulk", "POST", { action: "delete", ids: ["q-0"] }],
    ]) {
      const response = await f.request(path, method, body, admin);
      assert.equal(response.status, 405);
      assert.equal((await response.json()).code, "QUIZ_CONTENT_READ_ONLY");
    }
    assert.equal(f.bucket.reads.length, 0);
    assert.equal(
      f.db.exec("SELECT COUNT(*) FROM quiz_questions")[0].values[0][0],
      8,
    );
  } finally {
    f.db.close();
  }
});

test("não vistas, erros pessoais e progresso usam o histórico privado com as perguntas dos ficheiros", async () => {
  const f = fixture(10);
  try {
    const attempt = (
      await (
        await f.request("/api/quiz-attempts", "POST", {
          unitId: "unit-test",
          mode: "exam",
          questionCount: 10,
          timed: false,
        })
      ).json()
    ).attempt;
    for (const q of attempt.questions)
      assert.equal(
        (
          await f.request(
            "/api/quiz-attempts/" + attempt.id + "/answers",
            "PUT",
            { questionId: q.id, optionId: q.id + "-b" },
          )
        ).status,
        200,
      );
    const finished = await f.request(
      "/api/quiz-attempts/" + attempt.id + "/finish",
      "POST",
    );
    assert.equal(finished.status, 200);
    const unseen = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test",
      mode: "unseen",
      questionCount: 5,
      timed: false,
    });
    assert.equal(unseen.status, 409);
    const exhausted = await unseen.json();
    assert.equal(exhausted.code, "all_questions_seen");
    assert.equal(exhausted.total, 10);
    const mistakes = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test",
      mode: "mistakes",
      questionCount: 5,
      timed: false,
    });
    assert.equal(mistakes.status, 201);
    assert.equal((await mistakes.json()).attempt.questions.length, 5);
    const progress = await (
      await f.request("/api/quizzes/progress?unitId=unit-test")
    ).json();
    assert.equal(progress.summary.completedCount, 1);
    assert.equal(progress.summary.uniqueQuestionCount, 10);
    assert.ok(
      progress.mistakes.every((q) => q.prompt.startsWith("Pergunta JSON")),
    );
    assert.equal(
      f.statements.some((sql) => contentSql.test(sql)),
      false,
    );
  } finally {
    f.db.close();
  }
});

test("IDs novos publicados nos ficheiros preservam as relações do histórico sem copiar enunciados para D1", async () => {
  const f = fixture();
  try {
    f.db.run("DELETE FROM quiz_questions; DELETE FROM quiz_topics");
    const response = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test",
      mode: "quick",
      questionCount: 5,
      timed: false,
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).attempt.questions.length, 5);
    assert.equal(
      f.db.exec("SELECT COUNT(*) FROM quiz_questions")[0].values[0][0],
      5,
    );
    assert.equal(
      f.db.exec(
        "SELECT COUNT(*) FROM quiz_questions WHERE prompt<>'' OR explanation<>''",
      )[0].values[0][0],
      0,
    );
    assert.equal(
      f.db.exec("SELECT COUNT(*) FROM quiz_question_options")[0].values[0][0],
      0,
    );
  } finally {
    f.db.close();
  }
});


test("a origem escolhida separa os Ankis do compêndio, incluindo ao retomar a sessão", async () => {
  const f = fixture(10, true);
  try {
    const catalogue = await (await f.request("/api/quizzes")).json();
    assert.deepEqual(catalogue.units[0].sources.map(source => [source.id, source.questionCount]), [["compendium", 5], ["anki", 5]]);
    for (const source of ["anki", "compendium"]) {
      const created = await f.request("/api/quiz-attempts", "POST", { unitId: "unit-test", source, mode: "quick", questionCount: 5, timed: false });
      assert.equal(created.status, 201);
      const attempt = (await created.json()).attempt;
      assert.equal(attempt.source, source);
      assert.ok(attempt.questions.every(question => question.id.startsWith("anki-neuro-") === (source === "anki")));
      const resumed = await (await f.request("/api/quiz-attempts/" + attempt.id)).json();
      assert.equal(resumed.attempt.source, source);
    }
    const mismatched = await f.request("/api/quiz-attempts", "POST", { unitId: "unit-test", source: "compendium", topicIds: ["anki-neuro-lesson-at1"], mode: "quick", questionCount: 5 });
    assert.equal(mismatched.status, 400);
    const invalid = await f.request("/api/quiz-attempts", "POST", { unitId: "unit-test", source: "both", mode: "quick", questionCount: 5 });
    assert.equal(invalid.status, 400);
    const defaulted = await f.request("/api/quiz-attempts", "POST", { unitId: "unit-test", mode: "quick", questionCount: 5, timed: false });
    assert.equal(defaulted.status, 201);
    assert.ok((await defaulted.json()).attempt.questions.every(question => !question.id.startsWith("anki-neuro-")));
  } finally { f.db.close(); }
});

test("o catálogo e as sessões filtram Ankis de legendar e perguntas textuais em todos os modos pessoais", async () => {
  const f = fixture(20, true);
  try {
    const ankiQuestions = f.tables.quiz_questions.filter(q => q.id.startsWith("anki-neuro-"));
    for (const [index, question] of ankiQuestions.entries()) Object.assign(question, {
      response_type: "short_answer",
      anki_card_type: index % 2 === 0 ? "label_image" : "text",
      answer_text: "Resposta fictícia " + index,
      question_images_json: index % 2 === 0 ? JSON.stringify(["/api/quiz-media/" + String(index).padStart(64, "a")]) : "[]",
    });
    f.env.ASSETS = new Bucket(prepareQuizJson(f.tables, "seed-test", 2).artifacts);

    const catalogue = await (await f.request("/api/quizzes")).json();
    const ankiSource = catalogue.units[0].sources.find(source => source.id === "anki");
    assert.equal(ankiSource.labelImageCount, 5);
    assert.equal(ankiSource.textQuestionCount, 5);
    assert.equal(ankiSource.labelImagePlatformMistakeCount, 0);
    assert.equal(ankiSource.textQuestionPlatformMistakeCount, 0);
    const ankiTopic = catalogue.topics.find(topic => topic.id === "anki-neuro-lesson-at1");
    assert.equal(ankiTopic.labelImageCount, 5);
    assert.equal(ankiTopic.textQuestionCount, 5);
    assert.equal(ankiTopic.labelImagePlatformMistakeCount, 0);
    assert.equal(ankiTopic.textQuestionPlatformMistakeCount, 0);

    for (const [filter, cardType] of [["label_image", "label_image"], ["short_answer", "text"]]) {
      const created = await f.request("/api/quiz-attempts", "POST", {
        unitId: "unit-test", source: "anki", ankiCardType: filter, answerFormat: "short_answer",
        mode: "quick", questionCount: 5, timed: false,
      });
      assert.equal(created.status, 201);
      const attempt = (await created.json()).attempt;
      assert.equal(attempt.ankiCardType, filter);
      assert.equal(attempt.questions.length, 5);
      assert.ok(attempt.questions.every(question => question.cardType === cardType));
      const resumed = await (await f.request("/api/quiz-attempts/" + attempt.id)).json();
      assert.equal(resumed.attempt.ankiCardType, filter);
      assert.ok(resumed.attempt.questions.every(question => question.cardType === cardType));
    }

    const invalidForCompendium = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test", ankiCardType: "label_image", mode: "quick", questionCount: 5,
    });
    assert.equal(invalidForCompendium.status, 400);
    const invalidValue = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test", source: "anki", ankiCardType: "image", mode: "quick", questionCount: 5,
    });
    assert.equal(invalidValue.status, 400);

    // Seed a personal error in a textual Anki; label cards are revealed and
    // are intentionally not scored by the answer endpoint.
    const seed = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test", source: "anki", answerFormat: "short_answer", mode: "quick", questionCount: 5, timed: false,
    });
    assert.equal(seed.status, 201);
    const seedAttempt = (await seed.json()).attempt;
    const textQuestion = seedAttempt.questions.find(item => item.cardType === "text");
    assert.ok(textQuestion);
    const wrong = textQuestion.options.find(option => option.id !== textQuestion.correctOptionId);
    const answer = await f.request("/api/quiz-attempts/" + seedAttempt.id + "/answers", "PUT", { questionId: textQuestion.id, optionId: wrong.id });
    assert.equal(answer.status, 200);
    for (const [filter, available] of [["label_image", 0], ["short_answer", 1]]) {
      const mistakes = await f.request("/api/quiz-attempts", "POST", {
        unitId: "unit-test", source: "anki", ankiCardType: filter, answerFormat: "short_answer",
        mode: "mistakes", questionCount: 5, timed: false,
      });
      assert.equal(mistakes.status, 409);
      assert.equal((await mistakes.json()).available, available);
    }
  } finally { f.db.close(); }
});

test("o caminho D1 separa contagens e aplica o filtro de tipo antes de não vistas e erros", async () => {
  const f = fixture(20, true);
  try {
    f.env.QUIZ_CONTENT_STORAGE = "disabled";
    const ankiQuestions = f.tables.quiz_questions.filter(q => q.id.startsWith("anki-neuro-"));
    for (const [index, question] of ankiQuestions.entries()) {
      const cardType = index % 2 === 0 ? "label_image" : "text";
      f.db.run("UPDATE quiz_questions SET response_type='short_answer',answer_text=?,anki_card_type=?,question_images_json=? WHERE id=?", ["Resposta D1 " + index, cardType, cardType === "label_image" ? '["/api/quiz-media/' + String(index).padStart(64, "a") + '"]' : "[]", question.id]);
    }

    const catalogue = await (await f.request("/api/quizzes")).json();
    const ankiSource = catalogue.units[0].sources.find(source => source.id === "anki");
    assert.equal(ankiSource.labelImageCount, 5);
    assert.equal(ankiSource.textQuestionCount, 5);
    const ankiTopic = catalogue.topics.find(topic => topic.id === "anki-neuro-lesson-at1");
    assert.equal(ankiTopic.labelImageCount, 5);
    assert.equal(ankiTopic.textQuestionCount, 5);

    for (const [filter, cardType] of [["label_image", "label_image"], ["short_answer", "text"]]) {
      const created = await f.request("/api/quiz-attempts", "POST", {
        unitId: "unit-test", source: "anki", ankiCardType: filter, answerFormat: "short_answer",
        mode: "unseen", questionCount: 5, timed: false,
      });
      assert.equal(created.status, 201);
      const attempt = (await created.json()).attempt;
      assert.ok(attempt.questions.every(question => question.cardType === cardType));
    }

    const noLabelMistakes = await f.request("/api/quiz-attempts", "POST", {
      unitId: "unit-test", source: "anki", ankiCardType: "label_image", answerFormat: "short_answer",
      mode: "mistakes", questionCount: 5, timed: false,
    });
    assert.equal(noLabelMistakes.status, 409);
    assert.equal((await noLabelMistakes.json()).available, 0);
  } finally { f.db.close(); }
});

test("legendar revela o verso sem pontuar e retoma o estado próprio do cartão", async () => {
  const f = fixture(10, true);
  try {
    for (const question of f.tables.quiz_questions.filter(q => q.id.startsWith("anki-neuro-"))) Object.assign(question, { response_type: "short_answer", anki_card_type: "label_image", answer_text: "<p>Legenda privada fictícia</p>", explanation: "Fonte fictícia", question_images_json: JSON.stringify(["/api/quiz-media/" + "a".repeat(64)]), solution_images_json: JSON.stringify(["/api/quiz-media/" + "b".repeat(64)]) });
    f.env.ASSETS = new Bucket(prepareQuizJson(f.tables, "seed-test", 1).artifacts);
    const created = await f.request("/api/quiz-attempts", "POST", { unitId: "unit-test", source: "anki", mode: "quick", questionCount: 5, answerFormat: "short_answer", shortAnswerMode: "type_and_check", timed: false });
    assert.equal(created.status, 201);
    const attempt = (await created.json()).attempt, question = attempt.questions[0];
    assert.equal(question.cardType, "label_image");
    assert.equal(question.revealed, false);
    assert.ok(!JSON.stringify(question).includes("Legenda privada"));
    assert.equal(question.solutionImageUrls, undefined);
    const answerPath = "/api/quiz-attempts/" + attempt.id + "/answers";
    assert.equal((await f.request(answerPath, "PUT", { questionId: question.id, optionId: question.correctOptionId })).status, 409);
    const revealPath = "/api/quiz-attempts/" + attempt.id + "/reveal";
    assert.equal((await f.request(revealPath, "POST", { questionId: question.id }, admin)).status, 404);
    const revealed = await (await f.request(revealPath, "POST", { questionId: question.id })).json();
    assert.equal(revealed.question.revealed, true);
    assert.equal(revealed.question.solutionImageUrls.length, 1);
    assert.match(JSON.stringify(revealed.question.options), /Legenda privada/);
    const resumed = (await (await f.request("/api/quiz-attempts/" + attempt.id)).json()).attempt;
    assert.equal(resumed.answeredCount, 0);
    assert.equal(resumed.questions[0].cardType, "label_image");
    assert.equal(resumed.questions[0].revealed, true);
    assert.equal(resumed.questions[0].solutionImageUrls.length, 1);
    assert.equal((await f.request(answerPath, "PUT", { questionId: question.id, optionId: question.correctOptionId })).status, 200);
    assert.equal((await f.request(answerPath, "PUT", { questionId: question.id, optionId: question.correctOptionId })).status, 200);
    assert.equal(f.db.exec("SELECT answered_count FROM quiz_attempts WHERE id='" + attempt.id + "'")[0].values[0][0], 1);
  } finally { f.db.close(); }
});

test("as imagens privadas conservam os bytes e exigem autenticação", async () => {
  const f = fixture();
  try {
    const id = "c".repeat(64), key = "quiz-content/v1/media/" + id + ".json";
    const image = Buffer.from("imagem fictícia");
    const mediaStorage = await compile("../worker/quiz-content-store.ts", { "./quiz-content-index.json": { default: { files: [{ key }] } } });
    const bucket = new Bucket([{key,content:JSON.stringify({mimeType:"image/png",data:image.toString("base64")})}]);
    const response = await mediaStorage.readQuizMedia({ ...f.env, ASSETS: bucket }, id);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    assert.equal((await mediaStorage.readQuizMedia({ ...f.env, ASSETS: bucket }, "../manifest")).status, 404);
    assert.equal((await f.request("/api/quiz-media/"+id,"GET",null,null)).status, 401);
  } finally { f.db.close(); }
});
