import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0021_academic_hub.sql", import.meta.url), "utf8");

test("academic hub exposes every requested API surface", () => {
  for (const path of ["/api/calendar-events", "/api/documents", "/api/requests", "/api/commission-directory", "/api/curricular-units", "/api/polls", "/api/dashboard", "/api/search", "/api/material-submissions"]) {
    assert.match(worker, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.match(router, /handleAcademicHubRoute/);
});

test("academic hub schema keeps anonymous identities internally and votes detached", () => {
  assert.match(migration, /anonymous INTEGER NOT NULL/);
  assert.match(migration, /submitted_by TEXT NOT NULL REFERENCES users/);
  assert.match(migration, /voter_hash TEXT NOT NULL/);
  assert.doesNotMatch(migration, /poll_votes[\s\S]*?user_id/);
  assert.match(worker, /row\.anonymous === 1 && isPrimary\(viewer\)/);
  assert.match(worker, /row\.anonymous === 1 && isPrimary\(user\)/);
});

test("uploads are data URLs with explicit type and size validation", () => {
  assert.match(worker, /validDataUrl/);
  assert.match(worker, /8 \* 1024 \* 1024/);
  assert.match(worker, /4 \* 1024 \* 1024/);
  assert.match(worker, /MATERIAL_MIMES/);
});

test("every academic hub surface is controlled by a module key", () => {
  for (const key of ["calendar.events", "calendar.management", "documents.library", "documents.management", "requests.submission", "requests.management", "directory.members", "curricular_units.catalog", "curricular_units.detail", "polls.voting", "polls.management", "dashboard.analytics", "search.global", "materials.library", "materials.submission", "materials.moderation"]) {
    assert.ok(worker.includes(`\"${key}\"`), `missing module check for ${key}`);
  }
});

test("frontend compatibility aliases remain part of the backend contract", () => {
  for (const alias of ["canCreate", "canModerate", "hasVoted", "allowMultiple", "attachmentDataUrl", "commissionPositionLabel", "activeAnnouncements", "openRequests", "pendingMaterials", "activePolls"]) {
    assert.ok(worker.includes(alias), `missing response alias ${alias}`);
  }
});

test("calendar rescheduling updates only dates and reports assessment conflicts", () => {
  assert.match(worker, /request\.method === "PATCH"[\s\S]*UPDATE academic_events SET starts_at=\?,ends_at=\?/);
  assert.match(worker, /academic_event_rescheduled/);
  assert.match(worker, /endsAt < startsAt/);
  assert.match(worker, /academic_event_rescheduled[\s\S]*conflicts:/);
});
