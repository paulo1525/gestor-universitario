/// <reference types="@cloudflare/workers-types" />

import { reserveR2ReadOperations } from "@/worker/r2-read-budget";
import { driveConfigured, driveDownload, driveSyncStatus, isDriveKey, runDriveSync } from "@/worker/google-drive";

export type MaterialsCatalogUser = {
  id: string;
  role: string;
  commissionPosition: string | null;
  commissionDepartment: string | null;
};

export type MaterialsCatalogEnv = {
  DB: D1Database;
  MATERIALS_BUCKET?: R2Bucket;
  AUTH_RATE_LIMITER?: RateLimit;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
};

type WaitUntil = (promise: Promise<unknown>) => void;

type ModuleChecker = (key: string) => Promise<boolean>;
type ApiCard = {
  id: string;
  type: "multiple_choice" | "short_answer" | "image";
  unitCode?: string;
  unitName?: string;
  lesson: string;
  subtopic: string;
  chapter?: string;
  question: string;
  answer: string;
  hint: string;
  source: string;
  sourceLabel?: string;
  sourcePage?: string;
  sourceQuestion?: string;
  assessment?: string;
  session?: string;
  academicYear?: string;
  imageKey: string | null;
  imageUrl: string | null;
  tags: string[];
  options?: Array<{ text: string; isCorrect: boolean }>;
};

