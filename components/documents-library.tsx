"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  ChevronLeft,
  Download,
  Eye,
  FileArchive,
  FileText,
  GraduationCap,
  LockKeyhole,
  Tags,
  Trash2,
  Type,
  Users,
  X,
  Pencil,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { CancelButton, FormActions, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FileUploadField } from "@/components/file-upload-field";
import { ModuleGuard } from "@/components/module-guard";
import { useModuleEnabled } from "@/components/use-module-enabled";
import styles from "@/components/documents-library.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import { useFloatingAction } from "@/components/floating-actions";

const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;
const FLOATING_DELETE_ICON = <Trash2 aria-hidden="true" />;

type DateInput = string | number;
type DocumentItem = {
  id: string;
  title: string;
  description: string;
  type: string;
  visibility: string;
  fileName: string;
  fileUrl: string;
  unitId: string;
  unitName: string;
  authorName: string;
  authorEmail: string;
  authorStudentNumber: string;
  authorId: string;
  createdAt: DateInput;
};
type Unit = { id: string; code: string; name: string };
type Notice = { kind: ToastKind; message: string } | null;

const typeLabels: Record<string, string> = {
  document: "Documento",
  minutes: "Ata",
  regulation: "Regulamento",
  form: "Formul\u00e1rio",
};
const visibilityLabels: Record<string, string> = {
  authenticated: "Estudantes autenticados",
  commission: "Comiss\u00e3o de Curso",
  public: "P\u00fablico",
};

function first(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (raw[key] != null) return raw[key];
  return undefined;
}

function dateInput(raw: unknown): DateInput {
  return typeof raw === "number" ? raw : String(raw || new Date().toISOString());
}

function formatCreatedAt(value: DateInput) {
  const created = new Date(value);
  return Number.isNaN(created.getTime())
    ? "Data por confirmar"
    : new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(created);
}

function normalise(raw: Record<string, unknown>): DocumentItem {
  const unit = (raw.unit && typeof raw.unit === "object" ? raw.unit : {}) as Record<string, unknown>;
  return {
    id: String(raw.id),
    title: String(raw.title || "Documento"),
    description: String(raw.description || ""),
    type: String(first(raw, "type", "documentType", "document_type") || "document"),
    visibility: String(raw.visibility || "authenticated"),
    fileName: String(first(raw, "fileName", "file_name", "attachmentName", "attachment_name") || "documento"),
    fileUrl: String(first(raw, "fileUrl", "file_url", "url", "attachmentDataUrl", "attachment_data_url") || ""),
    unitId: String(first(raw, "unitId", "unit_id") ?? unit.id ?? ""),
    unitName: String(first(raw, "unitName", "unit_name") ?? unit.name ?? ""),
    authorName: String(first(raw, "authorName", "author_name") || "Comiss\u00e3o de Curso"),
    authorEmail: String(first(raw, "authorEmail", "author_email") || ""),
    authorStudentNumber: String(first(raw, "authorStudentNumber", "author_student_number") || ""),
    authorId: String(first(raw, "authorId", "author_id", "createdBy", "created_by") || ""),
    createdAt: dateInput(first(raw, "createdAt", "created_at")),
  };
}

const emptyForm = { title: "", description: "", type: "document", visibility: "authenticated", unitId: "" };

