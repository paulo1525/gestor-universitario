// Shared rules for student material uploads (browser and Worker).
// Limits are enforced silently: the interface never advertises them and only
// reports a problem when a file actually breaks one.

export type MaterialFileKind = "pdf" | "docx" | "pptx" | "zip" | "apkg" | "image";

const MB = 1024 * 1024;

export const MATERIAL_FILE_LIMITS: Record<MaterialFileKind, number> = {
  pdf: 50 * MB,
  docx: 50 * MB,
  pptx: 50 * MB,
  zip: 50 * MB,
  apkg: 200 * MB,
  image: 10 * MB,
};

export const MATERIAL_MAX_EXAM_PHOTOS = 20;

/** R2 multipart parts must be at least 5 MiB (except the last); 8 MiB keeps write operations low. */
export const MATERIAL_UPLOAD_PART_BYTES = 8 * MB;

export const MATERIAL_KIND_MIME: Record<MaterialFileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  apkg: "application/apkg",
  image: "image/jpeg",
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Kind declared by the file name; the content is verified separately with {@link sniffMaterialKind}. */
export function kindFromFileName(name: string): MaterialFileKind | null {
  const extension = fileExtension(name);
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (extension === "pptx") return "pptx";
  if (extension === "zip") return "zip";
  if (extension === "apkg") return "apkg";
  if (extension in IMAGE_MIME_BY_EXTENSION) return "image";
  return null;
}

export function mimeForFile(name: string, kind: MaterialFileKind): string {
  return kind === "image" ? IMAGE_MIME_BY_EXTENSION[fileExtension(name)] ?? "image/jpeg" : MATERIAL_KIND_MIME[kind];
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);

/**
 * Checks the first bytes of a file against the kind implied by its name.
 * Office documents and APKG are ZIP containers; their inner structure is
 * verified after upload with {@link zipEntryNames}.
 */
export function sniffMaterialKind(firstBytes: Uint8Array, declared: MaterialFileKind): boolean {
  switch (declared) {
    case "pdf":
      return startsWith(firstBytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "image":
      return startsWith(firstBytes, [0xff, 0xd8, 0xff]) // JPEG
        || startsWith(firstBytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG
        || (startsWith(firstBytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(firstBytes, [0x57, 0x45, 0x42, 0x50], 8)); // RIFF....WEBP
    case "docx":
    case "pptx":
    case "zip":
    case "apkg":
      return startsWith(firstBytes, [0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
  }
}

/** Required entries inside ZIP-based kinds. */
export function zipStructureMatches(kind: MaterialFileKind, entries: string[]): boolean {
  const names = new Set(entries);
  if (kind === "docx") return names.has("word/document.xml");
  if (kind === "pptx") return names.has("ppt/presentation.xml");
  if (kind === "apkg") return names.has("collection.anki2") || names.has("collection.anki21") || names.has("collection.anki21b");
  return kind === "zip";
}

/**
 * Locates the ZIP central directory from the archive tail.
 * Returns null when the tail does not contain an end-of-central-directory record.
 */
export function zipCentralDirectoryLocation(tail: Uint8Array, totalSize: number): { offset: number; size: number } | null {
  for (let index = tail.length - 22; index >= 0; index--) {
    if (tail[index] === 0x50 && tail[index + 1] === 0x4b && tail[index + 2] === 0x05 && tail[index + 3] === 0x06) {
      const view = new DataView(tail.buffer, tail.byteOffset + index, 22);
      const size = view.getUint32(12, true), offset = view.getUint32(16, true);
      if (offset === 0xffffffff || size === 0xffffffff) return null; // ZIP64 is not needed for our limits.
      if (offset + size > totalSize) return null;
      return { offset, size };
    }
  }
  return null;
}

/** Reads entry names from a ZIP central directory block. */
export function zipEntryNames(directory: Uint8Array): string[] {
  const names: string[] = [];
  const decoder = new TextDecoder();
  let index = 0;
  while (index + 46 <= directory.length) {
    const view = new DataView(directory.buffer, directory.byteOffset + index);
    if (view.getUint32(0, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(28, true), extraLength = view.getUint16(30, true), commentLength = view.getUint16(32, true);
    names.push(decoder.decode(directory.subarray(index + 46, index + 46 + nameLength)));
    index += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

export type MaterialCategory = "summary" | "notes" | "exam" | "anki" | "other";

/** Category suggested from the file; the student can change it except for exams and Anki decks. */
export function suggestedCategory(kind: MaterialFileKind): MaterialCategory {
  if (kind === "apkg") return "anki";
  if (kind === "image") return "exam";
  if (kind === "zip") return "other";
  return "summary";
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function safeObjectName(name: string): string {
  const cleaned = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "ficheiro").slice(-120);
}
