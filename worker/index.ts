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
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  const pending = await env.DB.prepare("SELECT last_sent_at FROM pending_registrations WHERE email = ?").bind(email).first<{ last_sent_at: number }>();
  if (pending && now - pending.last_sent_at < 60_000) return json({ error: "Aguarde um minuto antes de pedir outro código." }, 429);
  if (existing) {
    await audit(env, request, "registration_existing", false, email);
    return json({ error: "Já existe uma conta associada a este email. Inicie sessão.", code: "ACCOUNT_EXISTS" }, 409);
  }

  const salt = bytesToBase64(randomBytes(16));
  const hash = await derivePassword(password as string, salt, env.AUTH_PEPPER, PASSWORD_ITERATIONS);
  const code = makeCode();
  await env.DB.prepare("INSERT INTO pending_registrations (email, full_name, password_hash, password_salt, password_iterations, code_hash, code_expires_at, code_attempts, last_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, password_salt=excluded.password_salt, password_iterations=excluded.password_iterations, code_hash=excluded.code_hash, code_expires_at=excluded.code_expires_at, code_attempts=0, last_sent_at=excluded.last_sent_at")
    .bind(email, fullName, hash, salt, PASSWORD_ITERATIONS, await codeHash(env, email, code), now + CODE_SECONDS * 1000, now, now)
    .run();
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
  const userId = crypto.randomUUID();
  const role = email === env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() ? "admin" : "student";
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, email, full_name, password_hash, password_salt, password_iterations, role, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(userId, email, pending.full_name, pending.password_hash, pending.password_salt, pending.password_iterations, role, now, now, now, now),
      env.DB.prepare("DELETE FROM pending_registrations WHERE email = ?").bind(email),
    ]);
  } catch {
    return json({ error: "Não foi possível concluir o registo. A conta poderá já existir." }, 409);
  }
  await audit(env, request, "registration_complete", true, email, userId);
  return createSessionResponse(env, request, { id: userId, email, full_name: pending.full_name, role }, body?.rememberMe === true);
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
  if (!user || accessBlocked || (user.locked_until && user.locked_until > now)) {
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

async function currentUser(request: Request, env: Env): Promise<{ id: string; email: string; fullName: string; role: string } | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT users.id, users.email, users.full_name, users.role, users.status, users.status_until, sessions.id AS session_id, sessions.last_seen_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?")
    .bind(await sha256(`${token}:${env.AUTH_PEPPER}`), Date.now()).first<{ id: string; email: string; full_name: string; role: string; status: string; status_until: number | null; session_id: string; last_seen_at: number }>();
  if (!row) return null;
  if (row.status !== "active" && !(row.status === "suspended" && row.status_until && row.status_until <= Date.now())) return null;
  if (row.status === "suspended" && row.status_until && row.status_until <= Date.now()) await env.DB.prepare("UPDATE users SET status = 'active', status_reason = NULL, status_until = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  if (Date.now() - row.last_seen_at > 15 * 60_000) env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(Date.now(), row.session_id).run().catch(() => undefined);
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
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
    const users = await env.DB.prepare("SELECT id, email, full_name, role, status, status_reason, status_until, email_verified_at, last_login_at, created_at, updated_at FROM users ORDER BY created_at DESC").all();
    return json({ users: users.results });
  }
  const body = await parseJson(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const fullName = normalizeFullName(body?.fullName);
  const role = body?.role;
  const status = body?.status;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const statusUntil = typeof body?.statusUntil === "number" && Number.isFinite(body.statusUntil) ? body.statusUntil : null;
  if (!id || validateFullName(fullName) || !["student", "representative", "admin"].includes(String(role)) || !["active", "pending", "suspended", "banned"].includes(String(status))) return json({ error: "Dados do utilizador inválidos." }, 400);
  if (id === admin.id && (role !== "admin" || status !== "active")) return json({ error: "Não pode retirar o seu próprio acesso administrativo." }, 400);
  const target = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(id).first<{ id: string; email: string }>();
  if (!target) return json({ error: "Utilizador não encontrado." }, 404);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET full_name = ?, role = ?, status = ?, status_reason = ?, status_until = ?, updated_at = ? WHERE id = ?").bind(fullName, role, status, reason || null, status === "suspended" ? statusUntil : null, Date.now(), id),
    env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id, target_user_id, action, details, created_at) VALUES (?, ?, 'user_updated', ?, ?)").bind(admin.id, id, JSON.stringify({ role, status, reason: reason || null, statusUntil }), Date.now()),
  ]);
  if (status !== "active") await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleAdminSettings(request: Request, env: Env, admin: { id: string }): Promise<Response> {
  if (request.method === "GET") return json(await maintenanceConfig(env));
  const body = await parseJson(request);
  const enabled = body?.maintenanceMode === true;
  const message = typeof body?.maintenanceMessage === "string" ? body.maintenanceMessage.trim().slice(0, 500) : "";
  if (!message) return json({ error: "Indique uma mensagem de manutenção." }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance_mode', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(String(enabled), now, admin.id),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance_message', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(message, now, admin.id),
    env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id, action, details, created_at) VALUES (?, 'settings_updated', ?, ?)").bind(admin.id, JSON.stringify({ maintenanceMode: enabled }), now),
  ]);
  return json({ ok: true, maintenanceMode: enabled, maintenanceMessage: message });
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

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (!validOrigin(request, env)) return json({ error: "Origem do pedido inválida." }, 403);
  if (request.method === "GET" && pathname === "/api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, ...await maintenanceConfig(env) });
  if (request.method === "POST" && pathname === "/api/auth/register") return handleRegister(request, env);
  if (request.method === "POST" && pathname === "/api/auth/verify") return handleVerify(request, env);
  if (request.method === "POST" && pathname === "/api/auth/login") return handleLogin(request, env);
  if (request.method === "POST" && pathname === "/api/auth/logout") return handleLogout(request, env);
  if (request.method === "POST" && pathname === "/api/auth/session-preference") return handleSessionPreference(request, env);
  if (request.method === "GET" && pathname === "/api/auth/me") {
    const user = await currentUser(request, env);
    return user ? json({ user: { email: user.email, fullName: user.fullName, role: user.role } }) : json({ user: null }, 401);
  }
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
