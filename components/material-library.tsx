"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { ModuleGuard } from "@/components/module-guard";
import styles from "@/components/material-library.module.css";

type Status = "pending" | "approved" | "rejected";
type Category = "exam" | "summary" | "notes" | "other";
type ApiMaterial = {
  id: string | number;
  title: string;
  description?: string;
  category?: Category;
  type?: "exam_photo" | "summary" | "notes" | "other";
  status?: Status | "published";
  anonymous?: boolean;
  authorName?: string;
  author_name?: string;
  fileName?: string;
  file_name?: string;
  fileType?: string;
  file_type?: string;
  fileUrl?: string;
  file_url?: string;
  fileData?: string;
  file_data?: string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentDataUrl?: string;
  createdAt?: string;
  created_at?: string;
  unitId?: string | number;
  unitCode?: string;
  unitName?: string;
  unit?: { id: string | number; code?: string; name?: string };
  curricularUnit?: { id: string | number; code?: string; name?: string };
};
type Material = {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  anonymous: boolean;
  authorName: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  createdAt: string;
  unit: { id: string; code: string; name: string } | null;
};
type Unit = { id: string; code: string; name: string };
type Notice = { kind: ToastKind; message: string } | null;
const categoryLabels: Record<Category, string> = {
  exam: "Exame ou frequência",
  summary: "Resumo",
  notes: "Sebenta ou apontamentos",
  other: "Outro material",
};
const categoryToType: Record<
  Category,
  "exam_photo" | "summary" | "notes" | "other"
