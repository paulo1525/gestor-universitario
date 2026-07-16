export const STUDENT_SPECIAL_STATUSES = ["none", "worker_student", "athlete", "other"] as const;

export type StudentSpecialStatus = (typeof STUDENT_SPECIAL_STATUSES)[number];
export type StudentStatusCode = "N" | "TE" | "A" | "O";

export const STUDENT_STATUS_OPTIONS: ReadonlyArray<{
  value: StudentSpecialStatus;
  code: StudentStatusCode;
  label: string;
}> = [
  { value: "none", code: "N", label: "Nenhum" },
  { value: "worker_student", code: "TE", label: "Trabalhador-Estudante" },
  { value: "athlete", code: "A", label: "Atleta" },
  { value: "other", code: "O", label: "Outro" },
];

export function isStudentSpecialStatus(value: unknown): value is StudentSpecialStatus {
  return typeof value === "string" && (STUDENT_SPECIAL_STATUSES as readonly string[]).includes(value);
}

export function studentStatusFromCode(value: unknown): StudentSpecialStatus | undefined {
  const code = String(value ?? "").trim().toLocaleUpperCase("pt-PT");
  return STUDENT_STATUS_OPTIONS.find((option) => option.code === code)?.value;
}

export function studentStatusCode(value: StudentSpecialStatus): StudentStatusCode {
  return STUDENT_STATUS_OPTIONS.find((option) => option.value === value)?.code ?? "N";
}

export function studentStatusLabel(value: StudentSpecialStatus, locale: "pt-PT" | "en" = "pt-PT") {
  if (locale === "pt-PT") return STUDENT_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "Nenhum";
  return ({ none: "None", worker_student: "Working Student", athlete: "Athlete", other: "Other" } as const)[value];
}
