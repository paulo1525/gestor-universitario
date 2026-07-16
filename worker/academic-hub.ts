/// <reference types="@cloudflare/workers-types" />

import { sanitizeRichTextHtml } from "@/lib/announcement-content";

export type HubUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  commissionDepartment: string | null;
  commissionPosition: string | null;
  commissionPositionLabel: string | null;
  representedClass?: number | null;
  actorId?: string;
};

type HubEnv = { DB: D1Database; AUTH_PEPPER: string };
type ModuleChecker = (key: string) => Promise<boolean>;

const PRIMARY_ADMIN = "up202507850@up.pt";
const MATERIAL_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const NOTIFICATION_TYPES = new Set(["announcement", "event", "poll", "request", "material"]);
const USEFUL_LINK_PRIORITIES = new Set(["urgent", "important", "normal"]);
const USEFUL_LINK_CATEGORIES = new Set(["academic", "platform", "curricular_unit", "support", "association", "other"]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function bodyJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function longText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function actor(user: HubUser): string { return user.actorId || user.id; }
function isCommission(user: HubUser | null): boolean { return Boolean(user && (user.role === "admin" || user.commissionPosition)); }
function canManageCore(user: HubUser | null): boolean { return Boolean(user && (user.role === "admin" || user.commissionDepartment === "management")); }
function isPrimary(user: HubUser | null): boolean { return user?.email.toLowerCase().replace("@edu.med.up.pt", "@up.pt") === PRIMARY_ADMIN; }
function disabled(): Response { return json({ error: "Este módulo está temporariamente desativado.", code: "MODULE_DISABLED" }, 404); }
function unauthenticated(): Response { return json({ error: "Sessão inválida." }, 401); }
function forbidden(): Response { return json({ error: "Acesso reservado a membros da Comissão de Curso." }, 403); }
function rowObject(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }

function timestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function audit(env: HubEnv, user: HubUser, action: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,?,?,?)")
    .bind(actor(user), action, JSON.stringify(details), Date.now()).run();
}

async function existingUnit(env: HubEnv, id: string): Promise<boolean> {
  if (!id) return true;
  return Boolean(await env.DB.prepare("SELECT id FROM curricular_units WHERE id=? AND active=1").bind(id).first());
}

async function unitChoices(env: HubEnv): Promise<Array<Record<string, unknown>>> {
  const result = await env.DB.prepare("SELECT id,code,name,ects,study_year,semester FROM curricular_units WHERE active=1 ORDER BY study_year,semester,name COLLATE NOCASE").all();
  return result.results.map((item) => { const row = rowObject(item); return { id: row.id, code: row.code, name: row.name, ects: row.ects, year: row.study_year, semester: row.semester }; });
}

function eventDto(row: Record<string, unknown>) {
  return { id: row.id, title: row.title, description: row.description, type: row.event_type, kind: row.event_type, unitId: row.curricular_unit_id, unitCode: row.unit_code, unitName: row.unit_name, startsAt: row.starts_at, endsAt: row.ends_at, location: row.location, visibility: row.visibility, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function calendar(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  const management = request.method !== "GET";
  if (!await enabled(management ? "calendar.management" : "calendar.events")) return disabled();
  if (management && !isCommission(user)) return forbidden();
  if (request.method === "GET") {
    const from = Number(url.searchParams.get("from") || 0), to = Number(url.searchParams.get("to") || 4102444800000);
    const unitId = text(url.searchParams.get("unitId"), 80);
    const visibility = isCommission(user) ? "1=1" : "e.visibility!='cc'";
    const [result, units] = await Promise.all([env.DB.prepare(`SELECT e.*,cu.code AS unit_code,cu.name AS unit_name FROM academic_events e LEFT JOIN curricular_units cu ON cu.id=e.curricular_unit_id WHERE ${visibility} AND e.ends_at>=? AND e.starts_at<=? AND (?='' OR e.curricular_unit_id=?) ORDER BY e.starts_at LIMIT 500`).bind(from, to, unitId, unitId).all(), unitChoices(env)]);
    return json({ events: result.results.map((row) => eventDto(rowObject(row))), units });
  }
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  if (request.method === "DELETE") {
    const id = text(body.id, 80);
    const result = await env.DB.prepare("DELETE FROM academic_events WHERE id=?").bind(id).run();
    if (!result.meta.changes) return json({ error: "Evento não encontrado." }, 404);
    await audit(env, user, "academic_event_deleted", { id });
    return json({ ok: true });
  }
  if (request.method === "PATCH") {
    const id = text(body.id, 80);
    const startsAt = timestamp(body.startsAt), endsAt = body.endsAt === null ? startsAt : timestamp(body.endsAt);
    if (!id || startsAt === null || endsAt === null || endsAt < startsAt) return json({ error: "Datas do evento inválidas." }, 400);
    const current = await env.DB.prepare("SELECT id,title,event_type FROM academic_events WHERE id=?").bind(id).first<Record<string, unknown>>();
    if (!current) return json({ error: "Evento não encontrado." }, 404);
    const now = Date.now();
    await env.DB.prepare("UPDATE academic_events SET starts_at=?,ends_at=?,updated_by=?,updated_at=? WHERE id=?")
      .bind(startsAt, endsAt, actor(user), now, id).run();
    const type = String(current.event_type);
    const conflicts = ["assessment", "exam", "evaluation"].includes(type) ? await env.DB.prepare("SELECT id,title,starts_at,ends_at FROM academic_events WHERE id!=? AND event_type IN ('assessment','exam','evaluation') AND status='scheduled' AND starts_at<? AND ends_at>? ORDER BY starts_at LIMIT 20").bind(id, endsAt, startsAt).all() : { results: [] };
    await audit(env, user, "academic_event_rescheduled", { id, startsAt, endsAt });
    return json({ ok: true, id, startsAt, endsAt, conflicts: conflicts.results.map((row) => ({ id: rowObject(row).id, title: rowObject(row).title, startsAt: rowObject(row).starts_at, endsAt: rowObject(row).ends_at })) });
  }
  if (!["POST", "PUT"].includes(request.method)) return json({ error: "Operação não suportada." }, 405);
  const id = request.method === "PUT" ? text(body.id, 80) : crypto.randomUUID();
  const title = text(body.title, 160), description = longText(body.description, 5000);
  const type = text(body.type ?? body.eventType, 30) || "event";
  const unitId = text(body.unitId ?? body.curricularUnitId, 80);
  const startsAt = timestamp(body.startsAt), endsAt = timestamp(body.endsAt) ?? startsAt;
  const location = text(body.location, 200), visibility = text(body.visibility, 20) || "students";
  const status = text(body.status, 20) || "scheduled";
  if (title.length < 3 || !["assessment", "exam", "deadline", "academic", "meeting", "event", "evaluation"].includes(type) || startsAt === null || endsAt === null || endsAt < startsAt || !["public", "students", "cc"].includes(visibility) || !["scheduled", "cancelled"].includes(status) || !await existingUnit(env, unitId)) return json({ error: "Dados do evento inválidos." }, 400);
  const now = Date.now();
  if (request.method === "POST") {
    await env.DB.prepare("INSERT INTO academic_events (id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, title, description, type, unitId || null, startsAt, endsAt, location || null, visibility, status, actor(user), actor(user), now, now).run();
  } else {
    const result = await env.DB.prepare("UPDATE academic_events SET title=?,description=?,event_type=?,curricular_unit_id=?,starts_at=?,ends_at=?,location=?,visibility=?,status=?,updated_by=?,updated_at=? WHERE id=?")
      .bind(title, description, type, unitId || null, startsAt, endsAt, location || null, visibility, status, actor(user), now, id).run();
    if (!result.meta.changes) return json({ error: "Evento não encontrado." }, 404);
  }
  const conflicts = ["assessment", "exam", "evaluation"].includes(type) ? await env.DB.prepare("SELECT id,title,starts_at,ends_at FROM academic_events WHERE id!=? AND event_type IN ('assessment','exam','evaluation') AND status='scheduled' AND starts_at<? AND ends_at>? ORDER BY starts_at LIMIT 20").bind(id, endsAt, startsAt).all() : { results: [] };
  await audit(env, user, request.method === "POST" ? "academic_event_created" : "academic_event_updated", { id, title, type });
  return json({ ok: true, id, conflicts: conflicts.results.map((row) => ({ id: rowObject(row).id, title: rowObject(row).title, startsAt: rowObject(row).starts_at, endsAt: rowObject(row).ends_at })) }, request.method === "POST" ? 201 : 200);
}

function bytesBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function documentInput(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) return bodyJson(request);
  try {
    const form = await request.formData(), output: Record<string, unknown> = {};
    for (const key of ["id", "title", "description", "type", "documentType", "visibility", "unitId", "url", "content", "status"]) {
      const value = form.get(key); if (typeof value === "string") output[key] = value;
    }
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 4 * 1024 * 1024 || !MATERIAL_MIMES.has(file.type)) throw new Error("FILE_INVALID");
      output.attachmentName = file.name.slice(0, 180);
      output.attachmentMime = file.type;
      output.attachmentDataUrl = `data:${file.type};base64,${bytesBase64(new Uint8Array(await file.arrayBuffer()))}`;
    }
    return output;
  } catch (error) {
    if (error instanceof Error && error.message === "FILE_INVALID") return { __fileError: true };
    return null;
  }
}

