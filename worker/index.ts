/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_RATE_LIMITER: RateLimit;
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  AUTH_PEPPER: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  MAINTENANCE_MODE: string;
}

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  role: "student" | "representative" | "admin";
  email_verified_at: number;
  failed_login_count: number;
  locked_until: number | null;
  status: "active" | "pending" | "suspended" | "banned";
  status_reason: string | null;
  status_until: number | null;
};

type PendingRow = {
  email: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  code_hash: string;
  code_expires_at: number;
  code_attempts: number;
  last_sent_at: number;
};

const SESSION_COOKIE = "__Host-gu_session";
// Mantido abaixo do limite de CPU do Workers Free; sal, pepper e rate limiting
// complementam a derivação e cada registo conserva o seu número de iterações.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const BROWSER_SESSION_SECONDS = 60 * 60 * 12;
const CODE_SECONDS = 60 * 10;
const EMAIL_PATTERN = /^up\d{9}@(up\.pt|edu\.med\.up\.pt)$/i;
const PERMANENT_ADMIN_EMAIL = "up202507850@up.pt";
const encoder = new TextEncoder();

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function securityHeaders(headers: Headers): void {
  headers.set("content-security-policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; upgrade-insecure-requests");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
}

function withSecurity(response: Response): Response {
  const secured = new Response(response.body, response);
  securityHeaders(secured.headers);
  return secured;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeFullName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function validateFullName(value: unknown): string | null {
  const fullName = normalizeFullName(value);
  if (fullName.length < 3 || fullName.length > 120) return "O nome completo deve ter entre 3 e 120 caracteres.";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’. -]*[\p{L}\p{M}.]$/u.test(fullName) || !/\s/u.test(fullName)) return "Introduza o nome completo, incluindo nome e apelido.";
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256(value: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function derivePassword(password: string, saltB64: string, pepper: string, iterations: number): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", encoder.encode(`${password}\u0000${pepper}`), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index % Math.max(1, left.length)) || 0) ^ (right.charCodeAt(index % Math.max(1, right.length)) || 0);
  }
  return difference === 0;
}

function validatePassword(password: unknown, email: string): string | null {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) return "A password deve ter entre 12 e 128 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "Use maiúsculas, minúsculas, números e símbolos.";
  const local = email.split("@")[0];
  if (password.toLowerCase().includes(local) || /password|palavra.?passe|qwerty|123456|universidade/i.test(password)) return "Escolha uma password menos previsível e sem dados da conta.";
  return null;
}

function requestFingerprint(request: Request): { ipPrefix: string; userAgent: string } {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipPrefix = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
  return { ipPrefix, userAgent: request.headers.get("user-agent") || "unknown" };
}

async function audit(env: Env, request: Request, event: string, success: boolean, email?: string, userId?: string): Promise<void> {
  const fingerprint = requestFingerprint(request);
  await env.DB.prepare("INSERT INTO auth_audit_log (user_id, email_hash, event, success, ip_prefix_hash, user_agent_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(userId || null, email ? await sha256(`${email}:${env.AUTH_PEPPER}`) : null, event, success ? 1 : 0, await sha256(`${fingerprint.ipPrefix}:${env.AUTH_PEPPER}`), await sha256(fingerprint.userAgent), Date.now())
    .run();
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("application/json")) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function validOrigin(request: Request, env: Env): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  return origin === env.APP_ORIGIN;
}

async function verifyTurnstile(env: Env, request: Request, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const fingerprint = requestFingerprint(request);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: fingerprint.ipPrefix, idempotency_key: crypto.randomUUID() }),
  });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean; hostname?: string };
  return result.success === true && result.hostname === new URL(env.APP_ORIGIN).hostname;
}

async function rateLimit(env: Env, action: string, email: string): Promise<boolean> {
  const key = `${action}:${await sha256(`${email}:${env.AUTH_PEPPER}`)}`;
  return (await env.AUTH_RATE_LIMITER.limit({ key })).success;
}

function makeCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

async function codeHash(env: Env, email: string, code: string): Promise<string> {
  return sha256(`${email}:${code}:${env.AUTH_PEPPER}`);
}

