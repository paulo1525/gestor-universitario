/** Prepare reproducible catalogue migrations and upload/verify immutable R2 files.
 * node scripts/import-moodle-materials.mjs prepare <manifest.json>...
 * node scripts/import-moodle-materials.mjs upload <manifest.json>...
 * node scripts/import-moodle-materials.mjs verify <manifest.json>...
 * Binaries and operational receipts stay outside Git. No application deploy.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [action, ...manifestPaths] = process.argv.slice(2);
if (!["prepare", "upload", "verify"].includes(action) || !manifestPaths.length) throw new Error("Use prepare|upload|verify <manifest.json>...");
const manifests = manifestPaths.map((path) => JSON.parse(readFileSync(path, "utf8")));
const files = manifests.flatMap((manifest) => manifest.files);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sql = (value) => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const work = join(root, "tmp", "moodle-materials");
mkdirSync(work, { recursive: true });
if (files.length > 200 || files.reduce((sum, file) => sum + file.byteSize, 0) > 1024 ** 3) throw new Error("Staging exceeds the import limit (200 objects / 1 GiB).");
for (const file of files) {
  const bytes = readFileSync(file.localPath);
  if (bytes.length !== file.byteSize || digest(bytes) !== file.sha256) throw new Error(`Source checksum mismatch: ${file.id}`);
  if (!/^[a-f0-9]{64}$/.test(file.sha256) || !file.storageKey.startsWith("materials/")) throw new Error("Invalid storage manifest.");
}

if (action === "prepare") {
  const metadata = manifests.map(({ discipline, academicYear, zipSha256, files: items }) => ({ discipline, academicYear, zipSha256, files: items.map(({ localPath: _localPath, drivePath: _drivePath, ...metadata }) => metadata) }));
  mkdirSync(join(root, "data", "materials"), { recursive: true });
  writeFileSync(join(root, "data", "materials", "moodle-2026-27.json"), JSON.stringify(metadata, null, 2) + "\n");
  const lines = ["-- Official Moodle resources supplied by the user, 2026/2027.", "-- R2 files become ready only after checksum verification. Student rosters excluded."];
  for (const file of files) {
    const slides = ["theory", "tutorials", "practical", "seminars"].includes(file.category);
    const values = [file.id, "other", slides ? "slides" : null, file.category, file.title, `Material docente do Moodle · 2026/2027. Origem: ${file.sourcePath}`, file.fileName, file.mimeType, "r2", file.storageKey, "pending", file.byteSize, file.sha256, "original", "published", file.id, 1, 0, 0];
    const columns = "id,material_kind,other_format,resource_category,title,description,file_name,mime_type,storage_backend,storage_key,storage_state,byte_size,checksum_sha256,verification_status,publication_status,version_group,version_number,is_recommended,public_access";
    lines.push(`INSERT OR IGNORE INTO material_catalog (${columns},curricular_unit_id,created_at,updated_at) SELECT ${values.map(sql).join(",")},cu.id,unixepoch()*1000,unixepoch()*1000 FROM curricular_units cu WHERE cu.code=${sql(file.unitCode)} AND cu.active=1;`);
  }
  writeFileSync(join(root, "migrations", "0098_moodle_fisiologia_histologia_materials.sql"), lines.join("\n") + "\n");
  console.log(`Prepared ${files.length} catalogue entries.`);
} else {
  const receiptPath = join(work, `${action}-receipts.json`);
  let receipts = [];
  try { receipts = JSON.parse(readFileSync(receiptPath, "utf8")); } catch { /* First run. */ }
  // Reuse the existing Wrangler OAuth session, never write credentials to a
  // receipt or Git. The REST object endpoint is the one used by Wrangler.
  const authPath = join(homedir(), ".wrangler", "config", "default.toml");
  const token = () => process.env.CLOUDFLARE_API_TOKEN || /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(authPath, "utf8"))?.[1];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "cb6ada4d1d0dd03bcfa13683c6317fe5";
  async function requestObject(file, method) {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/gestor-universitario-materials/objects/${file.storageKey}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetch(endpoint, { method, headers: { authorization: `Bearer ${token()}`, ...(method === "PUT" ? { "content-type": file.mimeType, "cf-r2-storage-class": "Standard", "cf-r2-data-catalog-check": "true" } : {}) }, ...(method === "PUT" ? { body: readFileSync(file.localPath) } : {}), signal: AbortSignal.timeout(300_000) });
      } catch {
        if (attempt < 2) continue;
        throw new Error(`R2 network failure: ${file.id}`);
      }
      if (response.status === 401 && attempt < 2) {
        await response.body?.cancel();
        execFileSync(process.execPath, [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), "whoami"], { cwd: root, stdio: "ignore" });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 500 && attempt < 2) continue;
        throw new Error(`R2 HTTP ${response.status}: ${file.id}`);
      }
      return response;
    }
    throw new Error(`R2 authentication failed: ${file.id}`);
  }
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (receipts.some((receipt) => receipt.storageKey === file.storageKey && receipt.sha256 === file.sha256)) continue;
    if (action === "upload") await (await requestObject(file, "PUT")).body?.cancel();
    else {
      const bytes = Buffer.from(await (await requestObject(file, "GET")).arrayBuffer());
      if (bytes.length !== file.byteSize || digest(bytes) !== file.sha256) throw new Error(`R2 checksum mismatch: ${file.id}`);
    }
    receipts.push({ storageKey: file.storageKey, sha256: file.sha256, byteSize: file.byteSize, checkedAt: new Date().toISOString() });
    writeFileSync(receiptPath, JSON.stringify(receipts, null, 2));
    if ((index + 1) % 10 === 0 || index + 1 === files.length) console.log(`${action}: ${index + 1}/${files.length}`);
  }
  if (action === "verify") {
    // The conditional UPDATE cannot activate a stale/different catalogue version.
    const activation = files.map((file) => `UPDATE material_catalog SET storage_state='ready',updated_at=unixepoch()*1000 WHERE id=${sql(file.id)} AND storage_key=${sql(file.storageKey)} AND checksum_sha256=${sql(file.sha256)} AND byte_size=${file.byteSize} AND storage_backend='r2';`);
    writeFileSync(join(work, "activate.sql"), activation.join("\n") + "\n");
  }
  console.log(`${action} complete: ${receipts.length} verified operations.`);
}
