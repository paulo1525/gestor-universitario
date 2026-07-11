import { execFileSync } from "node:child_process";
import { pbkdf2Sync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const database = "gestor-universitario-prod";
const pepper = "gestor-universitario-local-test-pepper-2026";
const password = "TesteLocal!2026";
const salt = "Z2VzdG9yLWxvY2FsLXRlc3Q=";
const iterations = 310_000;
const passwordHash = pbkdf2Sync(`${password}\0${pepper}`, Buffer.from(salt, "base64"), iterations, 32, "sha256").toString("base64");
const now = Date.now();

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWrangler(args) {
  execFileSync("corepack", ["pnpm", "exec", "wrangler", ...args], { cwd: root, stdio: "inherit", shell: true });
}

runWrangler(["d1", "migrations", "apply", database, "--local"]);

const users = [
  ["local-admin", "up202500001@up.pt", "Administrador Local", "admin", 1, null],
  ...Array.from({ length: 5 }, (_, index) => [
    `local-rep-${index + 1}`,
    `up20250001${index + 1}@up.pt`,
    `Representante Teste ${index + 1}`,
    "representative",
    0,
    index + 1,
  ]),
];

const statements = [
  "PRAGMA foreign_keys = OFF",
  "DELETE FROM student_destinations",
  "DELETE FROM distribution_proposals",
  "DELETE FROM class_drafts",
  "DELETE FROM class_tickets",
  "DELETE FROM class_audit_log",
  "DELETE FROM class_students",
  "DELETE FROM admin_audit_log",
  "DELETE FROM auth_audit_log",
  "DELETE FROM password_resets",
  "DELETE FROM pending_registrations",
  "DELETE FROM sessions",
  "UPDATE classes SET submitted_by=NULL",
  "UPDATE app_settings SET updated_by=NULL",
  "DELETE FROM users",
  "UPDATE classes SET status='draft', submitted_at=NULL, submitted_by=NULL, workflow_step=1, draft_revision=0, updated_at=" + now,
  "UPDATE app_settings SET value='false', updated_at=" + now + " WHERE key='maintenance_mode'",
];

for (const [id, email, name, role, adminOverride, representedClass] of users) {
  statements.push(`INSERT INTO users (id,email,full_name,password_hash,password_salt,password_iterations,role,email_verified_at,password_changed_at,status,created_at,updated_at,admin_override,class_representative,represented_class,font_scale,commission_position,commission_department) VALUES (${sql(id)},${sql(email)},${sql(name)},${sql(passwordHash)},${sql(salt)},${iterations},${sql(role)},${now},${now},'active',${now},${now},${adminOverride},${representedClass ? 1 : 0},${representedClass ?? "NULL"},'normal',${role === "admin" ? "'principal_admin'" : "NULL"},${role === "admin" ? "'management'" : "NULL"})`);
}
statements.push("UPDATE classes SET status='submitted',submitted_at=" + now + ",submitted_by='local-admin',workflow_step=3,updated_at=" + now);

const firstNames = ["Ana", "Bruno", "Carolina", "Diogo", "Eva", "Filipe", "Gabriela", "Hugo", "Inês", "João"];
const lastNames = ["Almeida", "Barros", "Costa", "Dias", "Esteves", "Ferreira", "Gomes", "Henriques", "Lopes", "Martins"];
for (let classId = 1; classId <= 5; classId += 1) {
  for (let index = 0; index < 10; index += 1) {
    const id = `local-student-${classId}-${index + 1}`;
    const studentNumber = String(202500100 + (classId - 1) * 10 + index).padStart(9, "0");
    const name = `${firstNames[index]} ${lastNames[(index + classId - 1) % lastNames.length]}`;
    const preference = index % 4 === 0 ? "move" : "stay";
    statements.push(`INSERT INTO class_students (id,class_id,full_name,student_number,preference,preference_locked_at,created_by,created_at,updated_at) VALUES (${sql(id)},${classId},${sql(name)},${sql(studentNumber)},${sql(preference)},${now},${sql(`local-rep-${classId}`)},${now},${now})`);
    if (preference === "move") {
      const destination = classId === 5 ? 1 : classId + 1;
      statements.push(`INSERT INTO student_destinations (student_id,destination_class,rank,updated_by,updated_at) VALUES (${sql(id)},${destination},1,${sql(`local-rep-${classId}`)},${now})`);
    }
  }
}
statements.push(`INSERT INTO class_tickets (id,class_id,category,description,status,response,created_by,created_at,updated_at,request_type,request_payload,execution_result) VALUES ('local-ticket-pending',1,'correct_student','Corrigir o nome de um estudante fictício.','pending',NULL,'local-rep-1',${now},${now},'other','{}',NULL)`);
statements.push(`INSERT INTO class_tickets (id,class_id,category,description,status,response,created_by,resolved_by,created_at,updated_at,request_type,request_payload,decided_at,executed_at,execution_result) VALUES ('local-ticket-resolved',2,'reopen','Pedido fictício já resolvido.','executed','Pedido validado no ambiente local.','local-rep-2','local-admin',${now-60000},${now},'reopen','{}',${now},${now},'Turma reaberta e novamente submetida para demonstração.')`);
statements.push("PRAGMA foreign_keys = ON");

const tempFile = join(root, ".wrangler", "tmp", "local-test-seed.sql");
mkdirSync(dirname(tempFile), { recursive: true });
writeFileSync(tempFile, `${statements.join(";\n")};\n`, "utf8");
runWrangler(["d1", "execute", database, "--local", "--file", tempFile]);

writeFileSync(join(root, ".dev.vars"), [
  `AUTH_PEPPER=${pepper}`,
  "RESEND_API_KEY=local-not-used",
  "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
  "TURNSTILE_SITE_KEY=1x00000000000000000000AA",
  "APP_ORIGIN=http://127.0.0.1:3000",
  "MAINTENANCE_MODE=false",
  "",
].join("\n"), "utf8");

console.log("\nAmbiente local pronto em http://127.0.0.1:3000");
console.log(`Administrador: up202500001@up.pt / ${password}`);
console.log(`Representantes: up202500011@up.pt a up202500015@up.pt / ${password}`);
console.log("Dados: 5 turmas, 10 estudantes fictícios por turma.");