async function sendVerificationEmail(env: Env, email: string, code: string): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `registration-${crypto.randomUUID()}`,
      "user-agent": "GestorUniversitario/1.0",
    },
    body: JSON.stringify({
      to: [email],
      from: env.EMAIL_FROM,
      subject: `${code} — confirmar conta no Gestor Universitário`,
      text: `O seu código de confirmação é ${code}. Expira em 10 minutos e só pode ser utilizado uma vez. Se não iniciou este registo, ignore esta mensagem.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#161616"><h1 style="font-size:22px">Confirmar conta</h1><p>Introduza este código no Gestor Universitário:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px">${code}</p><p>O código expira em 10 minutos e só pode ser utilizado uma vez.</p><p style="color:#666;font-size:13px">Se não iniciou este registo, ignore esta mensagem.</p></div>`,
      tags: [{ name: "type", value: "registration_verification" }],
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("resend_rejected_email", response.status, details.slice(0, 300));
    throw new Error("O fornecedor de email rejeitou o envio.");
  }
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await parseJson(request);
  const email = normalizeEmail(body?.email);
  const fullName = normalizeFullName(body?.fullName);
  const password = body?.password;
  if (!EMAIL_PATTERN.test(email)) return json({ error: "Use um email institucional no formato upXXXXXXXXX@up.pt ou upXXXXXXXXX@edu.med.up.pt." }, 400);
  const fullNameError = validateFullName(body?.fullName);
  if (fullNameError) return json({ error: fullNameError }, 400);
  const passwordError = validatePassword(password, email);
  if (passwordError) return json({ error: passwordError }, 400);
  if (!await rateLimit(env, "register", email)) return json({ error: "Demasiadas tentativas. Aguarde antes de tentar novamente." }, 429);
  if (!await verifyTurnstile(env, request, body?.turnstileToken)) return json({ error: "Não foi possível validar a proteção antiabuso. Atualize a página e tente novamente." }, 400);

  const now = Date.now();
  const existing = await env.DB.prepare("SELECT id, status, email_verified_at FROM users WHERE email = ?").bind(email).first<{ id: string; status: string; email_verified_at: number }>();
  const pending = await env.DB.prepare("SELECT last_sent_at FROM pending_registrations WHERE email = ?").bind(email).first<{ last_sent_at: number }>();
  if (pending && now - pending.last_sent_at < 60_000) return json({ error: "Aguarde um minuto antes de pedir outro código." }, 429);
  if (existing && existing.email_verified_at > 0) {
    await audit(env, request, "registration_existing", false, email);
    return json({ error: "Já existe uma conta associada a este email. Inicie sessão.", code: "ACCOUNT_EXISTS" }, 409);
  }

  const salt = bytesToBase64(randomBytes(16));
  const hash = await derivePassword(password as string, salt, env.AUTH_PEPPER, PASSWORD_ITERATIONS);
  const code = makeCode();
  const userId = existing?.id ?? crypto.randomUUID();
  const role = email === env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() ? "admin" : "student";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, full_name, password_hash, password_salt, password_iterations, role, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, password_salt=excluded.password_salt, password_iterations=excluded.password_iterations, role=excluded.role, status='pending', updated_at=excluded.updated_at WHERE users.email_verified_at = 0").bind(userId, email, fullName, hash, salt, PASSWORD_ITERATIONS, role, now, now, now),
    env.DB.prepare("INSERT INTO pending_registrations (email, full_name, password_hash, password_salt, password_iterations, code_hash, code_expires_at, code_attempts, last_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, password_salt=excluded.password_salt, password_iterations=excluded.password_iterations, code_hash=excluded.code_hash, code_expires_at=excluded.code_expires_at, code_attempts=0, last_sent_at=excluded.last_sent_at").bind(email, fullName, hash, salt, PASSWORD_ITERATIONS, await codeHash(env, email, code), now + CODE_SECONDS * 1000, now, now),
  ]);
  try {
    await sendVerificationEmail(env, email, code);
  } catch (error) {
    console.error("verification_email_failed", error instanceof Error ? error.message : "unknown");
    await audit(env, request, "registration_email_failed", false, email);
    return json({ error: "Não foi possível enviar o código. Tente novamente mais tarde." }, 503);
  }
  await audit(env, request, "registration_code_sent", true, email);
  return json({ ok: true, next: "verify" });
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
  const body = await parseJson(request);
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!EMAIL_PATTERN.test(email) || !/^\d{6}$/.test(code)) return json({ error: "Código inválido ou expirado." }, 400);
  if (!await rateLimit(env, "verify", email)) return json({ error: "Demasiadas tentativas. Aguarde antes de tentar novamente." }, 429);
  const pending = await env.DB.prepare("SELECT * FROM pending_registrations WHERE email = ?").bind(email).first<PendingRow>();
  const now = Date.now();
  if (!pending || pending.code_expires_at < now || pending.code_attempts >= 5) {
    await audit(env, request, "registration_verify", false, email);
    return json({ error: "Código inválido ou expirado." }, 400);
  }
  const valid = constantTimeEqual(pending.code_hash, await codeHash(env, email, code));
  if (!valid) {
    await env.DB.prepare("UPDATE pending_registrations SET code_attempts = code_attempts + 1 WHERE email = ?").bind(email).run();
    await audit(env, request, "registration_verify", false, email);
    return json({ error: "Código inválido ou expirado." }, 400);
  }
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND email_verified_at = 0").bind(email).first<{ id: string }>();
  if (!user) return json({ error: "Não foi possível concluir o registo. A conta poderá já estar validada." }, 409);
  const userId = user.id;
  const role = email === env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() ? "admin" : "student";
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET full_name = ?, password_hash = ?, password_salt = ?, password_iterations = ?, role = ?, status = 'active', email_verified_at = ?, password_changed_at = ?, updated_at = ? WHERE id = ? AND email_verified_at = 0").bind(pending.full_name, pending.password_hash, pending.password_salt, pending.password_iterations, role, now, now, now, userId),
      env.DB.prepare("DELETE FROM pending_registrations WHERE email = ?").bind(email),
    ]);
  } catch {
    return json({ error: "Não foi possível concluir o registo. A conta poderá já existir." }, 409);
  }
  await audit(env, request, "registration_complete", true, email, userId);
  return createSessionResponse(env, request, { id: userId, email, full_name: pending.full_name, role }, body?.rememberMe === true);
}

