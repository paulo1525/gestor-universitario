/// <reference types="@cloudflare/workers-types" />

import type { HubUser } from "./academic-hub";

type CampusEnv = { DB: D1Database };
type Checker = (key: string) => Promise<boolean>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(value: unknown, max: number): string { return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : ""; }
function longText(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function actor(user: HubUser): string { return user.actorId || user.id; }
function isCommission(user: HubUser): boolean { return user.role === "admin" || Boolean(user.commissionPosition); }
function canManage(user: HubUser): boolean { return user.role === "admin" || user.commissionDepartment === "management"; }
function denied(): Response { return json({ error: "Acesso reservado ao Núcleo de Gestão." }, 403); }
function disabled(): Response { return json({ error: "Este módulo está temporariamente desativado.", code: "MODULE_DISABLED" }, 404); }
function row(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }

async function audit(env: CampusEnv, user: HubUser, action: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO admin_audit_log(actor_user_id,action,details,created_at) VALUES (?,?,?,?)")
    .bind(actor(user), action, JSON.stringify(details), Date.now()).run();
}

export function isCampusPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/api/campus" || path === "/api/campus/buildings" || path === "/api/campus/floors" || path === "/api/campus/rooms" || path === "/api/campus/faculty";
}

async function campus(request: Request, env: CampusEnv, url: URL, user: HubUser | null, enabled: Checker): Promise<Response> {
  if (!user) return json({ error: "Sessão inválida." }, 401);
  const management = request.method !== "GET";
  if (!await enabled(management ? "campus.management" : "campus.directory")) return disabled();
  if (management && !canManage(user)) return denied();

  if (request.method === "GET") {
    const query = text(url.searchParams.get("q"), 100), pattern = `%${query.replace(/[%_]/g, "")}%`;
    const [buildingsResult, floorsResult, roomsResult, facultyResult, linksResult, unitsResult] = await Promise.all([
      env.DB.prepare("SELECT id,name,code,address,map_url,accessibility_notes,updated_at FROM campus_buildings WHERE active=1 AND (name LIKE ? OR code LIKE ? OR address LIKE ?) ORDER BY name COLLATE NOCASE").bind(pattern, pattern, pattern).all(),
      env.DB.prepare("SELECT id,building_id,level,label,plan_url,updated_at FROM campus_floors WHERE active=1 AND (label LIKE ? OR level LIKE ?) ORDER BY building_id,level").bind(pattern, pattern).all(),
      env.DB.prepare("SELECT r.id,r.floor_id,r.code,r.name,r.room_type,r.capacity,r.accessibility_notes,r.directions,r.updated_at,f.level,f.label AS floor_label,b.id AS building_id,b.code AS building_code,b.name AS building_name,b.address AS building_address,b.map_url AS building_map_url,b.accessibility_notes AS building_accessibility_notes FROM campus_rooms r JOIN campus_floors f ON f.id=r.floor_id JOIN campus_buildings b ON b.id=f.building_id WHERE r.active=1 AND (r.code LIKE ? OR r.name LIKE ? OR b.name LIKE ? OR b.code LIKE ?) ORDER BY b.name COLLATE NOCASE,f.level,r.code").bind(pattern, pattern, pattern, pattern).all(),
      env.DB.prepare("SELECT cf.id,cf.full_name,cf.title,cf.email,cf.office,cf.profile_url,cf.notes,cf.updated_at FROM campus_faculty cf WHERE cf.active=1 AND (cf.full_name LIKE ? OR cf.title LIKE ? OR cf.email LIKE ? OR cf.office LIKE ? OR EXISTS (SELECT 1 FROM campus_faculty_units cfu JOIN curricular_units cu ON cu.id=cfu.curricular_unit_id WHERE cfu.faculty_id=cf.id AND cu.active=1 AND (cu.code LIKE ? OR cu.name LIKE ?))) ORDER BY cf.full_name COLLATE NOCASE").bind(pattern, pattern, pattern, pattern, pattern, pattern).all(),
      env.DB.prepare("SELECT cfu.faculty_id,cu.id AS unit_id,cu.code,cu.name FROM campus_faculty_units cfu JOIN curricular_units cu ON cu.id=cfu.curricular_unit_id WHERE cu.active=1 ORDER BY cu.name COLLATE NOCASE").all(),
      env.DB.prepare("SELECT id,code,name,study_year,semester FROM curricular_units WHERE active=1 ORDER BY study_year,semester,name COLLATE NOCASE").all(),
    ]);
    // Simple room list (room, building, optional teacher, classes) shown on "Salas e docentes".
    const [spacesResult, classesResult] = await Promise.all([
      env.DB.prepare("SELECT id,room,building,teacher,classes,subject,session,weekday,starts_at AS startsAt,ends_at AS endsAt,weeks,note,updated_at FROM campus_spaces WHERE active=1 ORDER BY building, room COLLATE NOCASE, weekday, starts_at").all(),
      env.DB.prepare("SELECT id FROM classes ORDER BY id").all(),
    ]);
    const spaces = spacesResult.results.map((item) => { const space = row(item); let classes: number[] = []; try { const parsed = JSON.parse(String(space.classes || "[]")); if (Array.isArray(parsed)) classes = parsed.map(Number).filter(Number.isInteger); } catch { classes = []; } let weeks: string[] | null = null; try { const parsed = space.weeks ? JSON.parse(String(space.weeks)) : null; if (Array.isArray(parsed)) weeks = parsed.map(String).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)); } catch { weeks = null; } return { ...space, classes, weeks }; });
    const classIds = classesResult.results.map((item) => Number(row(item).id)).filter(Number.isInteger);
    const facultyUnits = new Map<string, Array<Record<string, unknown>>>();
    for (const item of linksResult.results) { const link = row(item); facultyUnits.set(String(link.faculty_id), [...(facultyUnits.get(String(link.faculty_id)) || []), { id: link.unit_id, code: link.code, name: link.name }]); }
    return json({ buildings: buildingsResult.results, floors: floorsResult.results, rooms: roomsResult.results, faculty: facultyResult.results.map((item) => ({ ...row(item), units: facultyUnits.get(String(row(item).id)) || [] })), units: unitsResult.results, spaces, classes: classIds.length ? classIds : Array.from({ length: 20 }, (_, index) => index + 1), canManage: canManage(user), isCommission: isCommission(user), query });
  }

  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return json({ error: "Pedido JSON inválido." }, 400);
  let body: Record<string, unknown>;
  try { const value = await request.json(); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; } catch { return json({ error: "Pedido JSON inválido." }, 400); }
  const entity = text(body.entity, 20) || (url.pathname.endsWith("/buildings") ? "building" : url.pathname.endsWith("/floors") ? "floor" : url.pathname.endsWith("/rooms") ? "room" : "faculty");
  const method = request.method;
  if (method === "DELETE") {
    const id = text(body.id, 80);
    if (!id || !["building", "floor", "room", "faculty", "space"].includes(entity)) return json({ error: "Registo inválido." }, 400);
    const table = entity === "space" ? "campus_spaces" : entity === "building" ? "campus_buildings" : entity === "floor" ? "campus_floors" : entity === "room" ? "campus_rooms" : "campus_faculty";
    const result = await env.DB.prepare(`UPDATE ${table} SET active=0,updated_by=?,updated_at=? WHERE id=? AND active=1`).bind(actor(user), Date.now(), id).run();
    if (!result.meta.changes) return json({ error: "Registo não encontrado." }, 404);
    await audit(env, user, `campus_${entity}_archived`, { id });
    return json({ ok: true, id });
  }

  const id = method === "PUT" ? text(body.id, 80) : crypto.randomUUID(), now = Date.now();
  try {
    if (entity === "space") {
      const room = text(body.room, 60), building = text(body.building, 10), teacher = text(body.teacher, 160);
      // Which class uses the room and when: optional, but a time needs a weekday and a valid HH:MM range.
      const subject = text(body.subject, 80), session = text(body.session, 40), note = text(body.note, 200);
      const weekday = body.weekday === "" || body.weekday === null || body.weekday === undefined ? null : Number(body.weekday);
      const startsAt = text(body.startsAt, 5), endsAt = text(body.endsAt, 5), time = /^([01]\d|2[0-3]):[0-5]\d$/;
      // Weeks are kept as sent by the importer; the editor leaves them untouched (NULL keeps the stored value).
      const weeks = Array.isArray(body.weeks) ? JSON.stringify(body.weeks.map(String).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).slice(0, 60)) : null;
      if ((weekday !== null && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) || (startsAt && !time.test(startsAt)) || (endsAt && !time.test(endsAt)) || (startsAt && endsAt && endsAt <= startsAt) || (Boolean(startsAt) !== Boolean(endsAt))) return json({ error: "Indica um dia e um horário válidos." }, 400);
      const classes = Array.isArray(body.classes) ? [...new Set(body.classes.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 20))].sort((a, b) => a - b) : [];
      if (!room || !["cim", "hsj"].includes(building)) return json({ error: "Indica a sala e o edifício." }, 400);
      const statement = method === "PUT"
        ? env.DB.prepare("UPDATE campus_spaces SET room=?,building=?,teacher=?,classes=?,subject=?,session=?,weekday=?,starts_at=?,ends_at=?,note=?,weeks=COALESCE(?,weeks),updated_by=?,updated_at=? WHERE id=? AND active=1").bind(room, building, teacher || null, JSON.stringify(classes), subject || null, session || null, weekday, startsAt || null, endsAt || null, note || null, weeks, actor(user), now, id)
        : env.DB.prepare("INSERT INTO campus_spaces(id,room,building,teacher,classes,subject,session,weekday,starts_at,ends_at,note,weeks,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, room, building, teacher || null, JSON.stringify(classes), subject || null, session || null, weekday, startsAt || null, endsAt || null, note || null, weeks, actor(user), actor(user), now, now);
      const result = await statement.run(); if (method === "PUT" && !result.meta.changes) return json({ error: "Sala não encontrada." }, 404);
    } else if (entity === "building") {
      const name = text(body.name, 120), code = text(body.code, 30).toUpperCase(), address = text(body.address, 240), mapUrl = text(body.mapUrl, 1000), accessibility = longText(body.accessibilityNotes, 2000);
      if (name.length < 2 || !/^[A-Z0-9._-]{1,30}$/.test(code)) return json({ error: "Indique o nome e um código válido para o edifício." }, 400);
      const statement = method === "PUT" ? env.DB.prepare("UPDATE campus_buildings SET name=?,code=?,address=?,map_url=?,accessibility_notes=?,updated_by=?,updated_at=? WHERE id=? AND active=1").bind(name, code, address, mapUrl || null, accessibility, actor(user), now, id) : env.DB.prepare("INSERT INTO campus_buildings(id,name,code,address,map_url,accessibility_notes,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, name, code, address, mapUrl || null, accessibility, actor(user), actor(user), now, now);
      const result = await statement.run(); if (method === "PUT" && !result.meta.changes) return json({ error: "Edifício não encontrado." }, 404);
    } else if (entity === "floor") {
      const buildingId = text(body.buildingId, 80), level = text(body.level, 20), label = text(body.label, 80), planUrl = text(body.planUrl, 1000);
      if (!buildingId || !level || label.length < 1 || !await env.DB.prepare("SELECT id FROM campus_buildings WHERE id=? AND active=1").bind(buildingId).first()) return json({ error: "Piso ou edifício inválido." }, 400);
      const statement = method === "PUT" ? env.DB.prepare("UPDATE campus_floors SET building_id=?,level=?,label=?,plan_url=?,updated_by=?,updated_at=? WHERE id=? AND active=1").bind(buildingId, level, label, planUrl || null, actor(user), now, id) : env.DB.prepare("INSERT INTO campus_floors(id,building_id,level,label,plan_url,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, buildingId, level, label, planUrl || null, actor(user), actor(user), now, now);
      const result = await statement.run(); if (method === "PUT" && !result.meta.changes) return json({ error: "Piso não encontrado." }, 404);
    } else if (entity === "room") {
      const floorId = text(body.floorId, 80), code = text(body.code, 30), name = text(body.name, 120), roomType = text(body.roomType, 20) || "room", capacity = body.capacity === "" || body.capacity === undefined ? null : Number(body.capacity), accessibility = longText(body.accessibilityNotes, 2000), directions = longText(body.directions, 2000);
      if (!floorId || !code || !name || !["room", "laboratory", "amphitheatre", "service", "other"].includes(roomType) || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) return json({ error: "Dados da sala inválidos." }, 400);
      if (!await env.DB.prepare("SELECT id FROM campus_floors WHERE id=? AND active=1").bind(floorId).first()) return json({ error: "Piso inválido." }, 400);
      const statement = method === "PUT" ? env.DB.prepare("UPDATE campus_rooms SET floor_id=?,code=?,name=?,room_type=?,capacity=?,accessibility_notes=?,directions=?,updated_by=?,updated_at=? WHERE id=? AND active=1").bind(floorId, code, name, roomType, capacity, accessibility, directions, actor(user), now, id) : env.DB.prepare("INSERT INTO campus_rooms(id,floor_id,code,name,room_type,capacity,accessibility_notes,directions,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, floorId, code, name, roomType, capacity, accessibility, directions, actor(user), actor(user), now, now);
      const result = await statement.run(); if (method === "PUT" && !result.meta.changes) return json({ error: "Sala não encontrada." }, 404);
    } else if (entity === "faculty") {
      const fullName = text(body.fullName ?? body.name, 160), title = text(body.title, 120), email = text(body.email, 180), office = text(body.office, 120), profileUrl = text(body.profileUrl, 1000), notes = longText(body.notes, 3000), unitIds = Array.isArray(body.unitIds) ? body.unitIds.map((item) => text(item, 80)).filter(Boolean) : [];
      if (fullName.length < 3) return json({ error: "Indique o nome completo do docente." }, 400);
      if (unitIds.length && Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM curricular_units WHERE active=1 AND id IN (${unitIds.map(() => "?").join(",")})`).bind(...unitIds).first<{ n: number }>())?.n || 0) !== new Set(unitIds).size) return json({ error: "Unidade curricular inválida." }, 400);
      const statement = method === "PUT" ? env.DB.prepare("UPDATE campus_faculty SET full_name=?,title=?,email=?,office=?,profile_url=?,notes=?,updated_by=?,updated_at=? WHERE id=? AND active=1").bind(fullName, title, email || null, office || null, profileUrl || null, notes, actor(user), now, id) : env.DB.prepare("INSERT INTO campus_faculty(id,full_name,title,email,office,profile_url,notes,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, fullName, title, email || null, office || null, profileUrl || null, notes, actor(user), actor(user), now, now);
      const result = await statement.run(); if (method === "PUT" && !result.meta.changes) return json({ error: "Docente não encontrado." }, 404);
      await env.DB.prepare("DELETE FROM campus_faculty_units WHERE faculty_id=?").bind(id).run();
      for (const unitId of [...new Set(unitIds)]) await env.DB.prepare("INSERT INTO campus_faculty_units(faculty_id,curricular_unit_id,created_at) VALUES (?,?,?)").bind(id, unitId, now).run();
    } else return json({ error: "Tipo de registo inválido." }, 400);
    await audit(env, user, `campus_${entity}_${method === "POST" ? "created" : "updated"}`, { id });
    return json({ ok: true, id }, method === "POST" ? 201 : 200);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ error: "Já existe um registo com estes dados." }, 409);
    throw error;
  }
}

export async function handleCampusRoute(request: Request, env: CampusEnv, url: URL, user: HubUser | null, enabled: Checker): Promise<Response> {
  return campus(request, env, url, user, enabled);
}