function documentDto(row: Record<string, unknown>, includeContent = true, revealAuthorIdentity = false) {
  return { id: row.id, title: row.title, description: row.description, type: row.document_type, unitId: row.curricular_unit_id, unitCode: row.unit_code, unitName: row.unit_name, url: row.url || row.attachment_data_url, content: includeContent ? row.content : undefined, attachmentName: row.attachment_name, attachmentMime: row.attachment_mime, attachmentDataUrl: includeContent ? row.attachment_data_url : undefined, visibility: row.visibility === "students" ? "authenticated" : row.visibility === "cc" ? "commission" : row.visibility, status: row.status, publishedAt: row.published_at, authorName: row.author_name, authorId: revealAuthorIdentity ? row.author_id : undefined, authorEmail: revealAuthorIdentity ? row.author_email : undefined, authorStudentNumber: revealAuthorIdentity ? row.author_student_number : undefined, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function documents(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  const management = request.method !== "GET";
  if (!await enabled(management ? "documents.management" : "documents.library")) return disabled();
  if (management && (!user || !isCommission(user))) return user ? forbidden() : unauthenticated();
  if (request.method === "GET") {
    const id = text(url.searchParams.get("id"), 80), unitId = text(url.searchParams.get("unitId"), 80);
    const scope = isCommission(user) ? "1=1" : user ? "d.visibility IN ('public','students') AND d.status='published'" : "d.visibility='public' AND d.status='published'";
    const [result, units] = await Promise.all([env.DB.prepare(`SELECT d.*,cu.code AS unit_code,cu.name AS unit_name,u.id AS author_id,u.full_name AS author_name,u.email AS author_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END AS author_student_number FROM academic_documents d LEFT JOIN curricular_units cu ON cu.id=d.curricular_unit_id JOIN users u ON u.id=d.created_by WHERE ${scope} AND (?='' OR d.id=?) AND (?='' OR d.curricular_unit_id=?) ORDER BY COALESCE(d.published_at,d.created_at) DESC LIMIT 300`).bind(id, id, unitId, unitId).all(), unitChoices(env)]);
    return json({ documents: result.results.map((row) => documentDto(rowObject(row), true, isCommission(user))), units });
  }
  const body = await documentInput(request);
  if (!body) return json({ error: "Pedido inválido." }, 400);
  if (body.__fileError) return json({ error: "O ficheiro deve ter até 4 MB e usar um formato suportado (imagem, PDF, texto, Word ou PowerPoint)." }, 413);
  if (request.method === "DELETE") {
    const id = text(body.id, 80);
    const result = await env.DB.prepare("UPDATE academic_documents SET status='archived',updated_by=?,updated_at=? WHERE id=?").bind(actor(user!), Date.now(), id).run();
    if (!result.meta.changes) return json({ error: "Documento não encontrado." }, 404);
    await audit(env, user!, "academic_document_archived", { id });
    return json({ ok: true });
  }
  const id = request.method === "PUT" ? text(body.id, 80) : crypto.randomUUID();
  const title = text(body.title, 180), description = longText(body.description, 3000), type = text(body.type ?? body.documentType, 30) || "document";
  const unitId = text(body.unitId, 80), urlValue = text(body.url, 1000), content = longText(body.content, 100_000);
  const rawVisibility = text(body.visibility, 20) || "authenticated", visibility = rawVisibility === "authenticated" ? "students" : rawVisibility === "commission" ? "cc" : rawVisibility, status = text(body.status, 20) || "published";
  const attachmentName = text(body.attachmentName, 180), attachmentMime = text(body.attachmentMime, 120), attachmentData = typeof body.attachmentDataUrl === "string" ? body.attachmentDataUrl : "";
  const hasStoredResource = request.method === "PUT" && Boolean(id && await env.DB.prepare("SELECT 1 FROM academic_documents WHERE id=? AND (url IS NOT NULL OR content IS NOT NULL OR attachment_data_url IS NOT NULL)").bind(id).first());
  if (title.length < 3 || !["minutes", "regulation", "form", "document"].includes(type) || !["public", "students", "cc"].includes(visibility) || !["draft", "published", "archived"].includes(status) || (!urlValue && !content && !attachmentData && !hasStoredResource) || !await existingUnit(env, unitId)) return json({ error: "Dados do documento inválidos." }, 400);
  const now = Date.now(), publishedAt = status === "published" ? now : null;
  if (request.method === "POST") {
    await env.DB.prepare("INSERT INTO academic_documents (id,title,description,document_type,curricular_unit_id,url,content,attachment_name,attachment_mime,attachment_data_url,visibility,status,published_at,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, title, description, type, unitId || null, urlValue || null, content || null, attachmentName || null, attachmentMime || null, attachmentData || null, visibility, status, publishedAt, actor(user!), actor(user!), now, now).run();
  } else {
    const result = await env.DB.prepare("UPDATE academic_documents SET title=?,description=?,document_type=?,curricular_unit_id=?,url=COALESCE(?,url),content=COALESCE(?,content),attachment_name=COALESCE(?,attachment_name),attachment_mime=COALESCE(?,attachment_mime),attachment_data_url=COALESCE(?,attachment_data_url),visibility=?,status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_by=?,updated_at=? WHERE id=?")
      .bind(title, description, type, unitId || null, urlValue || null, content || null, attachmentName || null, attachmentMime || null, attachmentData || null, visibility, status, status, now, actor(user!), now, id).run();
    if (!result.meta.changes) return json({ error: "Documento não encontrado." }, 404);
  }
  await audit(env, user!, request.method === "POST" ? "academic_document_created" : "academic_document_updated", { id, title, visibility, status });
  return json({ ok: true, id }, request.method === "POST" ? 201 : 200);
}

function requestDto(row: Record<string, unknown>, viewer: HubUser, management: boolean) {
  const owns = row.submitted_by === viewer.id;
  const dto: Record<string, unknown> = { id: row.id, subject: row.subject, body: row.body, category: row.category, unitId: row.curricular_unit_id, unitCode: row.unit_code, unitName: row.unit_name, anonymous: row.anonymous === 1, status: row.status, response: row.response, responseVisibility: row.response_visibility, respondedAt: row.responded_at, createdAt: row.created_at, updatedAt: row.updated_at, isOwn: owns };
  if (row.anonymous !== 1 && (management || owns)) dto.submitter = { id: row.submitted_by, fullName: row.submitter_name, email: row.submitter_email, studentNumber: management ? row.submitter_student_number : undefined };
  if (row.anonymous === 1 && isPrimary(viewer)) dto.internalIdentity = { id: row.submitted_by, fullName: row.submitter_name, email: row.submitter_email, studentNumber: row.submitter_student_number };
  return dto;
}

async function requests(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (request.method === "DELETE") {
    const id = text(url.searchParams.get("id"), 80);
    if (!id) return json({ error: "Pedido inválido." }, 400);
    const current = await env.DB.prepare("SELECT id,subject,submitted_by FROM course_requests WHERE id=?").bind(id).first<Record<string, unknown>>();
    if (!current) return json({ error: "Pedido não encontrado." }, 404);
    const managing = isCommission(user), owns = String(current.submitted_by) === user.id;
    if (!managing && !owns) return json({ error: "Não tem permissão para apagar este pedido." }, 403);
    if (!await enabled(managing ? "requests.management" : "requests.submission")) return disabled();
    const details = JSON.stringify({ id, subject: String(current.subject) });
    const deletion = managing
      ? env.DB.prepare("DELETE FROM course_requests WHERE id=?").bind(id)
      : env.DB.prepare("DELETE FROM course_requests WHERE id=? AND submitted_by=?").bind(id, user.id);
    const result = await env.DB.batch([
      deletion,
      env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) SELECT ?,'course_request_deleted',?,? WHERE changes()>0").bind(actor(user), details, Date.now()),
    ]);
    if (!result[0]?.meta.changes) return json({ error: "Pedido não encontrado." }, 404);
    return json({ ok: true });
  }
  const management = request.method === "PATCH" || url.searchParams.get("scope") === "management";
  if (!await enabled(management ? "requests.management" : "requests.submission")) return disabled();
  if (management && !isCommission(user)) return forbidden();
  if (request.method === "GET") {
    const where = management ? "1=1" : "(r.submitted_by=? OR (r.response_visibility='public' AND r.response IS NOT NULL))";
    const query = `SELECT r.*,cu.code AS unit_code,cu.name AS unit_name,u.full_name AS submitter_name,u.email AS submitter_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END AS submitter_student_number FROM course_requests r LEFT JOIN curricular_units cu ON cu.id=r.curricular_unit_id JOIN users u ON u.id=r.submitted_by WHERE ${where} ORDER BY r.created_at DESC LIMIT 500`;
    const [result, units] = await Promise.all([management ? env.DB.prepare(query).all() : env.DB.prepare(query).bind(user.id).all(), unitChoices(env)]);
    return json({ requests: result.results.map((row) => requestDto(rowObject(row), user, management)), units });
  }
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  if (request.method === "POST") {
    const subject = text(body.subject, 180), content = longText(body.body ?? body.content ?? body.message, 8000), category = text(body.category, 30) || "suggestion", unitId = text(body.unitId, 80), anonymous = body.anonymous === true;
    if (subject.length < 3 || content.length < 10 || !["suggestion", "problem", "curricular_unit", "facilities", "academic", "other", "complaint", "question"].includes(category) || !await existingUnit(env, unitId)) return json({ error: "Preencha o assunto e a mensagem do pedido." }, 400);
    const id = crypto.randomUUID(), now = Date.now();
    await env.DB.prepare("INSERT INTO course_requests (id,subject,body,category,curricular_unit_id,anonymous,submitted_by,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'received',?,?)").bind(id, subject, content, category, unitId || null, anonymous ? 1 : 0, user.id, now, now).run();
    return json({ ok: true, id, anonymous }, 201);
  }
  if (request.method === "PATCH") {
    const id = text(body.id, 80), status = text(body.status, 30), response = longText(body.response, 8000), responseVisibility = text(body.responseVisibility, 20) || "private";
    if (!id || !["received", "reviewing", "forwarded", "resolved", "closed"].includes(status) || (response && !["public", "private"].includes(responseVisibility))) return json({ error: "Atualização inválida." }, 400);
    const now = Date.now();
    const result = await env.DB.prepare("UPDATE course_requests SET status=?,response=?,response_visibility=?,responded_by=?,responded_at=?,updated_at=? WHERE id=?").bind(status, response || null, response ? responseVisibility : null, response ? actor(user) : null, response ? now : null, now, id).run();
    if (!result.meta.changes) return json({ error: "Pedido não encontrado." }, 404);
    await audit(env, user, "course_request_updated", { id, status, responseVisibility: response ? responseVisibility : null });
    return json({ ok: true });
  }
  return json({ error: "Operação não suportada." }, 405);
}

async function directory(env: HubEnv, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("directory.members")) return disabled();
  const [result, unitsResult] = await Promise.all([env.DB.prepare("SELECT u.id,u.email,u.full_name,u.commission_position,u.commission_department,u.class_representative,u.represented_class,p.label AS position_label,p.rank AS position_rank,d.label AS department_label FROM users u JOIN commission_positions p ON p.code=u.commission_position LEFT JOIN commission_departments d ON d.code=u.commission_department WHERE u.status='active' ORDER BY p.rank,u.full_name COLLATE NOCASE").all(), env.DB.prepare("SELECT id,code,name,representative_user_id FROM curricular_units WHERE active=1 ORDER BY name COLLATE NOCASE").all()]);
  const units = unitsResult.results.map(rowObject);
  return json({ members: result.results.map((item) => { const row = rowObject(item); return { id: row.id, email: row.email, fullName: row.full_name, commissionPosition: row.commission_position, commissionPositionLabel: row.position_label, positionCode: row.commission_position, position: row.position_label, commissionDepartment: row.commission_department, departmentCode: row.commission_department, department: row.department_label, classRepresentative: row.class_representative === 1, representedClass: row.represented_class, units: units.filter((unit) => unit.representative_user_id === row.id).map((unit) => ({ id: unit.id, code: unit.code, name: unit.name })) }; }) });
}

async function unitCatalog(env: HubEnv, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("curricular_units.catalog")) return disabled();
  const result = await env.DB.prepare("SELECT cu.id,cu.code,cu.name,cu.ects,cu.study_year,cu.semester,u.id AS representative_id,u.full_name AS representative_name,u.email AS representative_email,p.label AS representative_position FROM curricular_units cu JOIN users u ON u.id=cu.representative_user_id LEFT JOIN commission_positions p ON p.code=u.commission_position WHERE cu.active=1 ORDER BY cu.study_year,cu.semester,cu.name COLLATE NOCASE").all();
  return json({ units: result.results.map((item) => { const row = rowObject(item); return { id: row.id, code: row.code, name: row.name, ects: row.ects, year: row.study_year, semester: row.semester, representativeUserId: row.representative_id, representativeName: row.representative_name, representativePosition: row.representative_position, representative: { id: row.representative_id, name: row.representative_name, email: row.representative_email, position: row.representative_position } }; }) });
}

async function unitDetail(env: HubEnv, id: string, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("curricular_units.detail")) return disabled();
  const unit = await env.DB.prepare("SELECT cu.id,cu.code,cu.name,cu.ects,cu.study_year,cu.semester,u.id AS representative_id,u.full_name AS representative_name,u.email AS representative_email,p.label AS representative_position,d.label AS representative_department FROM curricular_units cu JOIN users u ON u.id=cu.representative_user_id LEFT JOIN commission_positions p ON p.code=u.commission_position LEFT JOIN commission_departments d ON d.code=u.commission_department WHERE cu.id=? AND cu.active=1").bind(id).first();
  if (!unit) return json({ error: "Unidade curricular não encontrada." }, 404);
  const visibility = isCommission(user) ? "1=1" : user ? "visibility!='cc'" : "visibility='public'";
  const [eventsResult, docsResult, announcementsResult, materialsResult] = await Promise.all([
    env.DB.prepare(`SELECT * FROM academic_events WHERE curricular_unit_id=? AND ${visibility} AND status='scheduled' ORDER BY starts_at LIMIT 100`).bind(id).all(),
    env.DB.prepare(`SELECT d.*,u.id AS author_id,u.full_name AS author_name,u.email AS author_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END AS author_student_number FROM academic_documents d JOIN users u ON u.id=d.created_by WHERE d.curricular_unit_id=? AND ${visibility} AND d.status='published' ORDER BY d.published_at DESC LIMIT 100`).bind(id).all(),
    env.DB.prepare("SELECT a.* FROM announcements a JOIN announcement_curricular_units acu ON acu.announcement_id=a.id WHERE acu.curricular_unit_id=? AND a.status='published' AND (a.expires_at IS NULL OR a.expires_at>?) ORDER BY a.published_at DESC LIMIT 50").bind(id, Date.now()).all(),
    env.DB.prepare("SELECT id,title,description,material_type,academic_year,attachment_name,attachment_mime,attachment_data_url,created_at FROM material_submissions WHERE curricular_unit_id=? AND status='published' AND material_type!='exam_photo' ORDER BY created_at DESC LIMIT 100").bind(id).all(),
  ]);
  const row = rowObject(unit);
  return json({ unit: { id: row.id, code: row.code, name: row.name, ects: row.ects, year: row.study_year, semester: row.semester, representative: { id: row.representative_id, fullName: row.representative_name, email: row.representative_email, position: row.representative_position, department: row.representative_department } }, events: eventsResult.results.map((item) => eventDto(rowObject(item))), documents: docsResult.results.map((item) => documentDto(rowObject(item), false, isCommission(user))), announcements: announcementsResult.results, materials: materialsResult.results.map((item) => materialDto(item)) });
}

