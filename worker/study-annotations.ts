import type { StudyAnnotation } from "@/lib/study-annotations";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";

type AnnotationUser = { id: string; actorId?: string };
type AnnotationEnv = { DB: D1Database };
type Row = { id: string; paragraph_id: string; start_offset: number; end_offset: number; quote: string; note: string; color: StudyAnnotation["color"]; revision: number; updated_at: number };
const documentId = "neuro-ap1";
const fields = "id,paragraph_id,start_offset,end_offset,quote,note,color,revision,updated_at";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const dto = (row: Row): StudyAnnotation => ({ id: row.id, paragraphId: row.paragraph_id, start: row.start_offset, end: row.end_offset, quote: row.quote, note: row.note, color: row.color, revision: row.revision, updatedAt: row.updated_at });

export async function handleStudyAnnotations(request: Request, env: AnnotationEnv, user: AnnotationUser | null, enabled: (key: string) => Promise<boolean>, paragraphText: (id: string) => string | undefined): Promise<Response> {
  if (!user) return json({ error: "Inicie sessão para consultar os seus apontamentos." }, 401);
  if (!await enabled("materials.library")) return json({ error: "Os materiais estão temporariamente indisponíveis." }, 404);
  // A pré-visualização administrativa nunca permite ler os apontamentos alheios.
  const userId = user.actorId ?? user.id;
  if (request.method === "GET") {
    const result = await env.DB.prepare(`SELECT ${fields} FROM study_annotations WHERE user_id=? AND document_id=? ORDER BY updated_at DESC,id`).bind(userId, documentId).all<Row>();
    return json({ annotations: result.results.map(dto) });
  }
  if (!["PUT", "DELETE"].includes(request.method)) return json({ error: "Operação não suportada." }, 405);
  let body: Record<string, unknown>;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
    const raw = await request.text();
    if (raw.length > 30000) throw new Error();
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return json({ error: "Apontamento inválido." }, 400); }
  const { id, revision } = body;
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id) || !Number.isSafeInteger(revision) || Number(revision) < 0) return json({ error: "Apontamento inválido." }, 400);
  if (request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM study_annotations WHERE user_id=? AND document_id=? AND id=? AND revision=?").bind(userId, documentId, id, revision).run();
    if (!result.meta.changes) {
      const current = await env.DB.prepare("SELECT id FROM study_annotations WHERE user_id=? AND document_id=? AND id=?").bind(userId, documentId, id).first();
      if (current) return json({ error: "O apontamento foi alterado noutro separador. Atualize a lista antes de o remover." }, 409);
    }
    return json({ ok: true });
  }
  const { paragraphId, start, end, quote, note, color } = body;
  const source = typeof paragraphId === "string" ? paragraphText(paragraphId) : undefined;
  if (typeof paragraphId !== "string" || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Number(start) < 0 || Number(end) < Number(start) || typeof quote !== "string" || quote.length > 4000 || typeof note !== "string" || note.length > 12000 || (!quote && !note.trim()) || !["yellow", "green", "blue", "pink"].includes(String(color))) return json({ error: "Selecione um trecho válido ou escreva uma nota (até 12 000 caracteres)." }, 400);
  const validAnchor = source !== undefined && Number(end) <= source.length && source.slice(Number(start), Number(end)) === quote;
  if (!validAnchor) {
    // A revised lesson must not make a previously saved personal note uneditable.
    // Only the owner can retain an existing anchor; new or changed anchors must
    // still match the current source. The UPDATE below enforces its revision.
    const previous = Number(revision) > 0 ? await env.DB.prepare(`SELECT ${fields} FROM study_annotations WHERE user_id=? AND document_id=? AND id=?`).bind(userId, documentId, id).first<Row>() : null;
    if (!previous || previous.paragraph_id !== paragraphId || previous.start_offset !== start || previous.end_offset !== end || previous.quote !== quote) return json({ error: "O trecho já não corresponde ao texto da aula. Volte a selecioná-lo." }, 400);
  }
  const safeNote = sanitizeRichTextHtml(note);
  if (safeNote.length > 12000 || (!quote && !richTextPlainText(safeNote))) return json({ error: "Escreva uma nota válida (até 12 000 caracteres)." }, 400);
  const now = Date.now();
  let changes: number;
  if (revision === 0) {
    const result = await env.DB.prepare(`INSERT INTO study_annotations (user_id,document_id,id,paragraph_id,start_offset,end_offset,quote,note,color,revision,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM study_annotations WHERE user_id=? AND document_id=?) < 1000
      ON CONFLICT(user_id,document_id,id) DO NOTHING`).bind(userId, documentId, id, paragraphId, start, end, quote, safeNote, color, now, now, userId, documentId).run();
    changes = result.meta.changes;
  } else {
    const result = await env.DB.prepare("UPDATE study_annotations SET paragraph_id=?,start_offset=?,end_offset=?,quote=?,note=?,color=?,revision=revision+1,updated_at=? WHERE user_id=? AND document_id=? AND id=? AND revision=?").bind(paragraphId, start, end, quote, safeNote, color, now, userId, documentId, id, revision).run();
    changes = result.meta.changes;
  }
  const saved = await env.DB.prepare(`SELECT ${fields} FROM study_annotations WHERE user_id=? AND document_id=? AND id=?`).bind(userId, documentId, id).first<Row>();
  // Retentar uma criação após falha de rede não duplica nem apaga o conteúdo.
  const same = saved && saved.paragraph_id === paragraphId && saved.start_offset === start && saved.end_offset === end && saved.quote === quote && saved.note === safeNote && saved.color === color;
  if (!changes && !(revision === 0 && same)) return json({ error: saved ? "Este apontamento foi alterado noutro separador. O seu rascunho foi mantido; atualize a lista para consultar a versão guardada." : "Não foi possível guardar. Atualize a lista; cada aula permite até 1000 apontamentos." }, 409);
  return json({ annotation: dto(saved!) });
}
