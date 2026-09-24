import { unzipSync } from "fflate";
import initSqlJs from "sql.js/dist/sql-asm.js";

// Reads a submitted .apkg in the browser so the Worker never parses decks.
// Only the collection database is decompressed; media entries are skipped.

export type AnkiInspection = {
  readable: boolean;
  format: "anki2" | "anki21" | "anki21b";
  deckNames: string[];
  noteTypes: string[];
  noteCount: number;
  cardCount: number;
  untaggedNotes: number;
  reviewCount: number;
  mediaCount: number | null;
};

export type AnkiIssue = { level: "error" | "warning"; code: string; message: string };

let sqlitePromise: ReturnType<typeof initSqlJs> | null = null;

function scalar(db: { exec: (sql: string) => Array<{ values: unknown[][] }> }, sql: string): number {
  const value = db.exec(sql)[0]?.values[0]?.[0];
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

function jsonNames(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "{}")) as Record<string, { name?: string }>;
    return Object.values(parsed).map((item) => String(item?.name ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function inspectApkg(bytes: Uint8Array): Promise<AnkiInspection> {
  const files = unzipSync(bytes, { filter: (file) => file.name.startsWith("collection.") || file.name === "media" });
  const names = Object.keys(files);
  if (names.includes("collection.anki21b")) {
    // Recent Anki exports compress the collection with zstd; the legacy file beside it is a placeholder.
    return { readable: false, format: "anki21b", deckNames: [], noteTypes: [], noteCount: 0, cardCount: 0, untaggedNotes: 0, reviewCount: 0, mediaCount: null };
  }
  const collectionName = names.includes("collection.anki21") ? "collection.anki21" : "collection.anki2";
  const collection = files[collectionName];
  if (!collection) throw new Error("O ficheiro não é um baralho Anki.");

  let mediaCount: number | null = null;
  if (files.media) {
    try { mediaCount = Object.keys(JSON.parse(new TextDecoder().decode(files.media)) as Record<string, string>).length; } catch { mediaCount = null; }
  }

  sqlitePromise ??= initSqlJs();
  const SQL = await sqlitePromise;
  const db = new SQL.Database(collection);
  try {
    const hasTable = (name: string) => scalar(db, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${name}'`) > 0;
    const deckNames = hasTable("decks")
      ? (db.exec("SELECT name FROM decks")[0]?.values ?? []).map((row) => String(row[0]).replaceAll("\x1f", "::"))
      : jsonNames(db.exec("SELECT decks FROM col")[0]?.values[0]?.[0]);
    const noteTypes = hasTable("notetypes")
      ? (db.exec("SELECT name FROM notetypes")[0]?.values ?? []).map((row) => String(row[0]))
      : jsonNames(db.exec("SELECT models FROM col")[0]?.values[0]?.[0]);
    return {
      readable: true,
      format: collectionName === "collection.anki21" ? "anki21" : "anki2",
      deckNames: deckNames.filter((name) => name !== "Default" && name !== "Predefinido"),
      noteTypes,
      noteCount: scalar(db, "SELECT count(*) FROM notes"),
      cardCount: scalar(db, "SELECT count(*) FROM cards"),
      untaggedNotes: scalar(db, "SELECT count(*) FROM notes WHERE trim(tags)=''"),
      reviewCount: hasTable("revlog") ? scalar(db, "SELECT count(*) FROM revlog") : 0,
      mediaCount,
    };
  } finally {
    db.close();
  }
}

/**
 * Submission criteria for Anki decks. Errors block the submission; warnings
 * reach the moderators. Adjust here — the form and the tests read this list.
 */
export function ankiSubmissionIssues(result: AnkiInspection): AnkiIssue[] {
  const issues: AnkiIssue[] = [];
  if (!result.readable) {
    issues.push({ level: "warning", code: "unreadable", message: "Formato recente do Anki: o conteúdo será verificado pela Comissão." });
    return issues;
  }
  if (result.cardCount === 0) issues.push({ level: "error", code: "empty", message: "O baralho não tem cartões." });
  if (result.reviewCount > 0) issues.push({ level: "error", code: "scheduling", message: "Inclui o teu histórico de estudo. Exporta de novo sem informação de agendamento." });
  if (result.noteCount > 0 && result.untaggedNotes / result.noteCount > 0.5) issues.push({ level: "warning", code: "untagged", message: "A maioria dos cartões não tem etiquetas." });
  return issues;
}