function pollDto(row: Record<string, unknown>, questions: Array<Record<string, unknown>>, options: Array<Record<string, unknown>>, canResults: boolean, voted: boolean) {
  const pollQuestions = questions.filter((q) => q.poll_id === row.id).map((q) => ({ id: q.id, prompt: q.prompt, selectionType: q.selection_type, required: q.required === 1, options: options.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, label: o.label, votes: canResults ? o.votes : undefined })) }));
  const first = pollQuestions[0];
  return { id: row.id, title: row.title, description: row.description, status: row.status === "published" ? "active" : row.status, resultsVisibility: row.results_visibility, startsAt: row.starts_at, endsAt: row.ends_at, voted, hasVoted: voted, totalVotes: canResults ? row.total_votes : undefined, allowMultiple: first?.selectionType === "multiple", options: first?.options || [], questions: pollQuestions };
}

async function voterHash(env: HubEnv, user: HubUser, pollId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pollId}:${user.id}:${env.AUTH_PEPPER}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return bytesBase64(digest);
}

async function polls(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker, pollId?: string, action?: string): Promise<Response> {
  if (!user) return unauthenticated();
  const management = request.method !== "GET" && action !== "vote";
  if (!await enabled(management ? "polls.management" : "polls.voting")) return disabled();
  if (management && !isCommission(user)) return forbidden();
  if (request.method === "GET") {
    const scope = isCommission(user) && url.searchParams.get("scope") === "management" ? "1=1" : "p.status IN ('published','closed') AND (p.starts_at IS NULL OR p.starts_at<=?)";
    const pollResult = scope === "1=1" ? await env.DB.prepare("SELECT p.*,(SELECT COUNT(*) FROM poll_participations pp WHERE pp.poll_id=p.id) AS total_votes FROM polls p ORDER BY p.created_at DESC").all() : await env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM poll_participations pp WHERE pp.poll_id=p.id) AS total_votes FROM polls p WHERE ${scope} ORDER BY p.created_at DESC`).bind(Date.now()).all();
    const ids = pollResult.results.map((item) => String(rowObject(item).id));
    if (!ids.length) return json({ polls: [], canCreate: isCommission(user), canManage: isCommission(user) });
    const placeholders = ids.map(() => "?").join(",");
    const [questionResult, optionResult, participationResult] = await Promise.all([
      env.DB.prepare(`SELECT * FROM poll_questions WHERE poll_id IN (${placeholders}) ORDER BY sort_order`).bind(...ids).all(),
      env.DB.prepare(`SELECT o.*,COUNT(v.option_id) AS votes FROM poll_options o LEFT JOIN poll_votes v ON v.option_id=o.id WHERE o.question_id IN (SELECT id FROM poll_questions WHERE poll_id IN (${placeholders})) GROUP BY o.id ORDER BY o.sort_order`).bind(...ids).all(),
      Promise.all(ids.map(async (id) => Boolean(await env.DB.prepare("SELECT 1 FROM poll_participations WHERE poll_id=? AND voter_hash=?").bind(id, await voterHash(env, user, id)).first()))),
    ]);
    const questions = questionResult.results.map(rowObject), options = optionResult.results.map(rowObject);
    return json({ polls: pollResult.results.map((item, index) => { const row = rowObject(item), voted = participationResult[index], effectiveStatus = row.status === "published" && row.ends_at !== null && Number(row.ends_at) < Date.now() ? "closed" : row.status; const show = isCommission(user) || row.results_visibility === "always" || (row.results_visibility === "after_vote" && voted) || (row.results_visibility === "after_close" && effectiveStatus === "closed"); return pollDto({ ...row, status: effectiveStatus }, questions, options, show, voted); }), canCreate: isCommission(user), canManage: isCommission(user) });
  }
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  if (action === "vote" && request.method === "POST" && pollId) {
    const poll = await env.DB.prepare("SELECT id,status,starts_at,ends_at FROM polls WHERE id=?").bind(pollId).first<Record<string, unknown>>();
    const now = Date.now();
    if (!poll || poll.status !== "published" || (Number(poll.starts_at || 0) > now) || (poll.ends_at !== null && Number(poll.ends_at) < now)) return json({ error: "Este inquérito não está aberto." }, 409);
    const questionsResult = await env.DB.prepare("SELECT id,selection_type,required FROM poll_questions WHERE poll_id=?").bind(pollId).all<Record<string, unknown>>();
    const answers = Array.isArray(body.answers) ? body.answers as Array<Record<string, unknown>> : Array.isArray(body.optionIds) && questionsResult.results[0] ? [{ questionId: questionsResult.results[0].id, optionIds: body.optionIds }] : [];
    const hash = await voterHash(env, user, pollId), statements: D1PreparedStatement[] = [env.DB.prepare("INSERT INTO poll_participations (poll_id,voter_hash,created_at) VALUES (?,?,?)").bind(pollId, hash, now)];
    for (const question of questionsResult.results) {
      const answer = answers.find((item) => item.questionId === question.id), optionIds = answer && Array.isArray(answer.optionIds) ? [...new Set(answer.optionIds.map(String))] : [];
      if ((question.required === 1 && !optionIds.length) || (question.selection_type === "single" && optionIds.length !== 1)) return json({ error: "Responda a todas as perguntas obrigatórias." }, 400);
      if (optionIds.length) {
        const valid = await env.DB.prepare(`SELECT id FROM poll_options WHERE question_id=? AND id IN (${optionIds.map(() => "?").join(",")})`).bind(question.id, ...optionIds).all();
        if (valid.results.length !== optionIds.length) return json({ error: "Opção de resposta inválida." }, 400);
        for (const optionId of optionIds) statements.push(env.DB.prepare("INSERT INTO poll_votes (poll_id,question_id,option_id,voter_hash,created_at) VALUES (?,?,?,?,?)").bind(pollId, question.id, optionId, hash, now));
      }
    }
    try { await env.DB.batch(statements); } catch { return json({ error: "Já respondeu a este inquérito." }, 409); }
    return json({ ok: true, anonymous: true }, 201);
  }
  if (request.method === "DELETE") {
    const id = text(body.id, 80);
    if (!id) return json({ error: "Inquérito inválido." }, 400);
    const current = await env.DB.prepare("SELECT id,title FROM polls WHERE id=?").bind(id).first<{ id: string; title: string }>();
    if (!current) return json({ error: "Inquérito não encontrado." }, 404);
    const result = await env.DB.prepare("DELETE FROM polls WHERE id=?").bind(id).run();
    if (!result.meta.changes) return json({ error: "Inquérito não encontrado." }, 404);
    await audit(env, user, "poll_deleted", { id, title: current.title });
    return json({ ok: true });
  }
  if (request.method === "POST") {
    const title = text(body.title, 180), description = longText(body.description, 3000), resultsVisibility = text(body.resultsVisibility, 30) || "after_vote";
    const simpleOptions = Array.isArray(body.options) ? body.options : [];
    const simplePoll = !Array.isArray(body.questions) && simpleOptions.length > 0;
    const questions = Array.isArray(body.questions) ? body.questions as Array<Record<string, unknown>> : simplePoll ? [{ prompt: title, selectionType: body.allowMultiple === true ? "multiple" : "single", required: true, options: simpleOptions }] : [];
    if (title.length < 3 || !questions.length || questions.length > 20 || !["always", "after_vote", "after_close", "cc"].includes(resultsVisibility)) return json({ error: "Dados do inquérito inválidos." }, 400);
    const id = crypto.randomUUID(), now = Date.now(), initialStatus = simplePoll ? "published" : "draft", statements: D1PreparedStatement[] = [env.DB.prepare("INSERT INTO polls (id,title,description,status,results_visibility,starts_at,ends_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, title, description, initialStatus, resultsVisibility, timestamp(body.startsAt), timestamp(body.endsAt), actor(user), now, now)];
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index], prompt = text(question.prompt, 300), selectionType = text(question.selectionType, 20) || "single", optionLabels = Array.isArray(question.options) ? question.options.map((value) => text(typeof value === "object" && value ? (value as Record<string, unknown>).label : value, 180)).filter(Boolean) : [];
      if (prompt.length < 3 || !["single", "multiple"].includes(selectionType) || optionLabels.length < 2 || optionLabels.length > 20) return json({ error: "Cada pergunta deve ter pelo menos duas opções válidas." }, 400);
      const questionId = crypto.randomUUID();
      statements.push(env.DB.prepare("INSERT INTO poll_questions (id,poll_id,prompt,selection_type,required,sort_order) VALUES (?,?,?,?,?,?)").bind(questionId, id, prompt, selectionType, question.required === false ? 0 : 1, index));
      optionLabels.forEach((label, optionIndex) => statements.push(env.DB.prepare("INSERT INTO poll_options (id,question_id,label,sort_order) VALUES (?,?,?,?)").bind(crypto.randomUUID(), questionId, label, optionIndex)));
    }
    await env.DB.batch(statements); await audit(env, user, "poll_created", { id, title });
    return json({ ok: true, id }, 201);
  }
  if (request.method === "PATCH" || request.method === "PUT") {
    const id = text(body.id, 80);
    if (!id) return json({ error: "Inquérito inválido." }, 400);
    const current = await env.DB.prepare("SELECT p.*,(SELECT COUNT(*) FROM poll_participations pp WHERE pp.poll_id=p.id) AS total_votes FROM polls p WHERE p.id=?").bind(id).first<Record<string, unknown>>();
    if (!current) return json({ error: "Inquérito não encontrado." }, 404);

    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const title = has("title") ? text(body.title, 180) : String(current.title);
    const description = has("description") ? longText(body.description, 3000) : String(current.description || "");
    const status = has("status") ? text(body.status, 20) : String(current.status);
    const resultsVisibility = has("resultsVisibility") ? text(body.resultsVisibility, 30) : String(current.results_visibility);
    const startsAt = has("startsAt") ? timestamp(body.startsAt) : current.starts_at as number | null;
    const endsAt = has("endsAt") ? timestamp(body.endsAt) : current.ends_at as number | null;
    if (title.length < 3 || !["draft", "published", "closed", "archived"].includes(status) || !["always", "after_vote", "after_close", "cc"].includes(resultsVisibility)) return json({ error: "Dados do inquérito inválidos." }, 400);
    if ((has("startsAt") && body.startsAt !== null && body.startsAt !== "" && startsAt === null) || (has("endsAt") && body.endsAt !== null && body.endsAt !== "" && endsAt === null)) return json({ error: "Data do inquérito inválida." }, 400);
    if (startsAt !== null && endsAt !== null && endsAt <= startsAt) return json({ error: "A data de fim deve ser posterior ao início." }, 400);

    const changesOptions = has("options") || has("allowMultiple");
    const statements: D1PreparedStatement[] = [env.DB.prepare("UPDATE polls SET title=?,description=?,status=?,results_visibility=?,starts_at=?,ends_at=?,updated_at=? WHERE id=?").bind(title, description, status, resultsVisibility, startsAt, endsAt, Date.now(), id)];
    if (changesOptions) {
      if (Number(current.total_votes || 0) > 0) return json({ error: "As opções e o tipo de resposta não podem ser alterados depois de existirem votos." }, 409);
      const questions = await env.DB.prepare("SELECT id,selection_type FROM poll_questions WHERE poll_id=? ORDER BY sort_order").bind(id).all<Record<string, unknown>>();
      if (questions.results.length !== 1) return json({ error: "Este inquérito tem várias perguntas e requer o editor avançado." }, 409);
      const questionId = String(questions.results[0].id);
      const currentOptions = await env.DB.prepare("SELECT label FROM poll_options WHERE question_id=? ORDER BY sort_order").bind(questionId).all<Record<string, unknown>>();
      const optionLabels = has("options") && Array.isArray(body.options) ? body.options.map((value) => text(typeof value === "object" && value ? (value as Record<string, unknown>).label : value, 180)).filter(Boolean) : currentOptions.results.map((option) => String(option.label));
      if (optionLabels.length < 2 || optionLabels.length > 20 || new Set(optionLabels.map((label) => label.toLocaleLowerCase("pt-PT"))).size !== optionLabels.length) return json({ error: "Indica entre duas e vinte opções diferentes." }, 400);
      const selectionType = has("allowMultiple") ? body.allowMultiple === true ? "multiple" : "single" : String(questions.results[0].selection_type);
      statements.push(env.DB.prepare("UPDATE poll_questions SET prompt=?,selection_type=? WHERE id=?").bind(title, selectionType, questionId));
      if (has("options")) {
        statements.push(env.DB.prepare("DELETE FROM poll_options WHERE question_id=?").bind(questionId));
        optionLabels.forEach((label, index) => statements.push(env.DB.prepare("INSERT INTO poll_options (id,question_id,label,sort_order) VALUES (?,?,?,?)").bind(crypto.randomUUID(), questionId, label, index)));
      }
    } else {
      statements.push(env.DB.prepare("UPDATE poll_questions SET prompt=? WHERE poll_id=? AND sort_order=0").bind(title, id));
    }
    await env.DB.batch(statements);
    await audit(env, user, "poll_updated", { id, status, optionsChanged: changesOptions });
    return json({ ok: true });
  }
  return json({ error: "Operação não suportada." }, 405);
}

function materialVersionDto(item: unknown) {
  const row = rowObject(item);
  return { id: row.id, version: Number(row.version_number), versionNumber: Number(row.version_number), fileName: row.attachment_name, fileUrl: row.attachment_data_url, attachmentName: row.attachment_name, attachmentMime: row.attachment_mime, attachmentDataUrl: row.attachment_data_url, notes: row.change_note, changeNote: row.change_note, createdAt: row.created_at };
}

function materialDto(item: unknown, extraAttachments: Array<Record<string, unknown>> = [], versions: Array<Record<string, unknown>> = []) {
  const row = rowObject(item);
  const categories: Record<string, string> = { exam_photo: "exam", summary: "summary", notes: "notes", other: "other" };
  const attachments = [{ id: `${String(row.id)}-legacy`, name: row.attachment_name, mime: row.attachment_mime, dataUrl: row.attachment_data_url }, ...extraAttachments.map((attachment) => ({ id: attachment.id, name: attachment.attachment_name, mime: attachment.attachment_mime, dataUrl: attachment.attachment_data_url }))];
  return { id: row.id, title: row.title, description: sanitizeRichTextHtml(String(row.description ?? "")), type: row.material_type, category: categories[String(row.material_type)] || "other", unitId: row.curricular_unit_id, unitCode: row.unit_code, unitName: row.unit_name, unit: row.curricular_unit_id ? { id: row.curricular_unit_id, code: row.unit_code, name: row.unit_name } : null, academicYear: row.academic_year, anonymous: row.anonymous === 1, attachmentName: row.attachment_name, attachmentMime: row.attachment_mime, attachmentDataUrl: row.attachment_data_url, attachments, fileName: row.attachment_name, fileType: row.attachment_mime, fileUrl: row.attachment_data_url, url: row.attachment_data_url, status: row.status === "published" ? "approved" : row.status, moderationNote: row.moderation_note, favorite: row.is_favorite === 1, isFavorite: row.is_favorite === 1, favoriteCount: Number(row.favorite_count || 0), helpful: row.helpful_by_me === 1, helpfulByMe: row.helpful_by_me === 1, helpfulCount: Number(row.helpful_count || 0), outdated: row.outdated_by_me === 1, reportedOutdated: row.outdated_by_me === 1, reportedOutdatedByMe: row.outdated_by_me === 1, outdatedCount: Number(row.outdated_count || 0), currentVersion: Number(row.current_version || versions[0]?.version_number || 1), versionCount: Number(row.version_count || Math.max(1, versions.length)), versions: versions.map(materialVersionDto), createdAt: row.created_at, updatedAt: row.updated_at };
}

function validDataUrl(value: string): { mime: string; bytes: number } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !MATERIAL_MIMES.has(match[1])) return null;
  return { mime: match[1], bytes: Math.floor(match[2].length * 3 / 4) };
}

async function materials(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  const moderation = request.method === "PATCH" || url.searchParams.get("scope") === "moderation";
  const key = moderation ? "materials.moderation" : request.method === "POST" ? "materials.submission" : "materials.library";
  if (!await enabled(key)) return disabled();
  if (moderation && !isCommission(user)) return forbidden();
  if (request.method === "GET") {
    const unitId = text(url.searchParams.get("unitId"), 80);
    const canModerate = isCommission(user) && await enabled("materials.moderation");
    const showModeration = moderation || canModerate;
    const materialVisibility = showModeration ? "1=1" : "m.status='published' AND m.material_type!='exam_photo'";
    const [result, units, attachmentResult, versionResult] = await Promise.all([
      env.DB.prepare(`SELECT m.*,cu.code AS unit_code,cu.name AS unit_name,u.full_name AS submitter_name,u.email AS submitter_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END AS submitter_student_number,EXISTS(SELECT 1 FROM material_favorites mf WHERE mf.material_id=m.id AND mf.user_id=?) AS is_favorite,(SELECT COUNT(*) FROM material_favorites mf WHERE mf.material_id=m.id) AS favorite_count,(SELECT COUNT(*) FROM material_feedback fb WHERE fb.material_id=m.id AND fb.helpful=1) AS helpful_count,(SELECT COUNT(*) FROM material_feedback fb WHERE fb.material_id=m.id AND fb.outdated=1) AS outdated_count,COALESCE((SELECT fb.helpful FROM material_feedback fb WHERE fb.material_id=m.id AND fb.user_id=?),0) AS helpful_by_me,COALESCE((SELECT fb.outdated FROM material_feedback fb WHERE fb.material_id=m.id AND fb.user_id=?),0) AS outdated_by_me,COALESCE((SELECT MAX(mv.version_number) FROM material_versions mv WHERE mv.material_id=m.id),1) AS current_version,MAX(1,(SELECT COUNT(*) FROM material_versions mv WHERE mv.material_id=m.id)) AS version_count FROM material_submissions m LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id JOIN users u ON u.id=m.submitted_by WHERE ${materialVisibility} AND (?='' OR m.curricular_unit_id=?) ORDER BY CASE m.status WHEN 'pending' THEN 0 ELSE 1 END,m.created_at DESC LIMIT 300`).bind(user.id, user.id, user.id, unitId, unitId).all(),
      unitChoices(env),
      env.DB.prepare(`SELECT a.* FROM material_submission_attachments a JOIN material_submissions m ON m.id=a.submission_id WHERE ${materialVisibility} AND (?='' OR m.curricular_unit_id=?) ORDER BY a.submission_id,a.sort_order,a.created_at`).bind(unitId, unitId).all(),
      env.DB.prepare(`SELECT mv.* FROM material_versions mv JOIN material_submissions m ON m.id=mv.material_id WHERE ${materialVisibility} AND (?='' OR m.curricular_unit_id=?) ORDER BY mv.material_id,mv.version_number DESC`).bind(unitId, unitId).all(),
    ]);
    const attachmentsBySubmission = new Map<string, Array<Record<string, unknown>>>();
    for (const item of attachmentResult.results) {
      const attachment = rowObject(item), submissionId = String(attachment.submission_id);
      attachmentsBySubmission.set(submissionId, [...(attachmentsBySubmission.get(submissionId) ?? []), attachment]);
    }
    const versionsBySubmission = new Map<string, Array<Record<string, unknown>>>();
    for (const item of versionResult.results) {
      const version = rowObject(item), submissionId = String(version.material_id);
      versionsBySubmission.set(submissionId, [...(versionsBySubmission.get(submissionId) ?? []), version]);
    }
    return json({ materials: result.results.map((item) => { const row = rowObject(item), dto = materialDto(item, attachmentsBySubmission.get(String(row.id)) ?? [], versionsBySubmission.get(String(row.id)) ?? []) as Record<string, unknown>; if (row.anonymous !== 1) dto.authorName = row.submitter_name; if (showModeration && row.anonymous !== 1) { dto.authorId = row.submitted_by; dto.authorEmail = row.submitter_email; dto.authorStudentNumber = row.submitter_student_number; dto.submitter = { id: row.submitted_by, fullName: row.submitter_name, email: row.submitter_email, studentNumber: row.submitter_student_number }; } if (showModeration && row.anonymous === 1 && isPrimary(user)) dto.internalIdentity = { id: row.submitted_by, fullName: row.submitter_name, email: row.submitter_email, studentNumber: row.submitter_student_number }; return dto; }), units, canModerate });
  }
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON inválido." }, 400);
  if (request.method === "POST") {
    const file = body.file && typeof body.file === "object" && !Array.isArray(body.file) ? body.file as Record<string, unknown> : {};
    const category = text(body.category, 30), categoryTypes: Record<string, string> = { exam: "exam_photo", summary: "summary", notes: "notes", other: "other" };
    const title = text(body.title, 180), description = sanitizeRichTextHtml(longText(body.description, 3000)), type = text(body.type ?? body.materialType, 30) || categoryTypes[category] || "", unitId = text(body.unitId, 80), academicYear = text(body.academicYear, 20), anonymous = body.anonymous === true, attachmentName = text(body.attachmentName ?? file.name, 180), attachmentData = typeof (body.attachmentDataUrl ?? file.dataUrl) === "string" ? String(body.attachmentDataUrl ?? file.dataUrl) : "", parsed = validDataUrl(attachmentData);
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 9) : [];
    const photoInputs = (rawAttachments.length ? rawAttachments : [{ name: attachmentName, dataUrl: attachmentData }]).map((item) => item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {});
    const photos = photoInputs.map((item, index) => {
      const name = text(item.name, 180) || `foto-${index + 1}.jpg`;
      const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";
      return { name, dataUrl, parsed: validDataUrl(dataUrl) };
    });
    const invalidExamPhotos = type === "exam_photo" && (photos.length < 1 || photos.length > 8 || !parsed || !parsed.mime.startsWith("image/") || parsed.bytes > 5 * 1024 * 1024 || photos.some((item) => !item.parsed || !item.parsed.mime.startsWith("image/") || item.parsed.bytes > 5 * 1024 * 1024) || photos.reduce((total, item) => total + (item.parsed?.bytes ?? 0), 0) > 24 * 1024 * 1024);
    if (invalidExamPhotos) return json({ error: "Fotos de exame invalidas. Usa ate 8 imagens, 5 MB por imagem e 24 MB no total." }, 400);
    if (title.length < 3 || !["exam_photo", "summary", "notes", "other"].includes(type) || !attachmentName || !parsed || parsed.bytes > 8 * 1024 * 1024 || !await existingUnit(env, unitId)) return json({ error: "Dados ou anexo inválidos. O ficheiro deve ter até 8 MB." }, 400);
    const id = crypto.randomUUID(), now = Date.now();
    const primaryAttachment = type === "exam_photo" ? photos[0] : { name: attachmentName, dataUrl: attachmentData, parsed };
    const statements = [env.DB.prepare("INSERT INTO material_submissions (id,title,description,material_type,curricular_unit_id,academic_year,anonymous,submitted_by,attachment_name,attachment_mime,attachment_data_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)").bind(id, title, description, type, unitId || null, academicYear || null, anonymous ? 1 : 0, user.id, primaryAttachment.name, primaryAttachment.parsed?.mime || parsed.mime, primaryAttachment.dataUrl, now, now)];
    if (type === "exam_photo") photos.slice(1).forEach((item, index) => statements.push(env.DB.prepare("INSERT INTO material_submission_attachments (id,submission_id,attachment_name,attachment_mime,attachment_data_url,sort_order,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, item.name, item.parsed?.mime, item.dataUrl, index + 1, now)));
    await env.DB.batch(statements);
    return json({ ok: true, id, anonymous, status: "pending" }, 201);
  }
  if (request.method === "PATCH") {
    const id = text(body.id, 80), rawStatus = text(body.status, 20), status = rawStatus === "approved" ? "published" : rawStatus, note = longText(body.moderationNote, 2000);
    const submission = id ? await env.DB.prepare("SELECT material_type FROM material_submissions WHERE id=?").bind(id).first<{ material_type: string }>() : null;
    if (submission?.material_type === "exam_photo" && status === "published") return json({ error: "As fotos de exame sao privadas e nao podem ser publicadas diretamente." }, 400);
    if (!id || !["pending", "published", "rejected", "archived"].includes(status)) return json({ error: "Moderação inválida." }, 400);
    const now = Date.now(), result = await env.DB.prepare("UPDATE material_submissions SET status=?,moderation_note=?,moderated_by=?,moderated_at=?,updated_at=? WHERE id=?").bind(status, note || null, actor(user), now, now, id).run();
    if (!result.meta.changes) return json({ error: "Submissão não encontrada." }, 404);
    await audit(env, user, "material_submission_moderated", { id, status });
    return json({ ok: true });
  }
  return json({ error: "Operação não suportada." }, 405);
}

async function materialFavorites(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.favorites")) return disabled();
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT m.*,cu.code AS unit_code,cu.name AS unit_name,mf.created_at AS favorited_at,1 AS is_favorite,(SELECT COUNT(*) FROM material_favorites all_favorites WHERE all_favorites.material_id=m.id) AS favorite_count,(SELECT COUNT(*) FROM material_feedback fb WHERE fb.material_id=m.id AND fb.helpful=1) AS helpful_count,(SELECT COUNT(*) FROM material_feedback fb WHERE fb.material_id=m.id AND fb.outdated=1) AS outdated_count,COALESCE((SELECT fb.helpful FROM material_feedback fb WHERE fb.material_id=m.id AND fb.user_id=?),0) AS helpful_by_me,COALESCE((SELECT fb.outdated FROM material_feedback fb WHERE fb.material_id=m.id AND fb.user_id=?),0) AS outdated_by_me,COALESCE((SELECT MAX(mv.version_number) FROM material_versions mv WHERE mv.material_id=m.id),1) AS current_version,MAX(1,(SELECT COUNT(*) FROM material_versions mv WHERE mv.material_id=m.id)) AS version_count FROM material_favorites mf JOIN material_submissions m ON m.id=mf.material_id LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id WHERE mf.user_id=? AND m.status='published' AND m.material_type!='exam_photo' ORDER BY mf.created_at DESC LIMIT 300").bind(user.id, user.id, user.id).all();
    return json({ favorites: result.results.map((item) => ({ ...materialDto(item), favoritedAt: rowObject(item).favorited_at })) });
  }
  const body = await bodyJson(request), materialId = text(body?.materialId ?? url.searchParams.get("materialId"), 80);
  if (!body && request.method !== "DELETE" || !materialId) return json({ error: "Material invalido." }, 400);
  if (request.method === "PUT") {
    const material = await env.DB.prepare("SELECT id FROM material_submissions WHERE id=? AND status='published' AND material_type!='exam_photo'").bind(materialId).first();
    if (!material) return json({ error: "Material publicado nao encontrado." }, 404);
    const result = await env.DB.prepare("INSERT OR IGNORE INTO material_favorites(user_id,material_id,created_at) VALUES (?,?,?)").bind(user.id, materialId, Date.now()).run();
    return json({ ok: true, materialId, isFavorite: true, created: Boolean(result.meta.changes) }, result.meta.changes ? 201 : 200);
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM material_favorites WHERE user_id=? AND material_id=?").bind(user.id, materialId).run();
    return json({ ok: true, materialId, isFavorite: false });
  }
  return json({ error: "Operacao nao suportada." }, 405);
}

async function materialFeedback(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.feedback")) return disabled();
  const materialId = text(url.searchParams.get("materialId"), 80);
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT m.id,(SELECT COUNT(*) FROM material_feedback f WHERE f.material_id=m.id AND f.helpful=1) AS helpful_count,(SELECT COUNT(*) FROM material_feedback f WHERE f.material_id=m.id AND f.outdated=1) AS outdated_count,COALESCE((SELECT f.helpful FROM material_feedback f WHERE f.material_id=m.id AND f.user_id=?),0) AS helpful_by_me,COALESCE((SELECT f.outdated FROM material_feedback f WHERE f.material_id=m.id AND f.user_id=?),0) AS outdated_by_me FROM material_submissions m WHERE m.status='published' AND m.material_type!='exam_photo' AND (?='' OR m.id=?) ORDER BY m.updated_at DESC LIMIT 300").bind(user.id, user.id, materialId, materialId).all();
    return json({ feedback: result.results.map((item) => { const row = rowObject(item); return { materialId: row.id, helpfulCount: row.helpful_count, outdatedCount: row.outdated_count, helpfulByMe: row.helpful_by_me === 1, reportedOutdatedByMe: row.outdated_by_me === 1 }; }) });
  }
  const body = await bodyJson(request), id = text(body?.materialId ?? materialId, 80);
  if (!id || !body && request.method !== "DELETE") return json({ error: "Material invalido." }, 400);
  if (request.method === "PUT") {
    const hasHelpful = typeof body?.helpful === "boolean", hasOutdated = typeof body?.outdated === "boolean";
    if (!hasHelpful && !hasOutdated) return json({ error: "Indique feedback util ou desatualizado." }, 400);
    const material = await env.DB.prepare("SELECT id FROM material_submissions WHERE id=? AND status='published' AND material_type!='exam_photo'").bind(id).first();
    if (!material) return json({ error: "Material publicado nao encontrado." }, 404);
    const current = await env.DB.prepare("SELECT helpful,outdated,created_at FROM material_feedback WHERE user_id=? AND material_id=?").bind(user.id, id).first<{ helpful: number; outdated: number; created_at: number }>();
    const helpful = hasHelpful ? body?.helpful === true : current?.helpful === 1, outdated = hasOutdated ? body?.outdated === true : current?.outdated === 1, now = Date.now();
    await env.DB.prepare("INSERT INTO material_feedback(user_id,material_id,helpful,outdated,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,material_id) DO UPDATE SET helpful=excluded.helpful,outdated=excluded.outdated,updated_at=excluded.updated_at")
      .bind(user.id, id, helpful ? 1 : 0, outdated ? 1 : 0, current?.created_at ?? now, now).run();
    return json({ ok: true, materialId: id, helpful, outdated });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM material_feedback WHERE user_id=? AND material_id=?").bind(user.id, id).run();
    return json({ ok: true, materialId: id, helpful: false, outdated: false });
  }
  return json({ error: "Operacao nao suportada." }, 405);
}

async function materialVersions(request: Request, env: HubEnv, materialId: string, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("materials.versioning")) return disabled();
  const material = await env.DB.prepare("SELECT * FROM material_submissions WHERE id=?").bind(materialId).first<Record<string, unknown>>();
  if (!material || (!isCommission(user) && (material.status !== "published" || material.material_type === "exam_photo"))) return json({ error: "Material nao encontrado." }, 404);
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,version_number,attachment_name,attachment_mime,attachment_data_url,change_note,created_at FROM material_versions WHERE material_id=? ORDER BY version_number DESC").bind(materialId).all();
    const versions = result.results.length ? result.results.map((item) => { const row = rowObject(item); return { id: row.id, version: row.version_number, attachmentName: row.attachment_name, attachmentMime: row.attachment_mime, attachmentDataUrl: row.attachment_data_url, changeNote: row.change_note, createdAt: row.created_at }; }) : [{ id: `${materialId}-v1`, version: 1, attachmentName: material.attachment_name, attachmentMime: material.attachment_mime, attachmentDataUrl: material.attachment_data_url, changeNote: "Versao original", createdAt: material.created_at }];
    return json({ materialId, currentVersion: Number(rowObject(versions[0]).version), versions, canCreate: isCommission(user) });
  }
  if (request.method !== "POST") return json({ error: "Operacao nao suportada." }, 405);
  if (!isCommission(user)) return forbidden();
  const body = await bodyJson(request), file = body?.file && typeof body.file === "object" && !Array.isArray(body.file) ? body.file as Record<string, unknown> : {};
  if (!body) return json({ error: "Pedido JSON invalido." }, 400);
  const attachmentName = text(body.attachmentName ?? file.name, 180), attachmentDataUrl = typeof (body.attachmentDataUrl ?? file.dataUrl) === "string" ? String(body.attachmentDataUrl ?? file.dataUrl) : "", parsed = validDataUrl(attachmentDataUrl), changeNote = longText(body.changeNote, 1000);
  if (!attachmentName || !parsed || parsed.bytes > 8 * 1024 * 1024) return json({ error: "Versao invalida. O ficheiro deve ter ate 8 MB." }, 400);
  const latest = await env.DB.prepare("SELECT MAX(version_number) AS n FROM material_versions WHERE material_id=?").bind(materialId).first<{ n: number | null }>(), version = Math.max(2, Number(latest?.n || 1) + 1), now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (!latest?.n) statements.push(env.DB.prepare("INSERT INTO material_versions(id,material_id,version_number,attachment_name,attachment_mime,attachment_data_url,change_note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), materialId, 1, material.attachment_name, material.attachment_mime, material.attachment_data_url, "Versao original", material.submitted_by, material.created_at));
  statements.push(
    env.DB.prepare("INSERT INTO material_versions(id,material_id,version_number,attachment_name,attachment_mime,attachment_data_url,change_note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), materialId, version, attachmentName, parsed.mime, attachmentDataUrl, changeNote, actor(user), now),
    env.DB.prepare("UPDATE material_submissions SET attachment_name=?,attachment_mime=?,attachment_data_url=?,updated_at=? WHERE id=?").bind(attachmentName, parsed.mime, attachmentDataUrl, now, materialId),
    env.DB.prepare("INSERT INTO admin_audit_log(actor_user_id,action,details,created_at) VALUES (?,'material_version_created',?,?)").bind(actor(user), JSON.stringify({ materialId, version, attachmentName }), now),
  );
  try { await env.DB.batch(statements); } catch { return json({ error: "Outra versao foi criada em simultaneo. Atualize e tente novamente." }, 409); }
  return json({ ok: true, materialId, version, createdAt: now }, 201);
}

type NotificationPreferences = {
  announcements: boolean;
  calendar: boolean;
  polls: boolean;
  requests: boolean;
  materials: boolean;
  email: boolean;
  urgentOnly: boolean;
  unitIds: string[];
};

function notificationPreferencesDto(preferences: NotificationPreferences) {
  const categories = { announcements: preferences.announcements, calendar: preferences.calendar, polls: preferences.polls, requests: preferences.requests, materials: preferences.materials };
  return { ...preferences, categories, enabledCategories: Object.entries(categories).filter(([, value]) => value).map(([key]) => key), onlyUrgent: preferences.urgentOnly, curricularUnitIds: preferences.unitIds };
}

function stringArray(value: unknown, maxItems = 100): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => text(item, 80));
  if (items.some((item) => !item) || new Set(items).size !== items.length) return null;
  return items;
}

function parsedStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try { return stringArray(JSON.parse(value)) ?? []; } catch { return []; }
}

async function validUnitIds(env: HubEnv, unitIds: string[]): Promise<boolean> {
  if (!unitIds.length) return true;
  const placeholders = unitIds.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT COUNT(*) AS n FROM curricular_units WHERE active=1 AND id IN (${placeholders})`).bind(...unitIds).first<{ n: number }>();
  return Number(result?.n || 0) === unitIds.length;
}

