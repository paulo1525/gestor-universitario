/// <reference types="@cloudflare/workers-types" />

import contentIndex from "./quiz-content-index.json";

export type ContentRow = Record<string, unknown>;
export const QUIZ_CONTENT_MANIFEST_KEY = "quiz-content/v1/manifest.json";
export type QuizContentManifest = {
  schemaVersion: 1;
  revision: string;
  updatedAt: number;
  shards: Record<string, string[]>;
  bankIndexes: Record<string, string>;
  topics: ContentRow[];
  questions: ContentRow[];
};
export type QuizContentShard = {
  schemaVersion: 1;
  unitId: string;
  questions: ContentRow[];
  options: ContentRow[];
  bankQuestions: ContentRow[];
  bankTopics: ContentRow[];
  bankSources: ContentRow[];
};
export type QuizContentEnv = {
  DB: D1Database;
  ASSETS?: Fetcher;
  QUIZ_CONTENT_STORAGE?: string;
  QUIZ_CONTENT_KEY?: string;
  QUIZ_CONTENT_KEY_NEXT?: string;
};

export class QuizContentError extends Error {
  constructor(
    message: string,
    public status = 503,
    public code = "QUIZ_CONTENT_UNAVAILABLE",
  ) {
    super(message);
  }
}

type ManifestVersion = { manifest: QuizContentManifest };
type Cache = {
  version?: ManifestVersion;
  pending?: Promise<ManifestVersion>;
  shards: Map<string, Promise<QuizContentShard>>;
};
const caches = new WeakMap<Fetcher, Cache>();
const MAX_CACHED_SHARDS = 32;

function cacheFor(bucket: Fetcher): Cache {
  let cache = caches.get(bucket);
  if (!cache) {
    cache = { shards: new Map() };
    caches.set(bucket, cache);
  }
  return cache;
}

function validKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    /^quiz-content\/v1\/units\/[a-zA-Z0-9_%.-]+\/[a-zA-Z0-9-]+\/(quiz-\d+|bank-\d+|bank-index)\.json$/.test(key) &&
    !key.split("/").some((part) => part === "." || part === "..")
  );
}

const mediaKeyPattern = /^quiz-content\/v1\/media\/[a-f0-9]{64}\.json$/;

export async function readQuizMedia(env: QuizContentEnv, id: string): Promise<Response> {
  const key = "quiz-content/v1/media/" + id + ".json";
  if (!mediaKeyPattern.test(key) || !contentIndex.files.some(file => file.key === key)) return new Response(null, { status: 404 });
  const data = await readFile(env, key) as { mimeType?: string; data?: string };
  if (!data || !["image/png", "image/jpeg", "image/webp"].includes(data.mimeType || "") || typeof data.data !== "string" || data.data.length > 4 * 1024 * 1024) throw new QuizContentError("Imagem privada inválida.");
  const bytes = Uint8Array.from(atob(data.data), character => character.charCodeAt(0));
  return new Response(bytes, { headers: { "content-type": data.mimeType!, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

function validRows(value: unknown): value is ContentRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        typeof row.id === "string",
    )
  );
}

export function validateManifest(
  value: unknown,
): asserts value is QuizContentManifest {
  const manifest = value as QuizContentManifest;
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.revision !== "string" ||
    !Number.isFinite(manifest.updatedAt) ||
    !manifest.shards ||
    typeof manifest.shards !== "object" ||
    Array.isArray(manifest.shards) ||
    !Object.values(manifest.shards).every(
      (keys) => Array.isArray(keys) && keys.every(validKey),
    ) ||
    !manifest.bankIndexes ||
    typeof manifest.bankIndexes !== "object" ||
    Array.isArray(manifest.bankIndexes) ||
    !Object.values(manifest.bankIndexes).every(validKey) ||
    !validRows(manifest.topics) ||
    !validRows(manifest.questions)
  )
    throw new QuizContentError("O índice das perguntas é inválido.");
  for (const rows of [manifest.topics, manifest.questions]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new QuizContentError("O índice contém IDs repetidos.");
  }
  const topics = new Map(manifest.topics.map((topic) => [topic.id, topic]));
  if (
    manifest.questions.some(
      (row) =>
        !manifest.shards[String(row.curricular_unit_id)]?.includes(
          String(row._chunk),
        ) ||
        topics.get(row.topic_id)?.curricular_unit_id !== row.curricular_unit_id,
    )
  ) {
    throw new QuizContentError("O índice contém referências inválidas.");
  }
}

export function validateShard(
  value: unknown,
  unitId: string,
): asserts value is QuizContentShard {
  const shard = value as QuizContentShard;
  if (
    !shard ||
    shard.schemaVersion !== 1 ||
    shard.unitId !== unitId ||
    ![
      shard.questions,
      shard.options,
      shard.bankQuestions,
      shard.bankTopics,
      shard.bankSources,
    ].every(validRows)
  ) {
    throw new QuizContentError("O ficheiro das perguntas é inválido.");
  }
  if (
    shard.questions.some((row) => row.curricular_unit_id !== unitId) ||
    shard.bankQuestions.some((row) => row.curricular_unit_id !== unitId)
  ) {
    throw new QuizContentError(
      "O ficheiro contém perguntas de outra disciplina.",
    );
  }
  const ids = new Set(shard.questions.map((row) => row.id));
  if (
    ids.size !== shard.questions.length ||
    shard.options.some((option) => !ids.has(option.question_id))
  ) {
    throw new QuizContentError("O ficheiro contém opções ou IDs inválidos.");
  }
}

