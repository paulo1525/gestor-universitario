/// <reference types="@cloudflare/workers-types" />

/**
 * Google Drive as the storage of the year's materials.
 *
 * The commission keeps the files in one Drive folder (never shared publicly), shared read-only with a
 * Google service account. The site periodically indexes that folder into material_catalog (name, subject,
 * type, size) and, on download, streams the file from Drive, so access control and redaction stay on the site.
 *
 * Expected layout:
 *   <root folder>/<UC: code or name, e.g. "NEURO" or "Neuroanatomia">/<type: Sumários | Resumos | Bibliografia | Anki | Exames | Outros>/<files…>
 * Files directly inside a UC folder count as "Outros". Google Docs and Slides are exported as PDF.
 *
 * Configuration (Cloudflare secrets, never in the repository):
 *   GOOGLE_SERVICE_ACCOUNT_JSON  JSON key of the service account (client_email, private_key)
 *   GOOGLE_DRIVE_FOLDER_ID       id of the root folder
 */

export type DriveEnv = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
};

type DriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };
type Kind = { kind: "summary" | "bibliography" | "anki" | "exam" | "other"; summaryFormat: "lecture" | "notes" | null };
export type DriveSyncResult = { ok: boolean; files: number; archived: number; unmatched: string[]; message: string };

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
// Native Google files that can be exported to PDF; any other native type (forms, sheets…) is skipped.
const EXPORTABLE = new Set(["application/vnd.google-apps.document", "application/vnd.google-apps.presentation", "application/vnd.google-apps.drawing"]);
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const MAX_DEPTH = 4;
const MAX_FILES = 2000;

export function driveConfigured(env: Partial<DriveEnv>): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_DRIVE_FOLDER_ID);
}

// ---- Authentication (service account, read-only scope) ----------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(bytes: ArrayBuffer | Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(env: DriveEnv): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}") as { client_email?: string; private_key?: string };
  if (!key.client_email || !key.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON inválido.");
  const pem = key.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const signingKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64Url(signature)}` }),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(`Autenticação no Google Drive falhou: ${data.error_description || response.status}`);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function listChildren(token: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ q: `'${folderId.replace(/'/g, "")}' in parents and trashed=false`, fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)", pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${DRIVE_API}/files?${params}`, { headers: { authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({})) as { files?: DriveFile[]; nextPageToken?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(`Google Drive: ${data.error?.message || response.status}`);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

// ---- Folder conventions ----------------------------------------------------------------------

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-PT").replace(/\s+/g, " ").trim();
}

export function kindFromFolder(name: string): Kind {
  const folder = normalize(name);
  if (/^resumo/.test(folder)) return { kind: "summary", summaryFormat: "notes" };
  if (/^sumario/.test(folder)) return { kind: "summary", summaryFormat: "lecture" };
  if (/^(bibliografia|livro)/.test(folder)) return { kind: "bibliography", summaryFormat: null };
  if (/^(anki|baralho)/.test(folder)) return { kind: "anki", summaryFormat: null };
  if (/^(exame|teste|frequencia)/.test(folder)) return { kind: "exam", summaryFormat: null };
  return { kind: "other", summaryFormat: null };
}

/** A UC folder may be named after the code ("NEURO"), the name ("Neuroanatomia") or both ("NEURO - Neuroanatomia"). */
export function matchUnit(folderName: string, units: Array<{ id: string; code: string; name: string }>): string | null {
  const folder = normalize(folderName);
  for (const unit of units) {
    const code = normalize(unit.code), name = normalize(unit.name);
    if (folder === code || folder === name || folder.startsWith(`${code} `) || folder.startsWith(`${code}-`) || folder.endsWith(` ${name}`)) return unit.id;
  }
  return null;
}

function title(fileName: string): string {
  return fileName.replace(/\.(pdf|docx?|pptx?|apkg|png|jpe?g|webp|txt)$/i, "").trim() || fileName;
}

// ---- Synchronisation ---------------------------------------------------------------------------

