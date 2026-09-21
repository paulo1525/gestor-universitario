/// <reference types="@cloudflare/workers-types" />

// This is an application safeguard, not a Cloudflare billing limit. Other
// callers of the same R2 account and storage usage are outside its scope.
export const R2_MONTHLY_READ_RESERVATION_LIMIT = 100_000;
export type R2ReadReservation = "allowed" | "exhausted" | "unavailable";

export async function reserveR2ReadOperations(
  database: D1Database,
  operations: 1 | 2,
  now = new Date(),
): Promise<R2ReadReservation> {
  const period = now.toISOString().slice(0, 7);
  try {
    const reserved = await database.prepare(`
      INSERT INTO r2_read_budget (period_utc, reserved_operations, operation_limit, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(period_utc) DO UPDATE SET
        reserved_operations = reserved_operations + excluded.reserved_operations,
        updated_at = excluded.updated_at
      WHERE reserved_operations + excluded.reserved_operations <= operation_limit
      RETURNING reserved_operations
    `).bind(period, operations, R2_MONTHLY_READ_RESERVATION_LIMIT, now.getTime()).first<{ reserved_operations: number }>();
    return reserved ? "allowed" : "exhausted";
  } catch {
    // If D1 or the migration is unavailable, do not touch R2.
    return "unavailable";
  }
}