async function loadNotificationPreferences(env: HubEnv, userId: string): Promise<NotificationPreferences> {
  const row = await env.DB.prepare("SELECT * FROM notification_preferences WHERE user_id=?").bind(userId).first<Record<string, unknown>>();
  return {
    announcements: row?.announcements_enabled !== 0,
    calendar: row?.calendar_enabled !== 0,
    polls: row?.polls_enabled !== 0,
    requests: row?.requests_enabled !== 0,
    materials: row?.materials_enabled !== 0,
    email: row?.email_enabled === 1,
    urgentOnly: row?.urgent_only === 1,
    unitIds: parsedStringArray(row?.curricular_unit_ids),
  };
}

function notificationDto(item: unknown) {
  const row = rowObject(item);
  return { id: `${String(row.source_type)}:${String(row.source_id)}`, notificationId: `${String(row.source_type)}:${String(row.source_id)}`, sourceType: row.source_type, sourceId: row.source_id, type: row.source_type, category: row.source_type, title: row.title, body: row.description, description: row.description, priority: row.priority, href: row.href, unitId: row.unit_id, unitCode: row.unit_code, unitName: row.unit_name ?? row.unit_code, occurredAt: row.occurred_at, createdAt: row.occurred_at, read: row.read_at !== null, readAt: row.read_at, archived: row.archived_at !== null, archivedAt: row.archived_at };
}