const keys = new WeakMap<
  Fetcher,
  { encoded: string; value: Promise<CryptoKey> }
>();

function contentSecret(env: QuizContentEnv): string | undefined {
  return (contentIndex as { keySlot?: string }).keySlot === "next" ? env.QUIZ_CONTENT_KEY_NEXT : env.QUIZ_CONTENT_KEY;
}

async function readFile(env: QuizContentEnv, key: string): Promise<unknown> {
  const secret = contentSecret(env);
  if (!env.ASSETS || !secret)
    throw new QuizContentError(
      "Os ficheiros privados das perguntas ainda não estão disponíveis.",
      503,
      "QUIZ_CONTENT_NOT_READY",
    );
  try {
    let saved = keys.get(env.ASSETS);
    if (!saved || saved.encoded !== secret) {
      const bytes = Uint8Array.from(atob(secret), (c) =>
        c.charCodeAt(0),
      );
      if (bytes.length !== 32) throw new Error("Invalid key");
      saved = {
        encoded: secret,
        value: crypto.subtle.importKey(
          "raw",
          bytes,
          { name: "AES-GCM" },
          false,
          ["decrypt"],
        ),
      };
      keys.set(env.ASSETS, saved);
    }
    const response = await env.ASSETS.fetch(
      new Request(
        "https://quiz-assets.internal/__private_quiz/" + key + ".enc",
      ),
    );
    if (!response.ok) throw new Error("Missing file");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 29) throw new Error("Invalid file");
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: buffer.slice(0, 12),
        additionalData: new TextEncoder().encode(key),
      },
      await saved.value,
      buffer.slice(12),
    );
    const value: unknown = await new Response(
      new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).json();
    return value;
  } catch (error) {
    if (error instanceof QuizContentError) throw error;
    throw new QuizContentError(
      "Não foi possível abrir os ficheiros privados das perguntas.",
    );
  }
}

async function readManifest(env: QuizContentEnv): Promise<ManifestVersion> {
  const bucket = env.ASSETS;
  if (!bucket)
    throw new QuizContentError(
      "O armazenamento privado das perguntas não está disponível.",
    );
  const cache = cacheFor(bucket);
  if (cache.version) return cache.version;
  if (cache.pending) return cache.pending;
  const pending = (async () => {
    const manifest: unknown = await readFile(env, QUIZ_CONTENT_MANIFEST_KEY);
    validateManifest(manifest);
    if (manifest.revision !== contentIndex.revision)
      throw new QuizContentError(
        "Os ficheiros das perguntas não correspondem a esta versão da aplicação.",
      );
    const version = { manifest };
    cache.version = version;
    return version;
  })();
  cache.pending = pending;
  try {
    return await pending;
  } finally {
    if (cache.pending === pending) delete cache.pending;
  }
}

// A complete maintenance backup, including archived/deleted content. The secret
// stays in the Worker; only authenticated administrators can reach this stream.
export async function createQuizContentExport(env: QuizContentEnv, index = contentIndex, offset = 0): Promise<Response> {
  if (!Number.isInteger(offset) || offset < 0 || offset >= index.files.length || offset % 32 !== 0) throw new QuizContentError("Parte de backup inválida.", 400);
  await readManifest(env);
  const encoder = new TextEncoder();
  let position = -1;
  const end = Math.min(offset + 32, index.files.length);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (position === -1) {
          const units = await env.DB.prepare("SELECT id,code FROM curricular_units ORDER BY id").all<ContentRow>();
          controller.enqueue(encoder.encode(JSON.stringify({ type: "index", revision: index.revision, counts: index.counts, fileCount: index.files.length, offset, partFileCount: end - offset, units: units.results }) + "\n"));
          position = offset;
          return;
        }
        const file = position < end ? index.files[position++] : null;
        if (!file) { controller.close(); return; }
        if (file.key !== QUIZ_CONTENT_MANIFEST_KEY && !validKey(file.key) && !mediaKeyPattern.test(file.key)) throw new QuizContentError("Referência de backup inválida.");
        const content = JSON.stringify(await readFile(env, file.key));
        const bytes = encoder.encode(content);
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
        controller.enqueue(encoder.encode(JSON.stringify({ type: "file", key: file.key, bytes: bytes.length, sha256, content }) + "\n"));
      } catch { controller.error(new Error("Não foi possível concluir a exportação privada.")); }
    },
  });
  return new Response(stream, { headers: {
    "content-type": "application/x-ndjson; charset=utf-8",
    "content-disposition": 'attachment; filename="quiz-content-private-backup-' + String(offset).padStart(4, "0") + '.ndjson"',
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  } });
}

