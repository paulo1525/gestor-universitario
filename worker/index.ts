/// <reference types="@cloudflare/workers-types" />

import { calculateDistribution } from "@/lib/distribution-engine.mjs";
import { buildPublicClassesPdf } from "@/lib/public-classes-pdf.mjs";
import { APP_MODULE_KEYS, APP_MODULES, moduleEffectiveEnabled } from "@/lib/app-modules";
import { announcementDisplayHtml, announcementPlainText, sanitizeAnnouncementHtml } from "@/lib/announcement-content";
import { handleAcademicHubRoute, isAcademicHubPath } from "./academic-hub";

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
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.replace(/@edu\.med\.up\.pt$/i, "@up.pt");
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
  if (env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA") return token === "local-test";
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
  const existing = await env.DB.prepare("SELECT id, status, email_verified_at FROM users WHERE lower(replace(email,'@edu.med.up.pt','@up.pt')) = ?").bind(email).first<{ id: string; status: string; email_verified_at: number }>();
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- referência histórica de migração
async function ensureOperationalSchemaLegacy(env: Env): Promise<void> {
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

async function sendPasswordResetEmail(env:Env,email:string,code:string):Promise<void>{
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,"content-type":"application/json","idempotency-key":`password-reset-${crypto.randomUUID()}`,"user-agent":"GestorUniversitario/1.0"},body:JSON.stringify({to:[email],from:env.EMAIL_FROM,subject:`${code} — repor palavra-passe no Gestor Universitário`,text:`O seu código de reposição é ${code}. Expira em 10 minutos e só pode ser usado uma vez. Se não pediu esta alteração, ignore esta mensagem.`,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#161616"><h1 style="font-size:22px">Repor palavra-passe</h1><p>Introduza este código no Gestor Universitário:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px">${code}</p><p>Expira em 10 minutos e só pode ser usado uma vez.</p><p style="color:#666;font-size:13px">Se não pediu esta alteração, ignore esta mensagem.</p></div>`,tags:[{name:"type",value:"password_reset"}]})});
 if(!response.ok)throw new Error("O fornecedor de email rejeitou o envio.");
}

async function handlePasswordResetRequest(request:Request,env:Env):Promise<Response>{
 const body=await parseJson(request),email=normalizeEmail(body?.email),neutral={ok:true,message:"Se existir uma conta ativa com esse email, receberá um código de reposição."};
 if(!EMAIL_PATTERN.test(email))return json(neutral);
 if(!await rateLimit(env,"password-reset",email))return json({error:"Demasiados pedidos. Aguarde antes de tentar novamente."},429);
 if(!await verifyTurnstile(env,request,body?.turnstileToken))return json({error:"Não foi possível validar a proteção antiabuso."},400);
 const user=await env.DB.prepare("SELECT id,email FROM users WHERE lower(replace(email,'@edu.med.up.pt','@up.pt'))=? AND status='active' AND email_verified_at>0").bind(email).first<{id:string;email:string}>();
 if(!user)return json(neutral);
 const code=makeCode(),now=Date.now();await env.DB.prepare("INSERT INTO password_resets (email,user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET user_id=excluded.user_id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,created_at=excluded.created_at").bind(email,user.id,await codeHash(env,email,code),now+CODE_SECONDS*1000,now).run();
 try{await sendPasswordResetEmail(env,user.email,code)}catch(error){console.error("password_reset_email_failed",error);await env.DB.prepare("DELETE FROM password_resets WHERE email=?").bind(email).run();}
 return json(neutral);
}

async function handlePasswordResetConfirm(request:Request,env:Env):Promise<Response>{
 const body=await parseJson(request),email=normalizeEmail(body?.email),code=String(body?.code||"").replace(/\D/g,""),password=typeof body?.password==="string"?body.password:"",passwordError=validatePassword(password,email);
 if(!EMAIL_PATTERN.test(email)||!/^\d{6}$/.test(code)||passwordError)return json({error:passwordError||"Dados de reposição inválidos."},400);
 const reset=await env.DB.prepare("SELECT user_id,code_hash,expires_at,attempts FROM password_resets WHERE email=?").bind(email).first<{user_id:string;code_hash:string;expires_at:number;attempts:number}>();
 if(!reset||reset.expires_at<Date.now()||reset.attempts>=6||!constantTimeEqual(reset.code_hash,await codeHash(env,email,code))){if(reset)await env.DB.prepare("UPDATE password_resets SET attempts=attempts+1 WHERE email=?").bind(email).run();return json({error:"Código inválido ou expirado."},400);}
 const salt=bytesToBase64(randomBytes(16)),hash=await derivePassword(password,salt,env.AUTH_PEPPER,PASSWORD_ITERATIONS),now=Date.now();
 await env.DB.batch([env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,password_changed_at=?,failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?").bind(hash,salt,PASSWORD_ITERATIONS,now,now,reset.user_id),env.DB.prepare("DELETE FROM password_resets WHERE email=?").bind(email),env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(reset.user_id),env.DB.prepare("INSERT INTO auth_audit_log (user_id,event,success,created_at) VALUES (?,'password_reset',1,?)").bind(reset.user_id,now)]);
 return json({ok:true});
}

type QueryMetrics = { count: number; startedAt: number; statements: string[] };

function instrumentDatabase(database: D1Database, metrics: QueryMetrics): D1Database {
  const wrapStatement = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => new Proxy(statement, {
    get(target, property, receiver) {
      if (["run", "all", "first", "raw"].includes(String(property))) {
        return (...args: unknown[]) => {
          metrics.count += 1;
          metrics.statements.push(sql.replace(/\s+/g, " ").trim().slice(0, 180));
          return (Reflect.get(target, property, receiver) as (...values: unknown[]) => unknown).apply(target, args);
        };
      }
      if (property === "bind") return (...args: unknown[]) => wrapStatement(target.bind(...args), sql);
      return Reflect.get(target, property, receiver);
    },
  }) as D1PreparedStatement;
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "prepare") return (sql: string) => wrapStatement(target.prepare(sql), sql);
      if (property === "batch") return (statements: D1PreparedStatement[]) => {
        // As instruções do batch são contabilizadas quando são preparadas para execução.
        metrics.count += statements.length;
        metrics.statements.push(`BATCH (${statements.length} instruções)`);
        return target.batch(statements);
      };
      if (property === "exec") return (sql: string) => {
        const count = sql.split(";").filter((part) => part.trim()).length;
        metrics.count += count;
        metrics.statements.push(`EXEC (${count} instruções)`);
        return target.exec(sql);
      };
      return Reflect.get(target, property, receiver);
    },
  }) as D1Database;
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
  const user = await env.DB.prepare("SELECT * FROM users WHERE lower(replace(email,'@edu.med.up.pt','@up.pt')) = ?").bind(email).first<UserRow>();
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

type CurrentUser = { id: string; email: string; fullName: string; role: string; fontScale: string; classRepresentative: boolean; representedClass: number | null; commissionDepartment: string | null; commissionPosition: string | null; commissionPositionLabel: string | null; preview?:boolean; actorId?:string };
async function currentUser(request: Request, env: Env): Promise<CurrentUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT users.id, users.email, users.full_name, users.role, users.font_scale, users.class_representative, users.represented_class, users.commission_department, users.commission_position, commission_positions.label AS commission_position_label, users.status, users.status_until, sessions.id AS session_id, sessions.last_seen_at FROM sessions JOIN users ON users.id = sessions.user_id LEFT JOIN commission_positions ON commission_positions.code = users.commission_position WHERE sessions.token_hash = ? AND sessions.expires_at > ?")
    .bind(await sha256(`${token}:${env.AUTH_PEPPER}`), Date.now()).first<{ id: string; email: string; full_name: string; role: string; font_scale: string; class_representative: number; represented_class: number | null; commission_department: string | null; commission_position: string | null; commission_position_label: string | null; status: string; status_until: number | null; session_id: string; last_seen_at: number }>();
  if (!row) return null;
  if (row.status !== "active" && !(row.status === "suspended" && row.status_until && row.status_until <= Date.now())) return null;
  if (row.status === "suspended" && row.status_until && row.status_until <= Date.now()) await env.DB.prepare("UPDATE users SET status = 'active', status_reason = NULL, status_until = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  if (Date.now() - row.last_seen_at > 15 * 60_000) env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(Date.now(), row.session_id).run().catch(() => undefined);
  const base={ id: row.id, email: row.email, fullName: row.full_name, role: row.role, fontScale: row.font_scale, classRepresentative: row.class_representative === 1, representedClass: row.represented_class, commissionDepartment: row.commission_department, commissionPosition: row.commission_position, commissionPositionLabel: row.commission_position_label };
  const previewId=cookieValue(request,"gu_preview_user");
  if(row.email.toLowerCase()===PERMANENT_ADMIN_EMAIL&&previewId){
    const target=await env.DB.prepare("SELECT users.id,users.email,users.full_name,users.role,users.font_scale,users.class_representative,users.represented_class,users.commission_department,users.commission_position,commission_positions.label AS commission_position_label FROM users LEFT JOIN commission_positions ON commission_positions.code=users.commission_position WHERE users.id=? AND users.status='active'").bind(previewId).first<{id:string;email:string;full_name:string;role:string;font_scale:string;class_representative:number;represented_class:number|null;commission_department:string|null;commission_position:string|null;commission_position_label:string|null}>();
    if(target)return {id:target.id,email:target.email,fullName:target.full_name,role:target.role,fontScale:target.font_scale,classRepresentative:target.class_representative===1,representedClass:target.represented_class,commissionDepartment:target.commission_department,commissionPosition:target.commission_position,commissionPositionLabel:target.commission_position_label,preview:true,actorId:row.id};
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

async function moduleStates(env: Env): Promise<Record<string, boolean>> {
  const result = await env.DB.prepare("SELECT module_key,enabled FROM app_module_settings").all<{ module_key: string; enabled: number }>();
  const stored = Object.fromEntries(result.results.map((row) => [row.module_key, row.enabled === 1]));
  return Object.fromEntries(APP_MODULES.map((module) => [module.key, stored[module.key] ?? module.defaultEnabled]));
}

async function isModuleEnabled(env: Env, key: string): Promise<boolean> {
  return moduleEffectiveEnabled(key, await moduleStates(env));
}

function moduleSnapshot(states: Record<string, boolean>) {
  return APP_MODULES.filter((module) => module.parentKey === null).map((module) => ({
    key: module.key,
    label: module.label,
    description: module.description,
    enabled: states[module.key] !== false,
    effectiveEnabled: moduleEffectiveEnabled(module.key, states),
    submodules: APP_MODULES.filter((candidate) => candidate.parentKey === module.key).map((submodule) => ({
      key: submodule.key,
      label: submodule.label,
      description: submodule.description,
      enabled: states[submodule.key] !== false,
      effectiveEnabled: moduleEffectiveEnabled(submodule.key, states),
      inheritedDisabled: states[module.key] === false,
    })),
  }));
}

async function handleAdminModules(request: Request, env: Env, user: CurrentUser): Promise<Response> {
  if (normalizeEmail(user.email) !== PERMANENT_ADMIN_EMAIL) return json({ error: "A gestão de módulos está reservada ao administrador principal." }, 403);
  if (request.method === "GET") return json({ modules: moduleSnapshot(await moduleStates(env)) });
  const body = await parseJson(request);
  const moduleKey = String(body?.moduleKey || "");
  const submoduleKey = String(body?.submoduleKey || "");
  const targetKey = submoduleKey || moduleKey;
  const enabled = body?.enabled;
  const target = APP_MODULES.find((module) => module.key === targetKey);
  if (!APP_MODULE_KEYS.has(targetKey) || !target || typeof enabled !== "boolean") return json({ error: "Módulo ou estado inválido." }, 400);
  if (submoduleKey && target.parentKey !== moduleKey) return json({ error: "O submódulo não pertence ao módulo indicado." }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_module_settings (module_key,enabled,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(module_key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(targetKey, enabled ? 1 : 0, user.actorId || user.id, now),
    env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'app_module_updated',?,?)").bind(user.actorId || user.id, JSON.stringify({ moduleKey: targetKey, enabled }), now),
  ]);
  return json({ ok: true, modules: moduleSnapshot(await moduleStates(env)) });
}

function moduleDisabled(): Response {
  return json({ error: "Este módulo está temporariamente desativado.", code: "MODULE_DISABLED" }, 404);
}

function isManagementCore(user: CurrentUser): boolean {
  return normalizeEmail(user.email) === PERMANENT_ADMIN_EMAIL || user.commissionDepartment === "management";
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
  const section = typeof body?.section === "string" ? body.section : "";
  if (!['maintenance', 'preference_windows'].includes(section)) return json({ error: "Indique a configuração que pretende guardar." }, 400);
  const now = Date.now();
  if (section === 'maintenance') {
    const enabled = body?.maintenanceMode === true;
    const message = typeof body?.maintenanceMessage === "string" ? body.maintenanceMessage.trim().slice(0, 500) : "";
    if (!message) return json({ error: "Indique uma mensagem de manutenção." }, 400);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance_mode', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(String(enabled), now, admin.id),
      env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance_message', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(message, now, admin.id),
      env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id, action, details, created_at) VALUES (?, 'settings_updated', ?, ?)").bind(admin.id, JSON.stringify({ section, maintenanceMode: enabled }), now),
    ]);
    return json({ ok: true, maintenanceMode: enabled, maintenanceMessage: message });
  }
  const windows=Array.isArray(body?.windows)?body.windows:[];
  if(windows.length!==4)return json({error:"Configure as quatro janelas de turmas."},400);
  const normalized=windows.map((window,index)=>({group:index+1,openAt:String(window?.openAt||""),closeAt:String(window?.closeAt||"")}));
  if(normalized.some(window=>!Number.isFinite(Date.parse(window.openAt))||!Number.isFinite(Date.parse(window.closeAt))||Date.parse(window.openAt)>=Date.parse(window.closeAt)))return json({error:"Cada bloco deve ter uma abertura anterior ao encerramento."},400);
  const writes=normalized.flatMap(window=>[
    env.DB.prepare("INSERT INTO app_settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(`preferences_group_${window.group}_open_at`,window.openAt,now,admin.id),
    env.DB.prepare("INSERT INTO app_settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(`preferences_group_${window.group}_close_at`,window.closeAt,now,admin.id),
  ]);
  writes.push(env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'preference_windows_updated',?,?)").bind(admin.id,JSON.stringify({windows:normalized}),now));
  await env.DB.batch(writes);return json({ok:true,preferenceWindows:normalized});
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
function canEditClass(user: CurrentUser, classId: number): boolean { void classId; return canManageAll(user); }

async function classSettings(env: Env) {
  const result = await env.DB.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'preferences_group_%' OR key IN ('classes_open_at','classes_close_at','preferences_open_at','preferences_close_at')").all<{ key: string; value: string }>();
  const values = Object.fromEntries(result.results.map((row) => [row.key, row.value]));
  const preferenceWindows=Array.from({length:4},(_,index)=>{const group=index+1;return {group,classes:`${index*5+1}–${index*5+5}`,openAt:values[`preferences_group_${group}_open_at`]||values.preferences_open_at||values.classes_close_at,closeAt:values[`preferences_group_${group}_close_at`]||values.preferences_close_at||values.classes_close_at}});
  return { openAt: values.classes_open_at, closeAt: values.classes_close_at,preferencesOpenAt:values.preferences_open_at||values.classes_close_at,preferencesCloseAt:values.preferences_close_at||values.classes_close_at,preferenceWindows };
}

type DraftStudent = { id: string; fullName: string; studentNumber: string; preference: "stay" | "move" };

function normalizeDraftStudents(input: unknown): { students?: DraftStudent[]; error?: string } {
  if (!Array.isArray(input)) return { error: "O rascunho não tem um formato válido." };
  const students = input.map((value: unknown) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { id: typeof row.id === "string" ? row.id : crypto.randomUUID(), fullName: normalizeFullName(row.fullName), studentNumber: String(row.studentNumber || "").trim(), preference: row.preference === "move" ? "move" as const : "stay" as const };
  }).filter((student) => student.fullName || student.studentNumber);
  if (new Set(students.map((student) => student.studentNumber)).size !== students.length) return { error: "O mesmo estudante não pode aparecer duas vezes na turma." };
  if (students.some((student) => validateFullName(student.fullName) || !/^\d{9}$/.test(student.studentNumber))) return { error: "Preencha o nome completo e um número mecanográfico com 9 algarismos em cada bloco." };
  return { students };
}

async function conflictingStudent(env: Env, classId: number, numbers: string[]): Promise<{student_number:string;class_id:number}|null> {
  if (!numbers.length) return null;
  const placeholders = numbers.map(() => "?").join(",");
  return env.DB.prepare(`SELECT student_number,class_id FROM class_students WHERE removed_at IS NULL AND class_id<>? AND student_number IN (${placeholders}) LIMIT 1`).bind(classId, ...numbers).first<{student_number:string;class_id:number}>();
}

async function handleClassesV2(request: Request, env: Env, user: CurrentUser, pathname: string): Promise<Response> {
  const readOnlyStudent = !canManageAll(user) && !user.preview;
  const canReadBaseClasses = request.method === "GET" && (pathname === "/api/classes" || /^\/api\/classes\/\d+$/.test(pathname));
  if (readOnlyStudent && !canReadBaseClasses) return json({ error: "O acesso de escrita às turmas está reservado aos representantes e à gestão." }, 403);
  const settings = await classSettings(env);
  if (pathname === "/api/classes" && request.method === "GET") {
    const result = await env.DB.prepare(`SELECT c.id,c.status,c.submitted_at,u.full_name representative,
      COUNT(s.id) students,COALESCE(SUM(s.student_decision='stay'),0) stays,COALESCE(SUM(s.student_decision='move'),0) moves
      FROM classes c LEFT JOIN users u ON u.class_representative=1 AND u.represented_class=c.id AND u.status='active'
      LEFT JOIN class_students s ON s.class_id=c.id AND s.removed_at IS NULL GROUP BY c.id ORDER BY c.id`).all();
    const classes = readOnlyStudent
      ? result.results.map((row) => ({ id: row.id, status: row.status, submitted_at: row.submitted_at, representative: row.representative, students: row.students }))
      : result.results;
    return json({ classes, settings, serverNow: Date.now() });
  }
  const match = pathname.match(/^\/api\/classes\/(\d+)(?:\/(save|draft|submit|reopen|tickets|import))?$/);
  if (!match) return json({ error: "Turma não encontrada." }, 404);
  const classId = Number(match[1]), action = match[2] || "detail";
  if (classId < 1 || classId > 20) return json({ error: "Turma inválida." }, 400);
  if(action==="tickets")return json({error:"A funcionalidade de tickets está temporariamente desativada."},404);
  const klass = await env.DB.prepare("SELECT id,status,submitted_at,workflow_step,draft_revision FROM classes WHERE id=?").bind(classId).first<{id:number;status:string;submitted_at:number|null;workflow_step:number;draft_revision:number}>();
  if (!klass) return json({ error: "Turma não encontrada." }, 404);
  const isDraft = ["draft", "reopened"].includes(klass.status);
  if(!canManageAll(user)&&((request.method==="PUT"&&action==="draft")||(request.method==="POST"&&action==="submit")))return json({error:"A composição das turmas é gerida exclusivamente pelo Núcleo da CC."},403);

  if (request.method === "GET" && action === "detail") {
    if (!readOnlyStudent && !canManageAll(user) && !canEditClass(user, classId) && Date.now() < Date.parse(settings.closeAt)) return json({ error: "A formação inicial das turmas encontra-se em curso." }, 403);
    const savedDraft = isDraft ? await env.DB.prepare("SELECT payload FROM class_drafts WHERE class_id=? AND revision=?").bind(classId, klass.draft_revision).first<{payload:string}>() : null;
    const ownNumber = studentNumberFromEmail(user.email),preferenceWindow=settings.preferenceWindows[Math.ceil(classId/5)-1],preferencesClosed=klass.status==="published"||Boolean(preferenceWindow&&Date.now()>=Date.parse(preferenceWindow.closeAt));
    let output: Array<{id:string;nome:string;numero:string;preferencia:string;locked:boolean;isSelf:boolean;destinations:number[];notes?:string}>;
    if (savedDraft) {
      output = (JSON.parse(savedDraft.payload) as DraftStudent[]).map((student) => ({ id:student.id,nome:student.fullName,numero:student.studentNumber,preferencia:"A aguardar decisão",locked:false,isSelf:student.studentNumber===ownNumber,destinations:[] }));
    } else {
      const students = await env.DB.prepare(`SELECT s.id,s.full_name,s.student_number,s.preference,s.student_decision,s.notes,COALESCE(GROUP_CONCAT(d.destination_class || ':' || d.rank, ','),'') destinations FROM class_students s LEFT JOIN student_destinations d ON d.student_id=s.id WHERE s.class_id=? AND s.removed_at IS NULL GROUP BY s.id ORDER BY s.full_name`).bind(classId).all<{id:string;full_name:string;student_number:string;preference:string;student_decision:string|null;notes:string|null;destinations:string}>();
      output = students.results.map((student) => ({ id:student.id,nome:student.full_name,numero:student.student_number,preferencia:readOnlyStudent ? "A aguardar decisão" : student.student_decision === "move" ? "Mudar" : student.student_decision === "stay" ? "Ficar" : preferencesClosed ? "Mantém turma base" : "A aguardar decisão",locked:!isDraft,isSelf:student.student_number===ownNumber,destinations:readOnlyStudent ? [] : String(student.destinations).split(",").filter(Boolean).sort((a,b)=>Number(a.split(":")[1])-Number(b.split(":")[1])).map((value)=>Number(value.split(":")[0])),notes:!readOnlyStudent&&(student.student_number===ownNumber||canManageAll(user))?student.notes||"":undefined }));
    }
    const activeClasses=(await env.DB.prepare("SELECT id FROM classes ORDER BY id").all<{id:number}>()).results.map(row=>row.id);
    return json({ class:{id:classId,status:klass.status,submittedAt:klass.submitted_at,workflowStep:klass.workflow_step,draftRevision:klass.draft_revision},students:output,activeClasses,settings,serverNow:Date.now(),permissions:{edit:canManageAll(user),manage:canManageAll(user),representative:false} });
  }

  if(request.method==="PUT"&&action==="save"){
   if(!canManageAll(user))return json({error:"A composição das turmas é gerida exclusivamente pela Comissão de Curso."},403);
   const activeDistribution=await env.DB.prepare("SELECT id,status,result_snapshot FROM distribution_proposals WHERE invalidated_at IS NULL AND status IN ('applied','published') ORDER BY created_at DESC LIMIT 1").first<{id:string;status:string;result_snapshot:string}>();
   if(activeDistribution&&!(klass.status==="published"&&activeDistribution.status==="published"))return json({error:"Existe uma distribuição aplicada. Calcula uma nova proposta antes de alterar a composição base das turmas."},409);
   const body=await parseJson(request),normalized=normalizeDraftStudents(body?.students),reason=String(body?.reason||"").trim().slice(0,500);
   if(normalized.error||!normalized.students?.length)return json({error:normalized.error||"Adicione pelo menos um estudante e preencha todos os campos."},400);
   if(klass.status==="published"&&reason.length<10)return json({error:"Indique o motivo da correção da pauta publicada (mínimo de 10 caracteres)."},400);
   let publishedResults:Array<Record<string,unknown>&{studentId:string;destinationClass:number}>|null=null;if(klass.status==="published"&&activeDistribution){try{const parsed=JSON.parse(activeDistribution.result_snapshot);if(!Array.isArray(parsed))throw new Error();publishedResults=parsed}catch{return json({error:"A pauta publicada tem um snapshot inválido e não pode ser corrigida em segurança."},409)}}
   const conflict=await conflictingStudent(env,classId,normalized.students.map(student=>student.studentNumber));
   if(conflict)return json({error:`O estudante ${conflict.student_number} já está associado à Turma ${conflict.class_id}.`},409);
   const [before,knownStudents]=await Promise.all([env.DB.prepare("SELECT id,full_name,student_number FROM class_students WHERE class_id=? AND removed_at IS NULL ORDER BY student_number").bind(classId).all<{id:string;full_name:string;student_number:string}>(),env.DB.prepare("SELECT id,student_number FROM class_students WHERE student_number IN ("+normalized.students.map(()=>"?").join(",")+")").bind(...normalized.students.map(student=>student.studentNumber)).all<{id:string;student_number:string}>()]),canonicalStudents=normalized.students.map(student=>({...student,id:knownStudents.results.find(previous=>previous.student_number===student.studentNumber)?.id||student.id})),now=Date.now(),actorId=user.actorId||user.id,publishedCorrection=klass.status==="published";
   let correctedSnapshot:string|null=null;if(publishedCorrection&&activeDistribution&&publishedResults){const previousIds=new Set(before.results.map(student=>student.id)),nextIds=new Set(canonicalStudents.map(student=>student.id));publishedResults=publishedResults.filter(result=>!previousIds.has(result.studentId)||nextIds.has(result.studentId));for(const student of canonicalStudents){const result=publishedResults.find(item=>item.studentId===student.id);if(result){result.destinationClass=classId}else publishedResults.push({studentId:student.id,originClass:classId,destinationClass:classId,rank:null,status:"stayed_by_choice",points:0,pointBreakdown:{integration:0,exception:0},randomized:false,manualReview:false,manualOverride:true})}if(new Set(publishedResults.map(result=>result.studentId)).size!==publishedResults.length)return json({error:"A pauta publicada contém estudantes duplicados e não pode ser corrigida em segurança."},409);correctedSnapshot=JSON.stringify(publishedResults)}
   const writes=[];if(publishedCorrection&&activeDistribution&&correctedSnapshot)writes.push(env.DB.prepare("UPDATE distribution_proposals SET result_snapshot=? WHERE id=? AND status='published' AND result_snapshot=?").bind(correctedSnapshot,activeDistribution.id,activeDistribution.result_snapshot));else writes.push(env.DB.prepare("UPDATE distribution_proposals SET invalidated_at=? WHERE invalidated_at IS NULL AND status IN ('draft','approved')").bind(now));
   const correctionGuard=publishedCorrection&&activeDistribution&&correctedSnapshot?" AND EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='published' AND result_snapshot=?)":" AND NOT EXISTS (SELECT 1 FROM distribution_proposals WHERE invalidated_at IS NULL AND status IN ('applied','published'))",correctionBindings=publishedCorrection&&activeDistribution&&correctedSnapshot?[activeDistribution.id,correctedSnapshot]:[];
   writes.push(env.DB.prepare("UPDATE class_students SET removed_at=?,updated_at=? WHERE class_id=? AND removed_at IS NULL AND student_number NOT IN ("+canonicalStudents.map(()=>"?").join(",")+")"+correctionGuard).bind(now,now,classId,...canonicalStudents.map(student=>student.studentNumber),...correctionBindings));
   for(const student of canonicalStudents)writes.push(env.DB.prepare(`INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at,removed_at) SELECT ?,?,?,?,?,?,?,?,?,NULL WHERE ${publishedCorrection?"EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='published' AND result_snapshot=?)":"NOT EXISTS (SELECT 1 FROM distribution_proposals WHERE invalidated_at IS NULL AND status IN ('applied','published'))"} ON CONFLICT(student_number) DO UPDATE SET class_id=excluded.class_id,full_name=excluded.full_name,updated_at=excluded.updated_at,removed_at=NULL`).bind(student.id,classId,student.fullName,student.studentNumber,student.preference,now,actorId,now,now,...correctionBindings));
   const classTransitionIndex=writes.length;writes.push(env.DB.prepare("UPDATE classes SET status=CASE WHEN status='published' THEN 'published' ELSE 'submitted' END,workflow_step=1,submitted_at=?,submitted_by=?,updated_at=? WHERE id=?"+correctionGuard).bind(now,actorId,now,classId,...correctionBindings));
   const classAudit=JSON.stringify({reason:reason||null,before:before.results,after:canonicalStudents.map(student=>({id:student.id,fullName:student.fullName,studentNumber:student.studentNumber})),students:canonicalStudents.length});if(publishedCorrection)writes.push(env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) SELECT ?,?,'published_roster_corrected',?,? WHERE EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='published' AND result_snapshot=?)").bind(classId,actorId,classAudit,now,...correctionBindings),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) SELECT ?,'published_roster_corrected',?,? WHERE EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='published' AND result_snapshot=?)").bind(actorId,JSON.stringify({classId,reason,before:before.results,after:canonicalStudents}),now,...correctionBindings));else writes.push(env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) SELECT ?,?,'class_roster_saved',?,? WHERE NOT EXISTS (SELECT 1 FROM distribution_proposals WHERE invalidated_at IS NULL AND status IN ('applied','published'))").bind(classId,actorId,classAudit,now));
   const batch=await env.DB.batch(writes);if(publishedCorrection&&!batch[0]?.meta.changes)return json({error:"A pauta foi alterada por outro administrador. Atualize os dados e tente novamente."},409);if(!publishedCorrection&&!batch[classTransitionIndex]?.meta.changes)return json({error:"Foi aplicada uma distribuição enquanto editavas a turma. Atualiza os dados e tenta novamente."},409);
    return json({ok:true});
  }

  if(request.method==="POST"&&action==="import"){
   if(!canManageAll(user))return json({error:"A importação CSV está reservada ao Núcleo da CC."},403);
   if(klass.status==="published")return json({error:"Não é possível importar estudantes para uma pauta publicada."},409);
   const activeDistribution=await env.DB.prepare("SELECT id FROM distribution_proposals WHERE invalidated_at IS NULL AND status IN ('applied','published') LIMIT 1").first();
   if(activeDistribution)return json({error:"Existe uma distribuição aplicada. Conclua esse ciclo antes de importar estudantes."},409);
   const body=await parseJson(request),rows=Array.isArray(body?.students)?body.students:[],normalized=normalizeDraftStudents(rows.map((student)=>({fullName:student?.nome,studentNumber:String(student?.n_mecanografico||""),preference:"stay"})));
   if(normalized.error||!normalized.students?.length)return json({error:normalized.error||"O CSV não contém estudantes válidos."},400);
   const existing=await env.DB.prepare("SELECT student_number FROM class_students WHERE class_id=? AND removed_at IS NULL").bind(classId).all<{student_number:string}>(),existingNumbers=new Set(existing.results.map(student=>student.student_number));
   if(normalized.students.some(student=>existingNumbers.has(student.studentNumber)))return json({error:"O CSV contém um estudante que já pertence a esta turma."},409);
   const conflict=await conflictingStudent(env,classId,normalized.students.map(student=>student.studentNumber));if(conflict)return json({error:`O estudante ${conflict.student_number} já está associado à Turma ${conflict.class_id}.`},409);
   const now=Date.now(),actorId=user.actorId||user.id,writes=normalized.students.map(student=>env.DB.prepare("INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(student.id,classId,student.fullName,student.studentNumber,"stay",now,actorId,now,now));
   writes.push(env.DB.prepare("UPDATE classes SET status='submitted',workflow_step=3,submitted_at=COALESCE(submitted_at,?),submitted_by=COALESCE(submitted_by,?),updated_at=? WHERE id=?").bind(now,actorId,now,classId),env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) VALUES (?,?,'class_csv_imported',?,?)").bind(classId,actorId,JSON.stringify({students:normalized.students.length}),now));
   await env.DB.batch(writes);return json({ok:true,imported:normalized.students.length});
  }

  if (request.method === "PUT" && action === "draft") {
    if (!canEditClass(user,classId)) return json({error:"Sem permissão para alterar esta turma."},403);
    if (!isDraft) return json({error:"A turma já foi submetida. Crie um pedido de alteração."},409);
    const body=await parseJson(request),revision=Number(body?.revision),workflowStep=Number(body?.workflowStep),normalized=normalizeDraftStudents(body?.students);
    if (!Number.isSafeInteger(revision)||revision<=klass.draft_revision) return json({error:"Existe uma versão mais recente deste rascunho.",revision:klass.draft_revision},409);
    if (![1,2,3].includes(workflowStep)||normalized.error||!normalized.students) return json({error:normalized.error||"Etapa inválida."},400);
    const conflict=await conflictingStudent(env,classId,normalized.students.map((student)=>student.studentNumber));
    if(conflict)return json({error:`O estudante ${conflict.student_number} já está associado à Turma ${conflict.class_id}.`},409);
    const now=Date.now();
    await env.DB.batch([env.DB.prepare("INSERT INTO class_drafts (class_id,revision,workflow_step,payload,saved_by,saved_at) VALUES (?,?,?,?,?,?)").bind(classId,revision,workflowStep,JSON.stringify(normalized.students),user.id,now),env.DB.prepare("UPDATE classes SET draft_revision=?,workflow_step=?,updated_at=? WHERE id=? AND draft_revision<? AND status IN ('draft','reopened')").bind(revision,workflowStep,now,classId,revision)]);
    return json({ok:true,revision,savedAt:now});
  }

  if (request.method === "POST" && action === "submit") {
    if (!canEditClass(user,classId)) return json({error:"Sem permissão para submeter esta turma."},403);
    if (!isDraft) return json({ok:true,alreadySubmitted:true});
    const saved=await env.DB.prepare("SELECT payload FROM class_drafts WHERE class_id=? AND revision=?").bind(classId,klass.draft_revision).first<{payload:string}>(),normalized=normalizeDraftStudents(saved?JSON.parse(saved.payload):[]);
    if(normalized.error||!normalized.students?.length)return json({error:normalized.error||"Adicione pelo menos um estudante antes de submeter."},400);
    const conflict=await conflictingStudent(env,classId,normalized.students.map((student)=>student.studentNumber));
    if(conflict)return json({error:`O estudante ${conflict.student_number} já está associado à Turma ${conflict.class_id}.`},409);
    const now=Date.now(),values=normalized.students.map(()=>"(?,?,?,?,?,?,?,?,?,NULL)").join(","),bindings=normalized.students.flatMap((student)=>[student.id,classId,student.fullName,student.studentNumber,student.preference,now,user.id,now,now]);
    await env.DB.batch([env.DB.prepare("UPDATE class_students SET removed_at=?,updated_at=? WHERE class_id=? AND removed_at IS NULL").bind(now,now,classId),env.DB.prepare(`INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at,removed_at) VALUES ${values} ON CONFLICT(student_number) DO UPDATE SET class_id=excluded.class_id,full_name=excluded.full_name,preference=excluded.preference,preference_locked_at=excluded.preference_locked_at,updated_at=excluded.updated_at,removed_at=NULL`).bind(...bindings),env.DB.prepare("UPDATE classes SET status='submitted',workflow_step=3,submitted_at=?,submitted_by=?,updated_at=? WHERE id=? AND status IN ('draft','reopened')").bind(now,user.id,now,classId),env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) VALUES (?,?,'class_submitted',?,?)").bind(classId,user.id,JSON.stringify({students:normalized.students.length,revision:klass.draft_revision}),now)]);
    return json({ok:true});
  }

  if (request.method === "POST" && action === "reopen") {
   if (!canManageAll(user)) return json({error:"Apenas um administrador pode reverter a submissão."},403);
   if (klass.status === "published") return json({error:"Uma pauta publicada não pode ser reaberta por esta ação. Use Reverter publicação nas Colocações; as colocações serão preservadas."},409);
   const activeDistribution=await env.DB.prepare("SELECT id FROM distribution_proposals WHERE invalidated_at IS NULL AND status IN ('applied','published') LIMIT 1").first();if(activeDistribution)return json({error:"Existe uma distribuição aplicada. Inicia primeiro uma nova revisão nas Colocações."},409);
   if (isDraft) return json({ok:true,alreadyReopened:true});
    const now=Date.now(),actorId=user.actorId||user.id;
    await env.DB.batch([env.DB.prepare("UPDATE classes SET status='reopened',workflow_step=2,submitted_at=NULL,submitted_by=NULL,updated_at=? WHERE id=?").bind(now,classId),env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) VALUES (?,?,'class_submission_reverted',?,?)").bind(classId,actorId,JSON.stringify({previousStatus:klass.status}),now)]);
    return json({ok:true,status:"reopened"});
  }

  if (action === "tickets" && request.method === "GET") {
    const tickets=await env.DB.prepare("SELECT t.*,u.full_name created_by_name FROM class_tickets t JOIN users u ON u.id=t.created_by WHERE t.class_id=? ORDER BY t.created_at DESC").bind(classId).all(); return json({tickets:tickets.results});
  }
  if (action === "tickets" && request.method === "POST") {
    if (isDraft) return json({error:"Enquanto a turma estiver em rascunho, corrija os dados diretamente."},409);
    if (!canEditClass(user,classId)) return json({error:"Sem permissão para criar pedidos nesta turma."},403);
    const body=await parseJson(request),description=String(body?.description||"").trim().slice(0,1000),requestType=String(body?.requestType||"other"),payload=body?.payload&&typeof body.payload==="object"?body.payload:{};
    if(!["reopen","add_student","remove_student","replace_student","correct_student","other"].includes(requestType)||description.length<10)return json({error:"Selecione o tipo e indique um motivo com pelo menos 10 caracteres."},400);
    const structured=payload as Record<string,unknown>,studentId=String(structured.studentId||""),fullName=normalizeFullName(structured.fullName),studentNumber=String(structured.studentNumber||"").trim();
    if(["remove_student","replace_student","correct_student"].includes(requestType)&&!studentId)return json({error:"Selecione o estudante afetado."},400);
    if(["add_student","replace_student","correct_student"].includes(requestType)&&(validateFullName(fullName)||!/^\d{9}$/.test(studentNumber)))return json({error:"Indique o nome completo e um número mecanográfico com 9 algarismos."},400);
    if(studentId&&!(await env.DB.prepare("SELECT id FROM class_students WHERE id=? AND class_id=? AND removed_at IS NULL").bind(studentId,classId).first()))return json({error:"O estudante selecionado não pertence à turma."},400);
    const now=Date.now();await env.DB.prepare("INSERT INTO class_tickets (id,class_id,student_id,category,description,status,created_by,created_at,updated_at,request_type,request_payload) VALUES (?,?,?,?,?,'pending',?,?,?,?,?)").bind(crypto.randomUUID(),classId,typeof (payload as {studentId?:unknown}).studentId==="string"?(payload as {studentId:string}).studentId:null,requestType,description,user.id,now,now,requestType,JSON.stringify(payload)).run();return json({ok:true},201);
  }
  return json({error:"Operação não suportada."},405);
}

async function handleClasses(request: Request, env: Env, user: CurrentUser, pathname: string): Promise<Response> {
  return handleClassesV2(request, env, user, pathname);
  /* Código legado preservado temporariamente apenas para facilitar a revisão da migração.
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
  const classId = Number(match![1]); const action = match![2] || "detail";
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
  return json({error:"Operação não suportada."},405); */
}

async function handleOwnDestinations(request:Request,env:Env,user:CurrentUser):Promise<Response>{
  const number=studentNumberFromEmail(user.email); const student=await env.DB.prepare("SELECT s.id,s.class_id,s.student_decision,s.decision_at,s.notes,c.status FROM class_students s JOIN classes c ON c.id=s.class_id WHERE s.student_number=? AND s.removed_at IS NULL").bind(number).first<{id:string;class_id:number;student_decision:string|null;decision_at:number|null;notes:string|null;status:string}>();
  if(!student)return json({error:"O seu registo ainda não consta de uma turma."},404);
  const settings=await classSettings(env),group=Math.ceil(student.class_id/5),window=settings.preferenceWindows[group-1],studentSettings={preferencesOpenAt:window.openAt,preferencesCloseAt:window.closeAt,groupLabel:`Turmas ${window.classes}`};
  if(request.method==="GET"){const [destinations,classes]=await Promise.all([env.DB.prepare("SELECT destination_class FROM student_destinations WHERE student_id=? ORDER BY rank").bind(student.id).all<{destination_class:number}>(),env.DB.prepare("SELECT id FROM classes ORDER BY id").all<{id:number}>()]);const decision=student.student_decision==="move"?"move":student.student_decision==="stay"?"stay":null;return json({student:{classId:student.class_id,decision,submittedAt:student.decision_at,notes:decision==="move"?student.notes||"":"",destinations:decision==="move"?destinations.results.map(row=>row.destination_class):[]},activeClasses:classes.results.map(row=>row.id),settings:studentSettings,serverNow:Date.now()});}
  const body=await parseJson(request),decision=String(body?.decision||""),rawDestinations=Array.isArray(body?.destinations)?body.destinations.map(Number):[],rawNotes=typeof body?.notes==="string"?body.notes.trim().slice(0,1000):"";
  if(decision!=="stay"&&decision!=="move")return json({error:"Escolhe se pretendes manter a turma ou mudar."},400);
  const destinations=decision==="move"?rawDestinations:[],notes=decision==="move"?rawNotes:"";
  if(decision==="move"&&!destinations.length)return json({error:"Indica pelo menos uma turma de destino antes de submeter."},400);
  if(destinations.length>19||new Set(destinations).size!==destinations.length||destinations.some(id=>!Number.isInteger(id)))return json({error:"Pode indicar até 19 turmas alternativas, sem repetições."},400);
  if(student.status==="published")return json({error:"As turmas já foram publicadas. Reverta a publicação antes de alterar preferências."},409);
  if(student.status==="draft"||student.status==="reopened")return json({error:"A CC ainda não concluiu a composição da tua turma."},409);if(destinations.includes(student.class_id))return json({error:"A turma atual não pode ser um destino."},400);
  const classes=await env.DB.prepare("SELECT id FROM classes ORDER BY id").all<{id:number}>(),activeClasses=new Set(classes.results.map(row=>row.id));if(destinations.some(id=>!activeClasses.has(id)))return json({error:"Seleciona apenas turmas ativas."},400);
  const activeProposal=await env.DB.prepare("SELECT id,status FROM distribution_proposals WHERE invalidated_at IS NULL AND (status='published' OR (status='applied' AND published_at IS NULL)) ORDER BY created_at DESC LIMIT 1").first<{id:string;status:string}>();if(activeProposal)return json({error:"Existe uma distribuição aplicada ou publicada. Conclua esse ciclo antes de alterar preferências."},409);
  const now=Date.now();if(now<Date.parse(window.openAt))return json({error:`O formulário das Turmas ${window.classes} ainda não abriu.`},409);if(now>=Date.parse(window.closeAt))return json({error:`O formulário das Turmas ${window.classes} já encerrou.`},409);
  const writes=[env.DB.prepare("DELETE FROM student_destinations WHERE student_id=?").bind(student.id),env.DB.prepare("UPDATE class_students SET preference=?,student_decision=?,decision_at=?,preference_source='student',preference_admin_reason=NULL,distribution_result='pending',notes=?,considerations='[]',manual_review=?,additional_info_validation=NULL,additional_info_validation_note=NULL,additional_info_review_status=NULL,exception_points=0,exception_reviewed_at=NULL,exception_reviewed_by=NULL,exception_review_reason=NULL,updated_at=? WHERE id=?").bind(decision,decision,now,notes,notes?1:0,now,student.id)];
  if(destinations.length){const values=destinations.map(()=>"(?,?,?,?,?)").join(","),bindings=destinations.flatMap((id,rank)=>[student.id,id,rank+1,user.id,now]);writes.push(env.DB.prepare(`INSERT INTO student_destinations (student_id,destination_class,rank,updated_by,updated_at) VALUES ${values}`).bind(...bindings));}
  writes.push(env.DB.prepare("UPDATE distribution_proposals SET invalidated_at=? WHERE invalidated_at IS NULL AND (status IN ('draft','approved') OR (status='applied' AND published_at IS NOT NULL))").bind(now),env.DB.prepare("INSERT INTO class_audit_log (class_id,student_id,actor_user_id,action,details,created_at) VALUES (?,?,?,'student_preference_updated',?,?)").bind(student.class_id,student.id,user.id,JSON.stringify({decision,destinations,hasAdditionalInfo:Boolean(notes)}),now));await env.DB.batch(writes);return json({ok:true,submittedAt:now});
}

async function handlePublicClassesPdf(env:Env):Promise<Response>{
  const [classes,students,proposal]=await Promise.all([
    env.DB.prepare("SELECT id,status FROM classes ORDER BY id").all<{id:number;status:string}>(),
    env.DB.prepare("SELECT class_id,full_name,student_number FROM class_students WHERE removed_at IS NULL ORDER BY class_id,full_name COLLATE NOCASE").all<{class_id:number;full_name:string;student_number:string}>(),
    env.DB.prepare("SELECT published_at FROM distribution_proposals WHERE status='published' ORDER BY published_at DESC LIMIT 1").first<{published_at:number}>()
  ]);
  if(!classes.results.length||classes.results.some(item=>item.status!=="published")||!proposal?.published_at)return json({error:"As turmas definitivas ainda não foram publicadas."},409);
  const publishedAt=new Date(proposal.published_at).toLocaleString("pt-PT",{timeZone:"Europe/Lisbon"}),pdf=buildPublicClassesPdf({classes:classes.results.map(item=>item.id),students:students.results.map(student=>({classId:student.class_id,fullName:student.full_name,studentNumber:student.student_number})),publishedAt});
  return new Response(Uint8Array.from(pdf).buffer,{headers:{"content-type":"application/pdf","content-disposition":'attachment; filename="turmas-definitivas-2026-2027.pdf"',"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tickets temporariamente desativados
async function handleGlobalTickets(request:Request,env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 if(request.method==="GET"){const result=await env.DB.prepare(`SELECT t.*,s.full_name student_name,s.student_number,u.id created_by_user_id,u.full_name created_by_name,u.email created_by_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END created_by_student_number FROM class_tickets t LEFT JOIN class_students s ON s.id=t.student_id JOIN users u ON u.id=t.created_by ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,t.created_at DESC`).all();return json({tickets:result.results});}
 const body=await parseJson(request),id=String(body?.id||""),status=String(body?.status||""),response=String(body?.response||"").trim().slice(0,1000);
 if(!id||!["open","review","information_needed","accepted","rejected","completed"].includes(status))return json({error:"Estado do pedido inválido."},400);
 if(["accepted","rejected","completed"].includes(status)&&response.length<5)return json({error:"Registe uma resposta antes de concluir o pedido."},400);
 const now=Date.now();await env.DB.batch([env.DB.prepare("UPDATE class_tickets SET status=?,response=?,resolved_by=CASE WHEN ? IN ('accepted','rejected','completed') THEN ? ELSE resolved_by END,updated_at=? WHERE id=?").bind(status,response||null,status,user.actorId||user.id,now,id),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'class_ticket_updated',?,?)").bind(user.actorId||user.id,JSON.stringify({id,status}),now)]);return json({ok:true});
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tickets temporariamente desativados
async function handleGlobalTicketsV2(request:Request,env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 if(request.method==="GET"){const result=await env.DB.prepare(`SELECT t.*,s.full_name student_name,s.student_number,u.id created_by_user_id,u.full_name created_by_name,u.email created_by_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END created_by_student_number FROM class_tickets t LEFT JOIN class_students s ON s.id=t.student_id JOIN users u ON u.id=t.created_by ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,t.created_at DESC`).all();return json({tickets:result.results});}
 if(request.method==="DELETE"){const body=await parseJson(request),id=String(body?.id||"");if(!id)return json({error:"Pedido inválido."},400);const ticket=await env.DB.prepare("SELECT id,class_id,status FROM class_tickets WHERE id=?").bind(id).first<{id:string;class_id:number;status:string}>();if(!ticket)return json({ok:true,alreadyDeleted:true});const actorId=user.actorId||user.id,now=Date.now();await env.DB.batch([env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'class_ticket_deleted',?,?)").bind(actorId,JSON.stringify(ticket),now),env.DB.prepare("DELETE FROM class_tickets WHERE id=?").bind(id)]);return json({ok:true});}
  const body=await parseJson(request),id=String(body?.id||""),status=String(body?.status||""),response=String(body?.response||"").trim().slice(0,1000),actorId=user.actorId||user.id;
 if(!id||!["pending","approved","rejected"].includes(status))return json({error:"Estado do pedido inválido."},400);
 if(["approved","rejected"].includes(status)&&response.length<5)return json({error:"Registe uma resposta antes de decidir o pedido."},400);
 const ticket=await env.DB.prepare("SELECT id,class_id,request_type,request_payload,status FROM class_tickets WHERE id=?").bind(id).first<{id:string;class_id:number;request_type:string|null;request_payload:string|null;status:string}>();
 if(!ticket)return json({error:"Pedido não encontrado."},404);
 if(ticket.status==="executed")return json({ok:true,status:"executed",alreadyExecuted:true});
 const now=Date.now();
 if(status==="approved"&&ticket.request_type==="reopen"){
  await env.DB.batch([env.DB.prepare("UPDATE classes SET status='reopened',workflow_step=2,submitted_at=NULL,submitted_by=NULL,updated_at=? WHERE id=? AND status NOT IN ('draft','reopened')").bind(now,ticket.class_id),env.DB.prepare("UPDATE class_tickets SET status='executed',response=?,resolved_by=?,decided_at=COALESCE(decided_at,?),executed_at=COALESCE(executed_at,?),execution_result=COALESCE(execution_result,'Turma reaberta para edição.'),updated_at=? WHERE id=? AND status<>'executed'").bind(response,actorId,now,now,now,id),env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) SELECT ?,?,'class_reopened',?,? WHERE NOT EXISTS (SELECT 1 FROM class_audit_log WHERE action='class_reopened' AND details=?)").bind(ticket.class_id,actorId,JSON.stringify({ticketId:id}),now,JSON.stringify({ticketId:id}))]);
  return json({ok:true,status:"executed"});
 }
 if(status==="approved"){
  let payload:Record<string,unknown>={};
  try{payload=JSON.parse(ticket.request_payload||"{}") as Record<string,unknown>}catch{return json({error:"Os dados estruturados do pedido estão danificados."},409)}
  const requestType=ticket.request_type||"other";
  const targetId=String(payload.studentId||"");
  const fullName=normalizeFullName(payload.fullName);
  const studentNumber=String(payload.studentNumber||"").trim();
  const preference="stay";
  const target=targetId?await env.DB.prepare("SELECT id,student_number FROM class_students WHERE id=? AND class_id=? AND removed_at IS NULL").bind(targetId,ticket.class_id).first<{id:string;student_number:string}>():null;
  if(["remove_student","replace_student","correct_student"].includes(requestType)&&!target)return json({error:"O estudante indicado já não pertence a esta turma."},409);
  if(["add_student","replace_student","correct_student"].includes(requestType)){
   if(validateFullName(fullName)||!/^\d{9}$/.test(studentNumber))return json({error:"O nome ou número mecanográfico do pedido é inválido."},409);
   const conflict=await conflictingStudent(env,ticket.class_id,[studentNumber]);
   if(conflict)return json({error:`O estudante ${studentNumber} já está associado à Turma ${conflict.class_id}.`},409);
  }
  const details=JSON.stringify({ticketId:id,type:requestType});
  const writes:D1PreparedStatement[]=[];
  let result="";
  if(requestType==="add_student"){
   const studentId=crypto.randomUUID();
   writes.push(env.DB.prepare("INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(studentId,ticket.class_id,fullName,studentNumber,preference,now,actorId,now,now));
   result="Estudante adicionado à turma.";
  }else if(requestType==="remove_student"){
   writes.push(env.DB.prepare("UPDATE class_students SET removed_at=?,updated_at=? WHERE id=? AND class_id=? AND removed_at IS NULL").bind(now,now,targetId,ticket.class_id));
   result="Estudante removido da turma.";
  }else if(requestType==="replace_student"){
   const studentId=crypto.randomUUID();
   writes.push(env.DB.prepare("UPDATE class_students SET removed_at=?,updated_at=? WHERE id=? AND class_id=? AND removed_at IS NULL").bind(now,now,targetId,ticket.class_id));
   writes.push(env.DB.prepare("INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(studentId,ticket.class_id,fullName,studentNumber,preference,now,actorId,now,now));
   result="Substituição executada.";
  }else if(requestType==="correct_student"){
   writes.push(env.DB.prepare("UPDATE class_students SET full_name=?,student_number=?,updated_at=? WHERE id=? AND class_id=? AND removed_at IS NULL").bind(fullName,studentNumber,now,targetId,ticket.class_id));
   result="Dados do estudante corrigidos.";
  }else return json({error:"Este pedido precisa de execução manual pelo Núcleo de Gestão."},409);
  writes.push(env.DB.prepare("UPDATE class_tickets SET status='executed',response=?,resolved_by=?,decided_at=COALESCE(decided_at,?),executed_at=COALESCE(executed_at,?),execution_result=?,updated_at=? WHERE id=? AND status<>'executed'").bind(response,actorId,now,now,result,now,id));
  writes.push(env.DB.prepare("INSERT INTO class_audit_log (class_id,actor_user_id,action,details,created_at) SELECT ?,?,'ticket_executed',?,? WHERE NOT EXISTS (SELECT 1 FROM class_audit_log WHERE action='ticket_executed' AND details=?)").bind(ticket.class_id,actorId,details,now,details));
  await env.DB.batch(writes);
  return json({ok:true,status:"executed"});
 }
 await env.DB.batch([env.DB.prepare("UPDATE class_tickets SET status=?,response=?,resolved_by=?,decided_at=?,updated_at=? WHERE id=? AND status<>'executed'").bind(status,response||null,actorId,status==="rejected"?now:null,now,id),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'class_ticket_updated',?,?)").bind(actorId,JSON.stringify({id,status}),now)]);return json({ok:true,status});
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- versão legada preservada durante a transição para V2
async function handleDistributionCheck(env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 const [students,openTickets]=await Promise.all([env.DB.prepare("SELECT id,class_id,student_number,preference,student_decision FROM class_students WHERE removed_at IS NULL").all<{id:string;class_id:number;student_number:string;preference:string;student_decision:string|null}>(),env.DB.prepare("SELECT id,class_id,category FROM class_tickets WHERE status IN ('open','review','information_needed')").all<{id:string;class_id:number;category:string}>()]);
 const issues:Array<{severity:"blocker"|"warning";code:string;message:string;classId?:number}>=[];
 for(const student of students.results){if(!/^\d{9}$/.test(student.student_number))issues.push({severity:"blocker",code:"INVALID_NUMBER",message:`Número mecanográfico inválido na Turma ${student.class_id}.`,classId:student.class_id});if(student.student_decision==="move"){const count=await env.DB.prepare("SELECT COUNT(*) total FROM student_destinations WHERE student_id=?").bind(student.id).first<{total:number}>();if(!count?.total)issues.push({severity:"blocker",code:"MISSING_DESTINATION",message:`Há um aluno que pretende mudar sem destinos na Turma ${student.class_id}.`,classId:student.class_id});}}
 for(const ticket of openTickets.results)issues.push({severity:"blocker",code:"OPEN_TICKET",message:`A Turma ${ticket.class_id} tem um pedido pendente (${ticket.category}).`,classId:ticket.class_id});
 const counts=await env.DB.prepare("SELECT class_id,COUNT(*) total FROM class_students WHERE removed_at IS NULL GROUP BY class_id ORDER BY class_id").all<{class_id:number;total:number}>();const values=counts.results.map(r=>r.total);if(values.length===20&&Math.max(...values)-Math.min(...values)>3)issues.push({severity:"warning",code:"IMBALANCE",message:"A diferença atual entre a maior e a menor turma excede três alunos."});
 return json({ready:issues.every(i=>i.severity!=="blocker"),checkedAt:Date.now(),summary:{classes:20,students:students.results.length,blockers:issues.filter(i=>i.severity==="blocker").length,warnings:issues.filter(i=>i.severity==="warning").length},issues});
}

type DistributionCheckIssue={severity:"blocker"|"warning";code:string;message:string;classId?:number;studentId?:string;studentName?:string;studentNumber?:string};
function destinationsPreferredToCurrent<T extends {destination_class:number}>(destinations:T[],currentClass:number){const currentIndex=destinations.findIndex(destination=>destination.destination_class===currentClass),preferred=currentIndex>=0?destinations.slice(0,currentIndex):destinations.filter(destination=>destination.destination_class!==currentClass);return preferred.map((destination,index)=>({...destination,rank:index+1}))}
async function buildDistributionCheck(env:Env){
 const [classes,students,destinations,activeProposal,settings]=await Promise.all([
  env.DB.prepare("SELECT id,status FROM classes ORDER BY id").all<{id:number;status:string}>(),
  env.DB.prepare("SELECT id,full_name,student_number,class_id,student_decision,notes,considerations,exception_points,exception_reviewed_at,additional_info_validation,additional_info_validation_note,additional_info_review_status FROM class_students WHERE removed_at IS NULL ORDER BY class_id,full_name COLLATE NOCASE").all<{id:string;full_name:string;student_number:string;class_id:number;student_decision:string|null;notes:string|null;considerations:string;exception_points:number;exception_reviewed_at:number|null;additional_info_validation:string|null;additional_info_validation_note:string|null;additional_info_review_status:string|null}>(),
  env.DB.prepare("SELECT student_id,destination_class,rank FROM student_destinations ORDER BY student_id,rank").all<{student_id:string;destination_class:number;rank:number}>(),
  env.DB.prepare("SELECT id,status FROM distribution_proposals WHERE invalidated_at IS NULL AND (status='published' OR (status='applied' AND published_at IS NULL)) ORDER BY created_at DESC LIMIT 1").first<{id:string;status:string}>(),
  classSettings(env)
 ]);
 const issues:DistributionCheckIssue[]=[],activeClassIds=new Set(classes.results.map(row=>row.id)),destinationsById=new Map<string,typeof destinations.results>();
 for(const destination of destinations.results)destinationsById.set(destination.student_id,[...(destinationsById.get(destination.student_id)||[]),destination]);
 if(!classes.results.length)issues.push({severity:"blocker",code:"SEM_TURMAS",message:"Não existem turmas ativas para distribuir."});
 if(!students.results.length)issues.push({severity:"blocker",code:"SEM_ESTUDANTES",message:"Não existem estudantes ativos para distribuir."});
 if(settings.preferenceWindows.some(window=>!Number.isFinite(Date.parse(window.closeAt))||Date.now()<Date.parse(window.closeAt)))issues.push({severity:"blocker",code:"JANELAS_PREFERENCIAS_ABERTAS",message:"Só é possível calcular uma nova proposta depois de todas as janelas de preferências encerrarem."});
 const counts=new Map(classes.results.map(row=>[row.id,0]));for(const student of students.results)counts.set(student.class_id,(counts.get(student.class_id)||0)+1);
 for(const klass of classes.results)if(!(counts.get(klass.id)||0))issues.push({severity:"blocker",code:"TURMA_VAZIA",message:`A Turma ${klass.id} não tem estudantes.`,classId:klass.id});
 let automaticStays=0,exceptionalPending=0;
 for(const student of students.results){
  const identity={classId:student.class_id,studentId:student.id,studentName:student.full_name,studentNumber:student.student_number},ownDestinations=student.student_decision==="move"?destinationsPreferredToCurrent(destinationsById.get(student.id)||[],student.class_id):[];
  if(!/^\d{9}$/.test(student.student_number))issues.push({severity:"blocker",code:"NUMERO_INVALIDO",message:"O número mecanográfico não tem nove algarismos.",...identity});
  if(!student.student_decision)automaticStays++;
   if(!activeProposal){
    if(student.student_decision==="move"&&!ownDestinations.length)issues.push({severity:"blocker",code:"PREFERENCIAS_EM_FALTA",message:"Pretende mudar, mas não indicou nenhuma turma de destino.",...identity});
    const seen=new Set<number>();for(let index=0;index<ownDestinations.length;index++){const destination=ownDestinations[index];if(!activeClassIds.has(destination.destination_class)||destination.destination_class===student.class_id||seen.has(destination.destination_class))issues.push({severity:"blocker",code:"DESTINO_INVALIDO",message:`A preferência Turma ${destination.destination_class} não é um destino válido.`,...identity});if(destination.rank!==index+1)issues.push({severity:"blocker",code:"ORDEM_PREFERENCIAS_INVALIDA",message:"A ordem das preferências não é contínua.",...identity});seen.add(destination.destination_class)}
    if(student.notes?.trim()&&!student.additional_info_review_status){exceptionalPending++;issues.push({severity:"blocker",code:"INFORMACAO_POR_VALIDAR",message:"A informação adicional ainda não foi classificada pela CC.",...identity})}
    if(student.notes?.trim()&&student.additional_info_review_status==="valid"&&Number(student.exception_points||0)===0)issues.push({severity:"warning",code:"INFORMACAO_VALIDADA_SEM_PONTOS",message:"A informação foi considerada válida, mas não foram atribuídos pontos extra. Confirma se esta decisão foi intencional.",...identity})
   }
 }
 const values=[...counts.values()];if(values.length&&Math.max(...values)-Math.min(...values)>3)issues.push({severity:"warning",code:"DESEQUILIBRIO",message:`A diferença atual entre a maior e a menor turma é ${Math.max(...values)-Math.min(...values)} estudantes.`});
  if(activeProposal)issues.push({severity:"blocker",code:"DISTRIBUICAO_ATIVA",message:`A proposta ${activeProposal.id} está ${activeProposal.status==="published"?"publicada":"aplicada"}. Retire a publicação ou conclua este ciclo antes de calcular outra.`});
 let input:Awaited<ReturnType<typeof distributionInputs>>|null=null,simulation:null|{possible:boolean;moved:number;manualReviews:number;tieBreakStudents:number;classCounts:Record<string,number>;competition:Array<{classId:number;originSize:number;candidates:number;firstChoiceCandidates:number;otherChoiceCandidates:number;firstChoicePlaced:number;candidateCapacity:number;placed:number;notPlaced:number;finalSize:number;maximumSize:number}>}=null;
 if(!issues.some(issue=>issue.severity==="blocker")){input=await distributionInputs(env);try{
  const results=calculateDistribution(input.students,{seed:`preflight:${input.hash}`,maxDifference:3,classIds:input.classIds}),classCounts=new Map<number,number>();for(const result of results)classCounts.set(result.destinationClass,(classCounts.get(result.destinationClass)||0)+1);
  const minimumSize=Math.min(...input.classIds.map(id=>classCounts.get(id)||0)),maximumSize=minimumSize+3,competition=input.classIds.map(classId=>{
   const candidates=input!.students.filter(student=>student.studentDecision==="move"&&student.destinations.includes(classId)),candidateIds=new Set(candidates.map(student=>student.id)),firstChoiceIds=new Set(candidates.filter(student=>student.destinations[0]===classId).map(student=>student.id));
   const placedResults=results.filter(result=>candidateIds.has(result.studentId)&&result.destinationClass===classId),placed=placedResults.length,firstChoicePlaced=placedResults.filter(result=>firstChoiceIds.has(result.studentId)).length,finalSize=classCounts.get(classId)||0;
   return {classId,originSize:input!.students.filter(student=>student.classId===classId).length,candidates:candidateIds.size,firstChoiceCandidates:firstChoiceIds.size,otherChoiceCandidates:candidateIds.size-firstChoiceIds.size,firstChoicePlaced,candidateCapacity:Math.max(0,maximumSize-(finalSize-placed)),placed,notPlaced:candidateIds.size-placed,finalSize,maximumSize};
  });
  simulation={possible:true,moved:results.filter(result=>result.status==="moved").length,manualReviews:results.filter(result=>result.manualReview).length,tieBreakStudents:results.filter(result=>result.randomized).length,classCounts:Object.fromEntries(input.classIds.map(id=>[id,classCounts.get(id)||0])),competition};
 }catch(error){issues.push({severity:"blocker",code:"DISTRIBUICAO_IMPOSSIVEL",message:error instanceof Error?error.message:"O motor não encontrou uma distribuição válida."})}}
 const categories=[
  {key:"roster",label:"Turmas e estudantes",description:"Turmas não vazias e identificadores válidos.",codes:["SEM_TURMAS","SEM_ESTUDANTES","TURMA_VAZIA","NUMERO_INVALIDO"]},
  {key:"preferences",label:"Preferências",description:"Janelas encerradas e destinos ativos, únicos e ordenados.",codes:["JANELAS_PREFERENCIAS_ABERTAS","PREFERENCIAS_EM_FALTA","DESTINO_INVALIDO","ORDEM_PREFERENCIAS_INVALIDA"]},
  {key:"review",label:"Informação adicional",description:"Informação confidencial classificada pela CC.",codes:["INFORMACAO_POR_VALIDAR","INFORMACAO_VALIDADA_SEM_PONTOS"]},
   {key:"simulation",label:"Equilíbrio e cálculo",description:"Pré-visualização concluída e limites respeitados.",codes:["DESEQUILIBRIO","DISTRIBUICAO_IMPOSSIVEL","DISTRIBUICAO_ATIVA"]}
 ];
 const checks=categories.map(category=>{const own=issues.filter(issue=>category.codes.includes(issue.code)),blocked=own.some(issue=>issue.severity==="blocker");return {key:category.key,label:category.label,description:category.description,status:blocked?"blocked":own.length?"warning":"passed",count:own.length}});
 const blockers=issues.filter(issue=>issue.severity==="blocker").length,warnings=issues.filter(issue=>issue.severity==="warning").length;
 return {result:{ready:blockers===0,checkedAt:Date.now(),summary:{classes:classes.results.length,students:students.results.length,blockers,warnings,automaticStays,exceptionalPending},checks,issues,simulation},input};
}
async function handleDistributionCheckV2(env:Env,user:CurrentUser):Promise<Response>{if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);const evaluation=await buildDistributionCheck(env);return json(evaluation.result)}

const DISTRIBUTION_ENGINE_VERSION="5.1.0";
type DistributionInput={id:string;studentNumber:string;classId:number;manualReview:boolean;preference:"stay"|"move";studentDecision:"stay"|"move"|null;representativePreference:"stay"|"move";preferenceSource:string;notes:string|null;considerations:string[];integrationPoints:number;exceptionPoints:number;basePoints:number;destinations:number[]};
async function distributionInputs(env:Env){
 const [studentRows,classRows,destinationRows]=await Promise.all([
  env.DB.prepare("SELECT id,student_number,class_id,manual_review,preference,student_decision,preference_source,notes,considerations,exception_points FROM class_students WHERE removed_at IS NULL ORDER BY id").all<{id:string;student_number:string;class_id:number;manual_review:number;preference:"stay"|"move";student_decision:"stay"|"move"|null;preference_source:string;notes:string|null;considerations:string;exception_points:number}>(),
  env.DB.prepare("SELECT id,status FROM classes ORDER BY id").all<{id:number;status:string}>(),
  env.DB.prepare("SELECT student_id,destination_class,rank FROM student_destinations ORDER BY student_id,rank").all<{student_id:string;destination_class:number;rank:number}>()
 ]);
 const destinationsById=new Map<string,number[]>();for(const row of destinationRows.results)destinationsById.set(row.student_id,[...(destinationsById.get(row.student_id)||[]),row.destination_class]);
 const students:DistributionInput[]=studentRows.results.map(row=>{const preferredDestinations=row.student_decision==="move"?destinationsPreferredToCurrent((destinationsById.get(row.id)||[]).map((destination_class,rank)=>({destination_class,rank:rank+1})),row.class_id).map(destination=>destination.destination_class):[],decision=row.student_decision==="move"&&preferredDestinations.length?"move":row.student_decision?"stay":null,destinations=decision==="move"?preferredDestinations:[];let considerations:string[]=[];try{const parsed=JSON.parse(row.considerations||"[]");if(Array.isArray(parsed))considerations=parsed.filter((value):value is string=>typeof value==="string"&&["friends_other_class","integration_bullying","other"].includes(value))}catch{}const integrationPoints=considerations.includes("integration_bullying")?2:0,exceptionPoints=Math.max(0,Number(row.exception_points||0)-integrationPoints);return {id:row.id,studentNumber:row.student_number,classId:row.class_id,manualReview:Boolean(row.manual_review),preference:decision==="move"?"move":"stay",studentDecision:decision,representativePreference:row.preference,preferenceSource:decision?row.preference_source:"automatic",notes:row.notes,considerations,integrationPoints,exceptionPoints,basePoints:Number(row.exception_points||0),destinations};});
 const snapshot=JSON.stringify({engineVersion:DISTRIBUTION_ENGINE_VERSION,classes:classRows.results,students});
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(snapshot));const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
 return {students,classIds:classRows.results.map(row=>row.id),snapshot,hash};
}

async function handleDistributionProposals(request:Request,env:Env,user:CurrentUser,action:string):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 const actorId=user.actorId||user.id;
 if(request.method==="GET"){const [rows,reviews]=await Promise.all([env.DB.prepare("SELECT id,seed,status,input_snapshot,result_snapshot,input_hash,engine_version,invalidated_at,created_at,approved_at,applied_at,rolled_back_at,published_at FROM distribution_proposals ORDER BY created_at DESC LIMIT 10").all<Record<string,unknown>>(),env.DB.prepare("SELECT proposal_id,student_id,status FROM distribution_result_reviews ORDER BY proposal_id,student_id").all<{proposal_id:string;student_id:string;status:string}>()]);return json({proposals:rows.results.map(row=>({...row,reviews:reviews.results.filter(review=>review.proposal_id===row.id)}))});}
 if(action==="calculate"){
  const active=await env.DB.prepare("SELECT id,status FROM distribution_proposals WHERE invalidated_at IS NULL AND (status='published' OR (status='applied' AND published_at IS NULL)) ORDER BY created_at DESC LIMIT 1").first<{id:string;status:string}>();if(active)return json({error:"Já existe uma distribuição aplicada ou publicada. Conclua esse ciclo antes de calcular uma nova proposta."},409);
  const evaluation=await buildDistributionCheck(env);if(!evaluation.result.ready||!evaluation.input)return json({error:"Resolva os bloqueadores da pré-validação antes de calcular."},409);
  const input=evaluation.input,seed=crypto.randomUUID(),id=crypto.randomUUID(),now=Date.now();let results;try{results=calculateDistribution(input.students,{seed,maxDifference:3,classIds:input.classIds})}catch(error){return json({error:error instanceof Error?error.message:"Não foi possível calcular uma distribuição válida."},409)}
  const reviews=results.filter(result=>result.manualReview);await env.DB.batch([env.DB.prepare("UPDATE distribution_proposals SET invalidated_at=? WHERE invalidated_at IS NULL AND (status IN ('draft','approved') OR (status='applied' AND published_at IS NOT NULL))").bind(now),env.DB.prepare("INSERT INTO distribution_proposals (id,seed,status,input_snapshot,result_snapshot,input_hash,engine_version,created_by,created_at) VALUES (?,?,'draft',?,?,?,?,?,?)").bind(id,seed,input.snapshot,JSON.stringify(results),input.hash,DISTRIBUTION_ENGINE_VERSION,actorId,now),...reviews.map(result=>env.DB.prepare("INSERT INTO distribution_result_reviews (proposal_id,student_id,status) VALUES (?,?,'pending')").bind(id,result.studentId)),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'distribution_calculated',?,?)").bind(actorId,JSON.stringify({proposalId:id,seed,inputHash:input.hash,engineVersion:DISTRIBUTION_ENGINE_VERSION,students:input.students.length,manualReviews:reviews.length}),now)]);return json({proposal:{id,seed,status:"draft",results}},201);
 }
 const body=await parseJson(request),id=String(body?.id||""),proposal=await env.DB.prepare("SELECT * FROM distribution_proposals WHERE id=?").bind(id).first<{status:string;input_snapshot:string;result_snapshot:string;input_hash:string|null;invalidated_at:number|null}>();if(!proposal)return json({error:"Proposta não encontrada."},404);const now=Date.now();if(proposal.invalidated_at)return json({error:"Esta proposta foi invalidada por um cálculo ou alteração posterior."},409);
 if(action==="apply"&&proposal.status==="applied")return json({ok:true,status:"applied",alreadyApplied:true});
 if(action==="review"){if(proposal.status!=="draft")return json({error:"Só é possível rever resultados de uma proposta em rascunho."},409);const studentId=String(body?.studentId||""),reason=String(body?.reason||"").trim().slice(0,500);if(!reason)return json({error:"Registe a justificação da validação."},400);const changed=await env.DB.prepare("UPDATE distribution_result_reviews SET status='approved',reviewed_by=?,reviewed_at=? WHERE proposal_id=? AND student_id=? AND status='pending'").bind(actorId,now,id,studentId).run();if(!changed.meta.changes)return json({error:"Revisão pendente não encontrada."},404);await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'distribution_result_reviewed',?,?)").bind(actorId,JSON.stringify({proposalId:id,studentId,reason}),now).run();return json({ok:true});}
 if(action==="override"&&!String(body?.reason||"").trim())return json({error:"A justificação administrativa é obrigatória para alterar o destino final."},400);
 if(action==="override"){
  if(proposal.status!=="draft")return json({error:"Só é possível editar uma proposta em rascunho."},409);
  const studentId=String(body?.studentId||""),destinationClass=Number(body?.destinationClass),reason=String(body?.reason||"").trim().slice(0,500),auditReason=reason||"Alteração do destino final no editor administrativo.";
  const parsedInput=JSON.parse(proposal.input_snapshot) as {students:DistributionInput[];classes?:Array<{id:number}>;classIds?:number[]},classIds=parsedInput.classIds?.length?parsedInput.classIds:(parsedInput.classes||[]).map(item=>Number(item.id)).filter(Number.isInteger),student=parsedInput.students.find(item=>item.id===studentId);
  if(!student||!classIds.includes(destinationClass))return json({error:"O destino manual tem de ser uma turma ativa."},400);
  const results=JSON.parse(proposal.result_snapshot) as Array<Record<string,unknown>&{studentId:string;destinationClass:number}>,result=results.find(item=>item.studentId===studentId);if(!result)return json({error:"Estudante não encontrado na proposta."},404);
  const previousClass=result.destinationClass;result.destinationClass=destinationClass;result.rank=student.destinations.indexOf(destinationClass)+1||null;result.status=destinationClass===student.classId?(student.studentDecision==="move"?"fallback":"stayed_by_choice"):"moved";result.manualReview=false;result.randomized=false;result.manualOverride=true;
  const totals=new Map<number,number>(classIds.map(classId=>[classId,0]));for(const item of results)totals.set(item.destinationClass,(totals.get(item.destinationClass)||0)+1);const sizes=[...totals.values()];if(Math.max(...sizes)-Math.min(...sizes)>3)return json({error:"A alteração deixaria as turmas com uma diferença superior a três estudantes."},409);
  await env.DB.batch([env.DB.prepare("UPDATE distribution_proposals SET result_snapshot=? WHERE id=?").bind(JSON.stringify(results),id),env.DB.prepare("INSERT INTO distribution_manual_overrides (proposal_id,student_id,previous_class,destination_class,reason,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(proposal_id,student_id) DO UPDATE SET previous_class=distribution_manual_overrides.previous_class,destination_class=excluded.destination_class,reason=excluded.reason,actor_user_id=excluded.actor_user_id,created_at=excluded.created_at").bind(id,studentId,previousClass,destinationClass,auditReason,actorId,now),env.DB.prepare("INSERT INTO distribution_result_reviews (proposal_id,student_id,status,reviewed_by,reviewed_at) VALUES (?,?,'approved',?,?) ON CONFLICT(proposal_id,student_id) DO UPDATE SET status='approved',reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at").bind(id,studentId,actorId,now),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'distribution_manual_override',?,?)").bind(actorId,JSON.stringify({proposalId:id,studentId,previousClass,destinationClass,reason:auditReason}),now)]);return json({ok:true});
 }
 if(action==="rollback"){
  if(proposal.status==="applied")return json({ok:true,status:"applied",alreadyUnpublished:true});
  if(proposal.status!=="published")return json({error:"Só uma publicação ativa pode ser retirada do ar."},409);
  const writes=[env.DB.prepare("UPDATE classes SET status='submitted',updated_at=? WHERE status='published' AND EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='published')").bind(now,id),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) SELECT ?,'distribution_unpublished',?,? WHERE EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='published')").bind(actorId,JSON.stringify({proposalId:id,placementsPreserved:true}),now,id),env.DB.prepare("UPDATE distribution_proposals SET status='applied' WHERE id=? AND status='published'").bind(id)];
  const batch=await env.DB.batch(writes),transition=batch[batch.length-1];if(!transition?.meta.changes){const latest=await env.DB.prepare("SELECT status FROM distribution_proposals WHERE id=?").bind(id).first<{status:string}>();if(latest?.status==="applied")return json({ok:true,status:"applied",alreadyUnpublished:true});return json({error:"O estado da proposta mudou durante a operação. Atualize e tente novamente."},409);}
  return json({ok:true,status:"applied",placementsPreserved:true});
 }
 if(action==="publish"){
  if(proposal.status==="published")return json({ok:true,status:"published",alreadyPublished:true});
  if(proposal.status!=="applied")return json({error:"A proposta tem de estar aplicada antes de ser publicada."},409);
  const writes=[env.DB.prepare("UPDATE classes SET status='published',updated_at=? WHERE EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='applied')").bind(now,id),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) SELECT ?,'distribution_published',?,? WHERE EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='applied')").bind(actorId,JSON.stringify({proposalId:id}),now,id),env.DB.prepare("UPDATE distribution_proposals SET status='published',published_at=?,published_by=? WHERE id=? AND status='applied'").bind(now,actorId,id)];
  const batch=await env.DB.batch(writes),transition=batch[batch.length-1];if(!transition?.meta.changes){const latest=await env.DB.prepare("SELECT status FROM distribution_proposals WHERE id=?").bind(id).first<{status:string}>();if(latest?.status==="published")return json({ok:true,status:"published",alreadyPublished:true});return json({error:"O estado da proposta mudou durante a publicação. Atualize e tente novamente."},409);}
  return json({ok:true,status:"published"});
 }
 const current=await distributionInputs(env);if(proposal.input_hash!==current.hash)return json({error:"Os dados mudaram depois do cálculo. Crie uma nova proposta."},409);
 if(action==="approve"){
  if(proposal.status==="approved")return json({ok:true,status:"approved",alreadyApproved:true});
  if(proposal.status!=="draft")return json({error:"A proposta já não pode ser aprovada."},409);
  const pending=await env.DB.prepare("SELECT COUNT(*) total FROM distribution_result_reviews WHERE proposal_id=? AND status='pending'").bind(id).first<{total:number}>();if(pending?.total)return json({error:`Ainda existem ${pending.total} revisões manuais pendentes.`},409);
  const changed=await env.DB.prepare("UPDATE distribution_proposals SET status='approved',approved_by=?,approved_at=? WHERE id=? AND status='draft'").bind(actorId,now,id).run();
  if(!changed.meta.changes){const latest=await env.DB.prepare("SELECT status FROM distribution_proposals WHERE id=?").bind(id).first<{status:string}>();if(latest?.status==="approved")return json({ok:true,status:"approved",alreadyApproved:true});return json({error:"O estado da proposta mudou durante a aprovação. Atualize e tente novamente."},409)}
  await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'distribution_approved',?,?)").bind(actorId,JSON.stringify({proposalId:id,inputHash:current.hash}),now).run();return json({ok:true,status:"approved"});
 }
 if(action==="apply"){
  if(proposal.status==="applied")return json({ok:true,status:"applied",alreadyApplied:true});
  if(proposal.status!=="approved")return json({error:"A proposta tem de ser aprovada antes de ser aplicada."},409);
  const active=await env.DB.prepare("SELECT id FROM distribution_proposals WHERE status IN ('applied','published') AND invalidated_at IS NULL AND id<>?").bind(id).first();if(active)return json({error:"Já existe outra distribuição aplicada ou publicada. Conclua esse ciclo antes de continuar."},409);
  let results:Array<{studentId:string;destinationClass:number;status:string;manualReview:boolean;manualOverride?:boolean}>;try{const parsed=JSON.parse(proposal.result_snapshot);if(!Array.isArray(parsed))throw new Error();results=parsed}catch{return json({error:"O resultado guardado da proposta está corrompido."},409)}
  const currentById=new Map(current.students.map(student=>[student.id,student])),expectedIds=new Set(currentById.keys()),resultIds=new Set(results.map(result=>result?.studentId)),activeClasses=new Set(current.classIds),validStatuses=new Set(["stayed_by_choice","fallback","moved"]);
  if(results.length!==current.students.length||resultIds.size!==results.length||resultIds.size!==expectedIds.size||[...expectedIds].some(studentId=>!resultIds.has(studentId)))return json({error:"O resultado da proposta não contém exatamente um destino para cada estudante ativo."},409);
  if(results.some(result=>{const student=currentById.get(result?.studentId),destination=Number(result?.destinationClass),expectedStatus=student&&destination===student.classId?(student.studentDecision==="move"?"fallback":"stayed_by_choice"):"moved";return !result||!student||!Number.isInteger(result.destinationClass)||!activeClasses.has(destination)||!validStatuses.has(result.status)||result.status!==expectedStatus||typeof result.manualReview!=="boolean"}))return json({error:"O resultado da proposta contém um estudante, destino ou estado incoerente."},409);
  const counts=new Map<number,number>(current.classIds.map(classId=>[classId,0]));for(const result of results)counts.set(result.destinationClass,(counts.get(result.destinationClass)||0)+1);const sizes=[...counts.values()];if(Math.max(...sizes)-Math.min(...sizes)>3)return json({error:"O resultado guardado já não respeita a diferença máxima de três estudantes entre turmas."},409);
  const auditDetails=JSON.stringify({proposalId:id,inputHash:current.hash,classCounts:Object.fromEntries(counts)}),writes=[...results.map(result=>env.DB.prepare("UPDATE class_students SET class_id=?,distribution_result=?,manual_review=?,updated_at=? WHERE id=? AND removed_at IS NULL AND EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='approved' AND invalidated_at IS NULL)").bind(result.destinationClass,result.status,result.manualReview?1:0,now,result.studentId,id)),env.DB.prepare("UPDATE distribution_proposals SET status='applied',applied_at=? WHERE id=? AND status='approved' AND invalidated_at IS NULL").bind(now,id),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) SELECT ?,'distribution_applied',?,? WHERE EXISTS (SELECT 1 FROM distribution_proposals WHERE id=? AND status='applied' AND invalidated_at IS NULL AND applied_at=?)").bind(actorId,auditDetails,now,id,now)];
  let batch:Awaited<ReturnType<typeof env.DB.batch>>;try{batch=await env.DB.batch(writes)}catch{return json({error:"Outra distribuição foi aplicada em simultâneo. Atualize os dados antes de continuar."},409)}const transition=batch[results.length];if(!transition?.meta.changes){const latest=await env.DB.prepare("SELECT status FROM distribution_proposals WHERE id=?").bind(id).first<{status:string}>();if(latest?.status==="applied")return json({ok:true,status:"applied",alreadyApplied:true});return json({error:"O estado da proposta mudou durante a aplicação. Atualize e tente novamente."},409)}return json({ok:true,status:"applied"});
 }
 return json({error:"Operação não suportada."},405);
}

async function handleAdminAudit(env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 const [adminActions,classActions]=await Promise.all([
  env.DB.prepare(`SELECT a.id,a.action,a.details,a.created_at,u.id actor_id,u.full_name actor_name,u.email actor_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END actor_student_number,NULL class_id FROM admin_audit_log a JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 150`).all(),
  env.DB.prepare(`SELECT a.id,a.action,a.details,a.created_at,u.id actor_id,u.full_name actor_name,u.email actor_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END actor_student_number,a.class_id FROM class_audit_log a JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 150`).all()
 ]);
 const actions=[...adminActions.results,...classActions.results].sort((left,right)=>Number((right as {created_at:number}).created_at)-Number((left as {created_at:number}).created_at)).slice(0,200);
 return json({actions});
}

function validationExportDate(value:unknown){return value?new Date(Number(value)).toLocaleString("pt-PT",{timeZone:"Europe/Lisbon"}):""}
function validationExportClass(value:unknown){const number=Number(value);return value===null||value===undefined||value===""||!Number.isInteger(number)||number<1?"":`Turma ${number}`}
const validationExportLabels:Record<string,string>={stay:"Ficar",move:"Mudar",friends_other_class:"Tem amigos noutra turma",integration_bullying:"Sofre bullying / está mal integrado",other:"Outro — valor livre"};
const validationClassStatusLabels:Record<string,string>={draft:"Em preenchimento",submitted:"Submetida",reopened:"Reaberta",review:"Em revisão",validated:"Validada",published:"Publicada"};
const validationResultLabels:Record<string,string>={pending:"Pendente",stayed_by_choice:"Ficou por decisão",fallback:"Fallback — manteve a turma de origem",moved:"Mudou de turma"};
type ValidationExportStudent={id:string;full_name:string;student_number:string;class_id:number;class_status:string;preference:string;student_decision:string|null;decision_at:number|null;preference_locked_at:number;preference_source:string;preference_admin_reason:string|null;notes:string|null;considerations:string;manual_review:number;distribution_result:string|null;exception_points:number;exception_reviewed_at:number|null;exception_reviewed_by:string|null;exception_review_reason:string|null;additional_info_validation_note:string|null;additional_info_review_status:string|null;created_at:number;updated_at:number};
type ValidationExportDestination={student_id:string;destination_class:number;rank:number};
type ValidationExportProposal={id:string;seed:string;status:string;result_snapshot:string;input_hash:string|null;engine_version:string;invalidated_at:number|null;created_at:number;approved_at:number|null;applied_at:number|null;published_at:number|null};
type ValidationExportResult={studentId:string;originClass:number;destinationClass:number;rank:number|null;status:string;points:number;manualReview:boolean;randomized?:boolean;manualOverride?:boolean};

const xlsxCrcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit+=1)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function xlsxCrc32(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes)value=xlsxCrcTable[(value^byte)&0xff]^(value>>>8);return (value^0xffffffff)>>>0;}
function xlsxU16(view:DataView,offset:number,value:number){view.setUint16(offset,value,true)}
function xlsxU32(view:DataView,offset:number,value:number){view.setUint32(offset,value>>>0,true)}
function xlsxZip(files:Array<[string,string]>){
 const encoder=new TextEncoder(),locals:Uint8Array[]=[],central:Uint8Array[]=[],entries:Array<{name:Uint8Array,data:Uint8Array,crc:number,offset:number}>=[];let offset=0;
 for(const [name,content] of files){const nameBytes=encoder.encode(name),data=encoder.encode(content),crc=xlsxCrc32(data),local=new Uint8Array(30+nameBytes.length+data.length),localView=new DataView(local.buffer);xlsxU32(localView,0,0x04034b50);xlsxU16(localView,4,20);xlsxU16(localView,6,0);xlsxU16(localView,8,0);xlsxU16(localView,10,0);xlsxU16(localView,12,0);xlsxU32(localView,14,crc);xlsxU32(localView,18,data.length);xlsxU32(localView,22,data.length);xlsxU16(localView,26,nameBytes.length);xlsxU16(localView,28,0);local.set(nameBytes,30);local.set(data,30+nameBytes.length);locals.push(local);entries.push({name:nameBytes,data,crc,offset});offset+=local.length;}
 for(const entry of entries){const header=new Uint8Array(46+entry.name.length),view=new DataView(header.buffer);xlsxU32(view,0,0x02014b50);xlsxU16(view,4,20);xlsxU16(view,6,20);xlsxU16(view,8,0);xlsxU16(view,10,0);xlsxU16(view,12,0);xlsxU16(view,14,0);xlsxU32(view,16,entry.crc);xlsxU32(view,20,entry.data.length);xlsxU32(view,24,entry.data.length);xlsxU16(view,28,entry.name.length);xlsxU16(view,30,0);xlsxU16(view,32,0);xlsxU16(view,34,0);xlsxU16(view,36,0);xlsxU32(view,38,0);xlsxU32(view,42,entry.offset);header.set(entry.name,46);central.push(header);}
 const centralOffset=offset,centralSize=central.reduce((sum,item)=>sum+item.length,0),end=new Uint8Array(22);const endView=new DataView(end.buffer);xlsxU32(endView,0,0x06054b50);xlsxU16(endView,4,0);xlsxU16(endView,6,0);xlsxU16(endView,8,entries.length);xlsxU16(endView,10,entries.length);xlsxU32(endView,12,centralSize);xlsxU32(endView,16,centralOffset);xlsxU16(endView,20,0);const output=new Uint8Array(offset+centralSize+end.length);let cursor=0;for(const item of locals){output.set(item,cursor);cursor+=item.length;}for(const item of central){output.set(item,cursor);cursor+=item.length;}output.set(end,cursor);return output;
}

async function handlePlacementWorkbench(request:Request,env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);const actorId=user.actorId||user.id;
 if(request.method==="GET"){
  const [students,destinations,classes]=await Promise.all([env.DB.prepare("SELECT id,full_name,student_number,class_id,student_decision,preference_source,preference_admin_reason,notes,considerations,exception_points,exception_reviewed_at,exception_review_reason,additional_info_validation,additional_info_validation_note,additional_info_review_status,distribution_result FROM class_students WHERE removed_at IS NULL ORDER BY class_id,full_name COLLATE NOCASE").all(),env.DB.prepare("SELECT student_id,destination_class,rank FROM student_destinations ORDER BY student_id,rank").all(),env.DB.prepare("SELECT id FROM classes ORDER BY id").all<{id:number}>()]);
   return json({students:students.results,destinations:destinations.results,activeClasses:classes.results.map(row=>row.id)});
 }
  if(request.method==="PATCH"){
   const body=await parseJson(request),studentId=String(body?.studentId||""),status=String(body?.status||"");if(status!=="valid"&&status!=="invalid")return json({error:"Selecione Informação válida ou Informação inválida."},400);
   const activeProposal=await env.DB.prepare("SELECT id FROM distribution_proposals WHERE invalidated_at IS NULL AND (status='published' OR (status='applied' AND published_at IS NULL)) LIMIT 1").first();if(activeProposal)return json({error:"Conclua primeiro a publicação ou distribuição ativa antes de alterar esta validação."},409);
   const student=await env.DB.prepare("SELECT id,class_id,notes FROM class_students WHERE id=? AND removed_at IS NULL").bind(studentId).first<{id:string;class_id:number;notes:string|null}>();if(!student?.notes?.trim())return json({error:"Este aluno não tem informação adicional para validar."},400);
   const now=Date.now(),details={studentId,classId:student.class_id,status};const writes=[env.DB.prepare("UPDATE class_students SET additional_info_review_status=?,exception_reviewed_at=?,exception_reviewed_by=?,exception_review_reason=?,manual_review=0,updated_at=? WHERE id=?").bind(status,now,actorId,status==="valid"?"Informação classificada como válida pela CC.":"Informação classificada como inválida pela CC.",now,studentId),env.DB.prepare("UPDATE distribution_proposals SET invalidated_at=? WHERE invalidated_at IS NULL AND (status IN ('draft','approved') OR (status='applied' AND published_at IS NOT NULL))").bind(now),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'student_additional_info_reviewed',?,?)").bind(actorId,JSON.stringify(details),now),env.DB.prepare("INSERT INTO class_audit_log (class_id,student_id,actor_user_id,action,details,created_at) VALUES (?,?,?,'student_additional_info_reviewed',?,?)").bind(student.class_id,studentId,actorId,JSON.stringify(details),now)];
  if(status==="invalid")writes.push(env.DB.prepare("UPDATE class_students SET considerations='[]',exception_points=0,additional_info_validation=NULL,additional_info_validation_note=NULL WHERE id=?").bind(studentId));await env.DB.batch(writes);return json({ok:true,status});
 }
 if(request.method==="PUT"){
   const body=await parseJson(request),studentId=String(body?.studentId||""),reason=String(body?.reason||"").trim().slice(0,500),decision=String(body?.decision||""),rawDestinations=Array.isArray(body?.destinations)?body.destinations.map(Number):[],rawValidationTypes=Array.isArray(body?.validationTypes)?body.validationTypes.map(String):[],requestedReviewStatus=body?.additionalInfoStatus===null?null:String(body?.additionalInfoStatus||""),reviewStatus=decision==="stay"?null:requestedReviewStatus==="valid"||requestedReviewStatus==="invalid"?requestedReviewStatus:null,validationTypes=decision==="stay"||reviewStatus==="invalid"?[]:[...new Set(rawValidationTypes)],customPoints=decision==="stay"||reviewStatus==="invalid"?0:Number(body?.customPoints||0),destinations=decision==="move"?rawDestinations:[];
  if(decision!=="stay"&&decision!=="move")return json({error:"Selecione se o estudante mantém a turma ou pretende mudar."},400);
  if(decision==="move"&&!destinations.length)return json({error:"Indique pelo menos uma preferência para um estudante que pretende mudar."},400);
  if(validationTypes.some(value=>!["friends_other_class","integration_bullying","other"].includes(value)))return json({error:"Critério de pontuação inválido."},400);
  const fixedPoints=(validationTypes.includes("friends_other_class")?1:0)+(validationTypes.includes("integration_bullying")?2:0),hasOther=validationTypes.includes("other"),points=fixedPoints+(hasOther?customPoints:0);if(!Number.isInteger(customPoints)||customPoints<0||points>5)return json({error:`O valor livre deve ser inteiro e o total não pode ultrapassar 5 pontos.`},400);
  if(new Set(destinations).size!==destinations.length||destinations.some(value=>!Number.isInteger(value)))return json({error:"Preferências inválidas."},400);
    const [student,classes,activeProposal,currentDestinations]=await Promise.all([env.DB.prepare("SELECT id,class_id,student_decision,preference_admin_reason,notes,considerations,exception_points,additional_info_review_status FROM class_students WHERE id=? AND removed_at IS NULL").bind(studentId).first<{id:string;class_id:number;student_decision:string|null;preference_admin_reason:string|null;notes:string|null;considerations:string;exception_points:number;additional_info_review_status:string|null}>(),env.DB.prepare("SELECT id FROM classes ORDER BY id").all<{id:number}>(),env.DB.prepare("SELECT id,status FROM distribution_proposals WHERE invalidated_at IS NULL AND (status='published' OR (status='applied' AND published_at IS NULL)) ORDER BY created_at DESC LIMIT 1").first<{id:string;status:string}>(),env.DB.prepare("SELECT destination_class FROM student_destinations WHERE student_id=? ORDER BY rank").bind(studentId).all<{destination_class:number}>()]);
  const activeClasses=new Set(classes.results.map(row=>row.id));if(!student||destinations.includes(student.class_id)||destinations.some(value=>!activeClasses.has(value)))return json({error:"Estudante ou destinos inválidos; selecione apenas turmas ativas."},400);
  if(activeProposal)return json({error:"Existe uma distribuição aplicada ou publicada. Conclua esse ciclo antes de alterar preferências."},409);if(student.notes?.trim()&&!reviewStatus)return json({error:"Selecione Informação válida ou Informação inválida antes de guardar."},400);
   const previousDestinations=currentDestinations.results.map(row=>row.destination_class),preferenceChanged=student.student_decision!==decision||JSON.stringify(previousDestinations)!==JSON.stringify(destinations),pointsChanged=student.considerations!==JSON.stringify(validationTypes)||Number(student.exception_points||0)!==points;if((preferenceChanged||pointsChanged)&&!reason)return json({error:"A justificação administrativa é obrigatória para esta alteração."},400);
  const now=Date.now(),primaryValidation=validationTypes[0]||null,reviewed=Boolean(validationTypes.length||reviewStatus),preferenceReason=preferenceChanged?reason:student.preference_admin_reason,writes=[env.DB.prepare("DELETE FROM student_destinations WHERE student_id=?").bind(studentId),env.DB.prepare("UPDATE class_students SET preference=?,student_decision=?,decision_at=?,preference_source='admin',preference_admin_reason=?,considerations=?,exception_points=?,exception_reviewed_at=?,exception_reviewed_by=?,exception_review_reason=?,additional_info_validation=?,additional_info_validation_note=?,additional_info_review_status=?,manual_review=0,distribution_result='pending',updated_at=? WHERE id=?").bind(decision,decision,now,preferenceReason,JSON.stringify(validationTypes),points,reviewed?now:null,reviewed?actorId:null,hasOther?reason:reviewStatus?reviewStatus==="valid"?"Informação classificada como válida pela CC.":"Informação classificada como inválida pela CC.":null,primaryValidation,hasOther?reason:null,reviewStatus,now,studentId)];
  if(destinations.length){const values=destinations.map(()=>"(?,?,?,?,?)").join(","),bindings=destinations.flatMap((destination,rank)=>[studentId,destination,rank+1,actorId,now]);writes.push(env.DB.prepare(`INSERT INTO student_destinations (student_id,destination_class,rank,updated_by,updated_at) VALUES ${values}`).bind(...bindings));}
  const auditDetails={studentId,classId:student.class_id,preferenceChanged,before:{decision:student.student_decision,destinations:previousDestinations,additionalInfoStatus:student.additional_info_review_status},after:{decision,destinations,additionalInfoStatus:reviewStatus},validationTypes,customPoints,totalPoints:points,reason:reason||null};writes.push(env.DB.prepare("UPDATE distribution_proposals SET invalidated_at=? WHERE invalidated_at IS NULL AND (status IN ('draft','approved') OR (status='applied' AND published_at IS NOT NULL))").bind(now),env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'student_preferences_admin_updated',?,?)").bind(actorId,JSON.stringify(auditDetails),now),env.DB.prepare("INSERT INTO class_audit_log (class_id,student_id,actor_user_id,action,details,created_at) VALUES (?,?,?,'student_admin_placement_updated',?,?)").bind(student.class_id,studentId,actorId,JSON.stringify(auditDetails),now));await env.DB.batch(writes);return json({ok:true});
 }
 return json({error:"Operação não suportada."},405);
}
function xlsxXml(value:unknown){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
function xlsxColumnName(index:number){let value="",number=index+1;while(number){const remainder=(number-1)%26;value=String.fromCharCode(65+remainder)+value;number=Math.floor((number-1)/26);}return value;}
function xlsxCell(reference:string,value:unknown,style:number){return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xlsxXml(value)}</t></is></c>`;}
function xlsxRow(row:number,values:unknown[],style:number,height:number){return `<row r="${row}" ht="${height}" customHeight="1">${values.map((value,index)=>xlsxCell(`${xlsxColumnName(index)}${row}`,value,style)).join("")}</row>`;}

async function handleValidationExport(env:Env,user:CurrentUser):Promise<Response>{
 if(!canManageAll(user))return json({error:"Acesso reservado ao Núcleo de Gestão."},403);
 const [students,destinations,proposal]=await Promise.all([
  env.DB.prepare(`SELECT s.id,s.full_name,s.student_number,s.class_id,c.status class_status,s.preference,s.student_decision,s.decision_at,s.preference_locked_at,s.preference_source,s.preference_admin_reason,s.notes,s.considerations,s.manual_review,s.distribution_result,s.exception_points,s.exception_reviewed_at,s.exception_reviewed_by,s.exception_review_reason,s.additional_info_validation_note,s.additional_info_review_status,s.created_at,s.updated_at FROM class_students s JOIN classes c ON c.id=s.class_id WHERE s.removed_at IS NULL ORDER BY s.class_id,s.full_name COLLATE NOCASE,s.student_number`).all<ValidationExportStudent>(),
  env.DB.prepare("SELECT student_id,destination_class,rank FROM student_destinations ORDER BY student_id,rank").all<ValidationExportDestination>(),
  env.DB.prepare("SELECT id,seed,status,result_snapshot,input_hash,engine_version,invalidated_at,created_at,approved_at,applied_at,published_at FROM distribution_proposals WHERE invalidated_at IS NULL ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'applied' THEN 1 WHEN 'approved' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,created_at DESC LIMIT 1").first<ValidationExportProposal>(),
 ]);
 const destinationsByStudent=new Map<string,ValidationExportDestination[]>();
 for(const row of destinations.results)destinationsByStudent.set(row.student_id,[...(destinationsByStudent.get(row.student_id)||[]),row]);
 let proposalResults:ValidationExportResult[]=[];try{const parsed=JSON.parse(proposal?.result_snapshot||"[]");if(Array.isArray(parsed))proposalResults=parsed}catch{}const resultByStudent=new Map(proposalResults.map(result=>[result.studentId,result]));
 const headers=["ID interno","Nome completo","Número mecanográfico","Turma registada atual","Turma de origem no cálculo","Estado da turma","Decisão do estudante","Origem da decisão","Preferência inicial registada","Preferências de destino — ordem completa","Critérios validados","Códigos dos critérios","Pontos fixos","Pontos de valor livre — Outro","Pontos totais registados","Informação adicional do aluno","Classificação da informação adicional","Nota de validação — Outro","Revisto em","ID do revisor","Fundamento da revisão","Justificação da alteração de preferências","Revisão manual pendente","Resultado guardado no aluno","Turma final calculada","Posição da preferência obtida","Estado do resultado calculado","Pontos usados no cálculo","Exigiu revisão manual","Sorteio decisivo","Alteração manual do destino","ID da proposta","Estado da proposta","Seed do sorteio","Hash dos dados de entrada","Versão do motor","Proposta criada em","Aprovada em","Aplicada em","Publicada em","Invalidada em","Preferência bloqueada em","Decisão submetida em","Registo criado em","Última atualização em"];
 const exportRows=students.results.map((student)=>{
  let considerations:string[]=[];try{const parsed=JSON.parse(student.considerations||"[]");if(Array.isArray(parsed))considerations=parsed.filter((value):value is string=>typeof value==="string"&&["friends_other_class","integration_bullying","other"].includes(value))}catch{}
  const orderedDestinations=(destinationsByStudent.get(student.id)||[]).map(row=>`${row.rank}.ª: ${validationExportClass(row.destination_class)}`).join("; ");
  const result=resultByStudent.get(student.id),fixedPoints=(considerations.includes("friends_other_class")?1:0)+(considerations.includes("integration_bullying")?2:0),otherPoints=considerations.includes("other")?Math.max(0,Number(student.exception_points||0)-fixedPoints):0;
  const values=[student.id,student.full_name,student.student_number,validationExportClass(student.class_id),validationExportClass(result?.originClass),validationClassStatusLabels[student.class_status]||student.class_status,validationExportLabels[student.student_decision||""]||"A aguardar decisão",student.preference_source,validationExportLabels[student.preference]||student.preference,orderedDestinations,considerations.map(value=>validationExportLabels[value]||value).join("; "),considerations.join("; "),fixedPoints,otherPoints,Number(student.exception_points||0),student.notes||"",student.additional_info_review_status==="valid"?"Informação válida":student.additional_info_review_status==="invalid"?"Informação inválida":student.notes?"Por validar":"Sem informação",student.additional_info_validation_note||"",validationExportDate(student.exception_reviewed_at),student.exception_reviewed_by||"",student.exception_review_reason||"",student.preference_admin_reason||"",Number(student.manual_review)?"Sim":"Não",validationResultLabels[student.distribution_result||"pending"]||student.distribution_result||"Pendente",validationExportClass(result?.destinationClass),result?.rank?`${result.rank}.ª preferência`:result?"Sem preferência / origem":"",result?validationResultLabels[result.status]||result.status:"Sem proposta",result?.points??"",result?.manualReview?"Sim":"Não",result?.randomized?"Sim":"Não",result?.manualOverride?"Sim":"Não",proposal?.id||"",proposal?.status||"Sem proposta",proposal?.seed||"",proposal?.input_hash||"",proposal?.engine_version||"",validationExportDate(proposal?.created_at),validationExportDate(proposal?.approved_at),validationExportDate(proposal?.applied_at),validationExportDate(proposal?.published_at),validationExportDate(proposal?.invalidated_at),validationExportDate(student.preference_locked_at),validationExportDate(student.decision_at),validationExportDate(student.created_at),validationExportDate(student.updated_at)];
  return values;
 });
 const exportData=exportRows;
 const widths=headers.map(header=>header.length>30?34:header.length<18?16:24);
 const columns=widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join("");
 const lastRow=exportData.length+3;
 const lastColumn=xlsxColumnName(headers.length-1),sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols><sheetData>${xlsxRow(1,["Gestor Universitário — auditoria externa das pautas de colocação"],1,30)}${xlsxRow(2,[`Exportado em ${validationExportDate(Date.now())} · Dados confidenciais · ${proposal?`Proposta ${proposal.id} (${proposal.status})`:"Sem proposta calculada"}`],2,24)}${xlsxRow(3,headers,3,36)}${exportData.map((values,index)=>xlsxRow(index+4,values,index%2?5:4,42)).join("")}</sheetData><autoFilter ref="A3:${lastColumn}${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
 const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="3"><font><sz val="10"/><name val="Aptos"/><color rgb="FF171714"/></font><font><b/><sz val="16"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FF171714"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF171714"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6C945"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFDF4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFB8A33D"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyAlignment="1" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" applyAlignment="1" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyAlignment="1" xfId="0"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="0" applyAlignment="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const files:Array<[string,string]>=[
  ["[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
  ["_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ["xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Validador — pessoas" sheetId="1" r:id="rId1"/></sheets></workbook>`],
  ["xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ["xl/styles.xml",stylesXml],
  ["xl/worksheets/sheet1.xml",sheetXml],
 ];
 return new Response(xlsxZip(files),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="auditoria-pautas-colocacao-${new Date().toISOString().slice(0,10)}.xlsx`}});
}

async function handleAnnouncements(request: Request, env: Env, user: CurrentUser): Promise<Response> {
  if (!await isModuleEnabled(env, "announcements.feed")) return moduleDisabled();
  const publishingEnabled = await isModuleEnabled(env, "announcements.publishing");
  const canPublish = Boolean(publishingEnabled && user.commissionPosition);
  const canViewAuthorIdentifiers = user.role === "admin" || Boolean(user.commissionPosition);
  if (request.method === "GET") {
    const announcements = await env.DB.prepare("SELECT a.id,a.title,a.body,a.priority,a.status,a.author_user_id,a.author_name,a.author_position_code,a.author_position_label,a.published_at,a.expires_at,a.archived_at,u.email AS author_email,CASE WHEN lower(u.email) LIKE 'up_________@%' THEN substr(u.email,3,9) WHEN lower(u.email) LIKE '_________@%' THEN substr(u.email,1,9) ELSE NULL END AS author_student_number FROM announcements a LEFT JOIN users u ON u.id=a.author_user_id WHERE a.status='published' AND (a.expires_at IS NULL OR a.expires_at>?) ORDER BY CASE a.priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,a.published_at DESC LIMIT 100").bind(Date.now()).all<Record<string, unknown>>();
    return json({ announcements: announcements.results.map((announcement) => { const { author_user_id, author_email, author_student_number, ...publicFields } = announcement; return { ...publicFields, body: announcementDisplayHtml(String(announcement.body || "")), ...(canViewAuthorIdentifiers ? { authorId: author_user_id, authorEmail: author_email, authorStudentNumber: author_student_number } : {}) }; }), canPublish, canViewAuthorIdentifiers, publishingEnabled });
  }
  if (!canPublish) return json({ error: "A publicação está reservada a membros da Comissão de Curso com cargo definido." }, 403);
  const body = await parseJson(request);
  if (request.method === "POST") {
    const title = String(body?.title || "").trim().replace(/\s+/g, " ").slice(0, 140);
    const content = sanitizeAnnouncementHtml(String(body?.body || "").trim());
    const plainContent = announcementPlainText(content);
    const priority = String(body?.priority || "normal");
    const curricularUnitId = String(body?.unitId || body?.curricularUnitId || "").trim();
    const expiresAt = body?.expiresAt === null || body?.expiresAt === "" || body?.expiresAt === undefined ? null : Date.parse(String(body.expiresAt));
    if (title.length < 5 || plainContent.length < 10 || plainContent.length > 5000) return json({ error: "Indique um título e uma mensagem completos, até 5000 caracteres." }, 400);
    if (!["normal", "important", "urgent"].includes(priority)) return json({ error: "Prioridade inválida." }, 400);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return json({ error: "A validade deve terminar no futuro." }, 400);
    if (curricularUnitId && !await env.DB.prepare("SELECT id FROM curricular_units WHERE id=? AND active=1").bind(curricularUnitId).first()) return json({ error: "Unidade curricular inválida." }, 400);
    const id = crypto.randomUUID(), now = Date.now(), actorId = user.actorId || user.id;
    const statements = [
      env.DB.prepare("INSERT INTO announcements (id,title,body,priority,status,author_user_id,author_name,author_position_code,author_position_label,published_at,expires_at,created_at,updated_at) VALUES (?,?,?,?,'published',?,?,?,?,?,?,?,?)").bind(id, title, content, priority, user.id, user.fullName, user.commissionPosition, user.commissionPositionLabel || user.commissionPosition, now, expiresAt, now, now),
      env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'announcement_published',?,?)").bind(actorId, JSON.stringify({ id, title, priority, expiresAt }), now),
    ];
    if (curricularUnitId) statements.push(env.DB.prepare("INSERT INTO announcement_curricular_units (announcement_id,curricular_unit_id) VALUES (?,?)").bind(id, curricularUnitId));
    await env.DB.batch(statements);
    return json({ ok: true, id }, 201);
  }
  if (request.method === "PATCH") {
    const id = String(body?.id || ""), status = String(body?.status || "");
    if (!id || status !== "archived") return json({ error: "Ação inválida." }, 400);
    const existing = await env.DB.prepare("SELECT id,author_user_id,status FROM announcements WHERE id=?").bind(id).first<{ id: string; author_user_id: string; status: string }>();
    if (!existing) return json({ error: "Aviso não encontrado." }, 404);
    if (existing.author_user_id !== user.id && !isManagementCore(user)) return json({ error: "Só o autor ou o Núcleo pode arquivar este aviso." }, 403);
    if (existing.status === "archived") return json({ ok: true, alreadyArchived: true });
    const now = Date.now(), actorId = user.actorId || user.id;
    await env.DB.batch([
      env.DB.prepare("UPDATE announcements SET status='archived',archived_at=?,archived_by=?,updated_at=? WHERE id=? AND status='published'").bind(now, actorId, now, id),
      env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'announcement_archived',?,?)").bind(actorId, JSON.stringify({ id }), now),
    ]);
    return json({ ok: true });
  }
  return json({ error: "Operação não suportada." }, 405);
}

type CurricularUnitInput = { code: string; name: string; ects: number; year: number; semester: number; representativeUserId: string };
function curricularUnitInput(body: Record<string, unknown> | null): CurricularUnitInput {
  return {
    code: String(body?.code || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 20),
    name: String(body?.name || "").trim().replace(/\s+/g, " ").slice(0, 160),
    ects: Number(body?.ects),
    year: Number(body?.year),
    semester: Number(body?.semester),
    representativeUserId: String(body?.representativeUserId || ""),
  };
}

function validCurricularUnit(input: CurricularUnitInput): boolean {
  return /^[A-Z0-9._-]{2,20}$/.test(input.code) && input.name.length >= 3 && Number.isFinite(input.ects) && input.ects > 0 && input.ects <= 60 && Number.isInteger(input.year) && input.year >= 1 && input.year <= 6 && [1, 2].includes(input.semester) && Boolean(input.representativeUserId);
}

async function handleCurricularUnits(request: Request, env: Env, user: CurrentUser): Promise<Response> {
  if (!isManagementCore(user)) return json({ error: "Acesso reservado ao Núcleo de Gestão." }, 403);
  if (!await isModuleEnabled(env, request.method === "GET" ? "curricular_units.catalog" : "curricular_units.management")) return moduleDisabled();
  if (request.method === "GET") {
    const [units, representatives] = await Promise.all([
      env.DB.prepare("SELECT cu.id,cu.code,cu.name,cu.ects,cu.study_year,cu.semester,cu.representative_user_id,u.full_name AS representative_name,p.label AS representative_position,cu.created_at,cu.updated_at FROM curricular_units cu JOIN users u ON u.id=cu.representative_user_id LEFT JOIN commission_positions p ON p.code=u.commission_position WHERE cu.active=1 ORDER BY cu.study_year,cu.semester,cu.name COLLATE NOCASE").all<{ id:string;code:string;name:string;ects:number;study_year:number;semester:number;representative_user_id:string;representative_name:string;representative_position:string|null;created_at:number;updated_at:number }>(),
      env.DB.prepare("SELECT u.id,u.full_name AS name,u.email,p.label AS position_label,d.label AS department_label FROM users u JOIN commission_positions p ON p.code=u.commission_position LEFT JOIN commission_departments d ON d.code=u.commission_department WHERE u.status='active' ORDER BY p.rank,u.full_name COLLATE NOCASE").all(),
    ]);
    return json({
      units: units.results.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name, ects: unit.ects, year: unit.study_year, semester: unit.semester, representativeUserId: unit.representative_user_id, representativeName: unit.representative_name, representativePosition: unit.representative_position, createdAt: unit.created_at, updatedAt: unit.updated_at })),
      representatives: representatives.results.map((representative) => {
        const row = representative as { id:string;name:string;email:string;position_label:string|null;department_label:string|null };
        return { id: row.id, fullName: row.name, email: row.email, commissionPosition: row.position_label, department: row.department_label };
      }),
    });
  }
  const body = await parseJson(request), now = Date.now(), actorId = user.actorId || user.id;
  if (request.method === "DELETE") {
    const id = String(body?.id || "");
    if (!id) return json({ error: "Unidade curricular inválida." }, 400);
    const result = await env.DB.prepare("UPDATE curricular_units SET active=0,updated_by=?,updated_at=? WHERE id=? AND active=1").bind(actorId, now, id).run();
    if (!result.meta.changes) return json({ error: "Unidade curricular não encontrada." }, 404);
    await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'curricular_unit_archived',?,?)").bind(actorId, JSON.stringify({ id }), now).run();
    return json({ ok: true });
  }
  const input = curricularUnitInput(body);
  if (!validCurricularUnit(input)) return json({ error: "Preencha código, nome, ECTS, ano, semestre e representante válidos." }, 400);
  const representative = await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active' AND commission_position IS NOT NULL").bind(input.representativeUserId).first();
  if (!representative) return json({ error: "Selecione um membro ativo da Comissão de Curso." }, 400);
  if (request.method === "POST") {
    const id = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO curricular_units (id,code,name,ects,study_year,semester,representative_user_id,active,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)").bind(id, input.code, input.name, input.ects, input.year, input.semester, input.representativeUserId, actorId, actorId, now, now),
        env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'curricular_unit_created',?,?)").bind(actorId, JSON.stringify({ id, ...input }), now),
      ]);
    } catch { return json({ error: "Já existe uma unidade curricular com esse código." }, 409); }
    return json({ ok: true, id }, 201);
  }
  if (request.method === "PUT") {
    const id = String(body?.id || "");
    if (!id) return json({ error: "Unidade curricular inválida." }, 400);
    try {
      const result = await env.DB.prepare("UPDATE curricular_units SET code=?,name=?,ects=?,study_year=?,semester=?,representative_user_id=?,updated_by=?,updated_at=? WHERE id=? AND active=1").bind(input.code, input.name, input.ects, input.year, input.semester, input.representativeUserId, actorId, now, id).run();
      if (!result.meta.changes) return json({ error: "Unidade curricular não encontrada." }, 404);
      await env.DB.prepare("INSERT INTO admin_audit_log (actor_user_id,action,details,created_at) VALUES (?,'curricular_unit_updated',?,?)").bind(actorId, JSON.stringify({ id, ...input }), now).run();
    } catch { return json({ error: "Já existe uma unidade curricular com esse código." }, 409); }
    return json({ ok: true });
  }
  return json({ error: "Operação não suportada." }, 405);
}

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (!validOrigin(request, env)) return json({ error: "Origem do pedido inválida." }, 403);
  if (request.method === "GET" && pathname === "/api/config") {
    try {
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, ...await maintenanceConfig(env), ...await classSettings(env), serverNow:Date.now() });
    } catch (error) {
      console.error("config_fallback", error instanceof Error ? error.message : "unknown");
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, maintenanceMode: env.MAINTENANCE_MODE === "true", maintenanceMessage: "A plataforma encontra-se temporariamente em manutenção." });
    }
  }
  // O esquema é gerido exclusivamente pelas migrações D1. Nunca executar DDL no caminho do pedido.
  if (request.method === "POST" && pathname === "/api/auth/register") return handleRegister(request, env);
  if (request.method === "POST" && pathname === "/api/auth/verify") return handleVerify(request, env);
  if (request.method === "POST" && pathname === "/api/auth/password-reset/request") return handlePasswordResetRequest(request,env);
  if (request.method === "POST" && pathname === "/api/auth/password-reset/confirm") return handlePasswordResetConfirm(request,env);
  if (request.method === "POST" && pathname === "/api/auth/login") return handleLogin(request, env);
  if (request.method === "POST" && pathname === "/api/auth/logout") return handleLogout(request, env);
  if (request.method === "POST" && pathname === "/api/auth/session-preference") return handleSessionPreference(request, env);
  if (request.method === "PATCH" && pathname === "/api/auth/accessibility") return handleAccessibilityPreference(request, env);
  if (request.method === "PUT" && pathname === "/api/admin/preview-user") return handlePreviewUser(request,env);
  if (request.method === "GET" && pathname === "/api/auth/me") {
    const user = await currentUser(request, env);
    return user ? json({ user }) : json({ user: null }, 401);
  }
  if (request.method === "GET" && pathname === "/api/modules") {
    const user = await currentUser(request, env);
    return user ? json({ modules: moduleSnapshot(await moduleStates(env)) }) : json({ error: "Sessão inválida." }, 401);
  }
  if (pathname === "/api/admin/modules" && ["GET", "PUT"].includes(request.method)) {
    const user = await currentUser(request, env);
    return user ? handleAdminModules(request, env, user) : json({ error: "Sessão inválida." }, 401);
  }
  if (pathname === "/api/announcements" && ["GET", "POST", "PATCH"].includes(request.method)) {
    const user = await currentUser(request, env);
    return user ? handleAnnouncements(request, env, user) : json({ error: "Sessão inválida." }, 401);
  }
  if (pathname === "/api/admin/curricular-units" && ["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
    const user = await currentUser(request, env);
    return user ? handleCurricularUnits(request, env, user) : json({ error: "Sessão inválida." }, 401);
  }
  if (isAcademicHubPath(pathname)) {
    const user = await currentUser(request, env);
    return handleAcademicHubRoute(request, env, url, user, (key) => isModuleEnabled(env, key));
  }
  if (pathname === "/api/student/destinations" && ["GET","PUT"].includes(request.method)) {
    const user = await currentUser(request, env); return user ? await isModuleEnabled(env,"classes.preferences") ? handleOwnDestinations(request, env, user) : moduleDisabled() : json({ error:"Sessão inválida." },401);
  }
  if(pathname==="/api/classes/public-pdf"&&request.method==="GET"){const user=await currentUser(request,env);return user?await isModuleEnabled(env,"classes.rosters")?handlePublicClassesPdf(env):moduleDisabled():json({error:"Sessão inválida."},401);}
  if (pathname === "/api/classes" || pathname.startsWith("/api/classes/")) {
    const user = await currentUser(request, env); return user ? await isModuleEnabled(env,"classes.rosters") ? handleClasses(request, env, user, pathname) : moduleDisabled() : json({ error:"Sessão inválida." },401);
  }
  if(pathname==="/api/admin/class-tickets")return json({error:"A funcionalidade de tickets está temporariamente desativada."},404);
  if(pathname==="/api/admin/distribution-check"&&request.method==="GET"){const user=await currentUser(request,env);return user?await isModuleEnabled(env,"classes.placements")?handleDistributionCheckV2(env,user):moduleDisabled():json({error:"Sessão inválida."},401);}
  if(pathname==="/api/admin/placements"&&["GET","PUT","PATCH"].includes(request.method)){const user=await currentUser(request,env);return user?await isModuleEnabled(env,"classes.placements")?handlePlacementWorkbench(request,env,user):moduleDisabled():json({error:"Sessão inválida."},401);}
  if(pathname==="/api/admin/audit"&&request.method==="GET"){const user=await currentUser(request,env);return user?handleAdminAudit(env,user):json({error:"Sessão inválida."},401);}
  if(pathname==="/api/admin/export-decisions"&&request.method==="GET"){const user=await currentUser(request,env);return user?handleValidationExport(env,user):json({error:"Sessão inválida."},401);}
  if(pathname==="/api/admin/export-validation"&&request.method==="GET"){const user=await currentUser(request,env);return user?handleValidationExport(env,user):json({error:"Sessão inválida."},401);}
  if(pathname==="/api/admin/distribution-proposals"&&request.method==="GET"){const user=await currentUser(request,env);return user?await isModuleEnabled(env,"classes.placements")?handleDistributionProposals(request,env,user,"list"):moduleDisabled():json({error:"Sessão inválida."},401);}
  const proposalAction=pathname.match(/^\/api\/admin\/distribution-proposals\/(calculate|review|override|approve|apply|publish|rollback)$/);if(proposalAction&&request.method==="POST"){const user=await currentUser(request,env);return user?await isModuleEnabled(env,"classes.placements")?handleDistributionProposals(request,env,user,proposalAction[1]):moduleDisabled():json({error:"Sessão inválida."},401);}
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
    const metrics: QueryMetrics = { count: 0, startedAt: performance.now(), statements: [] };
    const measuredEnv = { ...env, DB: instrumentDatabase(env.DB, metrics) };
    try {
      if (url.pathname.startsWith("/api/")) {
        const response = withSecurity(await routeApi(request, measuredEnv, url));
        response.headers.set("server-timing", `d1;dur=${(performance.now() - metrics.startedAt).toFixed(1)};desc=\"${metrics.count} queries\"`);
        response.headers.set("x-db-query-count", String(metrics.count));
        if (request.headers.get("x-debug-db") === "1") console.log("db_metrics", JSON.stringify({ path: url.pathname, queries: metrics.count, durationMs: performance.now() - metrics.startedAt, statements: metrics.statements }));
        return response;
      }
      return withSecurity(await env.ASSETS.fetch(request));
    } catch (error) {
      const reference = crypto.randomUUID().slice(0, 8);
      console.error("request_failed", reference, url.pathname, error instanceof Error ? error.stack || error.message : "unknown");
      return withSecurity(json({ error: `Ocorreu um erro inesperado. Referência: ${reference}` }, 500));
    }
  },
} satisfies ExportedHandler<Env>;