async function loadNotifications(env: HubEnv, user: HubUser, preferences: NotificationPreferences, limit: number, unreadOnly: boolean, includeArchived: boolean) {
  const sources: string[] = [];
  const bindings: unknown[] = [];
  if (preferences.announcements) {
    sources.push("SELECT a.id AS source_id,'announcement' AS source_type,a.title,substr(a.body,1,300) AS description,a.priority,'/avisos' AS href,NULL AS unit_id,NULL AS unit_code,a.published_at AS occurred_at FROM announcements a WHERE a.status='published' AND (a.expires_at IS NULL OR a.expires_at>?)");
    bindings.push(Date.now());
  }
  if (preferences.calendar) sources.push("SELECT e.id AS source_id,'event' AS source_type,e.title,substr(e.description,1,300) AS description,CASE WHEN e.event_type IN ('exam','assessment','evaluation') THEN 'important' ELSE 'normal' END AS priority,'/calendario' AS href,e.curricular_unit_id AS unit_id,cu.code AS unit_code,e.starts_at AS occurred_at FROM academic_events e LEFT JOIN curricular_units cu ON cu.id=e.curricular_unit_id WHERE e.status='scheduled' AND e.visibility!='cc' AND e.starts_at>=unixepoch()*1000-86400000");
  if (preferences.polls) sources.push("SELECT p.id AS source_id,'poll' AS source_type,p.title,substr(p.description,1,300) AS description,'normal' AS priority,'/inqueritos' AS href,NULL AS unit_id,NULL AS unit_code,p.created_at AS occurred_at FROM polls p WHERE p.status='published' AND (p.starts_at IS NULL OR p.starts_at<=unixepoch()*1000) AND (p.ends_at IS NULL OR p.ends_at>=unixepoch()*1000)");
  if (preferences.requests) {
    sources.push("SELECT r.id AS source_id,'request' AS source_type,r.subject AS title,('Estado: '||r.status) AS description,CASE WHEN r.status IN ('resolved','closed') THEN 'important' ELSE 'normal' END AS priority,'/pedidos' AS href,r.curricular_unit_id AS unit_id,cu.code AS unit_code,r.updated_at AS occurred_at FROM course_requests r LEFT JOIN curricular_units cu ON cu.id=r.curricular_unit_id WHERE r.submitted_by=?");
    bindings.push(user.id);
  }
  if (preferences.materials) sources.push("SELECT m.id AS source_id,'material' AS source_type,m.title,substr(m.description,1,300) AS description,'normal' AS priority,'/materiais' AS href,m.curricular_unit_id AS unit_id,cu.code AS unit_code,m.updated_at AS occurred_at FROM material_submissions m LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id WHERE m.status='published' AND m.material_type!='exam_photo'");
  if (!sources.length) return [];
  const unitClause = preferences.unitIds.length ? `AND (feed.unit_id IS NULL OR feed.unit_id IN (${preferences.unitIds.map(() => "?").join(",")}))` : "";
  bindings.push(user.id, includeArchived ? 1 : 0, unreadOnly ? 1 : 0, preferences.urgentOnly ? 1 : 0, ...preferences.unitIds, limit);
  const result = await env.DB.prepare(`WITH feed AS (${sources.join(" UNION ALL ")}) SELECT feed.*,state.read_at,state.archived_at FROM feed LEFT JOIN notification_states state ON state.user_id=? AND state.source_type=feed.source_type AND state.source_id=feed.source_id WHERE (?=1 OR state.archived_at IS NULL) AND (?=0 OR state.read_at IS NULL) AND (?=0 OR feed.priority='urgent') ${unitClause} ORDER BY feed.occurred_at DESC LIMIT ?`).bind(...bindings).all();
  return result.results.map(notificationDto);
}

function secureCalendarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function calendarTokenHash(token: string): Promise<string> {
  return bytesBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

async function calendarSubscription(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("calendar.subscription")) return disabled();
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,label,curricular_unit_ids,created_at,last_used_at,revoked_at FROM calendar_subscription_tokens WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
    return json({ subscriptions: result.results.map((item) => { const row = rowObject(item); return { id: row.id, label: row.label, unitIds: parsedStringArray(row.curricular_unit_ids), createdAt: row.created_at, lastUsedAt: row.last_used_at, revokedAt: row.revoked_at, active: row.revoked_at === null }; }) });
  }
  if (request.method === "POST") {
    const body = await bodyJson(request);
    if (!body) return json({ error: "Pedido JSON invalido." }, 400);
    const label = text(body.label, 80) || "Calendario pessoal", unitIds = stringArray(body.unitIds ?? []);
    if (!unitIds || !await validUnitIds(env, unitIds)) return json({ error: "Unidades curriculares invalidas." }, 400);
    const token = secureCalendarToken(), id = crypto.randomUUID(), now = Date.now();
    await env.DB.prepare("INSERT INTO calendar_subscription_tokens(id,user_id,token_hash,label,curricular_unit_ids,created_at) VALUES (?,?,?,?,?,?)")
      .bind(id, user.id, await calendarTokenHash(token), label, JSON.stringify(unitIds), now).run();
    await audit(env, user, "calendar_subscription_created", { id, label, unitIds });
    return json({ id, label, unitIds, token, feedUrl: `${url.origin}/api/calendar-feed.ics?token=${encodeURIComponent(token)}`, createdAt: now }, 201);
  }
  if (request.method === "DELETE") {
    const body = await bodyJson(request), id = text(body?.id, 80);
    if (!body || !id) return json({ error: "Subscricao invalida." }, 400);
    const now = Date.now(), result = await env.DB.prepare("UPDATE calendar_subscription_tokens SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL").bind(now, id, user.id).run();
    if (!result.meta.changes) return json({ error: "Subscricao ativa nao encontrada." }, 404);
    await audit(env, user, "calendar_subscription_revoked", { id });
    return json({ ok: true, id, revokedAt: now });
  }
  return json({ error: "Operacao nao suportada." }, 405);
}

