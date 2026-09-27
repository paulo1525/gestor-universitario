/// <reference types="@cloudflare/workers-types" />

export type MaterialViewType = "catalog" | "anki";
type Env = { DB: D1Database; AUTH_PEPPER?: string; AUTH_RATE_LIMITER?: RateLimit };
const WINDOW_MS = 30 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function missingMigration(reason: unknown) {
  return reason instanceof Error && /no such table.*material_view_/i.test(reason.message);
}

/** One batched read per list, never one query per material. Null means unavailable, not zero. */
export async function materialViewCounts(env: Env, type: MaterialViewType): Promise<Map<string, number> | null> {
  try {
    const rows = await env.DB.prepare("SELECT resource_id,views FROM material_view_totals WHERE resource_type=?").bind(type).all<{ resource_id: string; views: number }>();
    return new Map(rows.results.map((row) => [row.resource_id, Number(row.views)]));
  } catch (reason) {
    if (!missingMigration(reason)) throw reason;
    return null;
  }
}

/** Explicit openings only: GET, HEAD, PDF ranges and prefetches cannot change counts. */
export async function recordMaterialView(request: Request, env: Env, type: MaterialViewType, id: string, user: { id: string } | null, enabled: (key: string) => Promise<boolean>): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Operação não suportada." }, 405);
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Origem inválida." }, 403);
  if (!await enabled("materials.library") || !await enabled("materials.catalog") || (type === "anki" && !await enabled("materials.anki"))) return json({ error: "Módulo indisponível." }, 404);
  // Table names are selected exclusively from a closed union, never from input.
  const sql = type === "catalog"
    ? "SELECT public_access,storage_state,storage_backend FROM material_catalog WHERE id=? AND publication_status='published'"
    : "SELECT public_access,storage_state,storage_backend FROM material_anki_decks WHERE id=? AND publication_status='published'";
  const item = await env.DB.prepare(sql).bind(id).first<Record<string, unknown>>();
  if (!user && (!item || Number(item.public_access) !== 1)) return json({ error: "Sessão inválida." }, 401);
  if (!item) return json({ error: "Material não encontrado." }, 404);
  if ((item.storage_state !== "ready" || !["r2", "external"].includes(String(item.storage_backend)))) return json({ error: "Material indisponível." }, 409);
  const identity = user ? `user:${user.id}` : `ip:${request.headers.get("cf-connecting-ip") || ""}`;
  if (!env.AUTH_PEPPER || (!user && identity === "ip:")) return json({ error: "Contagem indisponível." }, 503);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AUTH_PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`material-views:${identity}`));
  const viewer = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (env.AUTH_RATE_LIMITER && !(await env.AUTH_RATE_LIMITER.limit({ key: `material-views:${viewer}` })).success) return json({ error: "Demasiados pedidos." }, 429);
  const now = Date.now();
  try {
    const result = await env.DB.prepare(`INSERT INTO material_view_visitors(resource_type,resource_id,viewer_hash,viewed_at) VALUES(?,?,?,?)
      ON CONFLICT(resource_type,resource_id,viewer_hash) DO UPDATE SET viewed_at=excluded.viewed_at
      WHERE material_view_visitors.viewed_at<=?`).bind(type, id, viewer, now, now - WINDOW_MS).run();
    const total = await env.DB.prepare("SELECT views FROM material_view_totals WHERE resource_type=? AND resource_id=?").bind(type, id).first<{ views: number }>();
    // Bounded cleanup through the expiry index; cumulative totals are unaffected.
    await env.DB.prepare("DELETE FROM material_view_visitors WHERE rowid IN (SELECT rowid FROM material_view_visitors WHERE viewed_at<? ORDER BY viewed_at LIMIT 100)").bind(now - WINDOW_MS).run();
    return json({ views: Number(total?.views || 0), counted: Number(result.meta.changes) > 0 });
  } catch (reason) {
    if (!missingMigration(reason)) throw reason;
    return json({ error: "Contagem indisponível." }, 503);
  }
}