const catalogKinds = new Set(["summary", "bibliography", "anki", "exam", "other"]);
const cardTypes = new Set(["short_answer", "short"]);

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function text(value: unknown, max: number): string { return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : ""; }
function row(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }
function isManager(user: MaterialsCatalogUser | null): boolean { return Boolean(user && (user.role === "admin" || user.commissionDepartment === "management")); }
function unauthenticated(): Response { return json({ error: "Sessão inválida." }, 401); }
function disabled(): Response { return json({ error: "Este módulo está temporariamente desativado.", code: "MODULE_DISABLED" }, 404); }
const bibliographyFormats = new Set(["complete", "excerpt", "translation"]);
/** Formato explícito da migration 0065; antes dela, as páginas definem um excerto. */
function bibliographyFormat(item: Record<string, unknown>): string {
  if (typeof item.bibliography_format === "string" && bibliographyFormats.has(item.bibliography_format)) return item.bibliography_format;
  return item.printed_page_start || item.physical_page_start ? "excerpt" : "complete";
}
function mapCatalogItem(item: Record<string, unknown>, lessonCodes: string[] = []) {
  const ready = item.storage_state === "ready";
  const externalUrl = typeof item.external_url === "string" && /^https?:\/\//i.test(item.external_url)
    ? item.external_url
    : null;
  return {
    id: item.id,
    unitId: item.curricular_unit_id,
    unitCode: item.unit_code,
    unitName: item.unit_name,
    lessonId: item.lesson_id,
    lessonCode: item.lesson_code,
    lessonCodes,
    kind: item.material_kind,
    bibliographyFormat: item.material_kind === "bibliography" ? bibliographyFormat(item) : null,
    summaryFormat: item.material_kind === "summary" ? (item.summary_format === "notes" ? "notes" : "lecture") : null,
    publicAccess: Number(item.public_access) === 1,
    title: item.title,
    description: item.description,
    fileName: item.file_name,
    mimeType: item.mime_type,
    storage: { backend: item.storage_backend, state: item.storage_state, ready, size: item.byte_size, checksum: item.checksum_sha256 },
    downloadUrl: ready && item.storage_backend !== "inline"
      ? externalUrl || `/api/material-catalog/${encodeURIComponent(String(item.id))}/download`
      : null,
    viewUrl: ready && item.mime_type === "application/pdf" && !externalUrl
      ? `/api/material-catalog/${encodeURIComponent(String(item.id))}/view`
      : null,
    verification: item.verification_status,
    status: item.publication_status,
    source: item.source_id ? { id: item.source_id, title: item.source_title, edition: item.source_edition, author: item.source_author } : null,
    pages: { printedStart: item.printed_page_start, printedEnd: item.printed_page_end, physicalStart: item.physical_page_start, physicalEnd: item.physical_page_end, note: item.page_note },
    version: { group: item.version_group, number: item.version_number },
    recommended: item.is_recommended === 1,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}
function mapDeck(item: Record<string, unknown>, lessonRows: Array<Record<string, unknown>>) {
  return {
    id: item.id,
    unitId: item.curricular_unit_id,
    title: item.title,
    variant: item.variant,
    description: item.description,
    fileName: item.file_name,
    cardCount: Number(item.card_count || 0),
    mediaCount: Number(item.media_count || 0),
    storage: { backend: item.storage_backend, state: item.storage_state, ready: item.storage_state === "ready", size: item.byte_size, checksum: item.checksum_sha256 },
    downloadUrl: item.storage_state === "ready" ? `/api/material-anki/${encodeURIComponent(String(item.id))}/download` : null,
    publicAccess: Number(item.public_access) === 1,
    status: item.publication_status,
    sourceFileName: item.source_file_name,
    lessons: lessonRows.filter((lesson) => String(lesson.deck_id) === String(item.id)).map((lesson) => ({ id: lesson.lesson_id, code: lesson.code, title: lesson.title, cardCount: Number(lesson.card_count || 0) })),
  };
}
async function reviewedQuestionBankCards(
  env: MaterialsCatalogEnv,
  unitId: string,
  unitCode: string,
  subtopics: string[],
  types: string[],
): Promise<ApiCard[]> {
  const wantedTypes = new Set(types.filter(Boolean).map((value) => value === "short" ? "short_answer" : value));
  if (wantedTypes.size && !wantedTypes.has("short_answer")) return [];
  const wantedSubtopics = new Set(subtopics.filter(Boolean).map((value) => value.toLocaleLowerCase("pt-PT")));
  try {
    const result = await env.DB.prepare(`
      SELECT
        q.id,
        q.prompt,
        q.answer_text,
        q.source_subtopic,
        q.source_academic_year,
        q.source_page,
        q.source_question,
        q.source_assessment,
        q.source_session,
        t.title AS topic_title,
        t.chapter_number,
        cu.code AS unit_code,
        cu.name AS unit_name
      FROM question_bank_items q
      JOIN question_bank_topics t ON t.id=q.topic_id
      JOIN curricular_units cu ON cu.id=q.curricular_unit_id
      WHERE q.status='published'
        AND trim(q.review_note)=''
        AND trim(q.answer_text)<>''
        AND (?='' OR q.curricular_unit_id=?)
        AND (?='' OR lower(cu.code)=lower(?))
      ORDER BY q.sort_order,q.id
      LIMIT 2000
    `).bind(unitId, unitId, unitCode, unitCode).all();
    return result.results.map(row).flatMap((item): ApiCard[] => {
      const topic = text(item.source_subtopic, 180) || text(item.topic_title, 180) || "Neuroanatomia";
      if (wantedSubtopics.size && !wantedSubtopics.has(topic.toLocaleLowerCase("pt-PT"))) return [];
      const code = text(item.unit_code, 40) || unitCode;
      const chapter = text(item.chapter_number, 40);
      const sourcePage = text(item.source_page, 80);
      const sourceQuestion = text(item.source_question, 120);
      const assessment = text(item.source_assessment, 160);
      const session = text(item.source_session, 160);
      const academicYear = text(item.source_academic_year, 80);
      const sourceParts = ["Banco de perguntas revisto", academicYear, assessment, session, sourcePage, sourceQuestion].filter(Boolean);
      return [{
        id: `question-bank-${String(item.id)}`,
        type: "short_answer",
        unitCode: code,
        unitName: text(item.unit_name, 160),
        lesson: "",
        subtopic: topic,
        chapter,
        question: text(item.prompt, 2400),
        answer: text(item.answer_text, 2400),
        hint: "",
        source: sourceParts.join(" · "),
        sourceLabel: "Banco de perguntas revisto",
        sourcePage,
        sourceQuestion,
        assessment,
        session,
        academicYear,
        imageKey: null,
        imageUrl: null,
        tags: [code, chapter ? `capitulo-${chapter}` : "", topic, "short_answer"].filter(Boolean),
      }];
    });
  } catch {
    // Mantém o catálogo utilizável em previews locais onde a migration do
    // banco de perguntas ainda não exista.
    return [];
  }
}

async function catalog(request: Request, env: MaterialsCatalogEnv, url: URL, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
  const unitId = text(url.searchParams.get("unitId"), 100), lessonCode = text(url.searchParams.get("lesson"), 20).toUpperCase(), kind = text(url.searchParams.get("kind"), 30), query = text(url.searchParams.get("q"), 180);
  const queryPattern = query ? `%${query}%` : "";
  const conditions = ["m.publication_status='published'", "(?='' OR m.curricular_unit_id=?)", "(?='' OR m.material_kind=?)", "(?='' OR lower(m.title || ' ' || m.description) LIKE lower(?))"];
  const bindings: unknown[] = [unitId, unitId, kind && catalogKinds.has(kind) ? kind : "", kind && catalogKinds.has(kind) ? kind : "", queryPattern, queryPattern];
  if (lessonCode) { conditions.push("(EXISTS (SELECT 1 FROM material_catalog_lessons ml_filter JOIN material_lessons fl ON fl.id=ml_filter.lesson_id WHERE ml_filter.material_id=m.id AND fl.code=?) OR ml.code=?)"); bindings.push(lessonCode, lessonCode); }
  const [itemsResult, lessonsResult, sourcesResult, deckResult, deckLessonsResult] = await Promise.all([
    env.DB.prepare(`SELECT m.*,cu.code AS unit_code,cu.name AS unit_name,ml.code AS lesson_code,src.title AS source_title,src.edition AS source_edition,src.author AS source_author FROM material_catalog m LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id LEFT JOIN material_lessons ml ON ml.id=m.lesson_id LEFT JOIN material_sources src ON src.id=m.source_id WHERE ${conditions.join(" AND ")} ORDER BY CASE m.material_kind WHEN 'summary' THEN 1 WHEN 'bibliography' THEN 2 WHEN 'anki' THEN 3 ELSE 4 END,m.is_recommended DESC,m.updated_at DESC LIMIT 500`).bind(...bindings).all(),
    env.DB.prepare("SELECT id,curricular_unit_id,code,title,lesson_type,sort_order FROM material_lessons WHERE (?='' OR curricular_unit_id=?) ORDER BY sort_order,code").bind(unitId, unitId).all(),
    env.DB.prepare("SELECT id,title,author,edition,citation FROM material_sources ORDER BY title,edition").all(),
    env.DB.prepare("SELECT * FROM material_anki_decks WHERE publication_status='published' AND (?='' OR curricular_unit_id=?) ORDER BY CASE variant WHEN 'essential' THEN 1 WHEN 'complete' THEN 2 ELSE 3 END,title").bind(unitId, unitId).all(),
    env.DB.prepare("SELECT dl.deck_id,dl.lesson_id,dl.card_count,l.code,l.title FROM material_anki_deck_lessons dl JOIN material_lessons l ON l.id=dl.lesson_id ORDER BY l.sort_order,l.code").all(),
  ]);
  const lessons = lessonsResult.results.map(row);
  const materialIds = itemsResult.results.map((item) => String(row(item).id));
  const associationRows = materialIds.length
    ? (await env.DB.prepare(`SELECT ml.material_id,l.code FROM material_catalog_lessons ml JOIN material_lessons l ON l.id=ml.lesson_id WHERE ml.material_id IN (${materialIds.map(() => "?").join(",")}) ORDER BY l.sort_order,l.code`).bind(...materialIds).all()).results.map(row)
    : [];
  const lessonCodesByMaterial = new Map<string, string[]>();
  for (const association of associationRows) {
    const materialId = String(association.material_id);
    const values = lessonCodesByMaterial.get(materialId) || [];
    values.push(String(association.code));
    lessonCodesByMaterial.set(materialId, values);
  }
  const catalogItems = itemsResult.results.map((item) => {
    const material = row(item);
    return mapCatalogItem(material, lessonCodesByMaterial.get(String(material.id)) || []);
  });
  const decks = deckResult.results.map((item) => mapDeck(row(item), deckLessonsResult.results.map(row)));
  return json({ items: catalogItems, materials: catalogItems, lessons: lessons.map((item) => ({ id: item.id, unitId: item.curricular_unit_id, code: item.code, title: item.title, type: item.lesson_type, order: item.sort_order })), sources: sourcesResult.results.map((item) => ({ id: item.id, title: item.title, author: item.author, edition: item.edition, citation: item.citation })), decks, filters: { unitId, lesson: lessonCode, kind, query }, capabilities: { manage: isManager(user), storage: Boolean(env.MATERIALS_BUCKET) } });
}

/** One published material, for the annotator page (/materiais/ler/?id=…). */
async function catalogItem(request: Request, env: MaterialsCatalogEnv, id: string, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT m.*,cu.code AS unit_code,cu.name AS unit_name,ml.code AS lesson_code,src.title AS source_title,src.edition AS source_edition,src.author AS source_author FROM material_catalog m LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id LEFT JOIN material_lessons ml ON ml.id=m.lesson_id LEFT JOIN material_sources src ON src.id=m.source_id WHERE m.id=? AND m.publication_status='published'").bind(id).first<Record<string, unknown>>();
  if (!item) return json({ error: "Material não encontrado." }, 404);
  return json({ item: mapCatalogItem(item) });
}

async function anki(request: Request, env: MaterialsCatalogEnv, url: URL, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.anki")) return disabled();
  if (!user) return unauthenticated();
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
  const variant = text(url.searchParams.get("variant"), 20) || "reviewed";
  if (variant !== "reviewed") return json({ error: "Pacote Anki legado indisponível; use a versão revista.", code: "LEGACY_ANKI_RETIRED" }, 410);
  const unitId = text(url.searchParams.get("unitId"), 100);
  const unitCode = text(url.searchParams.get("unitCode"), 40) || "NEURO";
  const subtopics = url.searchParams.getAll("subtopic").concat((url.searchParams.get("subtopics") || "").split("\n")).map((value) => text(value, 180)).filter(Boolean);
  const types = url.searchParams.getAll("type").concat((url.searchParams.get("types") || "").split(",")).map((value) => text(value, 30)).filter(Boolean);
  if (types.some((value) => !cardTypes.has(value))) return json({ error: "Tipo de cartão inválido." }, 400);
  const cards = await reviewedQuestionBankCards(env, unitId, unitCode, subtopics, types);
  const facets = [...new Set(cards.map((card) => `${card.subtopic}\u0000${card.type}`))].map((key) => {
    const [subtopic, type] = key.split("\u0000");
    return { lesson: "", subtopic, type, cardCount: cards.filter((card) => card.subtopic === subtopic && card.type === type).length };
  });
  return json({
    variant,
    source: { label: "question-bank-reviewed", file: null, noteCount: cards.length },
    cards,
    cardCount: cards.length,
    totalCardCount: cards.length,
    lessons: [],
    subtopics: facets,
    capabilities: { customBuilder: true, storage: false, media: false, protectedBinaryPackages: false },
  });
}

type ByteRange = { offset: number; length: number };

function parseByteRange(value: string | null, size: number): ByteRange | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || value.includes(",")) return "invalid";
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ((start !== null && (!Number.isSafeInteger(start) || start < 0)) || (end !== null && (!Number.isSafeInteger(end) || end < 0))) return "invalid";
  if (size <= 0) return "invalid";
  if (start === null) {
    if (!end) return "invalid";
    const length = Math.min(end, size);
    return { offset: size - length, length };
  }
  if (start >= size) return "invalid";
  const last = end === null ? size - 1 : Math.min(end, size - 1);
  if (last < start) return "invalid";
  return { offset: start, length: last - start + 1 };
}