> = { exam: "exam_photo", summary: "summary", notes: "notes", other: "other" };
const statusLabels: Record<Status, string> = {
  pending: "Em moderação",
  approved: "Publicado",
  rejected: "Recusado",
};
const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;
function normalize(item: ApiMaterial): Material {
  const nested = item.unit ?? item.curricularUnit;
  const unit =
    nested ??
    (item.unitId
      ? { id: item.unitId, code: item.unitCode, name: item.unitName }
      : null);
  const apiType = item.type;
  const category: Category =
    item.category ?? (apiType === "exam_photo" ? "exam" : (apiType ?? "other"));
  return {
    id: String(item.id),
    title: item.title,
    description: item.description ?? "",
    category,
    status:
      item.status === "published" ? "approved" : (item.status ?? "pending"),
    anonymous: item.anonymous ?? false,
    authorName: item.anonymous
      ? "Partilha anónima"
      : (item.authorName ?? item.author_name ?? "Estudante"),
    fileName:
      item.attachmentName ?? item.fileName ?? item.file_name ?? "ficheiro",
    fileType:
      item.attachmentMime ??
      item.fileType ??
      item.file_type ??
      "application/octet-stream",
    fileUrl:
      item.attachmentDataUrl ??
      item.fileUrl ??
      item.file_url ??
      item.fileData ??
      item.file_data ??
      "",
    createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString(),
    unit: unit
      ? {
          id: String(unit.id),
          code: unit.code ?? "UC",
          name: unit.name ?? "Unidade curricular",
        }
      : null,
  };
}
function date(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}
function size(value: number) {
  return value < 1024 * 1024
    ? `${Math.round(value / 1024)} KB`
    : `${(value / 1024 / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
}
export function MaterialLibrary() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]),
    [units, setUnits] = useState<Unit[]>([]),
    [canModerate, setCanModerate] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<Notice>(null),
    [editor, setEditor] = useState(false),
    [saving, setSaving] = useState(false),
    [moderating, setModerating] = useState<string | null>(null),
    [filter, setFilter] = useState("all");
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState<Category>("exam"),
    [unitId, setUnitId] = useState(""),
    [anonymous, setAnonymous] = useState(true),
    [file, setFile] = useState<File | null>(null),
    [fileData, setFileData] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const moderator =
        user?.role === "admin" || Boolean(user?.commissionPosition);
      const materialResponse = await fetch(
        `/api/material-submissions${moderator ? "?scope=moderation" : ""}`,
        { cache: "no-store" },
      );
      const materialData = (await materialResponse.json()) as {
        materials?: ApiMaterial[];
        submissions?: ApiMaterial[];
        units?: Array<{ id: string | number; code?: string; name?: string }>;
        canModerate?: boolean;
        capabilities?: { moderate?: boolean };
        error?: string;
      };
      if (!materialResponse.ok)
        throw new Error(
          materialData.error || "Não foi possível carregar os materiais.",
        );
      setMaterials(
        (materialData.materials ?? materialData.submissions ?? []).map(
          normalize,
        ),
      );
      setCanModerate(
        moderator &&
          (materialData.canModerate ??
            materialData.capabilities?.moderate ??
            true),
      );
      setUnits(
        (materialData.units ?? []).map((item) => ({
          id: String(item.id),
          code: item.code ?? "UC",
          name: item.name ?? "Unidade curricular",
        })),
      );
    } catch (reason) {
      setNotice({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar os materiais.",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      materials.filter((item) => filter === "all" || item.category === filter),
    [materials, filter],
  );
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!allowed.includes(selected.type)) {
      setNotice({
        kind: "warning",
        message: "Seleciona uma imagem JPG, PNG, WebP ou um ficheiro PDF.",
      });
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_SIZE) {
      setNotice({
        kind: "warning",
        message: "O ficheiro não pode ultrapassar 5 MB.",
      });
      event.target.value = "";
      return;
    }
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error());
        reader.readAsDataURL(selected);
      });
      setFile(selected);
      setFileData(value);
    } catch {
      setNotice({
        kind: "error",
        message: "Não foi possível ler o ficheiro selecionado.",
      });
    }
  };
  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("exam");
    setUnitId("");
    setAnonymous(true);
    setFile(null);
    setFileData("");
    setEditor(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !file || !fileData) {
      setNotice({
        kind: "warning",
        message:
          "Indica um título e seleciona o ficheiro que queres partilhar.",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/material-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type: categoryToType[category],
          unitId: unitId || null,
          anonymous,
          attachmentName: file.name,
          attachmentDataUrl: fileData,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Não foi possível enviar o material.");
      reset();
      setNotice({
        kind: "success",
        message: "Material enviado para moderação.",
      });
      await load();
    } catch (reason) {
      setNotice({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Não foi possível enviar o material.",
      });
    } finally {
      setSaving(false);
    }
  };
  const moderate = async (id: string, status: "approved" | "rejected") => {
    setModerating(id);
    try {
      const response = await fetch("/api/material-submissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          status: status === "approved" ? "published" : status,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Não foi possível moderar o material.");
      setNotice({
        kind: "success",
        message:
          status === "approved"
            ? "Material aprovado e publicado."
            : "Material recusado.",
      });
      await load();
    } catch (reason) {
      setNotice({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Não foi possível moderar o material.",
      });
    } finally {
      setModerating(null);
    }
  };
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="materials.library">
        <AppShell active="materials" breadcrumb="Materiais">
          <div className={styles.page}>
            <header className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.heroIcon}>
                  <FolderOpen />
                </span>
                <div>
                  <span className="eyebrow">Partilha entre estudantes</span>
                  <h1>Materiais académicos</h1>
                  <p>
                    Partilha fotografias de exames, resumos, sebentas e outros
                    recursos úteis. Podes identificar-te ou manter a partilha
                    anónima.
                  </p>
                </div>
              </div>
              <div className={styles.heroActions}>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setEditor((value) => !value)}
                >
                  {editor ? <X /> : <Upload />}
                  {editor ? "Fechar formulário" : "Partilhar material"}
                </button>
              </div>
            </header>
            {notice && (
              <AppToast
                kind={notice.kind}
                message={notice.message}
                onDismiss={() => setNotice(null)}
              />
            )}{" "}
            {editor && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Novo material</h2>
                    <p>
                      Todos os envios são verificados pela Comissão de Curso
                      antes de serem publicados.
                    </p>
                  </div>
                </div>
                <form className={styles.form} onSubmit={submit}>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Título</span>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={180}
                        placeholder="Ex.: Frequência de Anatomia II — 2025"
                        required
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Tipo de material</span>
                      <select
                        value={category}
                        onChange={(event) =>
                          setCategory(event.target.value as Category)
                        }
                      >
                        {Object.entries(categoryLabels).map(
                          ([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>
                        Unidade curricular <small>(opcional)</small>
                      </span>
                      <select
                        value={unitId}
                        onChange={(event) => setUnitId(event.target.value)}
                      >
                        <option value="">Sem unidade específica</option>
                        {units.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      <span>
                        Descrição <small>(opcional)</small>
                      </span>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={1200}
                        placeholder="Contextualiza o ficheiro, ano letivo ou conteúdo…"
                      />
                    </label>
                  </div>
                  {file ? (
                    <div className={styles.preview}>
                      {file.type.startsWith("image/") ? (
                        <img
                          src={fileData}
                          alt="Pré-visualização do ficheiro"
                        />
                      ) : (
                        <span className={styles.filePreview}>
                          <FileText />
                        </span>
                      )}
                      <span>
                        <strong>{file.name}</strong>
                        <small>
                          {file.type} · {size(file.size)}
                        </small>
                      </span>
                      <button
                        className={styles.iconButton}
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setFileData("");
                        }}
                        aria-label="Remover ficheiro"
                      >
                        <X />
                      </button>
                    </div>
                  ) : (
                    <label className={styles.dropzone}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => void pick(event)}
                        required
                      />
                      <Upload />
                      <strong>Selecionar fotografia ou PDF</strong>
                      <small>JPG, PNG, WebP ou PDF · máximo de 5 MB</small>
                    </label>
                  )}
                  <label className={styles.checkField}>
                    <input
                      type="checkbox"
                      checked={anonymous}
                      onChange={(event) => setAnonymous(event.target.checked)}
                    />
                    <span>
                      <strong>Enviar anonimamente</strong>
                      <small>
                        O teu nome não será apresentado no material nem aos
                        restantes estudantes. A equipa de moderação mantém
                        apenas os dados técnicos necessários à segurança.
                      </small>
                    </span>
                  </label>
                  <div className={styles.formActions}>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={reset}
                    >
                      Cancelar
                    </button>
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? (
                        <LoaderCircle className={styles.spin} />
                      ) : (
                        <Send />
                      )}
                      {saving ? "A enviar…" : "Enviar para moderação"}
                    </button>
                  </div>
                </form>
              </section>
            )}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {canModerate
                      ? "Biblioteca e moderação"
                      : "Biblioteca de materiais"}
                  </h2>
                  <p>
                    {canModerate
                      ? "Os materiais pendentes aparecem primeiro para validação."
                      : "Recursos aprovados e disponibilizados à comunidade."}
                  </p>
                </div>
                {!loading && (
                  <span className={styles.count}>
                    {visible.length}{" "}
                    {visible.length === 1 ? "material" : "materiais"}
                  </span>
                )}
              </div>
              <div className={styles.toolbar}>
                <label>
                  <span className="sr-only">Filtrar por tipo</span>
                  <select
                    className={styles.select}
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">Todos os materiais</option>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {loading ? (
                <div className={styles.state}>
                  <LoaderCircle className={styles.spin} />
                  <strong>A carregar materiais…</strong>
                </div>
              ) : visible.length === 0 ? (
                <div className={styles.state}>
                  <FolderOpen />
                  <strong>Ainda não existem materiais nesta categoria.</strong>
                  <p>Podes ser a primeira pessoa a contribuir.</p>
                </div>
              ) : (
                <div className={styles.materialGrid}>
                  {visible.map((item) => (
                    <article className={styles.material} key={item.id}>
                      <div className={styles.materialThumb}>
                        {item.fileType.startsWith("image/") && item.fileUrl ? (
                          <img src={item.fileUrl} alt="" />
                        ) : (
                          <FileText />
                        )}
                      </div>
                      <div className={styles.materialBody}>
                        <div className={styles.cardTop}>
                          <span className={styles.tag}>
                            {categoryLabels[item.category]}
                          </span>
                          <span
                            className={`${styles.status} ${item.status === "approved" ? styles.statusApproved : item.status === "rejected" ? styles.statusRejected : styles.statusPending}`}
                          >
                            {statusLabels[item.status]}
                          </span>
                        </div>
                        <div>
                          <h3>{item.title}</h3>
                          {item.description && <p>{item.description}</p>}
                        </div>
                        {item.unit && (
                          <span className={styles.unitCode}>
                            {item.unit.code}
                          </span>
                        )}
                        <div className={styles.meta}>
                          <span className={styles.metaRow}>
                            {item.anonymous ? <ShieldCheck /> : <ImageIcon />}
                            <span>{item.authorName}</span>
                          </span>
                          <span className={styles.metaRow}>
                            <FileText />
                            <span>{item.fileName}</span>
                          </span>
                        </div>
                        {canModerate && item.status === "pending" ? (
                          <div className={styles.moderation}>
                            <button
                              className="button button--primary button--compact"
                              type="button"
                              onClick={() => void moderate(item.id, "approved")}
                              disabled={moderating === item.id}
                            >
                              {moderating === item.id ? (
                                <LoaderCircle className={styles.spin} />
                              ) : (
                                <Check />
                              )}
                              Aprovar
                            </button>
                            <button
                              className="button button--danger button--compact"
                              type="button"
                              onClick={() => void moderate(item.id, "rejected")}
                              disabled={moderating === item.id}
                            >
                              <X />
                              Recusar
                            </button>
                          </div>
                        ) : (
                          item.status === "approved" &&
                          item.fileUrl && (
                            <a
                              className="button button--secondary button--compact"
                              href={item.fileUrl}
                              download={item.fileName}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download />
                              Abrir material
                            </a>
                          )
                        )}
                        <footer className={styles.materialFooter}>
                          <span>{date(item.createdAt)}</span>
                          <span>{item.unit?.name ?? "Geral"}</span>
                        </footer>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
