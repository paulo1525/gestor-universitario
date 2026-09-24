/// <reference types="@cloudflare/workers-types" />

import {
  MATERIAL_FILE_LIMITS,
  MATERIAL_UPLOAD_PART_BYTES,
  kindFromFileName,
  mimeForFile,
  safeObjectName,
  sniffMaterialKind,
  zipCentralDirectoryLocation,
  zipEntryNames,
  zipStructureMatches,
  type MaterialFileKind,
} from "@/lib/material-upload";
import { objectDownload } from "@/worker/materials-catalog";
import { reserveR2ReadOperations } from "@/worker/r2-read-budget";
import {
  checkUserUploadAllowance,
  releaseSubmissionStorage,
  reserveR2WriteOperations,
  reserveSubmissionStorage,
} from "@/worker/r2-write-budget";

// Student uploads go straight to R2 in 8 MiB parts through the Worker, so no
// request exceeds the Workers body limit and D1 only keeps metadata.

type UploadEnv = { DB: D1Database; MATERIALS_BUCKET?: R2Bucket };
type UploadUser = { id: string };
type ModuleChecker = (key: string) => Promise<boolean>;

type SessionRow = {
  id: string;
  user_id: string;
  storage_key: string;
  r2_upload_id: string | null;
  file_name: string;
  file_kind: MaterialFileKind;
  mime_type: string;
  declared_size: number;
  status: "uploading" | "uploaded" | "attached" | "deleted";
  submission_id: string | null;
  created_at: number;
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_CENTRAL_DIRECTORY_BYTES = 4 * 1024 * 1024;
const GENERIC_UNAVAILABLE = "Não foi possível enviar agora. Tenta mais tarde.";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

const unauthenticated = () => json({ error: "Sessão inválida." }, 401);
const disabled = () => json({ error: "Módulo temporariamente desativado." }, 403);
const notFound = () => json({ error: "Envio não encontrado." }, 404);

export function isMaterialUploadPath(pathname: string): boolean {
  return pathname === "/api/material-uploads"
    || /^\/api\/material-uploads\/[^/]+(\/parts\/\d+|\/complete)?$/.test(pathname)
    || /^\/api\/material-submissions\/[^/]+\/files\/[^/]+$/.test(pathname);
}

function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / MATERIAL_UPLOAD_PART_BYTES));
}

async function session(env: UploadEnv, id: string, userId: string): Promise<SessionRow | null> {
  return env.DB.prepare("SELECT * FROM material_upload_sessions WHERE id=? AND user_id=?").bind(id, userId).first<SessionRow>();
}

/** Removes the R2 object (or unfinished multipart upload) and returns its reserved space. */
async function discard(env: UploadEnv, row: SessionRow): Promise<void> {
  const bucket = env.MATERIALS_BUCKET;
  if (bucket) {
    try {
      if (row.status === "uploading" && row.r2_upload_id) await bucket.resumeMultipartUpload(row.storage_key, row.r2_upload_id).abort();
      else await bucket.delete(row.storage_key);
    } catch {
      // The bucket lifecycle rule aborts forgotten multipart uploads after 7 days.
    }
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE material_upload_sessions SET status='deleted', updated_at=? WHERE id=?").bind(now, row.id),
    releaseSubmissionStorage(env.DB, row.declared_size, now),
  ]);
}

/** Opportunistic cleanup of uploads that never reached a submission. */
export async function cleanupStaleUploads(env: UploadEnv, now = Date.now(), limit = 10): Promise<number> {
  const stale = await env.DB.prepare("SELECT * FROM material_upload_sessions WHERE status IN ('uploading','uploaded') AND created_at < ? ORDER BY created_at LIMIT ?").bind(now - STALE_AFTER_MS, limit).all<SessionRow>();
  for (const row of stale.results) await discard(env, row);
  return stale.results.length;
}

async function start(request: Request, env: UploadEnv, user: UploadUser): Promise<Response> {
  const bucket = env.MATERIALS_BUCKET;
  if (!bucket) return json({ error: GENERIC_UNAVAILABLE }, 503);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "Pedido inválido." }, 400); }
  const name = String(body.name ?? "").trim().slice(0, 180);
  const size = Number(body.size);
  const kind = kindFromFileName(name);
  if (!name || !kind) return json({ error: "Formato não suportado." }, 400);
  if (!Number.isInteger(size) || size <= 0) return json({ error: "Ficheiro vazio." }, 400);
  if (size > MATERIAL_FILE_LIMITS[kind]) return json({ error: "Ficheiro demasiado grande." }, 413);

  await cleanupStaleUploads(env);
  const allowance = await checkUserUploadAllowance(env.DB, user.id, size);
  if (allowance === "too_many_uploads") return json({ error: "Aguarda que os envios em curso terminem." }, 429);
  if (allowance !== "allowed") return json({ error: "Atingiste o limite de envios por agora. Tenta mais tarde." }, 429);
  // create + parts + complete + a possible abort.
  if (await reserveR2WriteOperations(env.DB, partCount(size) + 3) !== "allowed") return json({ error: GENERIC_UNAVAILABLE }, 503);
  if (await reserveSubmissionStorage(env.DB, size) !== "allowed") return json({ error: GENERIC_UNAVAILABLE }, 503);

  const id = crypto.randomUUID(), now = Date.now();
  const key = `submissions/${user.id}/${id}/${safeObjectName(name)}`;
  const mime = mimeForFile(name, kind);
  try {
    const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: mime }, customMetadata: { uploadedBy: user.id } });
    await env.DB.prepare("INSERT INTO material_upload_sessions (id,user_id,storage_key,r2_upload_id,file_name,file_kind,mime_type,declared_size,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'uploading',?,?)")
      .bind(id, user.id, key, upload.uploadId, name, kind, mime, size, now, now).run();
  } catch {
    await releaseSubmissionStorage(env.DB, size).run();
    return json({ error: GENERIC_UNAVAILABLE }, 503);
  }
  return json({ id, kind, partSize: MATERIAL_UPLOAD_PART_BYTES, parts: partCount(size) }, 201);
}