async function collectFiles(token: string, folderId: string, depth: number, out: DriveFile[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  for (const item of await listChildren(token, folderId)) {
    if (item.mimeType === FOLDER) await collectFiles(token, item.id, depth + 1, out);
    else if (!item.mimeType.startsWith("application/vnd.google-apps.") || EXPORTABLE.has(item.mimeType)) out.push(item);
  }
}

/**
 * Indexes the Drive folder into material_catalog. Rows are keyed "drive-<file id>"; the public/session
 * choice (public_access) made on the site is never overwritten. Files that disappeared from Drive are
 * archived, but only after a complete, successful listing.
 */
export async function syncDriveMaterials(env: DriveEnv): Promise<DriveSyncResult> {
  if (!driveConfigured(env)) return { ok: false, files: 0, archived: 0, unmatched: [], message: "Google Drive não configurado." };
  const token = await accessToken(env);
  const units = (await env.DB.prepare("SELECT id,code,name FROM curricular_units").all()).results.map((row) => row as { id: string; code: string; name: string });
  const now = Date.now(), unmatched: string[] = [], statements: D1PreparedStatement[] = [], seen: string[] = [];
  for (const unitFolder of await listChildren(token, String(env.GOOGLE_DRIVE_FOLDER_ID))) {
    if (unitFolder.mimeType !== FOLDER) continue;
    const unitId = matchUnit(unitFolder.name, units);
    if (!unitId) { unmatched.push(unitFolder.name); continue; }
    for (const child of await listChildren(token, unitFolder.id)) {
      const kind = child.mimeType === FOLDER ? kindFromFolder(child.name) : { kind: "other" as const, summaryFormat: null };
      const files: DriveFile[] = [];
      if (child.mimeType === FOLDER) await collectFiles(token, child.id, 1, files);
      else if (!child.mimeType.startsWith("application/vnd.google-apps.") || EXPORTABLE.has(child.mimeType)) files.push(child);
      for (const file of files) {
        const exported = EXPORTABLE.has(file.mimeType), id = `drive-${file.id}`;
        const mime = exported ? "application/pdf" : file.mimeType, fileName = exported ? `${file.name}.pdf` : file.name;
        seen.push(id);
        statements.push(env.DB.prepare(`INSERT INTO material_catalog(id,curricular_unit_id,material_kind,summary_format,title,description,file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,verification_status,publication_status,created_at,updated_at)
          VALUES (?,?,?,?,?,'',?,?,'external',?,'ready',?,'original','published',?,?)
          ON CONFLICT(id) DO UPDATE SET curricular_unit_id=excluded.curricular_unit_id,material_kind=excluded.material_kind,summary_format=excluded.summary_format,title=excluded.title,file_name=excluded.file_name,mime_type=excluded.mime_type,storage_key=excluded.storage_key,storage_state='ready',byte_size=excluded.byte_size,publication_status='published',updated_at=excluded.updated_at`)
          .bind(id, unitId, kind.kind, kind.summaryFormat, title(file.name), fileName, mime, `${exported ? "drive-export" : "drive"}:${file.id}`, file.size ? Number(file.size) : null, now, now));
      }
    }
  }
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  // Anything indexed from Drive before and not seen now was removed or moved out of the folder.
  const previous = (await env.DB.prepare("SELECT id FROM material_catalog WHERE id LIKE 'drive-%' AND publication_status='published'").all()).results.map((row) => String((row as { id: string }).id));
  const seenSet = new Set(seen), gone = previous.filter((id) => !seenSet.has(id));
  for (let index = 0; index < gone.length; index += 50) await env.DB.batch(gone.slice(index, index + 50).map((id) => env.DB.prepare("UPDATE material_catalog SET publication_status='archived',updated_at=? WHERE id=?").bind(now, id)));
  return { ok: true, files: seen.length, archived: gone.length, unmatched, message: unmatched.length ? `Pastas sem UC correspondente: ${unmatched.join(", ")}` : "Sincronizado." };
}

/** Runs a sync and records it; the conditional update is a lock so two requests never sync at once. */
export async function runDriveSync(env: DriveEnv, { force = false } = {}): Promise<DriveSyncResult | null> {
  if (!driveConfigured(env)) return null;
  const now = Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO drive_sync_state(id,last_started_at,last_status) VALUES ('materials',0,'never')").run();
  const claim = await env.DB.prepare("UPDATE drive_sync_state SET last_started_at=?,last_status='running' WHERE id='materials' AND (last_status!='running' OR last_started_at<?) AND (? OR last_started_at<?)")
    .bind(now, now - 10 * 60 * 1000, force ? 1 : 0, now - SYNC_INTERVAL_MS).run();
  if (!claim.meta.changes) return null;
  try {
    const result = await syncDriveMaterials(env);
    await env.DB.prepare("UPDATE drive_sync_state SET last_finished_at=?,last_status='ok',last_message=?,files_count=? WHERE id='materials'").bind(Date.now(), result.message, result.files).run();
    return result;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message.slice(0, 500) : "Erro desconhecido.";
    await env.DB.prepare("UPDATE drive_sync_state SET last_finished_at=?,last_status='error',last_message=? WHERE id='materials'").bind(Date.now(), message).run();
    return { ok: false, files: 0, archived: 0, unmatched: [], message };
  }
}

export async function driveSyncStatus(env: DriveEnv) {
  const row = driveConfigured(env) ? await env.DB.prepare("SELECT last_started_at,last_finished_at,last_status,last_message,files_count FROM drive_sync_state WHERE id='materials'").first<Record<string, unknown>>().catch(() => null) : null;
  return { configured: driveConfigured(env), lastFinishedAt: row?.last_finished_at ?? null, status: row?.last_status ?? "never", message: row?.last_message ?? "", files: Number(row?.files_count || 0) };
}

// ---- Download (streamed from Drive; the file is never made public there) ----------------------

export function isDriveKey(key: unknown): key is string {
  return typeof key === "string" && /^drive(-export)?:[\w-]+$/.test(key);
}

export async function driveDownload(request: Request, env: DriveEnv, key: string, fileName: string, mimeType: string, disposition: "attachment" | "inline" = "attachment"): Promise<Response> {
  if (!driveConfigured(env)) return new Response(JSON.stringify({ error: "O Google Drive não está configurado.", code: "STORAGE_NOT_READY" }), { status: 409, headers: { "content-type": "application/json; charset=utf-8" } });
  const [mode, id] = key.split(":");
  const exported = mode === "drive-export";
  const token = await accessToken(env);
  const upstreamHeaders: Record<string, string> = { authorization: `Bearer ${token}` };
  const range = request.headers.get("range");
  if (range && !exported) upstreamHeaders.range = range;
  const upstream = await fetch(exported ? `${DRIVE_API}/files/${id}/export?mimeType=application%2Fpdf` : `${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`, { headers: upstreamHeaders });
  if (!upstream.ok) return new Response(JSON.stringify({ error: "Não foi possível obter o ficheiro do Google Drive." }), { status: upstream.status === 404 ? 404 : 502, headers: { "content-type": "application/json; charset=utf-8" } });
  const headers = new Headers();
  headers.set("content-type", mimeType || upstream.headers.get("content-type") || "application/octet-stream");
  headers.set("content-disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName || "material")}`);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  if (!exported) headers.set("accept-ranges", "bytes");
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}
