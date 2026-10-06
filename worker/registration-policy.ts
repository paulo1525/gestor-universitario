/// <reference types="@cloudflare/workers-types" />
export async function registrationPolicy(env: { DB: D1Database }, now = Date.now()) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='email_validation_closes_at'").first<{ value: string }>();
  const closesAt = row?.value || null;
  // A malformed stored setting fails closed; only the admin endpoint can change it.
  return { emailValidationClosesAt: closesAt, administratorValidationRequired: Boolean(closesAt && (!Number.isFinite(Date.parse(closesAt)) || now >= Date.parse(closesAt))) };
}

export const ADMIN_VALIDATION_MESSAGE = "A validação por email está encerrada. A sua conta aguarda aprovação por um administrador.";
