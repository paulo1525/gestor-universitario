"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  Download,
  Eye,
  FileArchive,
  FileText,
  Filter,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  Tags,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { FileUploadField } from "@/components/file-upload-field";
import { ModuleGuard } from "@/components/module-guard";
import { useModuleEnabled } from "@/components/use-module-enabled";
import styles from "@/components/documents-library.module.css";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";

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
  const activeFilterCount = [query.trim(), typeFilter !== "all", unitFilter !== "all"].filter(Boolean).length;
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

  const remove = async (id: string) => {
    if (!window.confirm("Eliminar este documento?")) return;
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "N\u00e3o foi poss\u00edvel eliminar o documento.");
      setNotice({ kind: "success", message: "Documento eliminado." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "N\u00e3o foi poss\u00edvel eliminar o documento." });
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="documents.library">
        <AppShell active="documents" breadcrumb="Documentos e atas">
          {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
          <section className={styles.hero}>
            <div className={styles.heroIcon}><FileArchive /></div>
            <div><span className="eyebrow">{"Arquivo da Comiss\u00e3o de Curso"}</span><h1>Documentos e atas</h1><p>{"Consulta atas, regulamentos, formul\u00e1rios e outros documentos \u00fateis."}</p></div>
            {canManage && <button className="button button--primary" type="button" onClick={() => setEditor((value) => !value)}><Plus />{editor ? "Fechar" : "Publicar documento"}</button>}
          </section>

          {canManage && editor && (
            <form className={`${styles.panel} ${styles.form}`} onSubmit={save}>
              <div className={styles.formHeading}><h2>Novo documento</h2><p>{"Define claramente quem poder\u00e1 consultar o ficheiro."}</p></div>
              <div className={styles.formGrid}>
                <label className={styles.wide}><span><Type />{"T\u00edtulo"}</span><input required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                <label><span><Tags />Tipo</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{Object.entries(typeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <label><span><Eye />Visibilidade</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}><option value="authenticated">Estudantes autenticados</option><option value="commission">{"Apenas Comiss\u00e3o de Curso"}</option><option value="public">{"P\u00fablico"}</option></select></label>
                <label className={styles.wide}><span><GraduationCap />Unidade curricular <small>(opcional)</small></span><select value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="">Documento geral</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} {"\u00b7"} {unit.name}</option>)}</select></label>
                <label className={styles.full}><span><AlignLeft />{"Descri\u00e7\u00e3o"} <small>(opcional)</small></span><textarea rows={3} maxLength={1500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <div className={styles.full}>
                  <FileUploadField
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,image/*"
                    emptyLabel="Documento para o arquivo"
                    file={file}
                    help={"PDF, imagem, documento Office ou formato aberto, at\u00e9 4 MB. N\u00e3o incluas dados pessoais desnecess\u00e1rios."}
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    onRemove={() => setFile(null)}
                  />
                </div>
              </div>
              <footer className={styles.formActions}><button className="button button--primary" disabled={saving}>{saving && <LoaderCircle className={styles.spin} />}{saving ? "A publicar\u2026" : "Publicar documento"}</button></footer>
            </form>
          )}

          <section className={styles.panel}>
            <div className={styles.filterBar}>
              <div className={styles.filterHeading}>
                <div className={styles.filterTitle}><span><Filter /></span><div><strong>Pesquisar e filtrar</strong><small>Encontra rapidamente documentos, atas e regulamentos no arquivo.</small></div></div>
                <div className={styles.filterActions}><span className={styles.resultCount}>{visible.length} {visible.length === 1 ? "resultado" : "resultados"}</span>{filtersActive && <span className={styles.activeFilters}>{activeFilterCount} {activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}</span>}{filtersActive && <button className={styles.clearFilters} type="button" onClick={clearFilters}><X />Limpar</button>}</div>
              </div>
              <div className={styles.filterControls}>
                <label className={`${styles.filterField} ${styles.searchFilter}`}><span><Search />Pesquisa</span><div className={styles.searchControl}><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por título, descrição ou ficheiro…" /></div></label>
                <label className={styles.filterField}><span><Tags />Tipo de documento</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Todos os tipos</option>{Object.entries(typeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <label className={styles.filterField}><span><GraduationCap />Unidade curricular</span><select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}><option value="all">Todas as unidades curriculares</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} {"\u00b7"} {unit.name}</option>)}</select></label>
              </div>
            </div>
            {loading ? <div className={styles.loading}><LoaderCircle className={styles.spin} />{"A carregar arquivo\u2026"}</div>
              : visible.length === 0 ? <div className={styles.empty}><FileText /><strong>{filtersActive ? "Não existem documentos com estes filtros" : "Ainda não existem documentos"}</strong><span>{filtersActive ? "Experimenta limpar os filtros ou pesquisar outros termos." : "Os documentos publicados aparecerão aqui."}</span>{filtersActive && <button className={styles.emptyAction} type="button" onClick={clearFilters}><X />Limpar filtros</button>}</div>
                : <div className={styles.cardGrid}>{visible.map((item) => { const author = personDisplay({ fullName: item.authorName, email: item.authorEmail, studentNumber: item.authorStudentNumber, id: item.authorId }, { revealIdentifier: canManage }); return <article className={styles.fileCard} key={item.id}>
                  <div className={styles.fileIcon}>{item.type === "minutes" ? <FileArchive /> : <FileText />}</div>
                    <div><div className={styles.badgeRow}><span className={styles.badge}>{typeLabels[item.type] || item.type}</span><span className={styles.softBadge}>{item.visibility === "commission" ? <LockKeyhole /> : <Users />}{visibilityLabels[item.visibility] || item.visibility}</span></div><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}<small>{item.unitName || "Arquivo geral"} {"\u00b7"} <PersonName person={author} /> {"\u00b7"} {formatCreatedAt(item.createdAt)}</small></div>
                  <div className={styles.cardActions}>{item.fileUrl && <a className="button" href={item.fileUrl} download={item.fileName}><Download />Descarregar</a>}{canManage && <button className={styles.iconDanger} type="button" onClick={() => void remove(item.id)} aria-label={`Eliminar ${item.title}`}><Trash2 /></button>}</div>
                </article>; })}</div>}
          </section>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