async function uploadPart(request: Request, env: UploadEnv, user: UploadUser, id: string, partNumber: number): Promise<Response> {
  const bucket = env.MATERIALS_BUCKET;
  const row = await session(env, id, user.id);
  if (!bucket || !row || row.status !== "uploading" || !row.r2_upload_id) return notFound();
  if (partNumber < 1 || partNumber > partCount(row.declared_size)) return json({ error: "Parte inválida." }, 400);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const expected = partNumber < partCount(row.declared_size) ? MATERIAL_UPLOAD_PART_BYTES : row.declared_size - MATERIAL_UPLOAD_PART_BYTES * (partNumber - 1);
  if (bytes.byteLength !== expected) return json({ error: "Parte com tamanho inválido." }, 400);
  if (partNumber === 1 && !sniffMaterialKind(bytes.subarray(0, 16), row.file_kind)) {
    await discard(env, row);
    return json({ error: "O conteúdo não corresponde ao tipo do ficheiro." }, 415);
  }
  const part = await bucket.resumeMultipartUpload(row.storage_key, row.r2_upload_id).uploadPart(partNumber, bytes);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

async function zipEntries(env: UploadEnv, bucket: R2Bucket, key: string, size: number): Promise<string[] | null> {
  if (await reserveR2ReadOperations(env.DB, 2) !== "allowed") return null;
  const tailLength = Math.min(size, 65_557);
  const tail = await bucket.get(key, { range: { offset: size - tailLength, length: tailLength } });
  if (!tail) return null;
  const location = zipCentralDirectoryLocation(new Uint8Array(await tail.arrayBuffer()), size);
  if (!location || location.size > MAX_CENTRAL_DIRECTORY_BYTES) return null;
  const directory = await bucket.get(key, { range: { offset: location.offset, length: location.size } });
  return directory ? zipEntryNames(new Uint8Array(await directory.arrayBuffer())) : null;
}

async function complete(request: Request, env: UploadEnv, user: UploadUser, id: string): Promise<Response> {
  const bucket = env.MATERIALS_BUCKET;
  const row = await session(env, id, user.id);
  if (!bucket || !row || row.status !== "uploading" || !row.r2_upload_id) return notFound();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "Pedido inválido." }, 400); }
  const parts = (Array.isArray(body.parts) ? body.parts : [])
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({ partNumber: Number(item.partNumber), etag: String(item.etag ?? "") }))
    .filter((item) => Number.isInteger(item.partNumber) && item.etag)
    .sort((a, b) => a.partNumber - b.partNumber);
  if (parts.length !== partCount(row.declared_size)) return json({ error: "Envio incompleto." }, 400);
  let object: R2Object;
  try {
    object = await bucket.resumeMultipartUpload(row.storage_key, row.r2_upload_id).complete(parts);
  } catch {
    await discard(env, row);
    return json({ error: "Não foi possível concluir o envio." }, 400);
  }
  const uploadedRow = { ...row, status: "uploaded" as const };
  if (object.size !== row.declared_size) {
    await discard(env, uploadedRow);
    return json({ error: "Envio incompleto." }, 400);
  }
  if (["docx", "pptx", "apkg"].includes(row.file_kind)) {
    const entries = await zipEntries(env, bucket, row.storage_key, object.size);
    if (!entries || !zipStructureMatches(row.file_kind, entries)) {
      await discard(env, uploadedRow);
      return json({ error: "O conteúdo não corresponde ao tipo do ficheiro." }, 415);
    }
  }
  await env.DB.prepare("UPDATE material_upload_sessions SET status='uploaded', r2_upload_id=NULL, updated_at=? WHERE id=?").bind(Date.now(), row.id).run();
  return json({ id: row.id, kind: row.file_kind, size: object.size });
}

async function cancel(env: UploadEnv, user: UploadUser, id: string): Promise<Response> {
  const row = await session(env, id, user.id);
  if (!row || row.status === "attached" || row.status === "deleted") return notFound();
  await discard(env, row);
  return json({ ok: true });
}

