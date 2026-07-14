import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  firstAndLastName,
  personDisplay,
  studentNumberFromIdentity,
} from "../lib/person-display.ts";

test("person names are reduced to first and last names", () => {
  assert.equal(firstAndLastName("Maria do Carmo da Silva"), "Maria Silva");
  assert.equal(firstAndLastName("  João   Costa  "), "João Costa");
  assert.equal(firstAndLastName("Madalena"), "Madalena");
});

test("student numbers can be read from explicit values or institutional emails", () => {
  assert.equal(studentNumberFromIdentity("202507850"), "202507850");
  assert.equal(studentNumberFromIdentity(null, "up202507850@up.pt"), "202507850");
  assert.equal(studentNumberFromIdentity(undefined, "202507850@edu.med.up.pt"), "202507850");
  assert.equal(studentNumberFromIdentity(undefined, "nome@up.pt"), "");
});

test("identifiers are only exposed in tooltip and accessible text when authorized", () => {
  const student = { fullName: "Maria do Carmo Silva", studentNumber: "202507850", email: "up202507850@up.pt" };
  assert.deepEqual(personDisplay(student), { name: "Maria Silva", ariaLabel: "Maria Silva" });
  assert.deepEqual(personDisplay(student, { revealIdentifier: true }), {
    name: "Maria Silva",
    identifier: "202507850",
    identifierKind: "student-number",
    title: "N.º mecanográfico: 202507850",
    ariaLabel: "Maria Silva, N.º mecanográfico 202507850",
  });
});

test("accounts without a student number do not expose another identifier", () => {
  const display = personDisplay({ fullName: "Ana Maria Pereira", email: "ana.pereira@up.pt" }, { revealIdentifier: true });
  assert.deepEqual(display, { name: "Ana Pereira", ariaLabel: "Ana Pereira" });
});

test("anonymous submissions never expose the supplied identity", () => {
  assert.deepEqual(personDisplay({ anonymous: true, fullName: "Nome Secreto", studentNumber: "202507850", email: "up202507850@up.pt" }, { revealIdentifier: true }), {
    name: "Envio anónimo",
    ariaLabel: "Envio anónimo",
  });
});

test("authorship identifiers are exposed only in management contexts", async () => {
  const [hub, worker, documents, tickets, announcements, requests, materials, audit] = await Promise.all([
    readFile(new URL("../worker/academic-hub.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/documents-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ticket-admin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/announcements-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/requests-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/material-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/audit-history.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(hub, /authorStudentNumber: revealAuthorIdentity \? row\.author_student_number : undefined/);
  assert.match(hub, /documentDto\(rowObject\(row\), true, isCommission\(user\)\)/);
  assert.match(worker, /created_by_student_number FROM class_tickets/);
  assert.match(documents, /personDisplay\(/);
  assert.match(documents, /revealIdentifier: canManage/);
  assert.match(tickets, /revealIdentifier: true/);
  assert.match(worker, /canViewAuthorIdentifiers = user\.role === "admin" \|\| Boolean\(user\.commissionPosition\)/);
  assert.match(worker, /\.\.\.\(canViewAuthorIdentifiers \? \{ authorId: author_user_id, authorEmail: author_email, authorStudentNumber: author_student_number \} : \{\}\)/);
  assert.match(announcements, /revealIdentifier: canViewAuthorIdentifiers/);
  assert.match(requests, /revealIdentifier: canManage/);
  assert.match(materials, /revealIdentifier: canModerate/);
  assert.match(audit, /revealIdentifier: true/);
  assert.match(hub, /row\.anonymous === 1 && isPrimary\(viewer\)/);
  assert.doesNotMatch(documents, /\{item\.authorName\}/);
});