export class QuizContentStore {
  private constructor(
    private env: QuizContentEnv,
    private version: ManifestVersion,
  ) {}
  static async open(env: QuizContentEnv): Promise<QuizContentStore | null> {
    if (env.QUIZ_CONTENT_STORAGE !== "files") return null;
    if (!env.ASSETS || !contentSecret(env))
      throw new QuizContentError(
        "Os ficheiros privados das perguntas ainda não estão disponíveis.",
        503,
        "QUIZ_CONTENT_NOT_READY",
      );
    const cache = cacheFor(env.ASSETS);
    if (keys.get(env.ASSETS)?.encoded !== contentSecret(env)) {
      delete cache.version;
      cache.shards.clear();
    }
    return new QuizContentStore(env, await readManifest(env));
  }
  get manifest(): QuizContentManifest {
    return this.version.manifest;
  }
  topic(id: string): ContentRow | null {
    return (
      this.manifest.topics.find(
        (row) => row.id === id && row.deleted_at == null,
      ) || null
    );
  }

  private async readChunk(
    unitId: string,
    key: string,
  ): Promise<QuizContentShard> {
    if (!validKey(key))
      throw new QuizContentError("A referência das perguntas é inválida.");
    const cache = cacheFor(this.env.ASSETS!);
    let pending = cache.shards.get(key);
    if (!pending) {
      pending = (async () => {
        const shard: unknown = await readFile(this.env, key);
        validateShard(shard, unitId);
        return shard;
      })();
      cache.shards.set(key, pending);
      while (cache.shards.size > MAX_CACHED_SHARDS)
        cache.shards.delete(cache.shards.keys().next().value!);
    }
    try {
      return await pending;
    } catch (error) {
      cache.shards.delete(key);
      throw error;
    }
  }
  async shard(unitId: string): Promise<QuizContentShard> {
    const key = this.manifest.bankIndexes[unitId];
    if (key) return this.readChunk(unitId, key);
    return {
      schemaVersion: 1,
      unitId,
      questions: [],
      options: [],
      bankQuestions: [],
      bankTopics: [],
      bankSources: [],
    };
  }
  async bankQuestions(
    unitId: string,
    metadata: ContentRow[],
  ): Promise<ContentRow[]> {
    const keys = [...new Set(metadata.map((q) => String(q._chunk)))];
    const rows = (
      await Promise.all(keys.map((key) => this.readChunk(unitId, key)))
    ).flatMap((chunk) => chunk.bankQuestions);
    const byId = new Map(rows.map((q) => [q.id, q]));
    return metadata.map((q) => {
      const found = byId.get(q.id);
      if (!found)
        throw new QuizContentError(
          "Falta uma pergunta no armazenamento privado.",
        );
      return found;
    });
  }
  async questionsByIds(ids: string[]): Promise<ContentRow[]> {
    const wanted = new Set(ids);
    const metadata = this.manifest.questions.filter((q) =>
      wanted.has(String(q.id)),
    );
    const keys = new Map(
      metadata.map((q) => [String(q._chunk), String(q.curricular_unit_id)]),
    );
    const chunks = await Promise.all(
      [...keys].map(([key, unit]) => this.readChunk(unit, key)),
    );
    const rows = new Map(
      chunks.flatMap((chunk) => chunk.questions).map((q) => [q.id, q]),
    );
    return metadata.map((q) => {
      const found = rows.get(q.id);
      if (!found)
        throw new QuizContentError(
          "Falta uma pergunta no armazenamento privado.",
        );
      return { ...found, ...q };
    });
  }
  async questions(unitId?: string): Promise<ContentRow[]> {
    return this.questionsByIds(
      this.manifest.questions
        .filter((q) => !unitId || q.curricular_unit_id === unitId)
        .map((q) => String(q.id)),
    );
  }
  async question(id: string): Promise<ContentRow | null> {
    return (await this.questionsByIds([id]))[0] || null;
  }
  async rawOptions(ids: string[]): Promise<ContentRow[]> {
    const wanted = new Set(ids);
    const keys = new Map(
      this.manifest.questions
        .filter((q) => wanted.has(String(q.id)))
        .map((q) => [String(q._chunk), String(q.curricular_unit_id)]),
    );
    return (
      await Promise.all(
        [...keys].map(([key, unit]) => this.readChunk(unit, key)),
      )
    ).flatMap((chunk) =>
      chunk.options.filter((o) => wanted.has(String(o.question_id))),
    );
  }
  async options(
    ids: string[],
  ): Promise<
    Map<
      string,
      Array<{ id: string; text: string; position: number; isCorrect: boolean }>
    >
  > {
    const result = new Map<
      string,
      Array<{ id: string; text: string; position: number; isCorrect: boolean }>
    >();
    for (const row of await this.rawOptions(ids)) {
      const options = result.get(String(row.question_id)) || [];
      options.push({
        id: String(row.id),
        text: String(row.option_text),
        position: Number(row.position),
        isCorrect: Number(row.is_correct) === 1,
      });
      result.set(String(row.question_id), options);
    }
    for (const options of result.values())
      options.sort((a, b) => a.position - b.position);
    return result;
  }
}
