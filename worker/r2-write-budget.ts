/// <reference types="@cloudflare/workers-types" />

// Silent application safeguards for the R2 free tier. Like the read budget,
// these are not Cloudflare billing limits; they stop the app from writing
// before the account could leave the free allowance. Nothing here is shown to
// students — a refused reservation only surfaces as a generic error.

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

/** Class A operations per UTC month reserved for student uploads (free tier: 1,000,000). */
export const R2_MONTHLY_WRITE_LIMIT = 200_000;
/** Bytes that student submissions may occupy in R2 (free tier: 10 GB-month, shared with the catalog). */
export const R2_SUBMISSION_STORAGE_LIMIT = 6 * GB;

export const USER_DAILY_UPLOAD_BYTES = 500 * MB;
export const USER_DAILY_UPLOAD_FILES = 40;
export const USER_CONCURRENT_UPLOADS = 5;
export const USER_PENDING_REVIEW_BYTES = 1 * GB;

const STORAGE_SCOPE = "material_submissions";

export type BudgetReservation = "allowed" | "exhausted" | "unavailable";

export async function reserveR2WriteOperations(database: D1Database, operations: number, now = new Date()): Promise<BudgetReservation> {
  const period = now.toISOString().slice(0, 7);
  try {
    const reserved = await database.prepare(`
      INSERT INTO r2_write_budget (period_utc, reserved_operations, operation_limit, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(period_utc) DO UPDATE SET
        reserved_operations = reserved_operations + excluded.reserved_operations,
        updated_at = excluded.updated_at
      WHERE reserved_operations + excluded.reserved_operations <= operation_limit
      RETURNING reserved_operations
    `).bind(period, operations, R2_MONTHLY_WRITE_LIMIT, now.getTime()).first<{ reserved_operations: number }>();
    return reserved ? "allowed" : "exhausted";
  } catch {
    return "unavailable";
  }
}

/** Reserves space for a file before any byte reaches R2. */
export async function reserveSubmissionStorage(database: D1Database, bytes: number, now = Date.now()): Promise<BudgetReservation> {
  try {
    const reserved = await database.prepare(`
      INSERT INTO r2_storage_budget (scope, reserved_bytes, byte_limit, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET
        reserved_bytes = reserved_bytes + excluded.reserved_bytes,
        updated_at = excluded.updated_at
      WHERE reserved_bytes + excluded.reserved_bytes <= byte_limit
      RETURNING reserved_bytes
    `).bind(STORAGE_SCOPE, bytes, R2_SUBMISSION_STORAGE_LIMIT, now).first<{ reserved_bytes: number }>();
    return reserved ? "allowed" : "exhausted";
  } catch {
    return "unavailable";
  }
}

/** Returns space when an object is deleted (rejected, abandoned or replaced). */
export function releaseSubmissionStorage(database: D1Database, bytes: number, now = Date.now()): D1PreparedStatement {
  return database.prepare("UPDATE r2_storage_budget SET reserved_bytes = max(0, reserved_bytes - ?), updated_at = ? WHERE scope = ?").bind(bytes, now, STORAGE_SCOPE);
}

export type UserUploadCheck = "allowed" | "daily_limit" | "too_many_uploads" | "pending_limit";

/** Per-student limits over the last 24 hours and the material still awaiting review. */
export async function checkUserUploadAllowance(database: D1Database, userId: string, bytes: number, now = Date.now()): Promise<UserUploadCheck> {
  const since = now - 24 * 60 * 60 * 1000;
  const usage = await database.prepare(`
    SELECT
      (SELECT count(*) FROM material_upload_sessions WHERE user_id = ?1 AND created_at >= ?2) AS files_today,
      (SELECT coalesce(sum(declared_size), 0) FROM material_upload_sessions WHERE user_id = ?1 AND created_at >= ?2) AS bytes_today,
      (SELECT count(*) FROM material_upload_sessions WHERE user_id = ?1 AND status = 'uploading') AS in_progress,
      (SELECT coalesce(sum(s.size_bytes), 0) FROM material_submissions s WHERE s.submitted_by = ?1 AND s.status = 'pending' AND s.storage_backend = 'r2')
        + (SELECT coalesce(sum(a.size_bytes), 0) FROM material_submission_attachments a JOIN material_submissions s ON s.id = a.submission_id WHERE s.submitted_by = ?1 AND s.status = 'pending' AND a.storage_backend = 'r2') AS pending_bytes
  `).bind(userId, since).first<{ files_today: number; bytes_today: number; in_progress: number; pending_bytes: number }>();
  if (!usage) return "allowed";
  if (usage.in_progress >= USER_CONCURRENT_UPLOADS) return "too_many_uploads";
  if (usage.files_today >= USER_DAILY_UPLOAD_FILES || usage.bytes_today + bytes > USER_DAILY_UPLOAD_BYTES) return "daily_limit";
  if (usage.pending_bytes + bytes > USER_PENDING_REVIEW_BYTES) return "pending_limit";
  return "allowed";
}