async function ensureOperationalSchema(env: Env): Promise<void> {
  const columns = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["status", "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'banned'))"],
    ["status_reason", "ALTER TABLE users ADD COLUMN status_reason TEXT"],
    ["status_until", "ALTER TABLE users ADD COLUMN status_until INTEGER"],
    ["last_login_at", "ALTER TABLE users ADD COLUMN last_login_at INTEGER"],
    ["commission_position", "ALTER TABLE users ADD COLUMN commission_position TEXT CHECK (commission_position IN ('principal_admin', 'president', 'vice_president', 'treasurer', 'member'))"],
    ["commission_department", "ALTER TABLE users ADD COLUMN commission_department TEXT CHECK (commission_department IN ('management', 'studies', 'curricular_units', 'recreation_image'))"],
    ["admin_override", "ALTER TABLE users ADD COLUMN admin_override INTEGER NOT NULL DEFAULT 0 CHECK (admin_override IN (0, 1))"],
    ["class_representative", "ALTER TABLE users ADD COLUMN class_representative INTEGER NOT NULL DEFAULT 0 CHECK (class_representative IN (0, 1))"],
    ["represented_class", "ALTER TABLE users ADD COLUMN represented_class INTEGER CHECK (represented_class BETWEEN 1 AND 20)"],
    ["font_scale", "ALTER TABLE users ADD COLUMN font_scale TEXT NOT NULL DEFAULT 'normal' CHECK (font_scale IN ('small', 'normal', 'large'))"],
  ] as const;
  for (const [name, statement] of additions) {
    if (names.has(name)) continue;
    try {
      await env.DB.prepare(statement).run();
    } catch (error) {
      const refreshed = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === name)) throw error;
    }
  }
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, details TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS commission_positions (code TEXT PRIMARY KEY, label TEXT NOT NULL, authority_level TEXT NOT NULL CHECK (authority_level IN ('supreme', 'core', 'moderator')), rank INTEGER NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS commission_departments (code TEXT PRIMARY KEY, label TEXT NOT NULL, rank INTEGER NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 20), academic_year TEXT NOT NULL DEFAULT '2026/2027', status TEXT NOT NULL DEFAULT 'draft', submitted_at INTEGER, submitted_by TEXT REFERENCES users(id), updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS class_students (id TEXT PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), full_name TEXT NOT NULL, student_number TEXT NOT NULL UNIQUE, preference TEXT NOT NULL CHECK(preference IN ('stay','move')), preference_locked_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, removed_at INTEGER);
    CREATE TABLE IF NOT EXISTS student_destinations (student_id TEXT NOT NULL REFERENCES class_students(id) ON DELETE CASCADE, destination_class INTEGER NOT NULL REFERENCES classes(id), rank INTEGER NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL, PRIMARY KEY(student_id, destination_class), UNIQUE(student_id, rank));
    CREATE TABLE IF NOT EXISTS class_tickets (id TEXT PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), student_id TEXT REFERENCES class_students(id), category TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', response TEXT, created_by TEXT NOT NULL REFERENCES users(id), resolved_by TEXT REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS class_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL, student_id TEXT, actor_user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, details TEXT, created_at INTEGER NOT NULL);
    INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('maintenance_mode', '${env.MAINTENANCE_MODE === "true" ? "true" : "false"}', ${Date.now()});
    INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('maintenance_message', 'A área de gestão encontra-se temporariamente indisponível enquanto preparamos novas funcionalidades.', ${Date.now()});
    INSERT OR IGNORE INTO commission_positions (code, label, authority_level, rank) VALUES ('principal_admin', 'Administrador Principal', 'supreme', 1), ('president', 'Presidente', 'core', 2), ('vice_president', 'Vice-Presidente', 'core', 3), ('treasurer', 'Tesoureiro/a', 'core', 4), ('member', 'Vogal', 'moderator', 5);
    INSERT OR IGNORE INTO commission_departments (code, label, rank) VALUES ('management', 'Núcleo de Gestão', 1), ('studies', 'Estudos e Sebentas', 2), ('curricular_units', 'Unidades Curriculares', 3), ('recreation_image', 'Recreativo e Imagem', 4);
  `);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('classes_open_at', '2026-07-11T08:00:00.000Z', ?)").bind(now),
    env.DB.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('classes_close_at', '2026-07-12T22:00:00.000Z', ?)").bind(now),
    ...Array.from({ length: 20 }, (_, index) => env.DB.prepare("INSERT OR IGNORE INTO classes (id, updated_at) VALUES (?, ?)").bind(index + 1, now)),
  ]);
  await env.DB.prepare("UPDATE users SET commission_position = COALESCE(commission_position, 'principal_admin'), role = 'admin' WHERE email = ?")
    .bind(PERMANENT_ADMIN_EMAIL).run();
  await env.DB.prepare("UPDATE users SET class_representative = 1, represented_class = 17 WHERE email = ?").bind(PERMANENT_ADMIN_EMAIL).run();
}

async function createSessionResponse(env: Env, request: Request, user: { id: string; email: string; full_name: string; role: string }, rememberMe: boolean): Promise<Response> {
  const token = bytesToBase64(randomBytes(32)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Date.now();
  const lifetime = rememberMe ? SESSION_SECONDS : BROWSER_SESSION_SECONDS;
  const fingerprint = requestFingerprint(request);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent_hash, ip_prefix_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id, await sha256(`${token}:${env.AUTH_PEPPER}`), now, now + lifetime * 1000, now, await sha256(fingerprint.userAgent), await sha256(`${fingerprint.ipPrefix}:${env.AUTH_PEPPER}`))
    .run();
  const persistence = rememberMe ? `; Max-Age=${SESSION_SECONDS}` : "";
  const cookie = `${SESSION_COOKIE}=${token}; Path=/${persistence}; HttpOnly; Secure; SameSite=Strict`;
  return json({ ok: true, user: { email: user.email, fullName: user.full_name, role: user.role } }, 200, { "set-cookie": cookie });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await parseJson(request);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  const genericError = { error: "Email ou password incorretos." };
  if (!EMAIL_PATTERN.test(email) || !password || password.length > 128) return json(genericError, 401);
  if (!await rateLimit(env, "login", email)) return json({ error: "Demasiadas tentativas. Aguarde antes de tentar novamente." }, 429);
  if (!await verifyTurnstile(env, request, body?.turnstileToken)) return json({ error: "Não foi possível validar a proteção antiabuso." }, 400);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  const now = Date.now();
  const accessBlocked = user && user.status !== "active" && !(user.status === "suspended" && user.status_until && user.status_until <= now);
  if (!user || user.email_verified_at <= 0 || accessBlocked || (user.locked_until && user.locked_until > now)) {
    await audit(env, request, "login", false, email, user?.id);
    return json(genericError, 401);
  }
  const candidate = await derivePassword(password, user.password_salt, env.AUTH_PEPPER, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) {
    const failures = user.failed_login_count + 1;
    const lockedUntil = failures >= 8 ? now + 15 * 60_000 : null;
    await env.DB.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?").bind(lockedUntil ? 0 : failures, lockedUntil, now, user.id).run();
    await audit(env, request, "login", false, email, user.id);
    return json(genericError, 401);
  }
  await env.DB.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, status = CASE WHEN status = 'suspended' AND status_until <= ? THEN 'active' ELSE status END, status_reason = CASE WHEN status = 'suspended' AND status_until <= ? THEN NULL ELSE status_reason END, status_until = CASE WHEN status = 'suspended' AND status_until <= ? THEN NULL ELSE status_until END, last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, now, now, user.id).run();
  await audit(env, request, "login", true, email, user.id);
  return createSessionResponse(env, request, user, body?.rememberMe === true);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

type CurrentUser = { id: string; email: string; fullName: string; role: string; fontScale: string; classRepresentative: boolean; representedClass: number | null; commissionDepartment: string | null; preview?:boolean; actorId?:string };
async function currentUser(request: Request, env: Env): Promise<CurrentUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT users.id, users.email, users.full_name, users.role, users.font_scale, users.class_representative, users.represented_class, users.commission_department, users.status, users.status_until, sessions.id AS session_id, sessions.last_seen_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?")
    .bind(await sha256(`${token}:${env.AUTH_PEPPER}`), Date.now()).first<{ id: string; email: string; full_name: string; role: string; font_scale: string; class_representative: number; represented_class: number | null; commission_department: string | null; status: string; status_until: number | null; session_id: string; last_seen_at: number }>();
  if (!row) return null;
  if (row.status !== "active" && !(row.status === "suspended" && row.status_until && row.status_until <= Date.now())) return null;
  if (row.status === "suspended" && row.status_until && row.status_until <= Date.now()) await env.DB.prepare("UPDATE users SET status = 'active', status_reason = NULL, status_until = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  if (Date.now() - row.last_seen_at > 15 * 60_000) env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(Date.now(), row.session_id).run().catch(() => undefined);
  const base={ id: row.id, email: row.email, fullName: row.full_name, role: row.role, fontScale: row.font_scale, classRepresentative: row.class_representative === 1, representedClass: row.represented_class, commissionDepartment: row.commission_department };
  const previewId=cookieValue(request,"gu_preview_user");
  if(row.email.toLowerCase()===PERMANENT_ADMIN_EMAIL&&previewId){
    const target=await env.DB.prepare("SELECT id,email,full_name,role,font_scale,class_representative,represented_class,commission_department FROM users WHERE id=? AND status='active'").bind(previewId).first<{id:string;email:string;full_name:string;role:string;font_scale:string;class_representative:number;represented_class:number|null;commission_department:string|null}>();
    if(target)return {id:target.id,email:target.email,fullName:target.full_name,role:target.role,fontScale:target.font_scale,classRepresentative:target.class_representative===1,representedClass:target.represented_class,commissionDepartment:target.commission_department,preview:true,actorId:row.id};
  }
  return base;
}

async function handlePreviewUser(request:Request,env:Env):Promise<Response>{
  const token=cookieValue(request,SESSION_COOKIE); if(!token)return json({error:"Sessão inválida."},401);
  const real=await env.DB.prepare("SELECT u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await sha256(`${token}:${env.AUTH_PEPPER}`),Date.now()).first<{email:string}>();
  if(real?.email.toLowerCase()!==PERMANENT_ADMIN_EMAIL)return json({error:"Esta função está reservada ao administrador principal."},403);
  const body=await parseJson(request),userId=typeof body?.userId==="string"?body.userId:"";
  if(userId&&!(await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(userId).first()))return json({error:"Utilizador inválido."},404);
  const cookie=userId?`gu_preview_user=${userId}; Path=/; Secure; SameSite=Strict; Max-Age=14400`:`gu_preview_user=; Path=/; Secure; SameSite=Strict; Max-Age=0`;
  return json({ok:true},200,{"set-cookie":cookie});
}

async function handleAccessibilityPreference(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sessão inválida." }, 401);
  const body = await parseJson(request);
  const fontScale = body?.fontScale;
  if (!["small", "normal", "large"].includes(String(fontScale))) return json({ error: "Tamanho de texto inválido." }, 400);
  await env.DB.prepare("UPDATE users SET font_scale = ?, updated_at = ? WHERE id = ?").bind(fontScale, Date.now(), user.id).run();
  return json({ ok: true, fontScale });
}

async function requireAdmin(request: Request, env: Env) {
  const user = await currentUser(request, env);
  return user?.role === "admin" ? user : null;
}

async function maintenanceConfig(env: Env): Promise<{ maintenanceMode: boolean; maintenanceMessage: string }> {
  const result = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key IN ('maintenance_mode', 'maintenance_message')").all<{ key: string; value: string }>();
  const settings = Object.fromEntries(result.results.map((row) => [row.key, row.value]));
  return { maintenanceMode: (settings.maintenance_mode ?? env.MAINTENANCE_MODE) === "true", maintenanceMessage: settings.maintenance_message ?? "A plataforma encontra-se temporariamente em manutenção." };
}

async function handleAdminUsers(request: Request, env: Env, admin: { id: string }): Promise<Response> {
  if (request.method === "GET") {
    const [users, positions, departments] = await Promise.all([
      env.DB.prepare("SELECT id, email, full_name, role, admin_override, class_representative, represented_class, status, status_reason, status_until, commission_position, commission_department, email_verified_at, last_login_at, created_at, updated_at FROM users ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT code, label, authority_level, rank FROM commission_positions ORDER BY rank").all(),
      env.DB.prepare("SELECT code, label, rank FROM commission_departments ORDER BY rank").all(),
    ]);
    return json({ users: users.results, positions: positions.results, departments: departments.results });
  }
  const body = await parseJson(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const fullName = normalizeFullName(body?.fullName);
  const adminOverride = body?.adminOverride === true;
  const classRepresentative = body?.classRepresentative === true;
  const representedClass = classRepresentative && Number.isInteger(body?.representedClass) ? Number(body.representedClass) : null;
  const status = body?.status;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const statusUntil = typeof body?.statusUntil === "number" && Number.isFinite(body.statusUntil) ? body.statusUntil : null;
  const commissionPosition = body?.commissionPosition === null ? null : String(body?.commissionPosition || "");
  const commissionDepartment = body?.commissionDepartment === null ? null : String(body?.commissionDepartment || "");
  if (!id || validateFullName(fullName) || !["active", "pending", "suspended", "banned"].includes(String(status))) return json({ error: "Dados do utilizador inválidos." }, 400);
  if (commissionPosition && !["principal_admin", "president", "vice_president", "treasurer", "member"].includes(commissionPosition)) return json({ error: "Cargo da Comissão inválido." }, 400);
  if (commissionDepartment && !["management", "studies", "curricular_units", "recreation_image"].includes(commissionDepartment)) return json({ error: "Departamento da Comissão inválido." }, 400);
  if (classRepresentative && (!representedClass || representedClass < 1 || representedClass > 20)) return json({ error: "Selecione uma turma válida entre 1 e 20." }, 400);
  const target = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(id).first<{ id: string; email: string }>();
  if (!target) return json({ error: "Utilizador não encontrado." }, 404);
  if (adminOverride && !commissionPosition) return json({ error: "Só pode atribuir acesso administrativo a membros da CC com cargo definido." }, 400);
  const isPermanentAdmin = target.email.toLowerCase() === PERMANENT_ADMIN_EMAIL;
  const effectiveAdminOverride = isPermanentAdmin ? false : adminOverride;
  const role = isPermanentAdmin || commissionDepartment === "management" || (effectiveAdminOverride && commissionPosition)
    ? "admin"
    : commissionPosition || classRepresentative ? "representative" : "student";
  if (id === admin.id && (role !== "admin" || status !== "active")) return json({ error: "Não pode retirar o seu próprio acesso administrativo." }, 400);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET full_name = ?, role = ?, admin_override = ?, class_representative = ?, represented_class = ?, status = ?, status_reason = ?, status_until = ?, commission_position = ?, commission_department = ?, updated_at = ? WHERE id = ?").bind(fullName, role, effectiveAdminOverride ? 1 : 0, classRepresentative ? 1 : 0, representedClass, status, reason || null, status === "suspended" ? statusUntil : null, commissionPosition || null, commissionDepartment || null, Date.now(), id),
    env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id, target_user_id, action, details, created_at) VALUES (?, ?, 'user_updated', ?, ?)").bind(admin.id, id, JSON.stringify({ role, adminOverride: effectiveAdminOverride, classRepresentative, representedClass, status, reason: reason || null, statusUntil, commissionPosition: commissionPosition || null, commissionDepartment: commissionDepartment || null }), Date.now()),
  ]);
  if (status !== "active") await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleAdminSettings(request: Request, env: Env, admin: { id: string }): Promise<Response> {
  if (request.method === "GET") return json({ ...await maintenanceConfig(env), ...await classSettings(env) });
  const body = await parseJson(request);
  const enabled = body?.maintenanceMode === true;
  const message = typeof body?.maintenanceMessage === "string" ? body.maintenanceMessage.trim().slice(0, 500) : "";
  if (!message) return json({ error: "Indique uma mensagem de manutenção." }, 400);
  const openAt = typeof body?.openAt === "string" ? body.openAt : "";
  const closeAt = typeof body?.closeAt === "string" ? body.closeAt : "";
  if (!Number.isFinite(Date.parse(openAt)) || !Number.isFinite(Date.parse(closeAt)) || Date.parse(openAt) >= Date.parse(closeAt)) return json({ error: "Defina um início e fim válidos para o prazo." }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance_mode', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(String(enabled), now, admin.id),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance_message', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(message, now, admin.id),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('classes_open_at', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(openAt, now, admin.id),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('classes_close_at', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(closeAt, now, admin.id),
    env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id, action, details, created_at) VALUES (?, 'settings_updated', ?, ?)").bind(admin.id, JSON.stringify({ maintenanceMode: enabled }), now),
  ]);
  return json({ ok: true, maintenanceMode: enabled, maintenanceMessage: message, openAt, closeAt });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(`${token}:${env.AUTH_PEPPER}`)).run();
  return json({ ok: true }, 200, { "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
}

async function handleSessionPreference(request: Request, env: Env): Promise<Response> {
  const body = await parseJson(request);
  const persistent = body?.persistent === true;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return json({ ok: true });
  const tokenHash = await sha256(`${token}:${env.AUTH_PEPPER}`);
  const session = await env.DB.prepare("SELECT id FROM sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, Date.now()).first<{ id: string }>();
  if (!session) return json({ error: "Sessão inválida." }, 401, { "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
  const lifetime = persistent ? SESSION_SECONDS : BROWSER_SESSION_SECONDS;
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(Date.now() + lifetime * 1000, session.id).run();
  const persistence = persistent ? `; Max-Age=${SESSION_SECONDS}` : "";
  return json({ ok: true }, 200, { "set-cookie": `${SESSION_COOKIE}=${token}; Path=/${persistence}; HttpOnly; Secure; SameSite=Strict` });
}

function studentNumberFromEmail(email: string): string { return email.split("@")[0].replace(/^up/i, ""); }
function canManageAll(user: CurrentUser): boolean { return user.role === "admin" || user.commissionDepartment === "management"; }
function canEditClass(user: CurrentUser, classId: number): boolean { return canManageAll(user) || (user.classRepresentative && user.representedClass === classId); }

async function classSettings(env: Env) {
  const result = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key IN ('classes_open_at','classes_close_at')").all<{ key: string; value: string }>();
  const values = Object.fromEntries(result.results.map((row) => [row.key, row.value]));
  return { openAt: values.classes_open_at, closeAt: values.classes_close_at };
}

async function handleClasses(request: Request, env: Env, user: CurrentUser, pathname: string): Promise<Response> {
  const settings = await classSettings(env);
  if (pathname === "/api/classes" && request.method === "GET") {
    const result = await env.DB.prepare(`SELECT c.id,c.status,c.submitted_at,u.full_name representative,
      COUNT(s.id) students,COALESCE(SUM(s.preference='stay'),0) stays,COALESCE(SUM(s.preference='move'),0) moves
      FROM classes c LEFT JOIN users u ON u.class_representative=1 AND u.represented_class=c.id AND u.status='active'
      LEFT JOIN class_students s ON s.class_id=c.id AND s.removed_at IS NULL GROUP BY c.id ORDER BY c.id`).all();
    return json({ classes: result.results, settings });
  }
  const match = pathname.match(/^\/api\/classes\/(\d+)(?:\/(students|submit|tickets))?$/);
  if (!match) return json({ error: "Turma não encontrada." }, 404);
  const classId = Number(match[1]); const action = match[2] || "detail";
  if (classId < 1 || classId > 20) return json({ error: "Turma inválida." }, 400);
  const klass = await env.DB.prepare("SELECT * FROM classes WHERE id=?").bind(classId).first<{ id:number; status:string; submitted_at:number|null }>();
  if (!klass) return json({ error: "Turma não encontrada." }, 404);
  if (request.method === "GET" && action === "detail") {
    const students = await env.DB.prepare("SELECT id,full_name,student_number,preference,preference_locked_at FROM class_students WHERE class_id=? AND removed_at IS NULL ORDER BY full_name").bind(classId).all<{id:string;full_name:string;student_number:string;preference:string;preference_locked_at:number}>();
    const ownNumber = studentNumberFromEmail(user.email);
    const output = await Promise.all(students.results.map(async (student) => {
      const isSelf = student.student_number === ownNumber;
      const destinations = isSelf || canManageAll(user) ? (await env.DB.prepare("SELECT destination_class FROM student_destinations WHERE student_id=? ORDER BY rank").bind(student.id).all<{destination_class:number}>()).results.map((row)=>row.destination_class) : [];
      return { id:student.id,nome:student.full_name,numero:student.student_number,preferencia:student.preference==='stay'?'Ficar':'Mudar',locked:true,isSelf,destinations };
    }));
    return json({ class: { id:classId,status:klass.status,submittedAt:klass.submitted_at }, students:output, settings, permissions:{ edit:canEditClass(user,classId), manage:canManageAll(user), representative:user.classRepresentative&&user.representedClass===classId } });
  }
  if (request.method === "POST" && action === "students") {
    if (!canEditClass(user,classId)) return json({ error:"Sem permissão para alterar esta turma." },403);
    if (klass.status !== "draft" && !canManageAll(user)) return json({ error:"A turma já foi submetida. Abra um pedido de correção." },409);
    const body=await parseJson(request); const fullName=normalizeFullName(body?.fullName); const number=String(body?.studentNumber||"").trim(); const preference=body?.preference==="move"?"move":"stay";
    if (validateFullName(fullName)||!/^\d{9}$/.test(number)) return json({error:"Indique o nome completo e um número mecanográfico com 9 algarismos."},400);
    const now=Date.now(), id=crypto.randomUUID();
    try { await env.DB.batch([
      env.DB.prepare("INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,classId,fullName,number,preference,now,user.id,now,now),
      env.DB.prepare("INSERT INTO class_audit_log (class_id,student_id,actor_user_id,action,details,created_at) VALUES (?,?,?,'student_created',?,?)").bind(classId,id,user.id,JSON.stringify({preference}),now),
    ]); } catch { return json({error:"Este número mecanográfico já está registado."},409); }
    return json({ok:true,id},201);
  }
  if (request.method === "POST" && action === "submit") {
    if (!canEditClass(user,classId)) return json({error:"Sem permissão para submeter esta turma."},403);
    if (!canManageAll(user) && klass.status!=="draft" && klass.status!=="reopened") return json({error:"Esta turma já foi submetida."},409);
    const count=await env.DB.prepare("SELECT COUNT(*) total FROM class_students WHERE class_id=? AND removed_at IS NULL").bind(classId).first<{total:number}>();
    if (!count?.total) return json({error:"Adicione pelo menos um aluno antes de submeter."},400);
    await env.DB.batch([env.DB.prepare("UPDATE classes SET status='submitted',submitted_at=?,submitted_by=?,updated_at=? WHERE id=?").bind(Date.now(),user.id,Date.now(),classId),env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,created_at) VALUES (?,?,'class_submitted',?)").bind(classId,user.id,Date.now())]);
    return json({ok:true});
  }
  if (action === "tickets" && request.method === "GET") {
    const tickets=await env.DB.prepare("SELECT t.*,u.full_name created_by_name FROM class_tickets t JOIN users u ON u.id=t.created_by WHERE t.class_id=? ORDER BY t.created_at DESC").bind(classId).all(); return json({tickets:tickets.results});
  }
  if (action === "tickets" && request.method === "POST") {
    const body=await parseJson(request), description=String(body?.description||"").trim().slice(0,1000), category=String(body?.category||"other"); if(description.length<10)return json({error:"Descreva o pedido com pelo menos 10 caracteres."},400);
    await env.DB.prepare("INSERT INTO class_tickets (id,class_id,student_id,category,description,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),classId,typeof body?.studentId==="string"?body.studentId:null,category,description,user.id,Date.now(),Date.now()).run(); return json({ok:true},201);
  }
  return json({error:"Operação não suportada."},405);
}

async function handleOwnDestinations(request:Request,env:Env,user:CurrentUser):Promise<Response>{
  const body=await parseJson(request); const destinations=Array.isArray(body?.destinations)?body.destinations.map(Number):[]; if(new Set(destinations).size!==destinations.length||destinations.some((id)=>!Number.isInteger(id)||id<1||id>20))return json({error:"Lista de destinos inválida."},400);
  const number=studentNumberFromEmail(user.email); const student=await env.DB.prepare("SELECT s.id,s.class_id,s.preference,c.status FROM class_students s JOIN classes c ON c.id=s.class_id WHERE s.student_number=? AND s.removed_at IS NULL").bind(number).first<{id:string;class_id:number;preference:string;status:string}>();
  if(!student)return json({error:"O seu registo ainda não consta de uma turma."},404); if(student.status==="draft"||student.status==="reopened")return json({error:"O representante ainda não submeteu a turma."},409); if(destinations.includes(student.class_id))return json({error:"A turma atual não pode ser um destino."},400);
  const settings=await classSettings(env), now=Date.now(); if(now<Date.parse(settings.openAt)||now>Date.parse(settings.closeAt))return json({error:"O prazo de preferências não está aberto."},409);
  await env.DB.batch([env.DB.prepare("DELETE FROM student_destinations WHERE student_id=?").bind(student.id),env.DB.prepare("UPDATE class_students SET preference=?,updated_at=? WHERE id=?").bind(destinations.length?'move':'stay',now,student.id),...destinations.map((id,rank)=>env.DB.prepare("INSERT INTO student_destinations (student_id,destination_class,rank,updated_by,updated_at) VALUES (?,?,?,?,?)").bind(student.id,id,rank+1,user.id,now)),env.DB.prepare("INSERT INTO class_audit_log (class_id,student_id,actor_user_id,action,details,created_at) VALUES (?,?,?,'student_preference_updated',?,?)").bind(student.class_id,student.id,user.id,JSON.stringify({destinations}),now)]); return json({ok:true});
}

async function handleGlobalTickets(request:Request,env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 if(request.method==="GET"){const result=await env.DB.prepare(`SELECT t.*,s.full_name student_name,s.student_number,u.full_name created_by_name FROM class_tickets t LEFT JOIN class_students s ON s.id=t.student_id JOIN users u ON u.id=t.created_by ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,t.created_at DESC`).all();return json({tickets:result.results});}
 const body=await parseJson(request),id=String(body?.id||""),status=String(body?.status||""),response=String(body?.response||"").trim().slice(0,1000);
 if(!id||!["open","review","information_needed","accepted","rejected","completed"].includes(status))return json({error:"Estado do pedido inválido."},400);
 if(["accepted","rejected","completed"].includes(status)&&response.length<5)return json({error:"Registe uma resposta antes de concluir o pedido."},400);
 const now=Date.now();await env.DB.batch([env.DB.prepare("UPDATE class_tickets SET status=?,response=?,resolved_by=CASE WHEN ? IN ('accepted','rejected','completed') THEN ? ELSE resolved_by END,updated_at=? WHERE id=?").bind(status,response||null,status,user.actorId||user.id,now,id),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'class_ticket_updated',?,?)").bind(user.actorId||user.id,JSON.stringify({id,status}),now)]);return json({ok:true});
}

async function handleDistributionCheck(env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 const [classes,students,openTickets]=await Promise.all([env.DB.prepare("SELECT id,status FROM classes ORDER BY id").all<{id:number;status:string}>(),env.DB.prepare("SELECT id,class_id,student_number,preference FROM class_students WHERE removed_at IS NULL").all<{id:string;class_id:number;student_number:string;preference:string}>(),env.DB.prepare("SELECT id,class_id,category FROM class_tickets WHERE status IN ('open','review','information_needed')").all<{id:string;class_id:number;category:string}>()]);
 const issues:Array<{severity:"blocker"|"warning";code:string;message:string;classId?:number}>=[];
 for(const klass of classes.results)if(["draft","reopened"].includes(klass.status))issues.push({severity:"blocker",code:"CLASS_NOT_SUBMITTED",message:`A Turma ${klass.id} ainda não foi submetida.`,classId:klass.id});
 for(const student of students.results){if(!/^\d{9}$/.test(student.student_number))issues.push({severity:"blocker",code:"INVALID_NUMBER",message:`Número mecanográfico inválido na Turma ${student.class_id}.`,classId:student.class_id});if(student.preference==="move"){const count=await env.DB.prepare("SELECT COUNT(*) total FROM student_destinations WHERE student_id=?").bind(student.id).first<{total:number}>();if(!count?.total)issues.push({severity:"blocker",code:"MISSING_DESTINATION",message:`Há um aluno que pretende mudar sem destinos na Turma ${student.class_id}.`,classId:student.class_id});}}
 for(const ticket of openTickets.results)issues.push({severity:"blocker",code:"OPEN_TICKET",message:`A Turma ${ticket.class_id} tem um pedido pendente (${ticket.category}).`,classId:ticket.class_id});
 const counts=await env.DB.prepare("SELECT class_id,COUNT(*) total FROM class_students WHERE removed_at IS NULL GROUP BY class_id ORDER BY class_id").all<{class_id:number;total:number}>();const values=counts.results.map(r=>r.total);if(values.length===20&&Math.max(...values)-Math.min(...values)>3)issues.push({severity:"warning",code:"IMBALANCE",message:"A diferença atual entre a maior e a menor turma excede três alunos."});
 return json({ready:issues.every(i=>i.severity!=="blocker"),checkedAt:Date.now(),summary:{classes:20,students:students.results.length,blockers:issues.filter(i=>i.severity==="blocker").length,warnings:issues.filter(i=>i.severity==="warning").length},issues});
}

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (!validOrigin(request, env)) return json({ error: "Origem do pedido inválida." }, 403);
  if (request.method === "GET" && pathname === "/api/config") {
    try {
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, ...await maintenanceConfig(env) });
    } catch (error) {
      console.error("config_fallback", error instanceof Error ? error.message : "unknown");
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, maintenanceMode: env.MAINTENANCE_MODE === "true", maintenanceMessage: "A plataforma encontra-se temporariamente em manutenção." });
    }
  }
  await ensureOperationalSchema(env);
  if (request.method === "POST" && pathname === "/api/auth/register") return handleRegister(request, env);
  if (request.method === "POST" && pathname === "/api/auth/verify") return handleVerify(request, env);
  if (request.method === "POST" && pathname === "/api/auth/login") return handleLogin(request, env);
  if (request.method === "POST" && pathname === "/api/auth/logout") return handleLogout(request, env);
  if (request.method === "POST" && pathname === "/api/auth/session-preference") return handleSessionPreference(request, env);
  if (request.method === "PATCH" && pathname === "/api/auth/accessibility") return handleAccessibilityPreference(request, env);
  if (request.method === "PUT" && pathname === "/api/admin/preview-user") return handlePreviewUser(request,env);
  if (request.method === "GET" && pathname === "/api/auth/me") {
    const user = await currentUser(request, env);
    return user ? json({ user }) : json({ user: null }, 401);
  }
  if (pathname === "/api/student/destinations" && request.method === "PUT") {
    const user = await currentUser(request, env); return user ? handleOwnDestinations(request, env, user) : json({ error:"Sessão inválida." },401);
  }
  if (pathname === "/api/classes" || pathname.startsWith("/api/classes/")) {
    const user = await currentUser(request, env); return user ? handleClasses(request, env, user, pathname) : json({ error:"Sessão inválida." },401);
  }
  if(pathname==="/api/admin/class-tickets"&&["GET","PATCH"].includes(request.method)){const user=await currentUser(request,env);return user?handleGlobalTickets(request,env,user):json({error:"Sessão inválida."},401);}
  if(pathname==="/api/admin/distribution-check"&&request.method==="GET"){const user=await currentUser(request,env);return user?handleDistributionCheck(env,user):json({error:"Sessão inválida."},401);}
  if (pathname === "/api/admin/users" && ["GET", "PATCH"].includes(request.method)) {
    const admin = await requireAdmin(request, env);
    return admin ? handleAdminUsers(request, env, admin) : json({ error: "Acesso reservado a administradores." }, 403);
  }
  if (pathname === "/api/admin/settings" && ["GET", "PUT"].includes(request.method)) {
    const admin = await requireAdmin(request, env);
    return admin ? handleAdminSettings(request, env, admin) : json({ error: "Acesso reservado a administradores." }, 403);
  }
  return json({ error: "Endpoint não encontrado." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return withSecurity(await routeApi(request, env, url));
      return withSecurity(await env.ASSETS.fetch(request));
    } catch (error) {
      const reference = crypto.randomUUID().slice(0, 8);
      console.error("request_failed", reference, url.pathname, error instanceof Error ? error.stack || error.message : "unknown");
      return withSecurity(json({ error: `Ocorreu um erro inesperado. Referência: ${reference}` }, 500));
    }
  },
} satisfies ExportedHandler<Env>;