function objectNotModified(request: Request, object: { httpEtag?: string; etag?: string; uploaded?: Date }): boolean {
  const etag = object.httpEtag || object.etag || "";
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    const normaliseTag = (value: string) => value.trim().replace(/^W\//i, "");
    const matches = ifNoneMatch.split(",").map(normaliseTag);
    if (matches.includes("*") || (etag && matches.includes(normaliseTag(etag)))) return true;
    return false;
  }
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince || !object.uploaded) return false;
  const since = Date.parse(ifModifiedSince);
  return Number.isFinite(since) && object.uploaded.getTime() <= since + 999;
}

function downloadHeaders(object: { writeHttpMetadata(headers: Headers): void; httpEtag?: string; etag?: string; uploaded?: Date; size: number }, fileName: string, mimeType: string, length: number, range: ByteRange | null, totalSize = object.size, disposition: "attachment" | "inline" = "attachment"): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has("content-type")) headers.set("content-type", mimeType || "application/octet-stream");
  headers.set("content-disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName || "material")}`);
  headers.set("cache-control", "private, max-age=3600, stale-while-revalidate=86400");
  headers.set("x-content-type-options", "nosniff");
  headers.set("accept-ranges", "bytes");
  if (object.httpEtag || object.etag) headers.set("etag", object.httpEtag || object.etag || "");
  if (object.uploaded) headers.set("last-modified", object.uploaded.toUTCString());
  headers.set("content-length", String(length));
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${totalSize}`);
  return headers;
}

export async function objectDownload(request: Request, env: MaterialsCatalogEnv, key: string, fileName: string, mimeType: string, disposition: "attachment" | "inline" = "attachment"): Promise<Response> {
  if (!env.MATERIALS_BUCKET) return json({ error: "O armazenamento de materiais ainda não foi provisionado.", code: "STORAGE_NOT_READY" }, 409);
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return json({ error: "Operação não suportada." }, 405);

  const rangeHeader = request.headers.get("range");
  const hasRange = rangeHeader !== null;
  const hasCondition = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
  const needsMetadata = method === "HEAD" || hasRange || hasCondition;

  // Metadata is enough for HEAD, conditional responses and invalid ranges. A
  // second reservation is made only when a GET still needs the object body;
  // malformed Range requests therefore cannot burn two Class B operations.
  const reservation = await reserveR2ReadOperations(env.DB, 1);
  if (reservation === "exhausted") return json({ error: "O limite mensal de downloads foi atingido. Tente novamente no próximo mês.", code: "R2_READ_BUDGET_EXHAUSTED" }, 429);
  if (reservation === "unavailable") return json({ error: "Os downloads estão temporariamente indisponíveis.", code: "R2_READ_BUDGET_UNAVAILABLE" }, 503);

  // Normal downloads perform a single streaming R2 get. Metadata is requested
  // first for HEAD, conditional requests and byte ranges, where the total size
  // is needed to build a correct Content-Range/416 response.
  let metadata: R2Object | null = null;
  if (needsMetadata) {
    try {
      metadata = await env.MATERIALS_BUCKET.head(key);
    } catch {
      return json({ error: "O armazenamento está temporariamente indisponível.", code: "STORAGE_UNAVAILABLE" }, 503);
    }
  }
  if (metadata && objectNotModified(request, metadata)) {
    const headers = downloadHeaders(metadata, fileName, mimeType, metadata.size, null, metadata.size, disposition);
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }
  if (needsMetadata && !metadata) return json({ error: "Ficheiro ainda não disponível no armazenamento.", code: "MATERIAL_NOT_FOUND" }, 404);

  const range = parseByteRange(rangeHeader, metadata?.size ?? 0);
  if (range === "invalid") {
    const headers = new Headers({ "content-range": `bytes */${metadata?.size ?? 0}`, "accept-ranges": "bytes", "cache-control": "private, max-age=60" });
    return new Response(null, { status: 416, headers });
  }

  if (method === "HEAD") {
    if (!metadata) return json({ error: "Ficheiro ainda não disponível no armazenamento.", code: "MATERIAL_NOT_FOUND" }, 404);
    const headers = downloadHeaders(metadata, fileName || key.split("/").pop() || "material", mimeType, range?.length ?? metadata.size, range, metadata.size, disposition);
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  if (needsMetadata) {
    const bodyReservation = await reserveR2ReadOperations(env.DB, 1);
    if (bodyReservation === "exhausted") return json({ error: "O limite mensal de downloads foi atingido. Tente novamente no próximo mês.", code: "R2_READ_BUDGET_EXHAUSTED" }, 429);
    if (bodyReservation === "unavailable") return json({ error: "Os downloads estão temporariamente indisponíveis.", code: "R2_READ_BUDGET_UNAVAILABLE" }, 503);
  }

  // The R2 body is returned directly so the Worker keeps the download as a
  // stream. For a ranged response, metadata.size is the complete object size;
  // R2ObjectBody.size may describe only the selected range.
  let object: R2ObjectBody | null = null;
  try {
    object = range
      ? await env.MATERIALS_BUCKET.get(key, { range: { offset: range.offset, length: range.length } })
      : await env.MATERIALS_BUCKET.get(key);
  } catch {
    return json({ error: "O armazenamento está temporariamente indisponível.", code: "STORAGE_UNAVAILABLE" }, 503);
  }
  if (!object) return json({ error: "Ficheiro ainda não disponível no armazenamento.", code: "MATERIAL_NOT_FOUND" }, 404);
  const contentLength = range?.length ?? object.size;
  const headers = downloadHeaders(object, fileName || key.split("/").pop() || "material", mimeType, contentLength, range, metadata?.size ?? object.size, disposition);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

async function download(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT id,file_name,mime_type,storage_backend,storage_key,storage_state,publication_status,public_access FROM material_catalog WHERE id=? AND publication_status='published'").bind(id).first<Record<string, unknown>>();
  const denied = await anonymousDenied(request, env, user, item);
  if (denied) return denied;
  if (!item) return json({ error: "Material não encontrado." }, 404);
  if (item.storage_state === "ready" && isDriveKey(item.storage_key)) return driveDownload(request, env, item.storage_key, String(item.file_name || "material"), String(item.mime_type || "application/octet-stream"));
  if (item.storage_backend !== "r2" || item.storage_state !== "ready" || !item.storage_key) return json({ error: "Este ficheiro está catalogado, mas ainda aguarda disponibilização no armazenamento.", code: "STORAGE_NOT_READY" }, 409);
  return objectDownload(request, env, String(item.storage_key), String(item.file_name || "material"), String(item.mime_type || "application/octet-stream"));
}

async function viewPdf(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT file_name,mime_type,storage_backend,storage_key,storage_state,public_access FROM material_catalog WHERE id=? AND publication_status='published'").bind(id).first<Record<string, unknown>>();
  const denied = await anonymousDenied(request, env, user, item);
  if (denied) return denied;
  if (!item || item.mime_type !== "application/pdf") return json({ error: "PDF não encontrado." }, 404);
  if (item.storage_state === "ready" && isDriveKey(item.storage_key)) return driveDownload(request, env, item.storage_key, String(item.file_name || "material.pdf"), "application/pdf", "inline");
  if (item.storage_backend !== "r2" || item.storage_state !== "ready" || !item.storage_key) return json({ error: "Este PDF ainda aguarda disponibilização no armazenamento.", code: "STORAGE_NOT_READY" }, 409);
  return objectDownload(request, env, String(item.storage_key), String(item.file_name || "material.pdf"), "application/pdf", "inline");
}

function finiteCoordinate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

type HighlightRect = { x: number; y: number; width: number; height: number };
const highlightColors = ["gold", "blue", "green", "rose"];

/** Up to 80 normalised line rectangles from a text selection; invalid entries are dropped. */
function highlightRects(value: unknown): HighlightRect[] {
  if (!Array.isArray(value)) return [];
  const rects: HighlightRect[] = [];
  for (const item of value.slice(0, 80)) {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const x = finiteCoordinate(entry.x), y = finiteCoordinate(entry.y), width = finiteCoordinate(entry.width), height = finiteCoordinate(entry.height);
    if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) continue;
    rects.push({ x, y, width, height });
  }
  return rects;
}

function parseStoredRects(value: unknown): HighlightRect[] {
  if (typeof value !== "string" || !value) return [];
  try { return highlightRects(JSON.parse(value)); } catch { return []; }
}

function mapHighlight(value: Record<string, unknown>) {
  return { id: value.id, page: value.page_number, x: value.x, y: value.y, width: value.width, height: value.height, rects: parseStoredRects(value.rects), color: value.color, selectedText: value.selected_text, note: value.note, createdAt: value.created_at, updatedAt: value.updated_at };
}

// Migration 0073 adds `rects`; until it runs, highlights are stored without them.
function missingRectsColumn(reason: unknown) {
  return reason instanceof Error && /no such column: rects|no column named rects/i.test(reason.message);
}

async function pdfHighlights(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  const material = await env.DB.prepare("SELECT id FROM material_catalog WHERE id=? AND mime_type='application/pdf' AND publication_status='published'").bind(id).first();
  if (!material) return json({ error: "PDF não encontrado." }, 404);
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM material_pdf_highlights WHERE user_id=? AND material_id=? ORDER BY page_number,y,created_at").bind(user.id, id).all();
    return json({ highlights: result.results.map((item) => mapHighlight(row(item))) });
  }
  let body: Record<string, unknown> | null = null;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "Pedido inválido." }, 400); }
  const highlightId = text(body.id, 100);
  if (request.method === "DELETE") {
    if (!highlightId) return json({ error: "Realce inválido." }, 400);
    const result = await env.DB.prepare("DELETE FROM material_pdf_highlights WHERE id=? AND user_id=? AND material_id=?").bind(highlightId, user.id, id).run();
    if (!result.meta.changes) return json({ error: "Realce não encontrado." }, 404);
    return json({ ok: true });
  }
  const now = Date.now();
  if (request.method === "PATCH") {
    // Only the colour and the note change; the geometry stays as highlighted.
    if (!highlightId) return json({ error: "Realce inválido." }, 400);
    const current = await env.DB.prepare("SELECT * FROM material_pdf_highlights WHERE id=? AND user_id=? AND material_id=?").bind(highlightId, user.id, id).first<Record<string, unknown>>();
    if (!current) return json({ error: "Realce não encontrado." }, 404);
    const color = body.color === undefined ? String(current.color) : text(body.color, 12);
    const note = body.note === undefined ? (current.note as string | null) : (text(body.note, 800) || null);
    if (!highlightColors.includes(color)) return json({ error: "Cor inválida." }, 400);
    await env.DB.prepare("UPDATE material_pdf_highlights SET color=?,note=?,updated_at=? WHERE id=? AND user_id=? AND material_id=?").bind(color, note, now, highlightId, user.id, id).run();
    return json({ highlight: mapHighlight({ ...current, color, note, updated_at: now }) });
  }
  if (request.method !== "POST" && request.method !== "PUT") return json({ error: "Operação não suportada." }, 405);
  const page = Number(body.page), x = finiteCoordinate(body.x), y = finiteCoordinate(body.y), width = finiteCoordinate(body.width), height = finiteCoordinate(body.height);
  const color = text(body.color, 12) || "gold", selectedText = text(body.selectedText, 2000), note = text(body.note, 800);
  const rects = highlightRects(body.rects);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || x === null || y === null || width === null || height === null || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001 || !highlightColors.includes(color)) return json({ error: "Coordenadas do realce inválidas." }, 400);
  const rectsJson = rects.length ? JSON.stringify(rects) : null;
  if (request.method === "PUT") {
    if (!highlightId) return json({ error: "Realce inválido." }, 400);
    const result = await env.DB.prepare("UPDATE material_pdf_highlights SET page_number=?,x=?,y=?,width=?,height=?,color=?,selected_text=?,note=?,updated_at=? WHERE id=? AND user_id=? AND material_id=?")
      .bind(page, x, y, width, height, color, selectedText || null, note || null, now, highlightId, user.id, id).run();
    if (!result.meta.changes) return json({ error: "Realce não encontrado." }, 404);
    return json({ highlight: { id: highlightId, page, x, y, width, height, rects, color, selectedText, note, updatedAt: now } });
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM material_pdf_highlights WHERE user_id=? AND material_id=?").bind(user.id, id).first<{ total: number }>();
  if (Number(count?.total || 0) >= 500) return json({ error: "Este PDF atingiu o limite de 500 realces." }, 409);
  const finalId = crypto.randomUUID();
  let storedRects = rects;
  try {
    await env.DB.prepare("INSERT INTO material_pdf_highlights(id,user_id,material_id,page_number,x,y,width,height,rects,color,selected_text,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(finalId, user.id, id, page, x, y, width, height, rectsJson, color, selectedText || null, note || null, now, now).run();
  } catch (reason) {
    if (!missingRectsColumn(reason)) throw reason;
    storedRects = [];
    await env.DB.prepare("INSERT INTO material_pdf_highlights(id,user_id,material_id,page_number,x,y,width,height,color,selected_text,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(finalId, user.id, id, page, x, y, width, height, color, selectedText || null, note || null, now, now).run();
  }
  return json({ highlight: { id: finalId, page, x, y, width, height, rects: storedRects, color, selectedText, note, createdAt: now, updatedAt: now } }, 201);
}

async function ankiDownload(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.anki")) return disabled();
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT id,file_name,mime_type,storage_backend,storage_key,storage_state,publication_status,public_access FROM material_anki_decks WHERE id=? AND publication_status='published'").bind(id).first<Record<string, unknown>>();
  const denied = await anonymousDenied(request, env, user, item);
  if (denied) return denied;
  if (!item) return json({ error: "Baralho Anki não encontrado." }, 404);
  if (item.storage_backend !== "r2" || item.storage_state !== "ready" || !item.storage_key) return json({ error: "Este baralho está catalogado, mas ainda aguarda disponibilização no armazenamento.", code: "STORAGE_NOT_READY" }, 409);
  return objectDownload(request, env, String(item.storage_key), String(item.file_name || "baralho.apkg"), String(item.mime_type || "application/apkg"));
}

/**
 * Without a session only items marked public can be downloaded, and each visitor (by IP) is rate limited.
 * A restricted or unknown item answers the same 401, so ids cannot be probed.
 */
async function anonymousDenied(request: Request, env: MaterialsCatalogEnv, user: MaterialsCatalogUser | null, item: Record<string, unknown> | null): Promise<Response | null> {
  if (user) return null;
  if (!item || Number(item.public_access) !== 1) return unauthenticated();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (env.AUTH_RATE_LIMITER && !(await env.AUTH_RATE_LIMITER.limit({ key: `public-material:${ip}` })).success) return json({ error: "Demasiados downloads seguidos. Tente novamente dentro de um minuto." }, 429);
  return null;
}

type PublicSection = "summaries" | "notes" | "bibliography" | "anki" | "other";
const PUBLIC_SECTION_ORDER: PublicSection[] = ["summaries", "notes", "bibliography", "anki", "other"];

function publicSection(item: Record<string, unknown>): PublicSection {
  if (item.material_kind === "summary") return item.summary_format === "notes" ? "notes" : "summaries";
  if (item.material_kind === "bibliography") return "bibliography";
  if (item.material_kind === "anki") return "anki";
  return "other";
}

/**
 * Public page of the year's materials (/materiais-do-ano). Everything published and downloadable is listed;
 * visitors without a session receive only a placeholder (section and unit, never the title, id or link) for items that are not public.
 * Managers can switch an item between public and session-only.
 */
async function publicMaterials(request: Request, env: MaterialsCatalogEnv, user: MaterialsCatalogUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  const manager = isManager(user);
  if (request.method === "PATCH") {
    if (!user) return unauthenticated();
    if (!manager) return json({ error: "Sem permissão para alterar o acesso." }, 403);
    const body = await request.json().catch(() => null) as { id?: unknown; type?: unknown; public?: unknown } | null;
    const id = text(body?.id, 160), type = body?.type === "anki" ? "anki" : body?.type === "catalog" ? "catalog" : "";
    if (!id || !type || typeof body?.public !== "boolean") return json({ error: "Pedido inválido." }, 400);
    const now = Date.now();
    const result = await env.DB.prepare(`UPDATE ${type === "anki" ? "material_anki_decks" : "material_catalog"} SET public_access=?,updated_by=?,updated_at=? WHERE id=? AND publication_status='published'`).bind(body.public ? 1 : 0, user.id, now, id).run();
    if (!result.meta.changes) return json({ error: "Material não encontrado." }, 404);
    await env.DB.prepare("INSERT INTO admin_audit_log(actor_user_id,action,details,created_at) VALUES (?,'material_public_access_updated',?,?)").bind(user.id, JSON.stringify({ id, type, public: body.public }), now).run();
    return json({ ok: true });
  }
  if (request.method !== "GET") return json({ error: "Operação não suportada." }, 405);
  const ankiEnabled = await enabled("materials.anki");
  const [catalogRows, deckRows] = await Promise.all([
    env.DB.prepare("SELECT m.id,m.material_kind,m.summary_format,m.bibliography_format,m.title,m.mime_type,m.file_name,m.storage_backend,m.storage_state,m.external_url,m.public_access,m.byte_size,m.updated_at,cu.id AS unit_id,cu.code AS unit_code,cu.name AS unit_name,cu.study_year,cu.semester FROM material_catalog m LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id WHERE m.publication_status='published' AND m.storage_state='ready' AND m.storage_backend IN ('r2','external') ORDER BY cu.study_year,cu.semester,cu.name COLLATE NOCASE,m.title COLLATE NOCASE LIMIT 800").all(),
    ankiEnabled ? env.DB.prepare("SELECT d.id,d.title,d.file_name,d.storage_state,d.public_access,d.byte_size,d.updated_at,cu.id AS unit_id,cu.code AS unit_code,cu.name AS unit_name,cu.study_year,cu.semester FROM material_anki_decks d JOIN curricular_units cu ON cu.id=d.curricular_unit_id WHERE d.publication_status='published' AND d.storage_state='ready' ORDER BY d.title COLLATE NOCASE").all() : Promise.resolve({ results: [] as unknown[] }),
  ]);
  type Entry = { section: PublicSection; locked: boolean; id?: string; type?: "catalog" | "anki"; title?: string; format?: string | null; href?: string; download?: string; isPublic?: boolean; mime?: string; size?: number | null; updatedAt?: number | null };
  type Unit = { key: string; code: string; name: string; year: number | null; semester: number | null; entries: Entry[] };
  const units = new Map<string, Unit>();
  const unitFor = (item: Record<string, unknown>) => {
    const key = String(item.unit_id || "general");
    if (!units.has(key)) units.set(key, { key, code: String(item.unit_code || ""), name: String(item.unit_name || "Geral"), year: item.study_year == null ? null : Number(item.study_year), semester: item.semester == null ? null : Number(item.semester), entries: [] });
    return units.get(key)!;
  };
  const add = (item: Record<string, unknown>, entry: Omit<Entry, "locked">) => {
    const isPublic = Number(item.public_access) === 1;
    // The redaction happens here, on the server: a locked entry carries only its section.
    unitFor(item).entries.push(user || isPublic ? { ...entry, locked: false, isPublic: manager ? isPublic : undefined } : { section: entry.section, locked: true });
  };
  // Every active subject is a folder, even while it has no files yet (ordered by year, semester and name).
  const unitRows = await env.DB.prepare("SELECT id AS unit_id,code AS unit_code,name AS unit_name,study_year,semester FROM curricular_units WHERE active=1 ORDER BY study_year,semester,name COLLATE NOCASE").all();
  for (const raw of unitRows.results) unitFor(row(raw));
  for (const raw of catalogRows.results) {
    const item = row(raw), id = String(item.id), external = typeof item.external_url === "string" && /^https?:\/\//i.test(item.external_url) ? item.external_url : null;
    const href = external || `/api/material-catalog/${encodeURIComponent(id)}/${item.mime_type === "application/pdf" ? "view" : "download"}`;
    add(item, { section: publicSection(item), id, type: "catalog", title: String(item.title), format: item.material_kind === "bibliography" ? bibliographyFormat(item) : null, href, download: external ? undefined : `/api/material-catalog/${encodeURIComponent(id)}/download`, mime: String(item.mime_type || ""), size: item.byte_size == null ? null : Number(item.byte_size), updatedAt: item.updated_at == null ? null : Number(item.updated_at) });
  }
  for (const raw of deckRows.results) {
    const item = row(raw), id = String(item.id), download = `/api/material-anki/${encodeURIComponent(id)}/download`;
    add(item, { section: "anki", id, type: "anki", title: String(item.title), href: download, download, mime: "application/apkg", size: item.byte_size == null ? null : Number(item.byte_size), updatedAt: item.updated_at == null ? null : Number(item.updated_at) });
  }
  const ordered = [...units.values()].map((unit) => ({ ...unit, entries: unit.entries.sort((a, b) => PUBLIC_SECTION_ORDER.indexOf(a.section) - PUBLIC_SECTION_ORDER.indexOf(b.section) || Number(a.locked) - Number(b.locked)) }));
  return json({ units: ordered, authenticated: Boolean(user), canManage: manager, drive: manager ? await driveSyncStatus(env) : undefined });
}

/** Starts a background Drive sync when the index is older than the sync interval (checked with one read). */
async function refreshDriveInBackground(env: MaterialsCatalogEnv, waitUntil?: WaitUntil) {
  if (!waitUntil || !driveConfigured(env)) return;
  const row = await env.DB.prepare("SELECT last_started_at,last_status FROM drive_sync_state WHERE id='materials'").first<{ last_started_at: number; last_status: string }>().catch(() => null);
  if (row && (row.last_status === "running" || Number(row.last_started_at) > Date.now() - 30 * 60 * 1000)) return;
  waitUntil(runDriveSync(env).catch((reason) => console.error("drive_sync_failed", reason instanceof Error ? reason.message : reason)));
}

/** GET: sync status; POST: sync now. Managers only. */
async function driveSyncRoute(request: Request, env: MaterialsCatalogEnv, user: MaterialsCatalogUser | null): Promise<Response> {
  if (!user) return unauthenticated();
  if (!isManager(user)) return json({ error: "Sem permissão." }, 403);
  if (request.method === "GET") return json(await driveSyncStatus(env));
  if (request.method !== "POST") return json({ error: "Operação não suportada." }, 405);
  if (!driveConfigured(env)) return json({ error: "O Google Drive ainda não está configurado." }, 409);
  const result = await runDriveSync(env, { force: true });
  if (!result) return json({ error: "Já está a decorrer uma sincronização. Tenta daqui a pouco." }, 409);
  await env.DB.prepare("INSERT INTO admin_audit_log(actor_user_id,action,details,created_at) VALUES (?,'drive_materials_synced',?,?)").bind(user.id, JSON.stringify(result), Date.now()).run();
  return json({ ...result, status: await driveSyncStatus(env) }, result.ok ? 200 : 502);
}

export function isMaterialsCatalogPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/api/material-catalog" || path === "/api/material-anki" || path === "/api/public-materials" || path === "/api/drive-sync" || /^\/api\/material-catalog\/[^/]+(?:\/(download|view|highlights))?$/.test(path) || /^\/api\/material-anki\/[^/]+\/download$/.test(path);
}

export async function handleMaterialsCatalogRoute(request: Request, env: MaterialsCatalogEnv, url: URL, user: MaterialsCatalogUser | null, enabled: ModuleChecker, waitUntil?: WaitUntil): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/drive-sync") return driveSyncRoute(request, env, user);
  if (request.method === "GET" && (path === "/api/material-catalog" || path === "/api/public-materials")) await refreshDriveInBackground(env, waitUntil);
  if (path === "/api/material-catalog") return user ? catalog(request, env, url, user, enabled) : unauthenticated();
  if (path === "/api/material-anki") return user ? anki(request, env, url, user, enabled) : unauthenticated();
  if (path === "/api/public-materials") return publicMaterials(request, env, user, enabled);
  const item = path.match(/^\/api\/material-catalog\/([^/]+)\/download$/);
  if (item) return download(request, env, decodeURIComponent(item[1]), user, enabled);
  const viewer = path.match(/^\/api\/material-catalog\/([^/]+)\/view$/);
  if (viewer) return viewPdf(request, env, decodeURIComponent(viewer[1]), user, enabled);
  const highlights = path.match(/^\/api\/material-catalog\/([^/]+)\/highlights$/);
  if (highlights) return user ? pdfHighlights(request, env, decodeURIComponent(highlights[1]), user, enabled) : unauthenticated();
  const single = path.match(/^\/api\/material-catalog\/([^/]+)$/);
  if (single) return user ? catalogItem(request, env, decodeURIComponent(single[1]), enabled) : unauthenticated();
  const deck = path.match(/^\/api\/material-anki\/([^/]+)\/download$/);
  if (deck) return ankiDownload(request, env, decodeURIComponent(deck[1]), user, enabled);
  return json({ error: "Operação não suportada." }, 405);
}
