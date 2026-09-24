/// <reference types="@cloudflare/workers-types" />

import { reserveR2ReadOperations } from "@/worker/r2-read-budget";

export type MaterialsCatalogUser = {
  id: string;
  role: string;
  commissionPosition: string | null;
  commissionDepartment: string | null;
};

export type MaterialsCatalogEnv = {
  DB: D1Database;
  MATERIALS_BUCKET?: R2Bucket;
};

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

async function download(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT id,file_name,mime_type,storage_backend,storage_key,storage_state,publication_status FROM material_catalog WHERE id=? AND publication_status='published'").bind(id).first<Record<string, unknown>>();
  if (!item) return json({ error: "Material não encontrado." }, 404);
  if (item.storage_backend !== "r2" || item.storage_state !== "ready" || !item.storage_key) return json({ error: "Este ficheiro está catalogado, mas ainda aguarda disponibilização no armazenamento.", code: "STORAGE_NOT_READY" }, 409);
  return objectDownload(request, env, String(item.storage_key), String(item.file_name || "material"), String(item.mime_type || "application/octet-stream"));
}

async function viewPdf(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT file_name,mime_type,storage_backend,storage_key,storage_state FROM material_catalog WHERE id=? AND publication_status='published'").bind(id).first<Record<string, unknown>>();
  if (!item || item.mime_type !== "application/pdf") return json({ error: "PDF não encontrado." }, 404);
  if (item.storage_backend !== "r2" || item.storage_state !== "ready" || !item.storage_key) return json({ error: "Este PDF ainda aguarda disponibilização no armazenamento.", code: "STORAGE_NOT_READY" }, 409);
  return objectDownload(request, env, String(item.storage_key), String(item.file_name || "material.pdf"), "application/pdf", "inline");
}

function finiteCoordinate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

async function pdfHighlights(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.catalog") || !await enabled("materials.library")) return disabled();
  const material = await env.DB.prepare("SELECT id FROM material_catalog WHERE id=? AND mime_type='application/pdf' AND publication_status='published'").bind(id).first();
  if (!material) return json({ error: "PDF não encontrado." }, 404);
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,page_number,x,y,width,height,color,selected_text,note,created_at,updated_at FROM material_pdf_highlights WHERE user_id=? AND material_id=? ORDER BY page_number,created_at").bind(user.id, id).all();
    return json({ highlights: result.results.map((item) => { const value = row(item); return { id: value.id, page: value.page_number, x: value.x, y: value.y, width: value.width, height: value.height, color: value.color, selectedText: value.selected_text, note: value.note, createdAt: value.created_at, updatedAt: value.updated_at }; }) });
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
  if (request.method !== "POST" && request.method !== "PUT") return json({ error: "Operação não suportada." }, 405);
  const page = Number(body.page), x = finiteCoordinate(body.x), y = finiteCoordinate(body.y), width = finiteCoordinate(body.width), height = finiteCoordinate(body.height);
  const color = text(body.color, 12) || "gold", selectedText = text(body.selectedText, 1200), note = text(body.note, 800);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || x === null || y === null || width === null || height === null || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001 || !["gold", "blue", "green", "rose"].includes(color)) return json({ error: "Coordenadas do realce inválidas." }, 400);
  const now = Date.now();
  if (request.method === "PUT") {
    if (!highlightId) return json({ error: "Realce inválido." }, 400);
    const result = await env.DB.prepare("UPDATE material_pdf_highlights SET page_number=?,x=?,y=?,width=?,height=?,color=?,selected_text=?,note=?,updated_at=? WHERE id=? AND user_id=? AND material_id=?")
      .bind(page, x, y, width, height, color, selectedText || null, note || null, now, highlightId, user.id, id).run();
    if (!result.meta.changes) return json({ error: "Realce não encontrado." }, 404);
    return json({ highlight: { id: highlightId, page, x, y, width, height, color, selectedText, note, updatedAt: now } });
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM material_pdf_highlights WHERE user_id=? AND material_id=?").bind(user.id, id).first<{ total: number }>();
  if (Number(count?.total || 0) >= 500) return json({ error: "Este PDF atingiu o limite de 500 realces." }, 409);
  const finalId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO material_pdf_highlights(id,user_id,material_id,page_number,x,y,width,height,color,selected_text,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(finalId, user.id, id, page, x, y, width, height, color, selectedText || null, note || null, now, now).run();
  return json({ highlight: { id: finalId, page, x, y, width, height, color, selectedText, note, createdAt: now, updatedAt: now } }, 201);
}

async function ankiDownload(request: Request, env: MaterialsCatalogEnv, id: string, user: MaterialsCatalogUser, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.anki")) return disabled();
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
  const item = await env.DB.prepare("SELECT id,file_name,mime_type,storage_backend,storage_key,storage_state,publication_status FROM material_anki_decks WHERE id=? AND publication_status='published'").bind(id).first<Record<string, unknown>>();
  if (!item) return json({ error: "Baralho Anki não encontrado." }, 404);
  if (item.storage_backend !== "r2" || item.storage_state !== "ready" || !item.storage_key) return json({ error: "Este baralho está catalogado, mas ainda aguarda disponibilização no armazenamento.", code: "STORAGE_NOT_READY" }, 409);
  return objectDownload(request, env, String(item.storage_key), String(item.file_name || "baralho.apkg"), String(item.mime_type || "application/apkg"));
}

export function isMaterialsCatalogPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/api/material-catalog" || path === "/api/material-anki" || /^\/api\/material-catalog\/[^/]+\/(download|view|highlights)$/.test(path) || /^\/api\/material-anki\/[^/]+\/download$/.test(path);
}

export async function handleMaterialsCatalogRoute(request: Request, env: MaterialsCatalogEnv, url: URL, user: MaterialsCatalogUser | null, enabled: ModuleChecker): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/material-catalog") return user ? catalog(request, env, url, user, enabled) : unauthenticated();
  if (path === "/api/material-anki") return user ? anki(request, env, url, user, enabled) : unauthenticated();
  const item = path.match(/^\/api\/material-catalog\/([^/]+)\/download$/);
  if (item) return user ? download(request, env, decodeURIComponent(item[1]), user, enabled) : unauthenticated();
  const viewer = path.match(/^\/api\/material-catalog\/([^/]+)\/view$/);
  if (viewer) return user ? viewPdf(request, env, decodeURIComponent(viewer[1]), user, enabled) : unauthenticated();
  const highlights = path.match(/^\/api\/material-catalog\/([^/]+)\/highlights$/);
  if (highlights) return user ? pdfHighlights(request, env, decodeURIComponent(highlights[1]), user, enabled) : unauthenticated();
  const deck = path.match(/^\/api\/material-anki\/([^/]+)\/download$/);
  if (deck) return user ? ankiDownload(request, env, decodeURIComponent(deck[1]), user, enabled) : unauthenticated();
  return json({ error: "Operação não suportada." }, 405);
}