/** Uploads owned by the user and ready to be attached to a new submission. */
export async function readyUploads(env: UploadEnv, userId: string, ids: string[]): Promise<SessionRow[] | null> {
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(`SELECT * FROM material_upload_sessions WHERE user_id=? AND status='uploaded' AND id IN (${placeholders})`).bind(userId, ...ids).all<SessionRow>();
  if (rows.results.length !== ids.length) return null;
  const byId = new Map(rows.results.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)!);
}

export function markUploadsAttached(env: UploadEnv, ids: string[], submissionId: string, now = Date.now()): D1PreparedStatement[] {
  return ids.map((id) => env.DB.prepare("UPDATE material_upload_sessions SET status='attached', submission_id=?, updated_at=? WHERE id=?").bind(submissionId, now, id));
}

/** Deletes a submission's R2 files (e.g. when rejected) and returns their space to the budget. */
export async function deleteSubmissionFiles(env: UploadEnv, submissionId: string): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT storage_key, size_bytes FROM material_submissions WHERE id=? AND storage_backend='r2' AND storage_key IS NOT NULL
    UNION ALL
    SELECT storage_key, size_bytes FROM material_submission_attachments WHERE submission_id=? AND storage_backend='r2' AND storage_key IS NOT NULL
  `).bind(submissionId, submissionId).all<{ storage_key: string; size_bytes: number | null }>();
  if (!rows.results.length) return;
  if (env.MATERIALS_BUCKET) {
    try { await env.MATERIALS_BUCKET.delete(rows.results.map((row) => row.storage_key)); } catch { return; }
  }
  const now = Date.now(), bytes = rows.results.reduce((total, row) => total + (row.size_bytes ?? 0), 0);
  await env.DB.batch([
    env.DB.prepare("UPDATE material_submissions SET storage_backend='removed', storage_key=NULL, updated_at=? WHERE id=?").bind(now, submissionId),
    env.DB.prepare("UPDATE material_submission_attachments SET storage_backend='removed', storage_key=NULL WHERE submission_id=?").bind(submissionId),
    env.DB.prepare("UPDATE material_upload_sessions SET status='deleted', updated_at=? WHERE submission_id=?").bind(now, submissionId),
    releaseSubmissionStorage(env.DB, bytes, now),
  ]);
}

async function download(request: Request, env: UploadEnv, user: UploadUser, submissionId: string, fileId: string, canModerate: boolean): Promise<Response> {
  const submission = await env.DB.prepare("SELECT id,submitted_by,status,material_type,storage_backend,storage_key,attachment_name,attachment_mime FROM material_submissions WHERE id=?").bind(submissionId).first<Record<string, unknown>>();
  if (!submission) return notFound();
  const isOwner = submission.submitted_by === user.id;
  const isPublic = submission.status === "published" && submission.material_type !== "exam_photo";
  if (!isOwner && !canModerate && !isPublic) return notFound();
  const file = fileId === "main"
    ? submission
    : await env.DB.prepare("SELECT storage_backend,storage_key,attachment_name,attachment_mime FROM material_submission_attachments WHERE id=? AND submission_id=?").bind(fileId, submissionId).first<Record<string, unknown>>();
  if (!file || file.storage_backend !== "r2" || !file.storage_key) return notFound();
  const mime = String(file.attachment_mime || "application/octet-stream");
  const inline = mime === "application/pdf" || mime.startsWith("image/");
  return objectDownload(request, env, String(file.storage_key), String(file.attachment_name || "material"), mime, inline ? "inline" : "attachment");
}

export async function handleMaterialUploadRoute(request: Request, env: UploadEnv, url: URL, user: UploadUser | null, enabled: ModuleChecker, canModerate: boolean): Promise<Response> {
  if (!user) return unauthenticated();
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const file = pathname.match(/^\/api\/material-submissions\/([^/]+)\/files\/([^/]+)$/);
  if (file) {
    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Operação não suportada." }, 405);
    if (!await enabled("materials.library") && !canModerate) return disabled();
    return download(request, env, user, decodeURIComponent(file[1]), decodeURIComponent(file[2]), canModerate);
  }
  if (!await enabled("materials.submission")) return disabled();
  if (pathname === "/api/material-uploads" && request.method === "POST") return start(request, env, user);
  const part = pathname.match(/^\/api\/material-uploads\/([^/]+)\/parts\/(\d+)$/);
  if (part && request.method === "PUT") return uploadPart(request, env, user, decodeURIComponent(part[1]), Number(part[2]));
  const done = pathname.match(/^\/api\/material-uploads\/([^/]+)\/complete$/);
  if (done && request.method === "POST") return complete(request, env, user, decodeURIComponent(done[1]));
  const single = pathname.match(/^\/api\/material-uploads\/([^/]+)$/);
  if (single && request.method === "DELETE") return cancel(env, user, decodeURIComponent(single[1]));
  return json({ error: "Operação não suportada." }, 405);
}
