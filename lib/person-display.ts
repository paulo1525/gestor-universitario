export type PersonIdentifierKind = "student-number";

export type PersonDisplayInput = {
  fullName?: unknown;
  full_name?: unknown;
  name?: unknown;
  studentNumber?: unknown;
  student_number?: unknown;
  email?: unknown;
  id?: unknown;
  anonymous?: unknown;
  anonymousLabel?: unknown;
};

export type PersonDisplay = {
  name: string;
  identifier?: string;
  identifierKind?: PersonIdentifierKind;
  title?: string;
  ariaLabel: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function firstAndLastName(value: unknown) {
  const parts = clean(value).split(" ").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function studentNumberFromIdentity(
  studentNumber: unknown,
  email?: unknown,
) {
  const explicit = clean(studentNumber);
  if (/^\d{9}$/.test(explicit)) return explicit;
  const localPart = clean(email).toLowerCase().split("@", 1)[0] ?? "";
  const match = localPart.match(/^(?:up)?(\d{9})$/);
  return match?.[1] ?? "";
}

export function personDisplay(
  input: PersonDisplayInput,
  options: { revealIdentifier?: boolean; locale?: "pt-PT" | "en" } = {},
): PersonDisplay {
  if (input.anonymous === true) {
    const anonymousName = clean(input.anonymousLabel)
      || (options.locale === "en" ? "Anonymous submission" : "Envio anónimo");
    return { name: anonymousName, ariaLabel: anonymousName };
  }
  const fullName = clean(input.fullName ?? input.full_name ?? input.name);
  const email = clean(input.email);
  const institutionalId = clean(input.id);
  const studentNumber = studentNumberFromIdentity(
    input.studentNumber ?? input.student_number,
    email,
  );
  const name = firstAndLastName(fullName) || email || institutionalId || studentNumber || "—";
  const identifier = studentNumber;
  const identifierKind: PersonIdentifierKind | undefined = studentNumber ? "student-number" : undefined;

  if (!options.revealIdentifier || !identifier || identifier === name) {
    return { name, ariaLabel: name };
  }

  const label = options.locale === "en" ? "Student number" : "N.º mecanográfico";
  return {
    name,
    identifier,
    identifierKind,
    title: `${label}: ${identifier}`,
    ariaLabel: `${name}, ${label} ${identifier}`,
  };
}