function icsText(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(value: unknown): string {
  return new Date(Number(value)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function calendarFeed(env: HubEnv, url: URL, enabled: ModuleChecker): Promise<Response> {
  if (!await enabled("calendar.subscription")) return disabled();
  const token = url.searchParams.get("token") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response("Subscricao nao encontrada.", { status: 404 });
  const subscription = await env.DB.prepare("SELECT id,user_id,curricular_unit_ids FROM calendar_subscription_tokens WHERE token_hash=? AND revoked_at IS NULL").bind(await calendarTokenHash(token)).first<Record<string, unknown>>();
  if (!subscription) return new Response("Subscricao nao encontrada.", { status: 404 });
  const unitIds = parsedStringArray(subscription.curricular_unit_ids), unitClause = unitIds.length ? `AND (e.curricular_unit_id IS NULL OR e.curricular_unit_id IN (${unitIds.map(() => "?").join(",")}))` : "";
  const from = Date.now() - 30 * 86400000, to = Date.now() + 550 * 86400000;
  const events = await env.DB.prepare(`SELECT e.*,cu.code AS unit_code,cu.name AS unit_name FROM academic_events e LEFT JOIN curricular_units cu ON cu.id=e.curricular_unit_id WHERE e.status='scheduled' AND e.visibility!='cc' AND e.ends_at>=? AND e.starts_at<=? ${unitClause} ORDER BY e.starts_at LIMIT 1000`).bind(from, to, ...unitIds).all();
  await env.DB.prepare("UPDATE calendar_subscription_tokens SET last_used_at=? WHERE id=? AND revoked_at IS NULL").bind(Date.now(), subscription.id).run();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gestor Universitario//Calendario Academico//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Gestor Universitario"];
  for (const item of events.results) {
    const row = rowObject(item), description = [row.description, row.unit_code ? `${row.unit_code} - ${row.unit_name}` : ""].filter(Boolean).join("\\n");
    lines.push("BEGIN:VEVENT", `UID:${icsText(row.id)}@gestoruniversitario.cc`, `DTSTAMP:${icsDate(row.updated_at)}`, `DTSTART:${icsDate(row.starts_at)}`, `DTEND:${icsDate(row.ends_at)}`, `SUMMARY:${icsText(row.title)}`, `DESCRIPTION:${icsText(description)}`);
    if (row.location) lines.push(`LOCATION:${icsText(row.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR", "");
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, no-store", "content-disposition": "inline; filename=gestor-universitario.ics" } });
}

async function notifications(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("notifications.feed")) return disabled();
  if (request.method === "GET") {
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) return json({ error: "Limite de notificacoes invalido." }, 400);
    const preferences = await loadNotificationPreferences(env, user.id);
    const items = await loadNotifications(env, user, preferences, rawLimit, url.searchParams.get("unreadOnly") === "true", url.searchParams.get("includeArchived") === "true");
    return json({ notifications: items, unreadCount: items.filter((item) => !item.read && !item.archived).length, preferences: notificationPreferencesDto(preferences) });
  }
  if (request.method !== "PATCH") return json({ error: "Operacao nao suportada." }, 405);
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON invalido." }, 400);
  let rawItems = Array.isArray(body.items) ? body.items : [body];
  if (body.all === true || body.action === "mark_all_read") {
    const preferences = await loadNotificationPreferences(env, user.id);
    rawItems = (await loadNotifications(env, user, preferences, 100, false, false)).map((item) => ({ sourceType: item.sourceType, sourceId: item.sourceId, read: true }));
    if (!rawItems.length) return json({ ok: true, updated: 0 });
  }
  if (!rawItems.length || rawItems.length > 100) return json({ error: "Indique entre uma e cem notificacoes." }, 400);
  const now = Date.now(), statements: D1PreparedStatement[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ error: "Estado de notificacao invalido." }, 400);
    const item = raw as Record<string, unknown>, composite = text(item.notificationId ?? item.id, 120), separator = composite.indexOf(":"), sourceType = text(item.sourceType ?? item.type ?? (separator > 0 ? composite.slice(0, separator) : ""), 30), sourceId = text(item.sourceId ?? (separator > 0 ? composite.slice(separator + 1) : composite), 80);
    const hasRead = typeof item.read === "boolean", hasArchived = typeof item.archived === "boolean";
    if (!NOTIFICATION_TYPES.has(sourceType) || !sourceId || (!hasRead && !hasArchived)) return json({ error: "Estado de notificacao invalido." }, 400);
    const readAt = item.read === true ? now : null, archivedAt = item.archived === true ? now : null;
    statements.push(env.DB.prepare("INSERT INTO notification_states(user_id,source_type,source_id,read_at,archived_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,source_type,source_id) DO UPDATE SET read_at=CASE WHEN ?=1 THEN ? ELSE notification_states.read_at END,archived_at=CASE WHEN ?=1 THEN ? ELSE notification_states.archived_at END,updated_at=excluded.updated_at")
      .bind(user.id, sourceType, sourceId, readAt, archivedAt, now, hasRead ? 1 : 0, readAt, hasArchived ? 1 : 0, archivedAt));
  }
  await env.DB.batch(statements);
  return json({ ok: true, updated: statements.length });
}

async function notificationPreferences(request: Request, env: HubEnv, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("notifications.preferences")) return disabled();
  if (request.method === "GET") return json({ preferences: notificationPreferencesDto(await loadNotificationPreferences(env, user.id)), units: await unitChoices(env) });
  if (request.method !== "PUT") return json({ error: "Operacao nao suportada." }, 405);
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON invalido." }, 400);
  const current = await loadNotificationPreferences(env, user.id), categoryInput = body.categories && typeof body.categories === "object" && !Array.isArray(body.categories) ? body.categories as Record<string, unknown> : null;
  const enabledCategories = Array.isArray(body.enabledCategories) ? new Set(body.enabledCategories.map(String)) : null;
  const valueFor = (key: "announcements" | "calendar" | "polls" | "requests" | "materials") => typeof body[key] === "boolean" ? body[key] === true : typeof categoryInput?.[key] === "boolean" ? categoryInput[key] === true : enabledCategories ? enabledCategories.has(key) : current[key];
  const email = typeof body.email === "boolean" ? body.email === true : current.email, urgentOnly = typeof body.urgentOnly === "boolean" ? body.urgentOnly === true : typeof body.onlyUrgent === "boolean" ? body.onlyUrgent === true : current.urgentOnly;
  const unitIds = stringArray(body.unitIds ?? body.curricularUnitIds ?? []);
  if (!unitIds || !await validUnitIds(env, unitIds)) return json({ error: "Unidades curriculares invalidas." }, 400);
  await env.DB.prepare("INSERT INTO notification_preferences(user_id,announcements_enabled,calendar_enabled,polls_enabled,requests_enabled,materials_enabled,email_enabled,urgent_only,curricular_unit_ids,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET announcements_enabled=excluded.announcements_enabled,calendar_enabled=excluded.calendar_enabled,polls_enabled=excluded.polls_enabled,requests_enabled=excluded.requests_enabled,materials_enabled=excluded.materials_enabled,email_enabled=excluded.email_enabled,urgent_only=excluded.urgent_only,curricular_unit_ids=excluded.curricular_unit_ids,updated_at=excluded.updated_at")
    .bind(user.id, valueFor("announcements") ? 1 : 0, valueFor("calendar") ? 1 : 0, valueFor("polls") ? 1 : 0, valueFor("requests") ? 1 : 0, valueFor("materials") ? 1 : 0, email ? 1 : 0, urgentOnly ? 1 : 0, JSON.stringify(unitIds), Date.now()).run();
  return json({ ok: true, preferences: notificationPreferencesDto(await loadNotificationPreferences(env, user.id)) });
}

function httpsUrl(value: unknown): string | null {
  const candidate = text(value, 2048);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch { return null; }
}

function usefulLinkDto(item: unknown) {
  const row = rowObject(item);
  return { id: row.id, title: row.title, url: row.url, description: row.description, priority: row.priority, category: row.category, unitId: row.curricular_unit_id, unitCode: row.unit_code, unitName: row.unit_name, visibility: row.visibility, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function usefulLinks(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  const canManage = canManageCore(user), mutation = request.method !== "GET", management = canManage && (mutation || url.searchParams.get("scope") === "management");
  if (!await enabled(management ? "useful_links.management" : "useful_links.library")) return disabled();
  if (mutation && !canManage) return forbidden();
  if (request.method === "GET") {
    const unitId = text(url.searchParams.get("unitId"), 80), category = text(url.searchParams.get("category"), 30), priority = text(url.searchParams.get("priority"), 20);
    if (category && !USEFUL_LINK_CATEGORIES.has(category) || priority && !USEFUL_LINK_PRIORITIES.has(priority)) return json({ error: "Filtro de links invalido." }, 400);
    const scope = management ? "1=1" : `l.status='published' AND (l.visibility!='cc' OR ${isCommission(user) ? "1=1" : "1=0"})`;
    const result = await env.DB.prepare(`SELECT l.*,cu.code AS unit_code,cu.name AS unit_name FROM useful_links l LEFT JOIN curricular_units cu ON cu.id=l.curricular_unit_id WHERE ${scope} AND (?='' OR l.curricular_unit_id=?) AND (?='' OR l.category=?) AND (?='' OR l.priority=?) ORDER BY CASE l.priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,cu.name COLLATE NOCASE,l.title COLLATE NOCASE`).bind(unitId, unitId, category, category, priority, priority).all();
    return json({ links: result.results.map(usefulLinkDto), units: await unitChoices(env), canManage, capabilities: { manage: canManage } });
  }
  const body = await bodyJson(request);
  if (!body) return json({ error: "Pedido JSON invalido." }, 400);
  if (request.method === "DELETE") {
    const id = text(body.id, 80), current = id ? await env.DB.prepare("SELECT id,title,url FROM useful_links WHERE id=?").bind(id).first<Record<string, unknown>>() : null;
    if (!current) return json({ error: "Link nao encontrado." }, 404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM useful_links WHERE id=?").bind(id),
      env.DB.prepare("INSERT INTO admin_audit_log(actor_user_id,action,details,created_at) VALUES (?,'useful_link_deleted',?,?)").bind(actor(user), JSON.stringify(current), Date.now()),
    ]);
    return json({ ok: true, id });
  }
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return json({ error: "Operacao nao suportada." }, 405);
  if (request.method === "PATCH" && Object.keys(body).every((key) => ["id", "status"].includes(key))) {
    const id = text(body.id, 80), status = text(body.status, 20);
    if (!id || !["draft", "published", "archived"].includes(status)) return json({ error: "Estado do link invalido." }, 400);
    const now = Date.now(), result = await env.DB.prepare("UPDATE useful_links SET status=?,updated_by=?,updated_at=? WHERE id=?").bind(status, actor(user), now, id).run();
    if (!result.meta.changes) return json({ error: "Link nao encontrado." }, 404);
    await audit(env, user, "useful_link_status_updated", { id, status });
    return json({ ok: true, id, status });
  }
  const id = request.method === "POST" ? crypto.randomUUID() : text(body.id, 80), title = text(body.title, 180), linkUrl = httpsUrl(body.url), description = longText(body.description, 2000), priority = text(body.priority, 20) || "normal", category = text(body.category, 30) || "other", unitId = text(body.unitId, 80), visibility = text(body.visibility, 20) || "students", status = text(body.status, 20) || "published";
  if (!id || title.length < 3 || !linkUrl || !USEFUL_LINK_PRIORITIES.has(priority) || !USEFUL_LINK_CATEGORIES.has(category) || !["public", "students", "cc"].includes(visibility) || !["draft", "published", "archived"].includes(status) || !await existingUnit(env, unitId)) return json({ error: "Dados do link invalido. O endereco tem de usar HTTPS." }, 400);
  const now = Date.now();
  if (request.method === "POST") {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO useful_links(id,title,url,description,priority,category,curricular_unit_id,visibility,status,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, title, linkUrl, description, priority, category, unitId || null, visibility, status, actor(user), actor(user), now, now),
      env.DB.prepare("INSERT INTO admin_audit_log(actor_user_id,action,details,created_at) VALUES (?,'useful_link_created',?,?)").bind(actor(user), JSON.stringify({ id, title, url: linkUrl, priority, category, unitId: unitId || null, visibility, status }), now),
    ]);
  } else {
    const result = await env.DB.prepare("UPDATE useful_links SET title=?,url=?,description=?,priority=?,category=?,curricular_unit_id=?,visibility=?,status=?,updated_by=?,updated_at=? WHERE id=?").bind(title, linkUrl, description, priority, category, unitId || null, visibility, status, actor(user), now, id).run();
    if (!result.meta.changes) return json({ error: "Link nao encontrado." }, 404);
    await audit(env, user, "useful_link_updated", { id, title, url: linkUrl, priority, category, unitId: unitId || null, visibility, status });
  }
  return json({ ok: true, id }, request.method === "POST" ? 201 : 200);
}

async function personalDashboard(env: HubEnv, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("dashboard.personal")) return disabled();
  const specialStatusesEnabled = await enabled("classes.special_statuses");
  const now = Date.now(), preferencesPromise = loadNotificationPreferences(env, user.id);
  const studentNumber = /^(?:up)?(\d{9})@/i.exec(user.email)?.[1] ?? "";
  const [upcomingResult, requestsResult, favoritesResult, urgentResult, pollsResult, preferences, classInfo] = await Promise.all([
    env.DB.prepare("SELECT e.*,cu.code AS unit_code,cu.name AS unit_name FROM academic_events e LEFT JOIN curricular_units cu ON cu.id=e.curricular_unit_id WHERE e.status='scheduled' AND e.visibility!='cc' AND e.starts_at BETWEEN ? AND ? ORDER BY e.starts_at LIMIT 10").bind(now, now + 30 * 86400000).all(),
    env.DB.prepare("SELECT r.id,r.subject,r.status,r.updated_at,cu.code AS unit_code,cu.name AS unit_name FROM course_requests r LEFT JOIN curricular_units cu ON cu.id=r.curricular_unit_id WHERE r.submitted_by=? AND r.status NOT IN ('resolved','closed') ORDER BY r.updated_at DESC LIMIT 6").bind(user.id).all(),
    env.DB.prepare("SELECT m.*,cu.code AS unit_code,cu.name AS unit_name,mf.created_at AS favorited_at,1 AS is_favorite FROM material_favorites mf JOIN material_submissions m ON m.id=mf.material_id LEFT JOIN curricular_units cu ON cu.id=m.curricular_unit_id WHERE mf.user_id=? AND m.status='published' AND m.material_type!='exam_photo' ORDER BY mf.created_at DESC LIMIT 6").bind(user.id).all(),
    env.DB.prepare("SELECT id,title,body,published_at FROM announcements WHERE status='published' AND priority='urgent' AND (expires_at IS NULL OR expires_at>?) ORDER BY published_at DESC LIMIT 5").bind(now).all(),
    env.DB.prepare("SELECT id,title,description,ends_at FROM polls WHERE status='published' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY COALESCE(ends_at,created_at) LIMIT 10").bind(now, now).all(),
    preferencesPromise,
    studentNumber ? env.DB.prepare("SELECT cs.class_id,cs.preference,cs.student_decision,cs.decision_at,cs.special_status,c.status AS class_status FROM class_students cs JOIN classes c ON c.id=cs.class_id WHERE cs.student_number=? AND cs.removed_at IS NULL LIMIT 1").bind(studentNumber).first<Record<string, unknown>>() : Promise.resolve(null),
  ]);
  const participation = await Promise.all(pollsResult.results.map(async (item) => { const id = String(rowObject(item).id); return Boolean(await env.DB.prepare("SELECT 1 FROM poll_participations WHERE poll_id=? AND voter_hash=?").bind(id, await voterHash(env, user, id)).first()); }));
  const pendingPolls = pollsResult.results.filter((_, index) => !participation[index]).map((item) => { const row = rowObject(item); return { id: row.id, title: row.title, description: row.description, endsAt: row.ends_at, href: "/inqueritos" }; });
  const notificationItems = await loadNotifications(env, user, preferences, 100, true, false);
  const upcomingEvents = upcomingResult.results.map((item) => eventDto(rowObject(item))), favoriteMaterials = favoritesResult.results.map((item) => ({ ...materialDto(item), favoritedAt: rowObject(item).favorited_at }));
  const requestItems = requestsResult.results.map((item) => { const row = rowObject(item); return { id: row.id, subject: row.subject, status: row.status, updatedAt: row.updated_at, unitCode: row.unit_code, unitName: row.unit_name, href: "/pedidos" }; });
  const announcementItems = urgentResult.results.map((item) => { const row = rowObject(item); return { id: row.id, title: row.title, description: row.body, priority: "urgent", publishedAt: row.published_at, href: "/avisos" }; });
  const classId = Number(classInfo?.class_id ?? user.representedClass ?? 0) || null;
  const classSummary = classId ? { id: classId, classId, name: `Turma ${classId}`, status: classInfo?.class_status ?? "" } : null;
  const hasSpecialStatus = specialStatusesEnabled && Boolean(classInfo?.special_status && classInfo.special_status !== "none"), classPreferences = { status: hasSpecialStatus ? "special_status" : classInfo?.student_decision ?? classInfo?.preference ?? "", summary: hasSpecialStatus ? "Alunos com estatutos especiais não podem preencher, ainda, o formulário de preferências." : classInfo?.student_decision ?? classInfo?.preference ?? "", decidedAt: hasSpecialStatus ? null : classInfo?.decision_at ?? null };
  return json({ generatedAt: now, unreadNotifications: notificationItems.length, summary: { unreadNotifications: notificationItems.length, upcomingEvents: upcomingEvents.length, openRequests: requestItems.length, activePolls: pendingPolls.length, favoriteMaterials: favoriteMaterials.length }, notifications: notificationItems.slice(0, 8), upcomingEvents, requests: requestItems, recentRequests: requestItems, polls: pendingPolls, activePolls: pendingPolls, favoriteMaterials, urgentAnnouncements: announcementItems, announcements: announcementItems, recentAnnouncements: announcementItems, classId, classInfo: classSummary, classSummary, preferences: classPreferences, classPreferences, management: isCommission(user) });
}

async function dashboard(env: HubEnv, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("dashboard.analytics")) return disabled();
  const cc = isCommission(user);
  const [announcements, upcoming, docs, pollsCount, materialsCount, requestsCount, recentResult, unitsResult] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM announcements WHERE status='published' AND (expires_at IS NULL OR expires_at>?)").bind(Date.now()).first<{ n:number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM academic_events WHERE status='scheduled' AND starts_at BETWEEN ? AND ?").bind(Date.now(), Date.now() + 30 * 86400000).first<{ n:number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM academic_documents WHERE status='published'").first<{ n:number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM polls WHERE status='published'").first<{ n:number }>(),
    env.DB.prepare(cc ? "SELECT COUNT(*) AS n FROM material_submissions WHERE status='pending'" : "SELECT COUNT(*) AS n FROM material_submissions WHERE status='published' AND material_type!='exam_photo'").first<{ n:number }>(),
    cc ? env.DB.prepare("SELECT COUNT(*) AS n FROM course_requests WHERE status NOT IN ('resolved','closed')").first<{ n:number }>() : env.DB.prepare("SELECT COUNT(*) AS n FROM course_requests WHERE submitted_by=? AND status NOT IN ('resolved','closed')").bind(user.id).first<{ n:number }>(),
    env.DB.prepare(`SELECT * FROM (SELECT id,title,'announcement' AS type,'/avisos' AS href,published_at AS created_at FROM announcements WHERE status='published' UNION ALL SELECT id,title,'event' AS type,'/calendario' AS href,created_at FROM academic_events UNION ALL SELECT id,title,'document' AS type,'/documentos' AS href,created_at FROM academic_documents WHERE status!='archived' UNION ALL SELECT id,title,'material' AS type,'/materiais' AS href,created_at FROM material_submissions WHERE ${cc ? "status IN ('pending','published')" : "status='published' AND material_type!='exam_photo'"}) ORDER BY created_at DESC LIMIT 12`).all(),
    env.DB.prepare("SELECT cu.id,cu.code,cu.name,(SELECT COUNT(*) FROM course_requests r WHERE r.curricular_unit_id=cu.id AND r.status NOT IN ('resolved','closed')) AS issues,(SELECT COUNT(*) FROM academic_events e WHERE e.curricular_unit_id=cu.id AND e.status='scheduled' AND e.starts_at>=?) AS events FROM curricular_units cu WHERE cu.active=1 ORDER BY issues DESC,events DESC,cu.name LIMIT 30").bind(Date.now()).all(),
  ]);
  const metrics = { activeAnnouncements: announcements?.n || 0, openRequests: requestsCount?.n || 0, pendingMaterials: materialsCount?.n || 0, activePolls: pollsCount?.n || 0, urgentAnnouncements: announcements?.n || 0, upcomingEvents: upcoming?.n || 0, publishedDocuments: docs?.n || 0, openPolls: pollsCount?.n || 0 };
  return json({ metrics, engagement: [{ label: "Comunicados", value: metrics.activeAnnouncements }, { label: "Eventos próximos", value: metrics.upcomingEvents }, { label: "Documentos", value: metrics.publishedDocuments }, { label: "Inquéritos", value: metrics.activePolls }, { label: cc ? "Materiais por moderar" : "Materiais", value: metrics.pendingMaterials }], recent: recentResult.results.map((item) => { const row = rowObject(item); return { id: row.id, title: row.title, type: row.type, href: row.href, createdAt: new Date(Number(row.created_at)).toISOString() }; }), units: unitsResult.results.map((item) => { const row = rowObject(item); return { id: row.id, code: row.code, name: row.name, issues: row.issues, events: row.events }; }), management: cc });
}

async function search(env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  if (!user) return unauthenticated();
  if (!await enabled("search.global")) return disabled();
  const query = text(url.searchParams.get("q"), 100);
  if (query.length < 2) return json({ results: [] });
  const pattern = `%${query.replace(/[%_]/g, "")}%`;
  const cc = isCommission(user), visibility = cc ? "1=1" : "visibility!='cc'";
  const [classesEnabled, linksEnabled] = await Promise.all([enabled("classes.rosters"), enabled("useful_links.library")]);
  const [classes, units, events, docs, announcements, materialRows, members, linkRows] = await Promise.all([
    classesEnabled
      ? env.DB.prepare("SELECT id,'Turma' AS eyebrow,('Turma ' || id) AS title,('Ano letivo ' || academic_year || ' · ' || (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id=classes.id AND cs.removed_at IS NULL) || ' estudantes') AS description,'class' AS type,updated_at AS date FROM classes WHERE (('Turma ' || id) LIKE ? OR CAST(id AS TEXT) LIKE ? OR academic_year LIKE ?) ORDER BY id LIMIT 20").bind(pattern, pattern, pattern).all()
      : Promise.resolve({ results: [] }),
    env.DB.prepare("SELECT id,code AS eyebrow,name AS title,'curricular_unit' AS type,('ECTS: ' || ects || ' · ' || study_year || '.º ano') AS description FROM curricular_units WHERE active=1 AND (name LIKE ? OR code LIKE ?) LIMIT 20").bind(pattern, pattern).all(),
    env.DB.prepare(`SELECT id,event_type AS eyebrow,title,description,'event' AS type,starts_at AS date FROM academic_events WHERE ${visibility} AND status='scheduled' AND (title LIKE ? OR description LIKE ?) LIMIT 20`).bind(pattern, pattern).all(),
    env.DB.prepare(`SELECT id,document_type AS eyebrow,title,description,'document' AS type,published_at AS date FROM academic_documents WHERE ${visibility} AND status='published' AND (title LIKE ? OR description LIKE ? OR content LIKE ?) LIMIT 20`).bind(pattern, pattern, pattern).all(),
    env.DB.prepare("SELECT id,priority AS eyebrow,title,substr(body,1,220) AS description,'announcement' AS type,published_at AS date FROM announcements WHERE status='published' AND (title LIKE ? OR body LIKE ?) LIMIT 20").bind(pattern, pattern).all(),
    env.DB.prepare("SELECT id,material_type AS eyebrow,title,description,'material' AS type,created_at AS date FROM material_submissions WHERE status='published' AND material_type!='exam_photo' AND (title LIKE ? OR description LIKE ?) LIMIT 20").bind(pattern, pattern).all(),
    env.DB.prepare("SELECT u.id,p.label AS eyebrow,u.full_name AS title,COALESCE(d.label,p.label) AS description,'member' AS type,u.updated_at AS date FROM users u JOIN commission_positions p ON p.code=u.commission_position LEFT JOIN commission_departments d ON d.code=u.commission_department WHERE u.status='active' AND (u.full_name LIKE ? OR p.label LIKE ? OR d.label LIKE ?) LIMIT 20").bind(pattern, pattern, pattern).all(),
    linksEnabled ? env.DB.prepare(`SELECT l.id,l.category AS eyebrow,l.title,l.description,'useful_link' AS type,l.updated_at AS date FROM useful_links l WHERE l.status='published' AND ${cc ? "1=1" : "l.visibility!='cc'"} AND (l.title LIKE ? OR l.description LIKE ? OR l.url LIKE ?) LIMIT 20`).bind(pattern, pattern, pattern).all() : Promise.resolve({ results: [] }),
  ]);
  const hrefs: Record<string, (id: unknown) => string> = { class: (id) => `/turmas/${encodeURIComponent(String(id))}`, announcement: () => "/avisos", curricular_unit: (id) => `/unidades-curriculares/${encodeURIComponent(String(id))}`, event: () => "/calendario", document: () => "/documentos", material: () => "/materiais", member: () => "/comissao", useful_link: () => "/links-uteis" };
  const results = [...classes.results, ...units.results, ...events.results, ...docs.results, ...announcements.results, ...materialRows.results, ...members.results, ...linkRows.results].map((item) => { const row = rowObject(item); return { id: row.id, type: row.type, title: row.title, description: row.description, meta: row.eyebrow, href: hrefs[String(row.type)]?.(row.id) || "/pesquisa", date: row.date }; }).sort((a, b) => Number(b.date || 0) - Number(a.date || 0)).slice(0, 50);
  return json({ query, results });
}

export function isAcademicHubPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === "/api/calendar-events" || path === "/api/calendar-subscription" || path === "/api/calendar-subscriptions" || path === "/api/calendar-feed.ics" || path === "/api/documents" || path === "/api/requests" || path === "/api/commission-directory" || path === "/api/curricular-units" || /^\/api\/curricular-units\/[^/]+$/.test(path) || path === "/api/polls" || /^\/api\/polls\/[^/]+\/vote$/.test(path) || path === "/api/dashboard" || path === "/api/dashboard/personal" || path === "/api/notifications" || path === "/api/notification-preferences" || path === "/api/search" || path === "/api/material-submissions" || path === "/api/material-favorites" || path === "/api/material-feedback" || /^\/api\/material-submissions\/[^/]+\/versions$/.test(path) || path === "/api/useful-links";
}

export async function handleAcademicHubRoute(request: Request, env: HubEnv, url: URL, user: HubUser | null, enabled: ModuleChecker): Promise<Response> {
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (pathname === "/api/calendar-events") return calendar(request, env, url, user, enabled);
  if (pathname === "/api/calendar-subscription" || pathname === "/api/calendar-subscriptions") return calendarSubscription(request, env, url, user, enabled);
  if (pathname === "/api/calendar-feed.ics" && request.method === "GET") return calendarFeed(env, url, enabled);
  if (pathname === "/api/documents") return documents(request, env, url, user, enabled);
  if (pathname === "/api/requests") return requests(request, env, url, user, enabled);
  if (pathname === "/api/commission-directory" && request.method === "GET") return directory(env, user, enabled);
  if (pathname === "/api/curricular-units" && request.method === "GET") return unitCatalog(env, user, enabled);
  const unit = pathname.match(/^\/api\/curricular-units\/([^/]+)$/);
  if (unit && request.method === "GET") return unitDetail(env, decodeURIComponent(unit[1]), user, enabled);
  const vote = pathname.match(/^\/api\/polls\/([^/]+)\/vote$/);
  if (vote) return polls(request, env, url, user, enabled, decodeURIComponent(vote[1]), "vote");
  if (pathname === "/api/polls") return polls(request, env, url, user, enabled);
  if (pathname === "/api/dashboard" && request.method === "GET") return dashboard(env, user, enabled);
  if (pathname === "/api/dashboard/personal" && request.method === "GET") return personalDashboard(env, user, enabled);
  if (pathname === "/api/notifications") return notifications(request, env, url, user, enabled);
  if (pathname === "/api/notification-preferences") return notificationPreferences(request, env, user, enabled);
  if (pathname === "/api/search" && request.method === "GET") return search(env, url, user, enabled);
  if (pathname === "/api/material-submissions") return materials(request, env, url, user, enabled);
  if (pathname === "/api/material-favorites") return materialFavorites(request, env, url, user, enabled);
  if (pathname === "/api/material-feedback") return materialFeedback(request, env, url, user, enabled);
  const versions = pathname.match(/^\/api\/material-submissions\/([^/]+)\/versions$/);
  if (versions) return materialVersions(request, env, decodeURIComponent(versions[1]), user, enabled);
  if (pathname === "/api/useful-links") return usefulLinks(request, env, url, user, enabled);
  return json({ error: "Operação não suportada." }, 405);
}