export function DocumentsLibrary() {
  const { user } = useAuth();
  const managementEnabled = useModuleEnabled("documents.management");
  const canManage = managementEnabled && (user?.role === "admin" || Boolean(user?.commissionPosition));
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openId, openDocument] = useHashRecord("documento");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const data = await response.json() as {
        documents?: Record<string, unknown>[];
        units?: Record<string, unknown>[];
        curricularUnits?: Record<string, unknown>[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "N\u00e3o foi poss\u00edvel carregar os documentos.");
      setDocuments((data.documents || []).map(normalise));
      setUnits((data.units || data.curricularUnits || []).map((raw) => ({
        id: String(raw.id),
        code: String(raw.code || ""),
        name: String(raw.name || ""),
      })));
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "N\u00e3o foi poss\u00edvel carregar os documentos." });
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => documents
      .filter((item) => {
        const term = query.trim().toLocaleLowerCase("pt-PT");
        return (!term || [item.title, item.description, item.fileName, item.unitName, item.authorName].join(" ").toLocaleLowerCase("pt-PT").includes(term))
          && (typeFilter === "all" || item.type === typeFilter)
          && (unitFilter === "all" || item.unitId === unitFilter);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [documents, query, typeFilter, unitFilter],
  );

  const filtersActive = Boolean(query.trim() || typeFilter !== "all" || unitFilter !== "all");
  const clearFilters = () => { setQuery(""); setTypeFilter("all"); setUnitFilter("all"); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setNotice({ kind: "warning", message: "Seleciona o ficheiro que pretendes publicar." });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setNotice({ kind: "warning", message: "O ficheiro n\u00e3o pode ultrapassar 4 MB." });
      return;
    }
    setSaving(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.set(key, value));
      payload.set("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: payload });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "N\u00e3o foi poss\u00edvel publicar o documento.");
      setForm(emptyForm);
      setFile(null);
      setEditor(false);
      setNotice({ kind: "success", message: "Documento publicado." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "N\u00e3o foi poss\u00edvel publicar o documento." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "N\u00e3o foi poss\u00edvel eliminar o documento.");
      setNotice({ kind: "success", message: "Documento eliminado." });
      if (openId === deleteTarget.id) openDocument(null);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "N\u00e3o foi poss\u00edvel eliminar o documento." });
    } finally { setDeleting(false); setDeleteTarget(null); }
  };

  const openItem = openId ? documents.find((item) => item.id === openId) ?? null : null;
  const authorOf = (item: DocumentItem) => personDisplay({ fullName: item.authorName, email: item.authorEmail, studentNumber: item.authorStudentNumber, id: item.authorId }, { revealIdentifier: canManage });
  useFloatingAction(canManage && !editor && !openId ? { id: "new-document", label: "Publicar documento", icon: FLOATING_CREATE_ICON, onClick: () => setEditor(true) } : null);
  const deletable = canManage && !editor && openItem ? openItem : null;
  useFloatingAction(deletable ? { id: "delete-document", label: "Eliminar documento", icon: FLOATING_DELETE_ICON, onClick: () => setDeleteTarget(deletable) } : null);

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="documents.library">
        <AppShell active="documents" breadcrumb="Documentos e atas">
          {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
          <SurfaceHeader standalone headingLevel="h1" icon={<FileArchive />} eyebrow="Arquivo da Comissão de Curso" title="Documentos e atas" />

          {canManage && editor && (
            <form className={`${styles.panel} ${styles.form}`} onSubmit={save}>
              <SurfaceHeader icon={<FileArchive />} title="Novo documento" actions={<FormCloseButton onClick={() => setEditor(false)} label="Fechar" disabled={saving} />} />
              <div className={styles.formGrid}>
                <label className={styles.wide}><span><Type />{"Título"}</span><input required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                <label><span><Tags />Tipo</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{Object.entries(typeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <label><span><Eye />Visibilidade</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}><option value="authenticated">Estudantes autenticados</option><option value="commission">{"Apenas Comissão de Curso"}</option><option value="public">{"Público"}</option></select></label>
                <label className={styles.wide}><span><GraduationCap />Unidade curricular <small>(opcional)</small></span><select value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="">Documento geral</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} {"·"} {unit.name}</option>)}</select></label>
                <label className={styles.full}><span><AlignLeft />{"Descrição"} <small>(opcional)</small></span><textarea rows={3} maxLength={1500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <div className={styles.full}>
                  <FileUploadField
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,image/*"
                    emptyLabel="Documento para o arquivo"
                    file={file}
                    help={"PDF, imagem, documento Office ou formato aberto, até 4 MB. Não incluas dados pessoais desnecessários."}
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    onRemove={() => setFile(null)}
                  />
                </div>
              </div>
              <FormActions><CancelButton onClick={() => setEditor(false)} disabled={saving}>Cancelar</CancelButton><SubmitButton busy={saving}>{saving ? "A publicar…" : "Publicar documento"}</SubmitButton></FormActions>
            </form>
          )}

          {!editor && !openId && <section className={`panel ${list.listPanel}`} aria-busy={loading}>
            <FilterBar label="Filtrar documentos">
              <FilterSearch label="Pesquisar" value={query} onChange={setQuery} placeholder="Título, descrição ou ficheiro…" />
              <FilterSelect label="Tipo de documento" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "Todos os tipos" }, ...Object.entries(typeLabels).map(([key, label]) => ({ value: key, label }))]} />
              <FilterSelect label="Unidade curricular" value={unitFilter} onChange={setUnitFilter} options={[{ value: "all", label: "Todas as unidades curriculares" }, ...units.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name}` }))]} />
            </FilterBar>
            {loading ? <RecordSkeleton label={"A carregar arquivo…"} />
              : visible.length === 0 ? <div className={list.empty}><FileText /><strong>{filtersActive ? "Não existem documentos com estes filtros" : "Ainda não existem documentos"}</strong>{filtersActive && <button className={styles.emptyAction} type="button" onClick={clearFilters}><X />Limpar filtros</button>}</div>
                : <ul className={list.rows}>{visible.map((item) => <li className={list.row} key={item.id}>
                  <span className={list.rowIcon} aria-hidden="true">{item.type === "minutes" ? <FileArchive /> : <FileText />}</span>
                  <div className={list.rowMain}>
                    <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("documento", item.id)} onClick={(event) => { event.preventDefault(); openDocument(item.id); }}>{item.title}</a></h3>
                    <p className={list.rowMeta}>{typeLabels[item.type] || item.type} {"·"} {item.unitName || "Arquivo geral"} {"·"} <PersonName person={authorOf(item)} /> {"·"} {formatCreatedAt(item.createdAt)}</p>
                  </div>
                  {item.visibility !== "authenticated" ? <span className={list.statusPill} data-tone={item.visibility === "commission" ? "accent" : "info"}>{visibilityLabels[item.visibility] || item.visibility}</span> : <span />}
                </li>)}</ul>}
          </section>}

          {!editor && openId && <>
            <button className={list.back} type="button" onClick={() => openDocument(null)}><ChevronLeft aria-hidden="true" />Todos os documentos</button>
            <article className={`panel ${list.reading}`} aria-busy={loading}>
              {loading ? <RecordSkeleton label={"A carregar documento…"} rows={2} /> : !openItem ? <div className={list.empty}><FileText /><strong>Documento não encontrado</strong></div> : <>
                <header className={list.byline}>
                  <span className={list.iconChip} aria-hidden="true">{openItem.type === "minutes" ? <FileArchive /> : <FileText />}</span>
                  <div>
                    <p className={list.bylineName}><PersonName person={authorOf(openItem)} /></p>
                    <p className={list.bylineMeta}>{typeLabels[openItem.type] || openItem.type} {"·"} {openItem.unitName || "Arquivo geral"} {"·"} {formatCreatedAt(openItem.createdAt)}</p>
                  </div>
                  <span className={list.statusPill} data-tone={openItem.visibility === "commission" ? "accent" : undefined}>{openItem.visibility === "commission" ? <LockKeyhole aria-hidden="true" className={styles.pillIcon} /> : <Users aria-hidden="true" className={styles.pillIcon} />}{visibilityLabels[openItem.visibility] || openItem.visibility}</span>
                </header>
                <h2 className={list.readingTitle}>{openItem.title}</h2>
                <span className={list.readingRule} aria-hidden="true" />
                {openItem.description && <p className={list.readingBody}>{openItem.description}</p>}
                {openItem.fileUrl && <footer className={list.manageArea}>
                  <a className={`button button--secondary button--compact ${styles.download}`} href={openItem.fileUrl} download={openItem.fileName}><Download aria-hidden="true" />{openItem.fileName}</a>
                </footer>}
              </>}
            </article>
          </>}
          <ConfirmationDialog open={Boolean(deleteTarget)} title="Eliminar este documento?" description="O documento deixa de estar disponível no arquivo da plataforma." subject={deleteTarget?.title} subjectLabel="Documento selecionado" warning="Esta ação não pode ser revertida." confirmLabel={deleting ? "A eliminar…" : "Eliminar documento"} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
